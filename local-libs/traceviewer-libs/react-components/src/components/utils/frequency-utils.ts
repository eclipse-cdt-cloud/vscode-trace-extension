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
 * How the series is detrended before the FFT.
 *  - 'linear': remove the least-squares line (suppresses drift; keeps a rhythm
 *    on a ramp detectable, but distorts steps/transients).
 *  - 'mean':   remove only the DC offset (faithful transient spectra, but drift
 *    dominates the long-period end).
 */
export type DetrendMode = 'linear' | 'mean';

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
 * The series is detrended (see `detrend`) and multiplied by a Hann window
 * before the FFT, so a constant offset or a slow drift does not swamp the
 * low-frequency (long-period) bins and spectral leakage is reduced. Power is
 * normalized by the window energy so estimates stay comparable.
 *
 * @param values   The sampled y-values (uniformly spaced in time).
 * @param timeSpan The total duration covered by `values` (end - start), in any
 *                 time unit. The returned periods use the same unit.
 * @param detrend  Detrending mode, defaults to 'linear'. See {@link DetrendMode}.
 * @returns        Array of {period, power}, sorted by ascending period, limited
 *                 to periods that fit inside the observation window and are at
 *                 least the Nyquist period (2 * sample interval).
 */
export function computePeriodogram(values: number[], timeSpan: number, detrend: DetrendMode = 'linear'): PeriodPower[] {
    const n = values.length;
    if (n < 4 || !Number.isFinite(timeSpan) || timeSpan <= 0) {
        return [];
    }

    // Sanitize input (replace non-finite samples with 0 before fitting).
    const y = new Array<number>(n);
    for (let i = 0; i < n; i++) {
        const v = Number(values[i]);
        y[i] = Number.isFinite(v) ? v : 0;
    }

    // Detrend before the FFT.
    //  - 'linear' removes the least-squares line (a + b * i). Trace signals
    //    frequently drift (counters, cumulative values); a residual trend leaks
    //    a large amount of power into the lowest-frequency (longest-period)
    //    bins and lets the drift bury genuine periodic components. Removing the
    //    line keeps a rhythm riding on a drift detectable. The trade-off is that
    //    it also attenuates the fundamental of a step/transient, which distorts
    //    the shape of an aperiodic signal's spectrum.
    //  - 'mean' removes only the DC offset. This faithfully reproduces the
    //    spectrum of transients (e.g. a step is monotonic ~1/f^2), but a strong
    //    drift will dominate the long-period end.
    // Sampling index t = i, with i = 0 .. n - 1.
    let sumY = 0;
    for (let i = 0; i < n; i++) {
        sumY += y[i];
    }
    const meanT = (n - 1) / 2;
    const meanY = sumY / n;
    let slope = 0;
    if (detrend === 'linear') {
        let cov = 0; // sum((t - meanT) * (y - meanY))
        let varT = 0; // sum((t - meanT)^2)
        for (let i = 0; i < n; i++) {
            const dtIdx = i - meanT;
            cov += dtIdx * (y[i] - meanY);
            varT += dtIdx * dtIdx;
        }
        slope = varT > 0 ? cov / varT : 0;
    }
    const intercept = meanY - slope * meanT;

    // Hann window to reduce spectral leakage. Without a window, energy from any
    // component that does not fall exactly on a DFT bin smears across the whole
    // spectrum (worst near the low-frequency end).
    const m = nextPow2(n);
    const re = new Array<number>(m).fill(0);
    const im = new Array<number>(m).fill(0);
    let windowEnergy = 0; // sum(w[i]^2), used to normalize the power estimate
    for (let i = 0; i < n; i++) {
        const w = n > 1 ? 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1))) : 1;
        const detrended = y[i] - (intercept + slope * i);
        re[i] = detrended * w;
        windowEnergy += w * w;
    }
    if (windowEnergy <= 0) {
        windowEnergy = n;
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
        // Normalize by the window energy so the estimate is comparable across
        // window shapes (for a rectangular window this reduces to / n).
        const power = (re[k] * re[k] + im[k] * im[k]) / windowEnergy;
        result.push({ period, power });
    }

    // Ascending by period (shortest period / highest frequency first).
    result.sort((a, b) => a.period - b.period);
    return result;
}

/**
 * Fills buckets that received no spectral component (`filled[i] === false`) by
 * interpolating across the gap, so an under-sampled region of the axis does not
 * show as isolated bars with wide empty spaces between them.
 *
 * Buckets are uniform in the axis' own space (log-period or linear-period), so
 * interpolating in bucket-index space is equivalent to interpolating along the
 * displayed axis. A gap that touches an edge is filled by carrying the nearest
 * populated value (constant extrapolation). Buckets that received a component
 * are left untouched, even when their power is zero, so genuinely quiet regions
 * are preserved and only unsampled gaps are bridged.
 */
export function fillBucketGaps(power: number[], filled: boolean[]): void {
    const n = power.length;
    let i = 0;
    while (i < n) {
        if (filled[i]) {
            i++;
            continue;
        }
        // [i, j) is a maximal run of unsampled buckets.
        let j = i;
        while (j < n && !filled[j]) {
            j++;
        }
        const left = i - 1; // last populated bucket before the run (or -1)
        const right = j; // first populated bucket after the run (or n)
        if (left < 0 && right >= n) {
            // Nothing populated anywhere: leave as zeros.
        } else if (left < 0) {
            // Leading gap: carry the first populated value backwards.
            for (let k = i; k < j; k++) {
                power[k] = power[right];
            }
        } else if (right >= n) {
            // Trailing gap: carry the last populated value forwards.
            for (let k = i; k < j; k++) {
                power[k] = power[left];
            }
        } else {
            // Interior gap: linearly interpolate between the two populated ends.
            const span = right - left;
            for (let k = i; k < j; k++) {
                const t = (k - left) / span;
                power[k] = power[left] + t * (power[right] - power[left]);
            }
        }
        i = j;
    }
}

/**
 * Resamples a periodogram onto logarithmically-spaced period buckets.
 *
 * The raw periodogram has periods period = (m·dt)/k, which are dense at short
 * periods and sparse at long ones. On a logarithmic period axis those points
 * bunch together at the short-period end. This redistributes the spectrum onto
 * `numBuckets` equal-width buckets in log-period space, so the resulting bars
 * are evenly spread across a logarithmic axis.
 *
 * Each bucket is represented by its geometric-center period and the maximum
 * power of the components falling inside it (peak-preserving). Empty buckets
 * are kept with zero power so the axis spacing stays uniform.
 *
 * @param spectrum   Periodogram sorted by ascending period (from computePeriodogram).
 * @param numBuckets Number of log-spaced buckets to produce.
 * @param range      Optional explicit period range for the bucket grid. When
 *                   several series must share an aligned grid (e.g. for stacked
 *                   bars), pass the same range to each so bucket centers match.
 * @returns          Resampled {period, power}, ascending by period.
 */
export function resampleLogBuckets(
    spectrum: PeriodPower[],
    numBuckets: number,
    range?: { min: number; max: number }
): PeriodPower[] {
    if (numBuckets < 1) {
        return [];
    }
    const minPeriod = range ? range.min : spectrum.length ? spectrum[0].period : NaN;
    const maxPeriod = range ? range.max : spectrum.length ? spectrum[spectrum.length - 1].period : NaN;
    if (!(minPeriod > 0) || !(maxPeriod > 0) || maxPeriod <= minPeriod) {
        // Degenerate range: nothing meaningful to redistribute.
        return spectrum.slice();
    }

    const logMin = Math.log(minPeriod);
    const logMax = Math.log(maxPeriod);
    const step = (logMax - logMin) / numBuckets;

    const power = new Array<number>(numBuckets).fill(0);
    const filled = new Array<boolean>(numBuckets).fill(false);
    for (const s of spectrum) {
        if (!(s.period > 0)) {
            continue;
        }
        let idx = Math.floor((Math.log(s.period) - logMin) / step);
        if (idx < 0) {
            idx = 0;
        } else if (idx >= numBuckets) {
            idx = numBuckets - 1;
        }
        if (!filled[idx] || s.power > power[idx]) {
            power[idx] = s.power;
        }
        filled[idx] = true;
    }

    // Bridge under-sampled gaps (common at the long-period end, where DFT bins
    // are spaced several log-buckets apart) so bars stay evenly distributed.
    fillBucketGaps(power, filled);

    const result: PeriodPower[] = [];
    for (let i = 0; i < numBuckets; i++) {
        // Geometric center of the bucket, in linear period units.
        const period = Math.exp(logMin + (i + 0.5) * step);
        result.push({ period, power: power[i] });
    }
    return result;
}

/**
 * Resamples a periodogram onto linearly-spaced (uniform-period) buckets.
 *
 * The raw periodogram is uniform in frequency, so its periods (period = C/k)
 * bunch up at the short-period end. On a *linear* period axis that looks like a
 * logarithmic sampling. This redistributes the spectrum onto `numBuckets`
 * equal-width buckets in linear period space so the bars are evenly spread
 * across a linear axis.
 *
 * Each bucket is represented by its midpoint period and the maximum power of
 * the components falling inside it (peak-preserving). Empty buckets are kept at
 * zero power so the axis spacing stays uniform.
 *
 * @param spectrum   Periodogram sorted by ascending period (from computePeriodogram).
 * @param numBuckets Number of linearly-spaced buckets to produce.
 * @param range      Optional explicit period range for the bucket grid, so
 *                   multiple series can share an aligned grid (e.g. stacked bars).
 * @returns          Resampled {period, power}, ascending by period.
 */
export function resampleLinearBuckets(
    spectrum: PeriodPower[],
    numBuckets: number,
    range?: { min: number; max: number }
): PeriodPower[] {
    if (numBuckets < 1) {
        return [];
    }
    const minPeriod = range ? range.min : spectrum.length ? spectrum[0].period : NaN;
    const maxPeriod = range ? range.max : spectrum.length ? spectrum[spectrum.length - 1].period : NaN;
    if (!(maxPeriod > minPeriod)) {
        // Degenerate range: nothing meaningful to redistribute.
        return spectrum.slice();
    }

    const step = (maxPeriod - minPeriod) / numBuckets;
    const power = new Array<number>(numBuckets).fill(0);
    const filled = new Array<boolean>(numBuckets).fill(false);
    for (const s of spectrum) {
        let idx = Math.floor((s.period - minPeriod) / step);
        if (idx < 0) {
            idx = 0;
        } else if (idx >= numBuckets) {
            idx = numBuckets - 1;
        }
        if (!filled[idx] || s.power > power[idx]) {
            power[idx] = s.power;
        }
        filled[idx] = true;
    }

    // Bridge under-sampled gaps so the bars stay evenly distributed instead of
    // collapsing to a few isolated stems at the short-period end.
    fillBucketGaps(power, filled);

    const result: PeriodPower[] = [];
    for (let i = 0; i < numBuckets; i++) {
        // Midpoint of the bucket in linear period units.
        const period = minPeriod + (i + 0.5) * step;
        result.push({ period, power: power[i] });
    }
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
