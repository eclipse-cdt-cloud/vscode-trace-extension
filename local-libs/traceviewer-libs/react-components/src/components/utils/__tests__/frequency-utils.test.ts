import {
    nextPow2,
    fft,
    computePeriodogram,
    formatPeriod,
    resampleLogBuckets,
    resampleLinearBuckets,
    fillBucketGaps
} from '../frequency-utils';

describe('nextPow2', () => {
    test('returns the next power of two', () => {
        expect(nextPow2(1)).toBe(1);
        expect(nextPow2(2)).toBe(2);
        expect(nextPow2(3)).toBe(4);
        expect(nextPow2(5)).toBe(8);
        expect(nextPow2(1000)).toBe(1024);
    });
});

describe('fft', () => {
    test('DFT of a constant signal concentrates energy in the DC bin', () => {
        const re = [1, 1, 1, 1];
        const im = [0, 0, 0, 0];
        fft(re, im);
        // DC bin = sum of samples
        expect(re[0]).toBeCloseTo(4, 6);
        expect(im[0]).toBeCloseTo(0, 6);
        // All other bins ~ 0
        for (let k = 1; k < 4; k++) {
            expect(re[k]).toBeCloseTo(0, 6);
            expect(im[k]).toBeCloseTo(0, 6);
        }
    });

    test('throws for non power-of-two lengths', () => {
        expect(() => fft([1, 2, 3], [0, 0, 0])).toThrow();
    });

    test('matches naive DFT for a small signal', () => {
        const signal = [0, 1, 2, 3, 4, 5, 6, 7];
        const re = [...signal];
        const im = new Array(signal.length).fill(0);
        fft(re, im);

        const n = signal.length;
        for (let k = 0; k < n; k++) {
            let expectedRe = 0;
            let expectedIm = 0;
            for (let t = 0; t < n; t++) {
                const angle = (-2 * Math.PI * k * t) / n;
                expectedRe += signal[t] * Math.cos(angle);
                expectedIm += signal[t] * Math.sin(angle);
            }
            expect(re[k]).toBeCloseTo(expectedRe, 6);
            expect(im[k]).toBeCloseTo(expectedIm, 6);
        }
    });
});

describe('computePeriodogram', () => {
    test('returns empty for too-few samples or invalid span', () => {
        expect(computePeriodogram([1, 2, 3], 100)).toEqual([]);
        expect(computePeriodogram([1, 2, 3, 4], 0)).toEqual([]);
        expect(computePeriodogram([1, 2, 3, 4], -5)).toEqual([]);
    });

    test('detects the dominant period of a pure sinusoid', () => {
        // Sample a sine wave with a known period over a known window.
        const n = 256;
        const timeSpan = 256; // ns; sample interval dt = 1 ns
        const cyclesInWindow = 8; // => period = timeSpan / cycles = 32 ns
        const values: number[] = [];
        for (let i = 0; i < n; i++) {
            values.push(Math.sin((2 * Math.PI * cyclesInWindow * i) / n));
        }

        const spectrum = computePeriodogram(values, timeSpan);
        expect(spectrum.length).toBeGreaterThan(0);

        // Results are sorted ascending by period.
        for (let i = 1; i < spectrum.length; i++) {
            expect(spectrum[i].period).toBeGreaterThanOrEqual(spectrum[i - 1].period);
        }

        // The peak power should occur near the expected period (32 ns).
        const peak = spectrum.reduce((best, cur) => (cur.power > best.power ? cur : best), spectrum[0]);
        const expectedPeriod = timeSpan / cyclesInWindow;
        expect(peak.period).toBeCloseTo(expectedPeriod, 0);
    });

    test('detrends a linear ramp so a superimposed sinusoid still dominates', () => {
        // A strong linear trend plus a small sinusoid. Without detrending, the
        // trend leaks huge power into the longest-period bins; with detrending
        // the sinusoid's period should remain the peak.
        const n = 256;
        const timeSpan = 256; // dt = 1 ns
        const cyclesInWindow = 8; // period = 32 ns
        const values: number[] = [];
        for (let i = 0; i < n; i++) {
            const trend = 100 * i; // large linear drift
            const sine = Math.sin((2 * Math.PI * cyclesInWindow * i) / n);
            values.push(trend + sine);
        }

        const spectrum = computePeriodogram(values, timeSpan);
        expect(spectrum.length).toBeGreaterThan(0);

        const peak = spectrum.reduce((best, cur) => (cur.power > best.power ? cur : best), spectrum[0]);
        const expectedPeriod = timeSpan / cyclesInWindow;
        expect(peak.period).toBeCloseTo(expectedPeriod, 0);
    });

    test("'mean' detrend keeps a step spectrum monotonic (peak at the longest period)", () => {
        // A centered step has a ~1/f^2 spectrum: power should grow with period
        // and be largest at the longest retained period. Linear detrending would
        // instead suppress the fundamental and produce an interior hump.
        const n = 512;
        const timeSpan = 512;
        const step = Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1));
        const spectrum = computePeriodogram(step, timeSpan, 'mean');
        expect(spectrum.length).toBeGreaterThan(0);
        const peak = spectrum.reduce((best, cur) => (cur.power > best.power ? cur : best), spectrum[0]);
        const longest = spectrum[spectrum.length - 1];
        expect(peak.period).toBe(longest.period);
    });

    test("'linear' detrend suppresses the step fundamental (interior hump)", () => {
        // Documents the trade-off: the default linear detrend moves the step's
        // peak away from the longest period.
        const n = 512;
        const timeSpan = 512;
        const step = Array.from({ length: n }, (_, i) => (i < n / 2 ? 0 : 1));
        const spectrum = computePeriodogram(step, timeSpan, 'linear');
        const peak = spectrum.reduce((best, cur) => (cur.power > best.power ? cur : best), spectrum[0]);
        const longest = spectrum[spectrum.length - 1];
        expect(peak.period).toBeLessThan(longest.period);
    });

    test("'mean' detrend lets a strong drift dominate over a small rhythm", () => {
        // The complementary trade-off to the linear-detrend ramp test above.
        const n = 256;
        const timeSpan = 256;
        const cyclesInWindow = 8;
        const values = Array.from({ length: n }, (_, i) => 100 * i + Math.sin((2 * Math.PI * cyclesInWindow * i) / n));
        const spectrum = computePeriodogram(values, timeSpan, 'mean');
        const peak = spectrum.reduce((best, cur) => (cur.power > best.power ? cur : best), spectrum[0]);
        // The drift wins: peak is far from the sinusoid's 32 ns period.
        expect(peak.period).toBeGreaterThan(100);
    });

    test('does not return periods longer than the observation window', () => {
        const n = 64;
        const timeSpan = 640;
        const values = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 4 * i) / n));
        const spectrum = computePeriodogram(values, timeSpan);
        spectrum.forEach(pp => {
            expect(pp.period).toBeLessThanOrEqual(timeSpan);
        });
    });
});

describe('formatPeriod', () => {
    test('formats using appropriate time units', () => {
        expect(formatPeriod(500)).toBe('500 ns');
        expect(formatPeriod(1500)).toBe('1.50 µs');
        expect(formatPeriod(2_000_000)).toBe('2.00 ms');
        expect(formatPeriod(3_000_000_000)).toBe('3.00 s');
    });

    test('handles non-finite input', () => {
        expect(formatPeriod(NaN)).toBe('');
        expect(formatPeriod(Infinity)).toBe('');
    });
});

describe('resampleLogBuckets', () => {
    test('returns the requested number of buckets', () => {
        const spectrum = Array.from({ length: 100 }, (_, i) => ({ period: i + 1, power: 1 }));
        const out = resampleLogBuckets(spectrum, 20);
        expect(out.length).toBe(20);
    });

    test('bucket center periods are evenly spaced on a log axis', () => {
        const spectrum = Array.from({ length: 100 }, (_, i) => ({ period: i + 1, power: 1 }));
        const out = resampleLogBuckets(spectrum, 10);
        // Successive log(period) differences should be (nearly) constant.
        const logs = out.map(p => Math.log(p.period));
        const diffs = logs.slice(1).map((v, i) => v - logs[i]);
        const first = diffs[0];
        for (const d of diffs) {
            expect(Math.abs(d - first)).toBeLessThan(1e-9);
        }
    });

    test('preserves the peak power (max) within a bucket', () => {
        const spectrum = [
            { period: 1, power: 1 },
            { period: 2, power: 9 }, // peak
            { period: 3, power: 2 },
            { period: 100, power: 5 }
        ];
        const out = resampleLogBuckets(spectrum, 4);
        expect(Math.max(...out.map(p => p.power))).toBe(9);
    });

    test('handles empty input and degenerate ranges', () => {
        expect(resampleLogBuckets([], 10)).toEqual([]);
        const single = [{ period: 5, power: 3 }];
        expect(resampleLogBuckets(single, 10)).toEqual(single);
    });
});

describe('resampleLinearBuckets', () => {
    test('returns the requested number of buckets', () => {
        const spectrum = Array.from({ length: 100 }, (_, i) => ({ period: i + 1, power: 1 }));
        expect(resampleLinearBuckets(spectrum, 25).length).toBe(25);
    });

    test('bucket center periods are evenly spaced on a linear axis', () => {
        const spectrum = Array.from({ length: 100 }, (_, i) => ({ period: i + 1, power: 1 }));
        const out = resampleLinearBuckets(spectrum, 10);
        const diffs = out.slice(1).map((p, i) => p.period - out[i].period);
        const first = diffs[0];
        for (const d of diffs) {
            expect(Math.abs(d - first)).toBeLessThan(1e-9);
        }
    });

    test('preserves the peak power within a bucket', () => {
        const spectrum = [
            { period: 1, power: 1 },
            { period: 2, power: 9 },
            { period: 3, power: 2 },
            { period: 100, power: 5 }
        ];
        expect(Math.max(...resampleLinearBuckets(spectrum, 4).map(p => p.power))).toBe(9);
    });

    test('handles empty input and degenerate ranges', () => {
        expect(resampleLinearBuckets([], 10)).toEqual([]);
        const single = [{ period: 5, power: 3 }];
        expect(resampleLinearBuckets(single, 10)).toEqual(single);
    });
});

describe('shared-range resampling (for stacked bars)', () => {
    test('different spectra resample to identical bucket centers with a shared range', () => {
        const a = [
            { period: 2, power: 1 },
            { period: 5, power: 4 },
            { period: 20, power: 2 }
        ];
        const b = [
            { period: 3, power: 7 },
            { period: 8, power: 1 },
            { period: 18, power: 3 }
        ];
        const range = { min: 2, max: 20 };
        const ra = resampleLogBuckets(a, 16, range);
        const rb = resampleLogBuckets(b, 16, range);
        expect(ra.length).toBe(16);
        expect(rb.length).toBe(16);
        for (let i = 0; i < ra.length; i++) {
            expect(ra[i].period).toBeCloseTo(rb[i].period, 9);
        }
    });

    test('empty spectrum with an explicit range yields aligned zero buckets', () => {
        const range = { min: 2, max: 20 };
        const out = resampleLogBuckets([], 16, range);
        expect(out.length).toBe(16);
        out.forEach(b => expect(b.power).toBe(0));
        // Same centers as a populated series over the same range.
        const populated = resampleLogBuckets([{ period: 5, power: 1 }], 16, range);
        for (let i = 0; i < out.length; i++) {
            expect(out[i].period).toBeCloseTo(populated[i].period, 9);
        }
    });

    test('linear shared range also aligns centers', () => {
        const range = { min: 0, max: 100 };
        const ra = resampleLinearBuckets([{ period: 10, power: 1 }], 10, range);
        const rb = resampleLinearBuckets([{ period: 90, power: 5 }], 10, range);
        for (let i = 0; i < ra.length; i++) {
            expect(ra[i].period).toBeCloseTo(rb[i].period, 9);
        }
    });
});

describe('fillBucketGaps', () => {
    test('interpolates interior unsampled buckets', () => {
        const power = [10, 0, 0, 4];
        const filled = [true, false, false, true];
        fillBucketGaps(power, filled);
        expect(power[0]).toBe(10);
        expect(power[3]).toBe(4);
        // Linear ramp from 10 -> 4 across index 0..3.
        expect(power[1]).toBeCloseTo(8, 6);
        expect(power[2]).toBeCloseTo(6, 6);
    });

    test('carries edge values for leading and trailing gaps', () => {
        const power = [0, 0, 5, 0];
        const filled = [false, false, true, false];
        fillBucketGaps(power, filled);
        expect(power).toEqual([5, 5, 5, 5]);
    });

    test('leaves genuine zero-power populated buckets untouched', () => {
        const power = [3, 0, 7];
        const filled = [true, true, true];
        fillBucketGaps(power, filled);
        expect(power).toEqual([3, 0, 7]);
    });

    test('leaves everything zero when no bucket is populated', () => {
        const power = [0, 0, 0];
        const filled = [false, false, false];
        fillBucketGaps(power, filled);
        expect(power).toEqual([0, 0, 0]);
    });
});

describe('resample gap bridging', () => {
    test('log resampling of a frequency-uniform spectrum leaves no interior gaps', () => {
        // Periods of a real DFT: period = C / k, which are sparse at the long
        // (large-period) end. Log buckets there would otherwise be empty.
        const C = 1024;
        const spectrum = [];
        for (let k = 512; k >= 2; k--) {
            spectrum.push({ period: C / k, power: 1 });
        }
        spectrum.sort((a, b) => a.period - b.period);
        const out = resampleLogBuckets(spectrum, 100);
        expect(out.length).toBe(100);
        // No interior bucket should be left at zero (all bridged/populated).
        out.forEach(p => expect(p.power).toBeGreaterThan(0));
    });
});
