# Dash-licenses / ClearlyDefined diagnostics

Tools to diagnose the intermittent **Cloudflare HTTP 524** failures seen in the
`3PP License Check` GitHub workflow (`.github/workflows/license-check-workflow.yml`,
which runs `npm run license:check`).

## TL;DR — is a specific dependency to blame?

**No.** The 524 is a *Cloudflare "origin timeout"*: Cloudflare fronts
`api.clearlydefined.io` and returns 524 when the ClearlyDefined backend does not
respond within Cloudflare's ~100 s window. It is a **transient, server-side**
condition on ClearlyDefined, not a property of any package in `package-lock.json`.

Evidence (reproducible with the scripts here):

- Only a small subset of dependencies actually reach ClearlyDefined; the rest are
  resolved by the Eclipse Foundation approved-license list and never touch
  Cloudflare.
- Probing every coordinate directly against the ClearlyDefined batch API returns
  HTTP 200 in well under 1 s per batch — **when the service is healthy**.
- Repeating the probe shows the slow/aborted batch **moves between runs** (e.g.
  batch 19 hangs on one pass, batch 0 on the next, none on a third). A
  dependency-specific problem would fail on the *same* batch every time.

This is why `license:check` in the workflow is wrapped in a retry loop that only
retries the transient "inconclusive" case (dash-licenses exit code `127`) and
fails fast on genuine restricted-dependency findings. The ClearlyDefined batch
size and per-batch timeout are also kept small (`configs/license-check-config.json`:
`batch: 25`, `timeout: 60`) so a stalled batch aborts quickly and blocks fewer
coordinates, letting retries finish within the job time budget.

## Usage

Run from the repo root.

```bash
# 1. Extract ClearlyDefined coordinates from package-lock.json
node scripts/dash-diagnostics/extract-coords.mjs package-lock.json > /tmp/cd-coords.txt

# 2. Probe ClearlyDefined in batches (default batch size 50, matching
#    configs/license-check-config.json)
node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt

# Repeat several passes to show the failure is transient (not a fixed dependency)
RUNS=5 node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt

# If a batch is slow, bisect it down to the individual coordinate(s)
BISECT=1 TMO=90000 node scripts/dash-diagnostics/probe-cd.mjs /tmp/cd-coords.txt
```

### Env vars for `probe-cd.mjs`

| Var       | Default | Meaning                                                        |
| --------- | ------- | -------------------------------------------------------------- |
| `BATCH`   | `50`    | Coordinates per request (matches the license-check config).    |
| `TMO`     | `60000` | Per-batch timeout in ms before the request is aborted.         |
| `RUNS`    | `1`     | Number of full passes; use `>1` to observe transience.         |
| `BISECT`  | unset   | If `1`, recursively bisect any slow batch to the offender(s).  |
| `SLOW_MS` | `20000` | A batch slower than this is flagged as slow.                   |

## Running the real tool instead

To reproduce exactly what CI does (uses the Eclipse Foundation list first, only
querying ClearlyDefined for the remainder):

```bash
npm ci --ignore-scripts
npm run license:check
```

The dash-licenses jar can also be invoked directly for finer control:

```bash
java -jar node_modules/@eclipse-dash/nodejs-wrapper/download/dash-licenses.jar \
  -batch 50 -timeout 240 -project ecd.cdt-cloud -summary summary.txt package-lock.json
```
