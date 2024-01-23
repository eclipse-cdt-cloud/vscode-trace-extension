# VSCode Trace Extension

This document contains information that may be useful for developers that want to build, modify, enhance and/or debug this extension. If you only intend to consume the extension, it might be easier to get it from the [public OpenVSX registry](https://www.open-vsx.org/extension/eclipse-cdt/vscode-trace-extension),

This project started from the [VSCode webview react project][vscode-webview-react]. It works this way, with the extension itself being in the `vscode-trace-extension` directory and the react application being in the `vscode-trace-webapps` directory.

**👋 Want to help?** Read our [contributor guide](CONTRIBUTING.md) and follow the instructions to contribute code.

## Installation Instructions

The code was migrated from the [PR in theia-trace-extension][init-contrib].

It depends on the trace viewer plugins from the [theia trace extension package][theia-trace] and the [tsp typescript client][tsp-client], as well as the [timeline chart][timeline-chart]. They are all available from the NPM package registry.

- timeline-chart
- traceviewer-base
- traceviewer-react-components
- tsp-typescript-client

To build the VSCode extension, run the `yarn` command:

``` bash
yarn
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

[init-contrib]: https://github.com/eclipse-cdt-cloud/theia-trace-extension/pull/124
[install]: https://code.visualstudio.com/docs/editor/extension-marketplace#_install-from-a-vsix
[open-output]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-trace-extension-001.png
[open-trace]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-open-with-trace-viewer-001.png
[theia-trace]: https://github.com/eclipse-cdt-cloud/theia-trace-extension/
[tc-server]: https://download.eclipse.org/tracecompass.incubator/trace-server/rcp/?d
[tc-server-build]: https://www.eclipse.org/tracecompass/download.html#trace-server
[timeline-chart]: https://github.com/eclipse-cdt-cloud/timeline-chart/
[trace-explorer-activity-bar]: https://raw.githubusercontent.com/eclipse-cdt-cloud/vscode-trace-extension/master/doc/images/vscode-show-trace-viewer-001.png
[tsp-client]: https://github.com/eclipse-cdt-cloud/tsp-typescript-client/
[vscode-messages]: https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-an-extension-to-a-webview
[vscode-webview]: https://github.com/rebornix/vscode-webview-react
[vscode-webview-react]: https://github.com/rebornix/vscode-webview-react

## Using the External API

VSCode Trace Extension provides an external API that adopter extensions can rely on for communication. Currently the API is limited to the following:

```javascript
getActiveExperiment(): Experiment | undefined
getActiveWebviewPanels(): { [key: string]: TraceViewerPanel | undefined; }
getActiveWebviews(): vscode.WebviewView[]
onWebviewCreated(listener: (data: vscode.WebviewView) => void): void
onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void
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

```javascript
for (const webview of importedApi.getActiveWebviews()) {
    webview.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
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

```javascript
importedApi.onWebviewPanelCreated(_panel => {
    // For newly created panel, handle messages from webviews
    _panel.webview.onDidReceiveMessage((message) => {
        switch (message.command) {
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
