/***************************************************************************************
 * Copyright (c) 2020 Ericsson and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
// Note: copied from
// https://github.com/eclipse-cdt-cloud/theia-trace-extension/blob/v0.7.2/scripts/typescript-references.js

const cp = require('child_process')
const fs = require('fs')
const jsonc = require('jsonc-parser')
const path = require('path')

/** @type {jsonc.ParseOptions} */
const parseOptions = {
    allowTrailingComma: true,
    allowEmptyContent: true,
}

/** @type {jsonc.FormattingOptions} */
const formattingOptions = {
    insertFinalNewline: true,
    insertSpaces: true,
    tabSize: 4,
}

main().catch(error => {
    console.error(error)
    process.exitCode = 1
})

async function main() {
    const projectCwd = path.resolve(__dirname, '..')
    const workspaces = getWorkspaces(projectCwd)
    workspaces['monorepo'] = {
        location: ensurePosixLike(path.relative(process.cwd(), projectCwd)),
        workspaceDependencies: Object.keys(workspaces),
    }
    await Promise.all(Object.entries(workspaces).map(async ([name, workspace]) => {
        const tsconfigPath = path.join(projectCwd, workspace.location, 'tsconfig.json')
        if (await fs.promises.stat(tsconfigPath).then(stat => false, error => true)) {
            delete workspaces[name] // remove workspaces that aren't TypeScript projects
        }
    }))
    await Promise.all(Object.values(workspaces).map(async workspace => {
        const tsconfigPath = path.join(projectCwd, workspace.location, 'tsconfig.json')
        const tsconfigText = await fs.promises.readFile(tsconfigPath, 'utf8')
        /** @type {jsonc.ParseError[]} */
        const errors = []
        const tsconfig = jsonc.parseTree(tsconfigText, errors, parseOptions)
        if (errors.length > 0) {
            throw new Error(`Parse Error in ${tsconfigPath}:\n${errors
                .map(error => `  ${jsonc.printParseErrorCode(error.error)} at offset: ${error.offset}, length: ${error.length}`)
                .join('\n')
            }`)
        }
        const expected = workspace.workspaceDependencies
            .sort()
            .filter(dep => dep in workspaces)
            .map(dep => ({
                path: ensurePosixLike(path.relative(path.resolve(projectCwd, workspace.location), workspaces[dep].location))
            }))
        const references = jsonc.findNodeAtLocation(tsconfig, ['references'])
        if (!references || JSON.stringify(expected) !== JSON.stringify(jsonc.getNodeValue(references))) {
            const edits = jsonc.modify(tsconfigText, ['references'], expected, { formattingOptions })
            const updated = jsonc.applyEdits(tsconfigText, edits)
            await fs.promises.writeFile(tsconfigPath, updated, 'utf8')
        }
    }))
}

/**
 * Reproduces the shape of `yarn workspaces info`, i.e. a map of
 * workspace package name -> { location, workspaceDependencies }, using npm.
 *
 * `location` is the workspace path relative to the monorepo root (POSIX-like).
 * `workspaceDependencies` are the names of other workspaces that this
 * workspace depends on (via dependencies/devDependencies/peerDependencies/
 * optionalDependencies), matching yarn's behaviour.
 *
 * @param {string} projectCwd absolute path to the monorepo root
 * @returns {Record<string, { location: string, workspaceDependencies: string[] }>}
 */
function getWorkspaces(projectCwd) {
    // `npm query .workspace` returns one entry per workspace package, each with
    // its on-disk `location` and parsed package.json fields.
    const queried = JSON.parse(
        cp.execSync('npm query .workspace', { cwd: projectCwd }).toString()
    )

    const byName = {}
    for (const pkg of queried) {
        if (pkg.name) {
            byName[pkg.name] = pkg
        }
    }
    const names = new Set(Object.keys(byName))

    /** @type {Record<string, { location: string, workspaceDependencies: string[] }>} */
    const workspaces = {}
    for (const [name, pkg] of Object.entries(byName)) {
        const location = ensurePosixLike(
            path.relative(projectCwd, pkg.realpath || pkg.path || pkg.location)
        )
        const allDeps = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
            ...(pkg.peerDependencies || {}),
            ...(pkg.optionalDependencies || {}),
        }
        const workspaceDependencies = Object.keys(allDeps).filter(dep => names.has(dep))
        workspaces[name] = { location, workspaceDependencies }
    }
    return workspaces
}

/**
 * @param {string} what
 * @returns {string}
 */
function ensurePosixLike(what) {
    return process.platform === 'win32'
        ? what.replace(/\\/g, '/')
        : what
}
