// Probes the ClearlyDefined API in batches, mimicking how dash-licenses queries
// it, and reports the status and latency of each batch. Use this to diagnose
// intermittent Cloudflare HTTP 524 ("origin timeout") failures from the
// "3PP License Check" workflow (npm run license:check).
//
// The 524 is a server-side timeout at ClearlyDefined, NOT a property of a
// specific dependency: the slow/aborted batch moves between runs. This tool
// lets you confirm that when ClearlyDefined is misbehaving, and (with --bisect)
// narrow a slow batch down to individual coordinates if you want to check
// whether one particular package is consistently slow.
//
// Prereqs:
//   node scripts/dash-diagnostics/extract-coords.mjs package-lock.json > /tmp/cd-coords.txt
//
// Usage:
//   node scripts/dash-diagnostics/probe-cd.mjs [coords-file]
//
// Env vars:
//   BATCH   batch size (default 50, matches configs/license-check-config.json)
//   TMO     per-batch timeout in ms (default 60000)
//   RUNS    number of full passes to repeat (default 1); use >1 to observe that
//           the slow batch is not stable across runs
//   BISECT  if "1", any batch that errors/times out is recursively bisected down
//           to the individual coordinate(s) that are slow
//
// Examples:
//   # Single pass, default batch of 50:
//   node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt
//
//   # Repeat 5 times to demonstrate the failure is transient:
//   RUNS=5 node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt
//
//   # Bisect any slow batch to the offending coordinate(s):
//   BISECT=1 TMO=90000 node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt

import fs from 'fs';

const coordsFile = process.argv[2] || '/tmp/cd-coords.txt';
const ALL = fs.readFileSync(coordsFile, 'utf8').split('\n').filter(Boolean);
const API = 'https://api.clearlydefined.io/definitions';
const BATCH = parseInt(process.env.BATCH || '50', 10);
const PERBATCH_TIMEOUT_MS = parseInt(process.env.TMO || '60000', 10);
const RUNS = parseInt(process.env.RUNS || '1', 10);
const BISECT = process.env.BISECT === '1';
const SLOW_MS = parseInt(process.env.SLOW_MS || '20000', 10);

function chunk(a, n) {
    const out = [];
    for (let i = 0; i < a.length; i += n) {
        out.push(a.slice(i, i + n));
    }
    return out;
}

async function postBatch(coords) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PERBATCH_TIMEOUT_MS);
    const start = Date.now();
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(coords),
            signal: ctrl.signal
        });
        const ms = Date.now() - start;
        let bodyLen = 0;
        try {
            const text = await res.text();
            bodyLen = text.length;
        } catch (e) {
            /* ignore body read errors */
        }
        return { status: res.status, ms, bodyLen };
    } catch (e) {
        const ms = Date.now() - start;
        return { status: 'ERR', ms, err: `${e.name}:${e.message}` };
    } finally {
        clearTimeout(t);
    }
}

function isBad(r) {
    return r.status === 524 || r.status === 'ERR' || r.ms > SLOW_MS;
}

// Recursively bisect a slow group of coordinates to find the offender(s).
async function bisect(coords, depth = 0) {
    const indent = '    '.repeat(depth + 1);
    if (coords.length === 1) {
        const r = await postBatch(coords);
        console.log(`${indent}COORD ${coords[0]} status=${r.status} ms=${r.ms} ${isBad(r) ? '<<< OFFENDER' : 'ok'}`);
        return isBad(r) ? coords : [];
    }
    const mid = Math.floor(coords.length / 2);
    const halves = [coords.slice(0, mid), coords.slice(mid)];
    const offenders = [];
    for (const half of halves) {
        const r = await postBatch(half);
        console.log(`${indent}sub-batch size=${half.length} status=${r.status} ms=${r.ms}${isBad(r) ? '  <<< slow, recursing' : ''}`);
        if (isBad(r)) {
            offenders.push(...(await bisect(half, depth + 1)));
        }
    }
    return offenders;
}

async function runOnce(runIdx) {
    const batches = chunk(ALL, BATCH);
    console.log(
        `RUN ${runIdx}: probing ${ALL.length} coords in ${batches.length} batches of ${BATCH}, per-batch timeout ${PERBATCH_TIMEOUT_MS}ms`
    );
    const allOffenders = [];
    for (let i = 0; i < batches.length; i++) {
        const r = await postBatch(batches[i]);
        const flag = isBad(r) ? '  <<< SLOW/ERROR' : '';
        const lo = String(i * BATCH).padStart(4);
        const hi = String(i * BATCH + batches[i].length - 1).padStart(4);
        console.log(
            `  batch ${String(i).padStart(3)} [${lo}-${hi}] status=${r.status} ms=${r.ms} bytes=${r.bodyLen ?? '-'} ${r.err ?? ''}${flag}`
        );
        if (isBad(r) && BISECT) {
            console.log('    bisecting slow batch...');
            allOffenders.push(...(await bisect(batches[i])));
        }
    }
    if (BISECT && allOffenders.length) {
        console.log(`RUN ${runIdx} offenders: ${allOffenders.join(', ')}`);
    }
}

for (let run = 1; run <= RUNS; run++) {
    await runOnce(run);
}
console.log('DONE');
