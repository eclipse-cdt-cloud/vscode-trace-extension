import { nextPow2, fft, computePeriodogram, formatPeriod } from '../frequency-utils';

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
