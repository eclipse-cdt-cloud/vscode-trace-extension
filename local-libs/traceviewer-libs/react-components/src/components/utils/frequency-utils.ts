/**
 * Utilities to transform a uniformly-sampled time series into a
 * frequency/period spectrum (periodogram).
 *
 * The XY output samples each series uniformly across the displayed time
 * window, so we can estimate the power at each frequency using a Discrete
 * Fourier Transform and express the result as periods (period = 1 / frequency).
 */

export interface PeriodPower {
    /** Period in the same time unit as the provided time span (e.g. nanoseconds). */
    period: number;
    /** Spectral power at that period. */
    power: number;
}

/**
 * Returns the smallest power of two that is greater than or equal to `n`.
 */
export function nextPow2(n: number): number {
    let p = 1;
    while (p < n) {
        p <<= 1;
    }
    return p;
}

/**
 * In-place iterative radix-2 Cooley-Tukey FFT.
 * `re` and `im` must have the same length, which must be a power of two.
 * On return, `re`/`im` hold the real/imaginary parts of the transform.
 */
export function fft(re: number[], im: number[]): void {
    const n = re.length;
    if (n <= 1) {
        return;
    }
    if ((n & (n - 1)) !== 0) {
        throw new Error('fft: input length must be a power of two');
    }

    // Bit-reversal permutation.
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) {
            j ^= bit;
        }
        j ^= bit;
        if (i < j) {
            const tmpRe = re[i];
            re[i] = re[j];
            re[j] = tmpRe;
            const tmpIm = im[i];
            im[i] = im[j];
            im[j] = tmpIm;
        }
    }

    // Butterfly stages.
    for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len;
        const wRe = Math.cos(ang);
        const wIm = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let curRe = 1;
            let curIm = 0;
            const half = len >> 1;
            for (let k = 0; k < half; k++) {
                const evenRe = re[i + k];
                const evenIm = im[i + k];
                const oddReRaw = re[i + k + half];
                const oddImRaw = im[i + k + half];
                const oddRe = oddReRaw * curRe - oddImRaw * curIm;
                const oddIm = oddReRaw * curIm + oddImRaw * curRe;

                re[i + k] = evenRe + oddRe;
                im[i + k] = evenIm + oddIm;
                re[i + k + half] = evenRe - oddRe;
                im[i + k + half] = evenIm - oddIm;

                const nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}

/**
 * Computes a periodogram from a uniformly-sampled series.
 *
 * @param values   The sampled y-values (uniformly spaced in time).
 * @param timeSpan The total duration covered by `values` (end - start), in any
 *                 time unit. The returned periods use the same unit.
 * @returns        Array of {period, power}, sorted by ascending period, limited
 *                 to periods that fit inside the observation window and are at
 *                 least the Nyquist period (2 * sample interval).
 */
export function computePeriodogram(values: number[], timeSpan: number): PeriodPower[] {
    const n = values.length;
    if (n < 4 || !Number.isFinite(timeSpan) || timeSpan <= 0) {
        return [];
    }

    // Detrend by removing the mean (DC component) so the constant offset does
    // not dominate the spectrum.
    let mean = 0;
    for (let i = 0; i < n; i++) {
        const v = Number(values[i]);
        mean += Number.isFinite(v) ? v : 0;
    }
    mean /= n;

    const m = nextPow2(n);
    const re = new Array<number>(m).fill(0);
    const im = new Array<number>(m).fill(0);
    for (let i = 0; i < n; i++) {
        const v = Number(values[i]);
        re[i] = (Number.isFinite(v) ? v : 0) - mean;
    }

    fft(re, im);

    const dt = timeSpan / n; // sample interval
    const result: PeriodPower[] = [];
    for (let k = 1; k <= m >> 1; k++) {
        // With zero-padding to length m, bin k maps to frequency k / (m * dt),
        // hence period = (m * dt) / k.
        const period = (m * dt) / k;
        if (period > timeSpan) {
            // Longer than the observation window: not physically meaningful.
            continue;
        }
        const power = (re[k] * re[k] + im[k] * im[k]) / n;
        result.push({ period, power });
    }

    // Ascending by period (shortest period / highest frequency first).
    result.sort((a, b) => a.period - b.period);
    return result;
}

/**
 * Formats a period given in nanoseconds into a compact human-readable string
 * with an appropriate time unit.
 */
export function formatPeriod(ns: number): string {
    if (!Number.isFinite(ns)) {
        return '';
    }
    const abs = Math.abs(ns);
    if (abs >= 1e9) {
        return `${(ns / 1e9).toFixed(2)} s`;
    }
    if (abs >= 1e6) {
        return `${(ns / 1e6).toFixed(2)} ms`;
    }
    if (abs >= 1e3) {
        return `${(ns / 1e3).toFixed(2)} µs`;
    }
    return `${Math.round(ns)} ns`;
}
