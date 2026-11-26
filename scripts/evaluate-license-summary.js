#!/usr/bin/env node
// @ts-check
'use strict';

/*
 * Evaluate a dash-licenses summary file the same way the
 * @eclipse-dash/nodejs-wrapper does, applying the project's exclusions file.
 *
 * The dash-licenses jar always exits 0 after writing its summary; it is the
 * wrapper that decides pass/fail by looking for "restricted" entries that are
 * not excluded. When we scan a short list of coordinates by calling the jar
 * directly (see scripts/license-check.sh "changed" mode), we need to
 * reproduce that decision here.
 *
 * Usage:
 *   node scripts/evaluate-license-summary.js <summary-file> [<exclusions-file>]
 *
 * Exit codes:
 *   0  no restricted dependencies (or all excluded by configuration)
 *   N  N restricted dependencies not covered by the exclusions file
 *      (mirrors the wrapper, which exits with the count of unhandled entries)
 */

const fs = require('fs');

/**
 * Parse the dash-licenses summary. Each line is:
 *   <dependency>, <license>, <status>, <source>
 * @param {string} summaryPath
 * @returns {{ dependency: string, license: string, status: string, source: string }[]}
 */
function readSummary(summaryPath) {
    if (!fs.existsSync(summaryPath)) {
        return [];
    }
    const contents = fs.readFileSync(summaryPath, 'utf8');
    return contents
        .split(/\r?\n/)
        .filter(line => line.trim() !== '')
        .map(line => {
            const [dependency, license, status, source] = line.split(', ');
            return { dependency, license, status, source };
        });
}

/**
 * Read the exclusions file. Supports both the array and object formats that
 * the wrapper accepts.
 * @param {string} exclusionsPath
 * @returns {Map<string, unknown>}
 */
function readExclusions(exclusionsPath) {
    const json = JSON.parse(fs.readFileSync(exclusionsPath, 'utf8'));
    if (Array.isArray(json)) {
        return new Map(json.map(element => [element, null]));
    }
    if (typeof json === 'object' && json !== null) {
        return new Map(Object.entries(json));
    }
    throw new Error(`Invalid format for exclusions file "${exclusionsPath}"`);
}

function main() {
    const [summaryPath, exclusionsPath] = process.argv.slice(2);
    if (!summaryPath) {
        process.stderr.write('usage: evaluate-license-summary.js <summary-file> [<exclusions-file>]\n');
        process.exit(2);
    }

    const restricted = readSummary(summaryPath)
        .filter(entry => (entry.status || '').toLowerCase() === 'restricted')
        .sort((a, b) => a.dependency.localeCompare(b.dependency));

    if (restricted.length === 0) {
        process.stdout.write('Found no dependency that requires further investigation. Good job!\n');
        process.exit(0);
    }

    const exclusions = exclusionsPath && fs.existsSync(exclusionsPath) ? readExclusions(exclusionsPath) : new Map();

    const unhandled = restricted.filter(entry => !exclusions.has(entry.dependency));

    if (unhandled.length > 0) {
        process.stderr.write('Found restricted dash-licenses results that are not filtered by configuration!\n');
        for (const entry of unhandled) {
            process.stderr.write(`> ${entry.dependency} (${entry.license}) [${entry.status}]\n`);
        }
        process.exit(unhandled.length);
    }

    process.stdout.write('Some restricted dependencies were found, but all were excluded by configuration!\n');
    process.exit(0);
}

main();
