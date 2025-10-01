# VSCode Trace Extension - Developer Guide

This guide provides comprehensive documentation for developers who want to build extensions that integrate with the VSCode Trace Extension using its external API.

## External API Overview

VSCode Trace Extension provides an external API that adopter extensions can rely on for communication. The API includes the following methods:

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
registerTimeGraphMenuSignal(menuId: string, menuLabel: string): void;
```

## API Reference

### Experiment Management

**`getActiveExperiment(): Experiment | undefined`**
- Returns the currently active experiment (trace) in the Trace Viewer
- Returns `undefined` if no experiment is currently active
- Useful for getting information about the currently opened trace

### Webview Management

**`getActiveWebviews(): vscode.WebviewView[]`**
- Returns an array of all currently active webview views
- Useful for handling webviews that were created before your extension was activated
- Each webview can receive messages via `webview.webview.onDidReceiveMessage()`

**`getActiveWebviewPanels(): { [key: string]: TraceViewerPanel | undefined; }`**
- Returns a dictionary of active webview panels indexed by key
- Useful for accessing existing trace viewer panels
- Each panel can receive messages via `panel.webview.onDidReceiveMessage()`

**`onWebviewCreated(listener: (data: vscode.WebviewView) => void): void`**
- Registers a listener for when new webview views are created
- The listener receives the newly created webview as a parameter
- Register during extension activation to handle all new webviews

**`onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void`**
- Registers a listener for when new webview panels are created
- The listener receives the newly created panel as a parameter
- Register during extension activation to handle all new panels

### Signal Management

**`onSignalManagerSignal(event: K extends SignalType, listener: (...args: [...SignalArgs<Signals[K]>]) => void | Promise<void>): void`**
- Adds a listener for specific signal events within the extension
- Available signal types include:
  - `'EXPERIMENT_OPENED'` - Fired when a trace experiment is opened
  - `'EXPERIMENT_CLOSED'` - Fired when a trace experiment is closed
  - `'EXPERIMENT_SELECTED'` - Fired when a trace experiment is selected
  - `'TIMEGRAPH_MENU_ITEM_CLICKED'` - Fired when a custom menu item is clicked in timegraph views
  - Other signal types as defined in the extension
- Listeners can be synchronous or asynchronous functions

**`offSignalManagerSignal(event: K extends SignalType, listener: (...args: [...SignalArgs<Signals[K]>]) => void | Promise<void>): void`**
- Removes a previously registered signal listener
- Must pass the exact same listener function that was registered
- Use this to clean up listeners when your extension is deactivated

### Menu Registration

**`registerTimeGraphMenuSignal(menuId: string, menuLabel: string): void`**
- Registers a custom menu item for timegraph views
- `menuId` - Unique identifier for the menu item
- `menuLabel` - Display text for the menu item
- When the menu item is clicked, a `'TIMEGRAPH_MENU_ITEM_CLICKED'` signal is emitted with the menuId

### Trace Server Management

**`addTraceServerContributor(contributor: TraceServerContributor): void`**
- Adds a custom contributor to the trace server lifecycle
- The contributor object must implement:
  - `startServer(): Promise<void>` - Called when server should start
  - `stopServer(): Promise<void>` - Called when server should stop  
  - `isApplicable(pathToTrace: string): boolean` - Determines if contributor applies to a trace
- Useful for adding custom server startup/shutdown logic

### Resource Type Configuration

**`setHandleTraceResourceType(handleFiles: boolean, handleFolders: boolean): void`**
- Configures which types of trace resources the extension should handle
- `handleFiles` - Whether to handle individual trace files
- `handleFolders` - Whether to handle trace folders/directories
- Allows adopter extensions to customize trace resource handling behavior

## Usage Examples

### Getting Started

First, retrieve the API object from the vscode-trace-extension:

```javascript
const ext = vscode.extensions.getExtension("eclipse-cdt.vscode-trace-extension");
const importedApi = ext.exports;
```

### Accessing Active Experiment

```javascript
const experiment = importedApi.getActiveExperiment();
if (experiment) {
    console.log(`Active experiment: ${experiment.name}`);
}
```

### Handling Webviews

Handle existing webviews that were created before your extension was activated:

**Note**: The command key was changed from `message.command` to `message.method` after version `0.4.0`.

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

### Listening for New Webviews

Register listeners during extension activation to handle newly created webviews:

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

### Signal Management

Add and remove listeners for extension signals:

```javascript
const _onExperimentOpened = (experiment: Experiment): void => {
    console.log(experiment.UUID);
};

// Add a listener
importedApi.onSignalManagerSignal('EXPERIMENT_OPENED', _onExperimentOpened);

// Remove a listener
importedApi.offSignalManagerSignal('EXPERIMENT_OPENED', _onExperimentOpened);
```

### Custom Menu Items

Register custom menu items in timegraph views and handle their selection:

```javascript
// Register a custom menu item
importedApi.registerTimeGraphMenuSignal('my-custom-action', 'My Custom Action');

// Handle menu item clicks
const _onMenuItemClicked = (menuId: string): void => {
    if (menuId === 'my-custom-action') {
        console.log('Custom menu action triggered');
        // Perform custom action here
    }
};

// Add listener for menu clicks
importedApi.onSignalManagerSignal('TIMEGRAPH_MENU_ITEM_CLICKED', _onMenuItemClicked);

// Clean up when extension deactivates
importedApi.offSignalManagerSignal('TIMEGRAPH_MENU_ITEM_CLICKED', _onMenuItemClicked);
```

### Trace Server Contribution

Add custom hooks to the trace server's start/stop lifecycle:

```javascript
const contributor: TraceServerContributor = {
    startServer: async () => { 
        // Perform pre-startup actions
        // Start the server
        console.log("server started"); 
    },
    stopServer: async () => {
        // Perform cleanup actions
        // Stop the server
        console.log("server stopped"); 
    },
    isApplicable: (pathToTrace: string) => {
        // Check whether this contributor applies for the trace at 'pathToTrace'
        return true; 
    }
};

importedApi.addTraceServerContributor(contributor);
```

### Resource Type Configuration

Customize which trace resource types the extension should handle:

```javascript
const handleTraceFiles = true;
const handleTraceFolders = false;

// The base extension will only provide support for trace files, not folders
importedApi.setHandleTraceResourceType(handleTraceFiles, handleTraceFolders);
```

## Best Practices

1. **Extension Activation**: Register listeners during your extension's activation to ensure you don't miss any events.

2. **Webview Handling**: Use both `getActiveWebviews()` and `onWebviewCreated()` to handle existing and new webviews respectively.

3. **Signal Cleanup**: Always remove signal listeners when your extension is deactivated to prevent memory leaks.

4. **Error Handling**: Wrap API calls in try-catch blocks as the trace extension might not be available or activated.

5. **Version Compatibility**: Check the trace extension version if using features that were added in specific versions.
