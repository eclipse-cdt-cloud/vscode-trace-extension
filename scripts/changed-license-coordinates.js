#!/usr/bin/env node
// @ts-check
'use strict';

/*
 * Compute the set of ClearlyDefined coordinates that were ADDED to yarn.lock
 * between two revisions, so a license scan can be run on just those entries
 * instead of the entire dependency graph.
 *
 * This is used to speed up (and de-flake) the 3PP license check on
 * Dependabot "Bump <pkg> from X to Y" pull requests, which only ever add a
 * handful of new resolved package versions to yarn.lock (including any
 * transitive bumps), while leaving the rest of the graph untouched.
 *
 * Usage:
 *   node scripts/changed-license-coordinates.js <old-yarn.lock> <new-yarn.lock>
 *
 * Output:
 *   One ClearlyDefined coordinate per line on stdout, e.g.
 *     npm/npmjs/-/moment/2.31.0
 *     npm/npmjs/@babel/core/7.29.7
 *   Suitable for piping into dash-licenses:  java -jar dash-licenses.jar -
 *
 * Only npm-registry ("resolved" on a registry) packages are emitted. Entries
 * resolved from git/file/link/workspace sources are skipped: dash-licenses
 * cannot resolve them from a ClearlyDefined coordinate and they are not 3PPs
 * published to npm.
 */

const fs = require('fs');

/**
 * Parse a yarn.lock (v1) file into a set of "name@version" resolved entries.
 * We pair each block's `resolved "<registry-url>"` with its `version "<v>"`.
 * @param {string} contents
 * @returns {Map<string, { name: string, version: string }>}
 */
function parseResolvedEntries(contents) {
    /** @type {Map<string, { name: string, version: string }>} */
    const entries = new Map();

    const lines = contents.split(/\r?\n/);
    let version = '';
    let registryName = '';

    const flush = () => {
        if (registryName && version) {
            entries.set(`${registryName}@${version}`, { name: registryName, version });
        }
        version = '';
        registryName = '';
    };

    for (const line of lines) {
        // A new block starts at column 0 with a package selector header
        // (e.g. `moment@^2.10.2:` or `"@babel/core@^7.0.0":`). Blank lines
        // and comments also delimit blocks.
        const isBlockHeader = line.length > 0 && !/^\s/.test(line) && !line.startsWith('#');
        if (isBlockHeader || line.trim() === '') {
            flush();
            continue;
        }

        const vMatch = line.match(/^\s+version:?\s+"?([^"]+)"?\s*$/);
        if (vMatch) {
            version = vMatch[1].trim();
            continue;
        }

        // Only consider packages resolved from an npm registry. The path is
        //   /<name>/-/<basename>-<version>.tgz#<hash>
        // where <name> may be scoped (@scope/pkg).
        const rMatch = line.match(/^\s+resolved\s+"https?:\/\/[^/]+\/((?:@[^/]+\/)?[^/]+)\/-\//);
        if (rMatch) {
            registryName = rMatch[1];
            continue;
        }
    }
    flush();

    return entries;
}

/**
 * Convert a resolved yarn.lock entry to a ClearlyDefined coordinate.
 *   foo         1.2.3  -> npm/npmjs/-/foo/1.2.3
 *   @scope/bar  1.2.3  -> npm/npmjs/@scope/bar/1.2.3
 * @param {{ name: string, version: string }} entry
 * @returns {string}
 */
function toCoordinate({ name, version }) {
    if (name.startsWith('@')) {
        return `npm/npmjs/${name}/${version}`;
    }
    return `npm/npmjs/-/${name}/${version}`;
}

function main() {
    const [oldPath, newPath] = process.argv.slice(2);
    if (!oldPath || !newPath) {
        process.stderr.write('usage: changed-license-coordinates.js <old-yarn.lock> <new-yarn.lock>\n');
        process.exit(2);
    }

    const oldEntries = parseResolvedEntries(fs.readFileSync(oldPath, 'utf8'));
    const newEntries = parseResolvedEntries(fs.readFileSync(newPath, 'utf8'));

    /** @type {string[]} */
    const coordinates = [];
    for (const [key, entry] of newEntries) {
        if (!oldEntries.has(key)) {
            coordinates.push(toCoordinate(entry));
        }
    }

    coordinates.sort();
    if (coordinates.length > 0) {
        process.stdout.write(coordinates.join('\n') + '\n');
    }
}

main();
