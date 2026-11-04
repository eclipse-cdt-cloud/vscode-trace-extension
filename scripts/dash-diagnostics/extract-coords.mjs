// Extracts ClearlyDefined coordinate strings from an npm package-lock.json file.
//
// dash-licenses reads package-lock.json, then for each npm dependency it cannot
// resolve from the Eclipse Foundation approved-license list it queries the
// ClearlyDefined API (https://api.clearlydefined.io). ClearlyDefined sits
// behind Cloudflare, and occasionally returns HTTP 524 (Cloudflare origin
// timeout) when its backend is slow. This script turns every dependency in
// package-lock.json into the same "npm/npmjs/<namespace>/<name>/<version>"
// coordinate form used by ClearlyDefined so we can probe them directly (see
// probe-cd.mjs).
//
// Usage:
//   node scripts/dash-diagnostics/extract-coords.mjs [path/to/package-lock.json] > coords.txt
//
// Output: one ClearlyDefined coordinate per line, e.g.
//   npm/npmjs/-/lodash/4.17.21
//   npm/npmjs/@babel/code-frame/7.26.2

import fs from 'fs';

const lockPath = process.argv[2] || 'package-lock.json';
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const coords = new Set();

// npm lockfile v2/v3 store every installed package under "packages", keyed by
// its install path (e.g. "node_modules/@babel/core"). The root project is keyed
// by "" and has no resolvable coordinate, so it is skipped.
const packages = lock.packages || {};
for (const [path, info] of Object.entries(packages)) {
    if (!path) {
        continue; // root project
    }

    // The package name is the path after the last "node_modules/" segment so
    // that nested dependencies resolve to their own coordinate.
    const marker = 'node_modules/';
    const idx = path.lastIndexOf(marker);
    const name = idx === -1 ? path : path.substring(idx + marker.length);
    const version = info.version;
    if (!name || !version) {
        continue; // workspace/link entries without a published version
    }

    // Map to a ClearlyDefined coordinate: scoped packages use the scope as the
    // namespace, unscoped packages use "-".
    let ns = '-';
    let nm = name;
    if (name.startsWith('@')) {
        const slash = name.indexOf('/');
        ns = name.substring(0, slash);
        nm = name.substring(slash + 1);
    }

    coords.add(`npm/npmjs/${ns}/${nm}/${version}`);
}

const arr = [...coords].sort();
process.stdout.write(arr.join('\n') + '\n');
process.stderr.write(`Extracted ${arr.length} unique coordinates from ${lockPath}\n`);
