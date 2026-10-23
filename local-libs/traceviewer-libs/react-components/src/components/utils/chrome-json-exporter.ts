/**
 * Chrome Trace Event JSON exporter for XY chart data.
 *
 * Produces the Chrome JSON trace format (also openable in Perfetto UI):
 * {
 *   traceEvents: [
 *     { process_name metadata = view node },
 *     { thread_name metadata = child/series node },
 *     { counter events = status items },
 *     ...
 *   ]
 * }
 *
 * Chrome Trace Event JSON expects `ts` in microseconds. Trace Compass XY data is
 * typically nanoseconds. Every nanosecond sample is converted to microseconds.
 * Large absolute wall-clock ns values (e.g. year 2026, ~1e18) exceed
 * Number.MAX_SAFE_INTEGER and lose precision in JS, so those are detected and
 * shifted to a relative origin before the ns→µs conversion. Smaller timestamps
 * (e.g. boot-relative / near-epoch traces) keep their origin and are only
 * converted to microseconds. Generic XY callers can pass `sourceUnit` when the
 * samples are not nanoseconds.
 */

export interface ChromeTraceEvent {
    name: string;
    ph: string;
    ts: number;
    pid: number;
    tid: number;
    args?: { [key: string]: string | number };
}

export interface ChromeJsonDocument {
    traceEvents: ChromeTraceEvent[];
}

export interface XyChartDataForChromeJson {
    labels?: Array<string | number | bigint>;
    datasets?: Array<{
        label?: string;
        data?: Array<number | { x?: string | number | bigint; y?: number }>;
    }>;
    /**
     * Unit of the raw X samples. Omitted / undefined means nanoseconds
     * (Trace Compass XY default). An explicit empty string or unknown unit
     * leaves values unscaled. Known time units (`ns`, `us`, `ms`, `s`) are
     * converted to Chrome Trace Event microseconds.
     */
    sourceUnit?: string;
}

interface CounterSample {
    timestamp: bigint;
    value: number;
}

interface SeriesSamples {
    tid: number;
    seriesName: string;
    samples: CounterSample[];
}

export class XyChartChromeJsonExporter {
    /**
     * Nanosecond timestamps above this need an origin shift before conversion
     * so `Number(...)` does not lose precision. Values at or below keep their
     * origin and are only converted ns→µs.
     */
    static readonly ABSOLUTE_NS_THRESHOLD = BigInt(Number.MAX_SAFE_INTEGER);

    private readonly processName: string;
    private readonly processId: number;

    constructor(processName: string, processId = 1) {
        this.processName = processName;
        this.processId = processId;
    }

    /** Build and serialize the Chrome JSON document (tab-indented like sample files). */
    export(xyData?: XyChartDataForChromeJson): string {
        return JSON.stringify(this.build(xyData), undefined, '\t');
    }

    /** Build the in-memory Chrome Trace Event document from XY chart datasets. */
    build(xyData?: XyChartDataForChromeJson): ChromeJsonDocument {
        const traceEvents: ChromeTraceEvent[] = [];
        const labels = xyData?.labels ?? [];
        const datasets = xyData?.datasets ?? [];
        const sourceUnit = xyData?.sourceUnit;
        const seriesList = this.collectSeriesSamples(labels, datasets);
        const allTimestamps = seriesList.flatMap(series => series.samples.map(sample => sample.timestamp));
        const nsTimestamps = allTimestamps
            .map(timestamp => this.toNanoseconds(timestamp, sourceUnit))
            .filter((timestamp): timestamp is bigint => timestamp !== undefined);
        const normalize = this.needsTimestampNormalization(nsTimestamps);
        const minTimestamp = normalize && nsTimestamps.length > 0 ? this.minTimestamp(nsTimestamps) : BigInt(0);

        traceEvents.push({
            name: 'process_name',
            ph: 'M',
            ts: 0,
            pid: this.processId,
            tid: 0,
            args: { name: this.processName }
        });

        seriesList.forEach(series => {
            traceEvents.push({
                name: 'thread_name',
                ph: 'M',
                ts: 0,
                pid: this.processId,
                tid: series.tid,
                args: { name: series.seriesName }
            });

            series.samples.forEach(sample => {
                traceEvents.push({
                    name: series.seriesName,
                    ph: 'C',
                    ts: this.toChromeJsonTimestamp(sample.timestamp, minTimestamp, normalize, sourceUnit),
                    pid: this.processId,
                    tid: series.tid,
                    args: { value: sample.value }
                });
            });
        });

        return { traceEvents };
    }

    /**
     * True when any timestamp looks like absolute wall-clock nanoseconds
     * (e.g. 2026 ≈ 1.78e18) that would break Chrome JSON / lose JS precision.
     */
    needsTimestampNormalization(timestamps: bigint[]): boolean {
        return timestamps.some(timestamp => timestamp > XyChartChromeJsonExporter.ABSOLUTE_NS_THRESHOLD);
    }

    private collectSeriesSamples(
        labels: Array<string | number | bigint>,
        datasets: NonNullable<XyChartDataForChromeJson['datasets']>
    ): SeriesSamples[] {
        return datasets.map((dataset, index) => {
            const tid = index + 1;
            const seriesName = dataset.label ?? `series_${tid}`;
            const samples: CounterSample[] = [];
            const data = dataset.data ?? [];

            data.forEach((point, pointIndex) => {
                let timestamp: string | number | bigint = 0;
                let value = 0;
                if (point && typeof point === 'object') {
                    // AbstractXY scatter stores view-relative (value - offset) in
                    // point.x and keeps the original timestamps in labels.
                    timestamp = pointIndex < labels.length ? labels[pointIndex] : (point.x ?? 0);
                    value = Number(point.y ?? 0);
                } else {
                    timestamp = labels[pointIndex] ?? 0;
                    value = Number(point);
                }
                if (!Number.isFinite(value)) {
                    value = 0;
                }
                samples.push({
                    timestamp: this.toBigIntTimestamp(timestamp),
                    value
                });
            });

            return { tid, seriesName, samples };
        });
    }

    private minTimestamp(timestamps: bigint[]): bigint {
        return timestamps.reduce((min, timestamp) => (timestamp < min ? timestamp : min), timestamps[0]);
    }

    /**
     * Convert a source-unit sample to Chrome Trace Event microseconds.
     * The threshold only chooses whether to subtract an origin; ns→µs always
     * happens for nanosecond (and other known time) inputs.
     */
    private toChromeJsonTimestamp(
        timestamp: bigint,
        minTimestampNs: bigint,
        normalize: boolean,
        sourceUnit?: string
    ): number {
        const ns = this.toNanoseconds(timestamp, sourceUnit);
        if (ns === undefined) {
            return Number(timestamp);
        }
        const origin = normalize ? minTimestampNs : BigInt(0);
        // Fractional microseconds so sub-µs ns samples are not collapsed by
        // integer division (Chrome Trace Event JSON `ts` unit is µs).
        return Number(ns - origin) / 1000;
    }

    /**
     * Convert a sample to nanoseconds. `undefined` sourceUnit is the Trace
     * Compass XY default (ns). An explicit empty / unknown unit returns
     * undefined so the caller can leave the value unscaled.
     */
    private toNanoseconds(value: bigint, sourceUnit?: string): bigint | undefined {
        if (sourceUnit === undefined) {
            return value;
        }
        const unit = sourceUnit.trim().toLowerCase();
        if (!unit) {
            return undefined;
        }
        switch (unit) {
            case 'ns':
            case 'nsec':
            case 'nanosecond':
            case 'nanoseconds':
                return value;
            case 'us':
            case 'µs':
            case 'usec':
            case 'microsecond':
            case 'microseconds':
                return value * BigInt(1000);
            case 'ms':
            case 'msec':
            case 'millisecond':
            case 'milliseconds':
                return value * BigInt(1000000);
            case 's':
            case 'sec':
            case 'second':
            case 'seconds':
                return value * BigInt(1000000000);
            default:
                return undefined;
        }
    }

    private toBigIntTimestamp(value: string | number | bigint): bigint {
        if (typeof value === 'bigint') {
            return value;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                return BigInt(0);
            }
            return BigInt(Math.trunc(value));
        }
        try {
            const trimmed = value.trim();
            if (!trimmed) {
                return BigInt(0);
            }
            // Prefer exact integer strings (avoids Number precision loss).
            if (/^[+-]?\d+$/.test(trimmed)) {
                return BigInt(trimmed);
            }
            const parsed = Number(trimmed);
            return Number.isFinite(parsed) ? BigInt(Math.trunc(parsed)) : BigInt(0);
        } catch {
            return BigInt(0);
        }
    }
}
