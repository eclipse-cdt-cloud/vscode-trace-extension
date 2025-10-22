# VSCode Trace Extension

🆕 Development has been made easier for features that require changes to the `traceviewer-base` and/or `traceviewer-react-components` libraries! These are now present locally in the form of a git subtree, which means that you can make changes to them directly here, along with changes to the VSCode extension. See below, and this [PR][PR-traceviewer-libs-as-subtree] for more information

---

This document contains information that may prove useful for developers that want to build, modify, enhance and/or debug this extension. If you only intend to consume the extension, it might be easier to get it from the [public OpenVSX registry][tc-open-vsx],

This project started from the [VSCode webview react project][vscode-webview-react]. It works this way, with the extension itself being in the `vscode-trace-extension` directory and the react application being in the `vscode-trace-webapps` directory.

**👋 Want to help?** Read our [contributor guide](CONTRIBUTING.md) and follow the instructions to contribute code.

## Prerequisites

First, you need Node.js and yarn:

It's suggested to install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage node on your machine. Once that's done, install the required version:

```bash
   nvm install 20
   # optional: make it the default version
   nvm alias default
   # or set it every time like so
   nvm use 20
```

Then install `yarn`:

```bash
npm i -g yarn  # the default version should be ok
```

## Installation Instructions

The Trace Viewer for VSCode extension depends on several "trace-related" libraries. The [tsp-typescript-client library][tsp-client], as well as the [timeline-chart library][timeline-chart] are pulled from the NPM package registry. 

The `traceviewer` libraries (traceviewer-base and traceviewer-react-components) are originally from the [theia-trace-extension repository][theia-trace], and are now present locally in this repository, in the form of a "git subtree". Look under folder `local-libs` and `local-libs/traceviewer-libs` for README.MD files that contain more information. TL;DR: as a contributor to this repository, you may consider that these libraries are local, modify them as needed and include those changes as part of your Pull Requests. The maintainers will manage the subtrees: keep them in-sync with their upstream as needed (both directions). The other trace-related libraries might eventually be added as subtrees too.

- timeline-chart (npm)
- tsp-typescript-client (npm)
- traceviewer-base (local subtree)
- traceviewer-react-components (local subtree)

To build the VSCode extension, run the `yarn` command:

``` bash
yarn
```
### Building from local sources

As a contributor to the Trace Viewer for VSCode extension, you may have to change code in the external trace-related libraries (`tsp-typescript-client`, `timeline-chart`), along with changes in the code contained in this repo here. For the time being, changes to these dependent libraries need to be done and upstreamed separately. Once new `npm` packages are published, they can be consumed by stepping the requested versions in the `package.json` where they are pulled. 

However, for easier local development and tests, it's possible to set things up such that the repo here will use a local version of those libraries, where you have performed the necessary changes and built. Follow the README instructions for each library, to clone and build them. 

After that's done, you need to link each using command `yarn link`, which creates a symbolic link into the user's home, under directory `~/.config/yarn/link`. 

The `yarn link` command makes sure that the libraries are available locally and can be linked from the `vscode-trace-extension`. 

First, make sure that you don't have existing links in `~/.config/yarn/link` from other repositories than relevant for the Trace Viewer for VSCode. If there are, remove them beforehand.

Assuming all repositories are stored in your home directory under the `rootDir=~/git`

```bash
cd $rootDir/tsp-typescript-client
yarn
cd tsp-typescript-client
yarn link
```

```bash
cd $rootDir/timeline-chart
yarn
cd timeline-chart
yarn link
```

To link the local dependencies to this repository, run the following commands:

```bash
cd $rootDir/vscode-trace-extension
yarn link tsp-typescript-client
yarn link timeline-chart
```

After linking the local dependencies on this repo and before running the vscode extension, run the `yarn` command:

```bash
yarn
```

### Removing links to local sources

To remove the links execute the following commands:

```bash
cd $rootDir/vscode-trace-extension
yarn unlink tsp-typescript-client
yarn unlink timeline-chart
```

Note that you will need to run `yarn install --force` to re-install the packages that were linked.

```bash
yarn install --force
```

## Running the extension

Then from VSCode, press `f5` to run the extension. The trace server needs to be started separately as described [here](#run-the-trace-server).

To open a trace use the VSCode file explorer to navigate to the trace directory. Then right mouse click on the trace and select menu option `Open with Trace Viewer`. See [here](#get-sample-traces) to get some sample traces.

Open the `Trace Viewer` view (`View` -> `Open view...`).

![open-trace][open-trace]

Two tabs will be visible: `Traces` and `Views`. The `Traces` tab will show all available traces on the trace server.

The `Views` tab shows all the available views for the selected trace. Click on a view to open the view under the timeline.

![open-output][open-output]

## Package as a VSCode extension (.vsix)

To package it as VSCode extension, run the command `yarn vsce:package`. If you get errors about case-sensitive files, just delete the node_modules folder and run `yarn` again.

The packaging will produce a `vscode-trace-extension-x.x.x.vsix` file in the subdirectory `vscode-trace-extension` of the repository.

## Running the extension in VSCode, VsCodium or Theia application

The packaged VSIX file can be installed in an existing `VSCode`, `VSCodium` or `Theia` application by using [Install from a vsix][install].

The trace server needs to be started separately as described [here](#run-the-trace-server).

## Running the extension in the Theia Trace Viewer example app

The packaged VSIX file can be run in the example app of the [theia-trace-extension][theia-trace]. For this the file can be can be symlinked in the `plugins` of the example app of `theia-trace-extension` repository.

``` bash
cd <theia-trace-extension root>/examples/plugins
ln -s <vscode-trace-extension root>/vscode-trace-extension-x.x.x.vsix ./
```

## Developing the extension

From the root directory execute `yarn run watch`.  This will watch and bundle `vscode-trace-common`, `vscode-trace-extension`, and `vscode-trace-webviews`.  All outputs will be in one terminal.  Changes can be observed and tested in the `Extension Development Host` by pressing `F5`.

For more information about `VSCode WebView API` see [here][vscode-webview].

### Communication between components

To communicate between VSCode extension and webviews use the [VSCode message API][vscode-messages]. When using `vscode.postMessage(data)` data structure `data` will be serialized to JSON before being propagated. Be aware that it cannot include data structures like `BigInt`. Proper handling of such data structures need to be implemented when sending and receiving messages.

Inside a webview or inside the extension signals can be used where data structures can be passed on.

The following sequence diagram shows how the `experiment-selected` signal (with payload `Experiment`) is propagated inside the application. The webview `Opened Traces WebView App` is sending the signal to the`VSCode extension` which is forwarding the signal to the `Available Views WebView App`.

```mermaid
sequenceDiagram
    actor User
    participant reactOpenTraces as ReactOpenTracesWidget
    participant explorerOpenTraces as TraceExplorerOpenedTraces
    participant exOpenTraceProvider as TraceExplorerOpenedTracesViewProvider
    participant exViewsAvailProvider as TraceExplorerAvailableViewsProvider
    participant explorerAvailView as TraceExplorerViewsWidget
    participant reactAvailViewsexplorerOpenTraces as ReactAvailableViewsWidget
    participant server as Trace Server
    User->>reactOpenTraces: click on trace
    Note over reactOpenTraces,explorerOpenTraces: Opened Traces WebView App
    Note over exOpenTraceProvider,exViewsAvailProvider: VsCode extension
    Note over explorerAvailView,reactAvailViewsexplorerOpenTraces: Available Views WebView App
    reactOpenTraces->>explorerOpenTraces: sendSignal(exp-sel)
    explorerOpenTraces->>exOpenTraceProvider: vscode.postMessage(exp-sel)
    exOpenTraceProvider->>exViewsAvailProvider: sendSignal(exp-sel)
    exViewsAvailProvider->>explorerAvailView: vscode.postMessage(exp-sel)
    explorerAvailView->>reactAvailViewsexplorerOpenTraces: sendSignal(exp-sel)
    reactAvailViewsexplorerOpenTraces->>server: fetchOutputs(exp)
    server->>reactAvailViewsexplorerOpenTraces: success(200)
    reactAvailViewsexplorerOpenTraces->>reactAvailViewsexplorerOpenTraces: visualize availableViews
```

### Debugging the extension

It is straightforward to debug the code of the VSCode extension itself (the code in `vscode-trace-extension`) by just putting breakpoints in VSCode and running the extension with `f5`.

The react-app is another matter. The panel is a webview that is running in its own context, so current VSCode does not have access to it. _(Patches welcome!)_

Each panel is its own small web application, so to debug, while in the context of the webview, press `ctrl-shift-p` and enter the command `Developer: Open Webview Developer Tools`. This will open the developer tools. The code is in the `Sources` tab of the developer tools window that opens.

### Logging in the extension

The extension uses an output channel for logging. To view the logs, navigate to the output panel. The output panel can be accessed by navigating to view -> open view -> type 'output'. To open the extension output channel, navigate the drop down option and look for `Trace Extension`. An alternate way of opening the trace extension output channel is through command palette. Open command palette by pressing `ctrl-shift-p`, and then run `Output: Show Output Channels...\`. This will prompt a list of available outputs. Select `Trace Extension` from the list of available outputs.

For logging to the `Trace Extension` output channel, use the `traceLogger` object instantiated in `extension.ts`. The following are examples of using the log channel:

```javascript
traceLogger.addLogMessage('Hello from trace extension without tag');
```

This will add the following log entry in the output channel:

```text
[2023-04-25 11:07:22.500] Hello from trace extension without tag
```

```javascript
traceLogger.addLogMessage('Hello from trace extension with tag', 'tag');
```

This will add the following log entry in the output channel:

```text
[2023-04-25 11:08:40.500] [tag] Hello from trace extension with tag
```

### Troubleshooting

*The `Trace Viewer` panel is not there, or disappears when switching panel.

Right-click on the vscode activity bar and make sure `Trace Viewer` is checked.

![trace-explorer-activity-bar][trace-explorer-activity-bar]

## Run the Trace Server

In order to open traces, you need a trace server running on the same machine as the trace extension. You can download the [Eclipse Trace Compass server][tc-server] or let `yarn` download and run it:

```bash
yarn download:server
yarn start:server
```

You can also build the trace-server yourself using Trace Compass and the Incubator. Take a look at the [instructions here][tc-server-build].

## Get sample traces

To get sample traces to try run the following command. The traces will be stored under the subdirectory `TraceCompassTutorialTraces` of the repository.

```bash
yarn download:sample-traces
```

## Running UI tests

To run the UI tests locally, use the following commands.

Steps for setup that only need to be run once:

```bash
yarn download:sample-traces
yarn download:server
yarn download:openvscode-server
yarn configure:openvscode-server
yarn playwright install --with-deps
```

Steps to run once and again every time the application code is modified:

```bash
yarn
yarn vsce:package
# kill openvscode-server if running and restart it below
```

Steps to run once if the corresponding server is not already running:

```bash
yarn start:server & # or run in a separate shell
yarn start:openvscode-server & # or run in a separate shell
```

To run or re-run the tests after test code is modified:

```bash
yarn playwright test
```

To test in debug mode, test with tracing on, or test with retries on failure, use the following options:

```bash
yarn playwright test --debug
yarn playwright test --trace on
yarn playwright test --retries <retries>
```

## Using the External API

VSCode Trace Extension provides an external API that adopter extensions can rely on for communication. Currently the API is limited to the following:

```typescript
getActiveExperiment(): Experiment | undefined;
getActiveWebviewPanels(): { [key: string]: TraceViewerPanel | undefined; };
getActiveWebviews(): vscode.WebviewView[];
onWebviewCreated(listener: (data: vscode.WebviewView) => void): void;
onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void;
addTraceServerContributor(contributor: TraceServerContributor): void;
setHandleTraceResourceType(handleFiles: boolean, handleFolders: boolean): void;
onSignalManagerSignal(event: K extends SignalType, listener: (...args: [...SignalArgs<Signals[K]>]) => void | Promise<void>): void;
offSignalManagerSignal(event: K extends SignalType, listener: (...args: [...SignalArgs<Signals[K]>]) => void | Promise<void>): void;
```

### Using the API from Adopter Extensions

```javascript
//The following retrieves the API object from the vscode-trace-extension
const ext = vscode.extensions.getExtension("eclipse-cdt.vscode-trace-extension");
const importedApi = ext.exports;
```

Once you have the API object, you can proceed to make API calls. For example, if you wish to retrieve the active experiment in the Trace Viewer, the following API call can be used:

```javascript
const experiment = importedApi.getActiveExperiment();
```

The API provides getters to retrieve the active webviews and panels. This can be useful for scenarios when webviews/panels were created before the adopter extension was activated but the adopter extension still wants to handle messages from them.

`Note`: The the command key was changed from `message.command` to `method.method` after version `0.4.0`. Please update your code for that.

```javascript
for (const webview of importedApi.getActiveWebviews()) {
    webview.webview.onDidReceiveMessage((message) => {
        switch (message.method) {
            case "webviewReady":
            console.log("From adopter extension - webviewReady signal received");
            break;
            default:
            break;
        }
    });
}
```

The API also provides a way to attach a listener for when webview or webview panel is created. Note that this listener will not be called for webviews and panels created before the registration of the listener. It is recommended to register the listeners during the activation of the adopter extensions.

`Note`: The key for the command key was changed from `message.command` to `method.method` after version `0.4.0`. Please update your code for that.

```javascript
importedApi.onWebviewPanelCreated(_panel => {
    // For newly created panel, handle messages from webviews
    _panel.webview.onDidReceiveMessage((message) => {
        switch (message.method) {
            case "webviewReady":
            console.log("From adopter extension - webviewReady signal received");
            break;
            default:
            break;
        }
    });
    _panel.onDidDispose(() => {
        console.log("panel disposed");
    });
});
```

As a general rule, adopter extensions should retrieve and handle the webviews and webview panels once during their activation by calling `getActiveWebviews` and `getActiveWebviewPanels`. This ensures that the webviews and panels created before the activation of the adopter extension are handled. To handle any new webviews and panels created afterwards, listeners can be registered by calling `onWebviewCreated` and `onWebviewPanelCreated`.

The adopter extensions can also add and remove listeners to signals propagated within the base extension.

```javascript
const _onExperimentOpened = (experiment: Experiment): void => {
    console.log(experiment.UUID);
};
//Add a listener
importedApi.onSignalManagerSignal('EXPERIMENT_OPENED', _onExperimentOpened);
//Remove a listener
importedApi.offSignalManagerSignal('EXPERIMENT_OPENED', _onExperimentOpened);
```

If the adopter extensions needs to add a custom hook to the trace server's start/stop API, a contribution can be made by calling `addTraceServerContributor`.

```javascript
const contributor: TraceServerContributor = {
    startServer: async () => { 
        //Perform pre-startup actions
        //Start the server
        console.log("server started"); 
        },
    stopServer: async () => {
        //Perform cleanup actions
        //Stop the server
        console.log("server stopped"); 
    },
    isApplicable: (pathToTrace: string) => {
        //Check whether this contributor applies for the trace at 'pathToTrace'
        return true; 
    }
  };

importedApi.addTraceServerContributor(contributor);
```

If adopter extensions want to customize the type of trace resources (File and/or Folder) that the base extension should handle, it can be set by calling `setHandleTraceResourceType`.

```javascript
const handleTraceFiles = true;
const handleTraceFolders = false;

//The base extension will only provide support for trace files, and not for trace folders
importedApi.setHandleTraceResourceType(handleTraceFiles, handleTraceFolders);
```

### Remote SSH Support

The `Trace Viewer for VSCode` extension is compatible with the use of [remote-ssh](https://code.visualstudio.com/docs/remote/ssh).  If you are using `remote-ssh`, you can simply install `Trace Viewer for VSCode` extension on your remote machine and begin using the extension. For VSCode compatible applications you can install the [open-remote-ssh][open-remote-ssh] extension from the [public OpenVSX registry][open-vsx] to get similar functionality.

The remote support works by forwarding the Trace Server's operating port from the client machine to the remote machine. The port is automatically forwarded on Trace Server startup.

Forwarded ports can be seen in the 'Ports' view of the remote VsCode.  To open the `Ports` view use menu `View -> Open view... -> Ports`.  You should see the forwarded Trace Server port in the `Ports` view, as shown below:

![ports-tab][vscode-ports-tab]

Make sure that there is no Trace Server running on your local host. If the `Trace Viewer for VSCode` is unresponsive, stop the port forwarding by pressing the 'Stop Port Fowarding (Delete)' of the trace server port and restart remote VSCode.

Make sure that the `Enable separate backend URL` setting of the `Trace Viewer for VSCode` extension is deselected (because the port can only be forwarded once).

If you are a developer of the `Trace Viewer for VsCode` and want to modify and test the extension, you can [package it as a VSCode extension (.vsix)](#package-as-a-vscode-extension-vsix), upload the `VSIX` to the remote host and install the extension using the `Install from VSIX...` view menu of the `Extensions` view.

## Release/publish

We use GitHub CI to create a GitHub release and the corresponding git tag, and also to publish this repo's VSCode extension to the `open-vsx.org` and the `Visual Studio Marketplace` registries.

### Triggering a new release

Whenever a new release is desired, it can be triggered through a PR, as per the following:

Create a new branch for your PR, based on the repo's latest state. e.g.

```bash
git branch new-release && git checkout new-release
```

Then decide if the release shall be a `Major`, `Minor` or `Patch` release and use the corresponding command below to step the package's versions, according to the release type. A new release commit will be created:

``` bash
yarn version:major
# or
yarn version:minor
# or
yarn version:patch
```

Modify the _version tag_ in file `./RELEASE`, to match the new release. Amend the release commit to include this change:

```bash
git add RELEASE && git commit --amend
```

If commit message shows `%s` as version string, then replace it by the version of the vscode-trace-extension release.

Finally, push the branch to the main repository (not a fork!) and use it to create a PR. When the PR is merged, a GitHub release should be created with auto-generated release notes, as well as a git tag. Then the `publish-*` CI jobs should trigger, and if everything goes well, publish the new version of the extension to both registries.

## Initial contribution
The code was migrated from the [PR in theia-trace-extension][init-contrib].

[init-contrib]: https://github.com/eclipse-cdt-cloud/theia-trace-extension/pull/124
[install]: https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix
[open-output]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-trace-extension-001.png
[open-remote-ssh]: https://open-vsx.org/extension/jeanp413/open-remote-ssh
[open-trace]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-open-with-trace-viewer-001.png
[open-vsx]: https://www.open-vsx.org/
[theia-trace]: https://github.com/eclipse-cdt-cloud/theia-trace-extension/
[tc-open-vsx]: https://www.open-vsx.org/extension/eclipse-cdt/vscode-trace-extension
[tc-server]: https://download.eclipse.org/tracecompass.incubator/trace-server/rcp/?d
[tc-server-build]: https://www.eclipse.org/tracecompass/download.html#trace-server
[timeline-chart]: https://github.com/eclipse-cdt-cloud/timeline-chart/
[trace-explorer-activity-bar]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-show-trace-viewer-001.png
[tsp-client]: https://github.com/eclipse-cdt-cloud/tsp-typescript-client/
[vscode-messages]: https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-an-extension-to-a-webview
[vscode-webview]: https://github.com/rebornix/vscode-webview-react
[vscode-webview-react]: https://github.com/rebornix/vscode-webview-react
[vscode-ports-tab]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-ports-tab-001.png
[PR-traceviewer-libs-as-subtree]: https://github.com/eclipse-cdt-cloud/vscode-trace-extension/pull/339