import { XyChartChromeJsonExporter } from '../chrome-json-exporter';

describe('XyChartChromeJsonExporter', () => {
    it('exports process metadata only when there are no datasets', () => {
        const exporter = new XyChartChromeJsonExporter('Quality of Service Bandwidth');
        const doc = exporter.build({ labels: [1, 2], datasets: [] });

        expect(doc.traceEvents).toEqual([
            {
                name: 'process_name',
                ph: 'M',
                ts: 0,
                pid: 1,
                tid: 0,
                args: { name: 'Quality of Service Bandwidth' }
            }
        ]);
    });

    it('builds view node, child nodes, then counter samples per series', () => {
        const exporter = new XyChartChromeJsonExporter('Quality of Service Bandwidth');
        const doc = exporter.build({
            labels: [0, 1007986],
            datasets: [
                { label: 'AP-System_Core_0/1L:Write', data: [0.0, 4.294967295e9] },
                { label: 'AP-System_Core_0/1L:Read', data: [0.0, 4.294967295e9] }
            ]
        });

        expect(doc.traceEvents).toEqual([
            {
                name: 'process_name',
                ph: 'M',
                ts: 0,
                pid: 1,
                tid: 0,
                args: { name: 'Quality of Service Bandwidth' }
            },
            {
                name: 'thread_name',
                ph: 'M',
                ts: 0,
                pid: 1,
                tid: 1,
                args: { name: 'AP-System_Core_0/1L:Write' }
            },
            {
                name: 'AP-System_Core_0/1L:Write',
                ph: 'C',
                ts: 0,
                pid: 1,
                tid: 1,
                args: { value: 0.0 }
            },
            {
                name: 'AP-System_Core_0/1L:Write',
                ph: 'C',
                ts: 1007.986,
                pid: 1,
                tid: 1,
                args: { value: 4.294967295e9 }
            },
            {
                name: 'thread_name',
                ph: 'M',
                ts: 0,
                pid: 1,
                tid: 2,
                args: { name: 'AP-System_Core_0/1L:Read' }
            },
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                ts: 0,
                pid: 1,
                tid: 2,
                args: { value: 0.0 }
            },
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                ts: 1007.986,
                pid: 1,
                tid: 2,
                args: { value: 4.294967295e9 }
            }
        ]);
    });

    it('supports scatter-style {x,y} points', () => {
        const exporter = new XyChartChromeJsonExporter('Scatter View');
        const doc = exporter.build({
            datasets: [
                {
                    label: 'series-a',
                    data: [
                        { x: 10, y: 1 },
                        { x: 20, y: 2 }
                    ]
                }
            ]
        });

        expect(doc.traceEvents.filter(e => e.ph === 'C')).toEqual([
            {
                name: 'series-a',
                ph: 'C',
                ts: 0.01,
                pid: 1,
                tid: 1,
                args: { value: 1 }
            },
            {
                name: 'series-a',
                ph: 'C',
                ts: 0.02,
                pid: 1,
                tid: 1,
                args: { value: 2 }
            }
        ]);
    });

    it('prefers indexed raw labels over view-relative scatter point.x', () => {
        const exporter = new XyChartChromeJsonExporter('Scatter View');
        const t0 = BigInt('2364103003797');
        const t1 = BigInt('2364118609425');
        const doc = exporter.build({
            labels: [t0, t1],
            datasets: [
                {
                    label: 'series-a',
                    data: [
                        { x: 10, y: 1 },
                        { x: 20, y: 2 }
                    ]
                }
            ]
        });

        expect(doc.traceEvents.filter(e => e.ph === 'C')).toEqual([
            {
                name: 'series-a',
                ph: 'C',
                ts: Number(t0) / 1000,
                pid: 1,
                tid: 1,
                args: { value: 1 }
            },
            {
                name: 'series-a',
                ph: 'C',
                ts: Number(t1) / 1000,
                pid: 1,
                tid: 1,
                args: { value: 2 }
            }
        ]);
    });

    it('serializes bigint timestamps as microseconds in JSON output', () => {
        const exporter = new XyChartChromeJsonExporter('View');
        const json = exporter.export({
            labels: [BigInt(100), BigInt(200)],
            datasets: [{ label: 'eth0', data: [1, 2] }]
        });
        const parsed = JSON.parse(json);

        expect(parsed.traceEvents.find((e: { ph: string; ts: number }) => e.ph === 'C' && e.ts === 0.1)).toBeTruthy();
        expect(parsed.traceEvents.find((e: { ph: string; ts: number }) => e.ph === 'C' && e.ts === 0.2)).toBeTruthy();
    });

    it('converts boot-relative nanoseconds to microseconds without shifting origin', () => {
        const exporter = new XyChartChromeJsonExporter('Bus Monitor');
        // Same magnitude as the working Downloads export (~2.3e12).
        const t0 = BigInt('2364103003797');
        const t1 = BigInt('2364118609425');
        const doc = exporter.build({
            labels: [t0, t1],
            datasets: [{ label: 'AP-System_Core_0/1L:Read', data: [0, 10] }]
        });

        expect(exporter.needsTimestampNormalization([t0, t1])).toBe(false);
        expect(doc.traceEvents.filter(e => e.ph === 'C')).toEqual([
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                ts: Number(t0) / 1000,
                pid: 1,
                tid: 1,
                args: { value: 0 }
            },
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                ts: Number(t1) / 1000,
                pid: 1,
                tid: 1,
                args: { value: 10 }
            }
        ]);
    });

    it('relativizes and converts absolute wall-clock nanoseconds to microseconds', () => {
        const exporter = new XyChartChromeJsonExporter('Bus Monitor');
        // Same magnitude as the failing 2026 export (~1.78e18 ns).
        const t0 = BigInt('1780577577155444000');
        const t1 = BigInt('1780577577167026200');
        const doc = exporter.build({
            labels: [t0.toString(), t1.toString()],
            datasets: [{ label: 'AP-System_Core_0/1L:Read', data: [0, 2576] }]
        });

        expect(exporter.needsTimestampNormalization([t0, t1])).toBe(true);
        expect(doc.traceEvents.filter(e => e.ph === 'C')).toEqual([
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                ts: 0,
                pid: 1,
                tid: 1,
                args: { value: 0 }
            },
            {
                name: 'AP-System_Core_0/1L:Read',
                ph: 'C',
                // Relative µs with fraction: Number(t1 - t0) / 1000
                ts: Number(t1 - t0) / 1000,
                pid: 1,
                tid: 1,
                args: { value: 2576 }
            }
        ]);
    });

    it('preserves sub-microsecond spacing as fractional microseconds', () => {
        const exporter = new XyChartChromeJsonExporter('View');
        const base = BigInt('1780577577155444000');
        const doc = exporter.build({
            labels: [base.toString(), (base + BigInt(500)).toString(), (base + BigInt(1500)).toString()],
            datasets: [{ label: 'series', data: [1, 2, 3] }]
        });

        expect(doc.traceEvents.filter(e => e.ph === 'C').map(e => e.ts)).toEqual([0, 0.5, 1.5]);
    });

    it('uses raw nanosecond labels instead of formatted chart strings', () => {
        const exporter = new XyChartChromeJsonExporter('Generic XY');
        const raw = BigInt('2364103003797');
        const formattedDoc = exporter.build({
            labels: ['0.002 s'],
            datasets: [{ label: 'series', data: [5] }]
        });
        const rawDoc = exporter.build({
            labels: [raw],
            datasets: [{ label: 'series', data: [5] }],
            sourceUnit: 'ns'
        });

        expect(formattedDoc.traceEvents.filter(e => e.ph === 'C')[0].ts).toBe(0);
        expect(rawDoc.traceEvents.filter(e => e.ph === 'C')[0].ts).toBe(Number(raw) / 1000);
    });

    it('converts explicit source units to microseconds', () => {
        const exporter = new XyChartChromeJsonExporter('Generic XY');
        const msDoc = exporter.build({
            labels: [2],
            datasets: [{ label: 'series', data: [1] }],
            sourceUnit: 'ms'
        });
        const rawDoc = exporter.build({
            labels: [7],
            datasets: [{ label: 'series', data: [1] }],
            sourceUnit: ''
        });

        expect(msDoc.traceEvents.filter(e => e.ph === 'C')[0].ts).toBe(2000);
        expect(rawDoc.traceEvents.filter(e => e.ph === 'C')[0].ts).toBe(7);
    });
});
