# Using vscode-trace-extension.code-workspace for development

That workspace file defines a multi-root workspace that permits developing/debugging the VSCode Trace Viewer extension as if its trace-related dependencies source code were in this repository.

## Setup

### Dependent git repos in place, checked-out at appropriate commit/branch/tag

It's assumed that the following trace-related git repos exist, along side this repo, each checked-out at an appropriate baseline, for the task at-hand.  Probably a new dev branch, created from the latest master, would be appropriate most of the time, to start development of a new cross-repo feature (for the repos that need to be modified, else latest master is good):

- theia-trace-extension
- tsp-typescript-client
- timeline-chart

### Cross-repo-development `resolutions` root `package.json` entries temporarily added

To whatever content is already in the `resolutions` object, add the four trace libraries, pointing to their "workspace" (see example below). This will override the use of `npm` to fetch these published dependencies and instead the ones locally built from source will be used.

```json
// before:
"resolutions": {
    "@vscode/vsce": "2.25.0"
}

//after:
"resolutions": {
     "@vscode/vsce": "2.25.0",
     "traceviewer-base": "file:../theia-trace-extension/packages/base",
     "traceviewer-react-components": "file:../theia-trace-extension/packages/react-components",
     "tsp-typescript-client": "file:../tsp-typescript-client/tsp-typescript-client",
     "timeline-chart": "file:../timeline-chart/timeline-chart"
 }
```

Note: the added `resolution` entries are temporary and need to be removed after, not checked-in along with the new developed feature. Also, their presence will result in a modified `yarn.lock` that should also not be checked-in along with any useful change/feature (first remove the resolutions, clean and rebuild).

## Development

### Open the workspace file

Option 1: start VSCode / VSCodium with the workspace:

```bash
cd <vscode-trace-extension repo>
codium ./vscode-trace-extension.code-workspace
```

Option 2: Or start VSCode / VSCodium in the repo and then `File -> Open Workspace from File` and select file `scode-trace-extension.code-workspace` at the repo root.

Once the multi-root workspace is open, all the trace library's source code will be available as if all in the current repo. Using this setup, one can add features that spawn-over several of these repositories, build and test the resulting VSCode Trace Viewer extension.

### Build / Watch tasks

When the multi-root workspace is opened, a build of all the dependent trace libraries and then of the current repo, will be triggered, as a VSCode task. You can follow it in the UI. If wanted, that task can be retriggered:

Tasks -> Run task -> `Build all trace repositories`

That's a "parent task", that calls one "child" build task per trace repo. The child tasks are also available to be called individually, if needed. e.g.:

Tasks -> Run task -> `Build theia-trace-extension`

During development, there's a "watch" task that will monitor and  rebuild individual dependent trace libraries when their code is modified:

Tasks -> Run task -> `Watch all trace libraries Workspaces`

This task will start one sub-task for each library. Any change to the source code of these libraries will be detected by its watch task and a rebuild will happen. Any compile error will be reported in the `Problems` view, and should obviously be addressed.

## Limitations

### Manual setup for every dependent git repository to the correct/desired baseline (branch.commit/tag)

The Trace libraries used to build from sources here do not affect the build in other Trace libraries repos. For example, here the version of `tsp-typescript-client` used will be built from sources from whatever source code exists under `../tsp-typescript-client/`. In consequence, it's necessary that each theia library repo used be first checked-out at an appropriate version. That version might be latest master for everything, or not, depending on context.

### Manual managing of Trace libraries "resolutions" entries

The `resolutions` entries added in the root `package.json`, that make it so the build will; use the local git repos as source for the "trace" libraries needed by the VSCode Trace Viewer, should not be checked-in or be submitted as part of a PR.

Related TODO: find a better way vs manual, to add/remove those `resolutions` entries as needed

Similarly, in this repo (vscode-trace-extension), building with the multi-root cross-repo development workspace will result in `yarn.lock` being updated to reflect that the "trace libraries" dependencies have been sourced locally (see example below). We do not want to check this in, or submit this as part of a PR.

e.g. of `yarn.lock` change resulting from using a local `tsp-typescript-client` library:

```diff
-tsp-typescript-client@^0.6.0:
-  version "0.6.0"
-  resolved "https://registry.npmjs.org/tsp-typescript-client/-/tsp-typescript-client-0.6.0.tgz#59d53a76dcb7759f8f16eb9e798320a9a790b7b1"
-  integrity sha512-K6tl773Nq7lo2XAexHBtVDKiFGUlrwFbzKL6aZkf33iHRyAM80xBc0cAoXXTgsSLb3pBodLQRVzw8sBTGWGwOA==
+tsp-typescript-client@^0.6.0, "tsp-typescript-client@file:../tsp-typescript-client/tsp-typescript-client":
+  version "0.5.1"
```

### Watch mode and trace dependency chain

The "watch" task described above narrowly monitors the trace libraries needed in this repo. Any other components in these repos will not be rebuilt, when a change is detected. e.g. changes in the `traceviewer-base` library will not result in the `theia-traceviewer` extension or the `Theia example applications` being rebuilt. To rebuild everything and make sure changes "play well" in their own repos as well, one can use the "Rebuild all [...]" task - see above.

In an ideal world, rebuilds of all cmoponents that need to be, following a code change, would be automatic (like it is in a monorepo). The difficulty here is that the libraries in other repos are not part of a single, unified `tsconfig` configuration, where the cross-repo dependencies are correctly defined, permitting the TS compiler to strategically rebuild as needed. Perhaps we can find a way to achieve such a configuration when using the multi-root workspace, and make the rebuild of all dependent components automatic.

### Watch mode and rebuild of `vscode-trace-extension`

It seems that using resolutions to pull the locally-built theia components, we need to rebuild the `vscode-trace-extension` repo, for changes in the libraries to be included in the vscode extebsion. For an unknown reason, it's not sufficient to run "yarn" - that rebuilds everything in theory but does not seem to do a good job updating the entries undes `node_modules`, potentially leaving the theia components to an earlier version.

To avoid this and be sure that the locally-build repo uses the latest version of the local theia components, there are two ways:

- git clean before running `yarn`. e.g.: `git clean -ffdx && yarn`
- or run yarn in "prepare" mode first, then run yarn again: i.e. `yarn --ignore-scripts && yarn"`
  - probably more efficient, will not need to rebuild everything
- use/run Task `Build vscode-trace-extension`

Future consideration: for a more automated workflow, consider creating a background task, that uses a file-watcher library to monitor the local Theia libraries for changes, and rebuild the `vscode-trace-extension` when one is detected.

### Watch tasks do not support/report webpack errors

Some of the components may use `webpack`. ATM the watch tasks have problem matchers that only handle `tsc` errors, and so probably would not report `webpack` errors.

### Upstreaming a cross-trace-repository feature or change

This multi-root workspace is good to help with developing such cross-trace-repos changes and features. When it comes time to upstream the changes, it probably still needs to be done the old fashion way, one repo at a time, starting at the edge of the dependency tree. i.e. if `tsp-typescript-client` is modofied, that change needs to be committed and released first, then e.g. the changes in dependent `traceviewer-base` and/or `traceviewer-react-components`, then the changes in `vscode-trace-extension`.

### Granularity of the trace libraries included in the multi-root workspace

It would be desirable to not always have all the trace libraries included in this workspace amd related tasks. e.g. in cases where not all of them need to be changed, for the development of a given feature. For now, this would need to ne done manually:

- root package.json resolutions: only add those for relevant components
- workspace file build and watch tasks: comment-out not relevant build and watch tasks in the main "parent" tasks:
  - `"label": "Build all trace repositories"`
  - `"label": "Watch all trace libraries Workspaces"`

### Theia libraries included from source here, will not affect version of same libeary included in other repos

In some cases, e.g. where we have a modified `tsp-typescript-client` and correspondingly modified `theia-trace-extensions` components, the setup here may not be sufficient for everything to work smoothly, since without making further modifications, `theia-trace-extension` components will pull `tsp-typescript-client` from npm, and that version will not have the expected modifications. 

Potential mitigation: in cases where it's needed, use a similar setup in repo `theia-trace-extension` as we do here, so it can use `tsp-typescript-client` built from local sources, and we can then use the `theia=-trace-extensions` components here, as part of `vscode-trace-extension`. It could be sufficient to add a temporary `resolution` entry in root `package.json` of `theia-trace-extension`, pointing to the local `tsp-typescript-extension` library (same entry as we use in this repo here)
