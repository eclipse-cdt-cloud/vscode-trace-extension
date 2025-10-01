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

## Creating a Third-Party Extension

This example demonstrates how to create a VSCode extension that integrates with the vscode-trace-extension.

### Extension Setup

**package.json**
```json
{
    "name": "my-trace-extension",
    "displayName": "My Trace Extension",
    "description": "Example extension integrating with VSCode Trace Extension",
    "version": "0.0.1",
    "engines": {
        "vscode": "^1.74.0"
    },
    "categories": ["Other"],
    "activationEvents": [
        "onExtension:eclipse-cdt.vscode-trace-extension"
    ],
    "main": "./out/extension.js",
    "contributes": {
        "commands": [
            {
                "command": "myTraceExtension.showActiveTrace",
                "title": "Show Active Trace Info"
            }
        ]
    },
    "extensionDependencies": [
        "eclipse-cdt.vscode-trace-extension"
    ],
    "scripts": {
        "compile": "tsc -p ./",
        "watch": "tsc -watch -p ./"
    },
    "devDependencies": {
        "@types/vscode": "^1.74.0",
        "typescript": "^4.9.4"
    }
}
```

**src/extension.ts**
```typescript
import * as vscode from 'vscode';

interface TraceExtensionAPI {
    getActiveExperiment(): any;
    getActiveWebviews(): vscode.WebviewView[];
    getActiveWebviewPanels(): { [key: string]: any };
    onWebviewCreated(listener: (data: vscode.WebviewView) => void): void;
    onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void;
    onSignalManagerSignal(event: string, listener: (...args: any[]) => void): void;
    offSignalManagerSignal(event: string, listener: (...args: any[]) => void): void;
    registerTimeGraphMenuSignal(menuId: string, menuLabel: string): void;
    addTraceServerContributor(contributor: any): void;
    setHandleTraceResourceType(handleFiles: boolean, handleFolders: boolean): void;
}

let traceAPI: TraceExtensionAPI | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('My Trace Extension');
    outputChannel.appendLine('My Trace Extension activated');

    // Get the trace extension API
    const traceExtension = vscode.extensions.getExtension('eclipse-cdt.vscode-trace-extension');
    if (!traceExtension) {
        vscode.window.showErrorMessage('VSCode Trace Extension not found');
        return;
    }

    if (!traceExtension.isActive) {
        traceExtension.activate().then(() => {
            initializeTraceAPI(traceExtension.exports);
        });
    } else {
        initializeTraceAPI(traceExtension.exports);
    }

    // Register command
    const disposable = vscode.commands.registerCommand('myTraceExtension.showActiveTrace', () => {
        showActiveTraceInfo();
    });

    context.subscriptions.push(disposable, outputChannel);
}

function initializeTraceAPI(api: TraceExtensionAPI) {
    traceAPI = api;
    outputChannel.appendLine('Trace API initialized');

    // Register custom menu item
    traceAPI.registerTimeGraphMenuSignal('my-custom-analysis', 'Run Custom Analysis');

    // Set up signal listeners
    setupSignalListeners();

    // Set up webview listeners
    setupWebviewListeners();

    // Configure resource handling
    traceAPI.setHandleTraceResourceType(true, true);

    // Add trace server contributor
    addTraceServerContributor();
}

function setupSignalListeners() {
    if (!traceAPI) return;

    // Listen for experiment events
    const onExperimentOpened = (experiment: any) => {
        outputChannel.appendLine(`Experiment opened: ${experiment.name}`);
        vscode.window.showInformationMessage(`Trace opened: ${experiment.name}`);
    };

    const onExperimentClosed = (experiment: any) => {
        outputChannel.appendLine(`Experiment closed: ${experiment.name}`);
    };

    // Listen for custom menu clicks
    const onMenuItemClicked = (menuId: string) => {
        if (menuId === 'my-custom-analysis') {
            runCustomAnalysis();
        }
    };

    traceAPI.onSignalManagerSignal('EXPERIMENT_OPENED', onExperimentOpened);
    traceAPI.onSignalManagerSignal('EXPERIMENT_CLOSED', onExperimentClosed);
    traceAPI.onSignalManagerSignal('TIMEGRAPH_MENU_ITEM_CLICKED', onMenuItemClicked);
}

function setupWebviewListeners() {
    if (!traceAPI) return;

    // Handle existing webviews
    const existingWebviews = traceAPI.getActiveWebviews();
    existingWebviews.forEach(webview => {
        handleWebview(webview);
    });

    // Handle existing panels
    const existingPanels = traceAPI.getActiveWebviewPanels();
    Object.values(existingPanels).forEach(panel => {
        if (panel) {
            handleWebviewPanel(panel);
        }
    });

    // Listen for new webviews
    traceAPI.onWebviewCreated((webview: vscode.WebviewView) => {
        outputChannel.appendLine('New webview created');
        handleWebview(webview);
    });

    // Listen for new panels
    traceAPI.onWebviewPanelCreated((panel: vscode.WebviewPanel) => {
        outputChannel.appendLine('New webview panel created');
        handleWebviewPanel(panel);
    });
}

function handleWebview(webview: vscode.WebviewView) {
    webview.webview.onDidReceiveMessage((message) => {
        outputChannel.appendLine(`Webview message: ${JSON.stringify(message)}`);
        
        switch (message.method) {
            case 'webviewReady':
                outputChannel.appendLine('Webview is ready');
                break;
            default:
                break;
        }
    });
}

function handleWebviewPanel(panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage((message) => {
        outputChannel.appendLine(`Panel message: ${JSON.stringify(message)}`);
    });

    panel.onDidDispose(() => {
        outputChannel.appendLine('Panel disposed');
    });
}

function addTraceServerContributor() {
    if (!traceAPI) return;

    const contributor = {
        startServer: async () => {
            outputChannel.appendLine('Custom server startup logic');
            // Add custom startup logic here
        },
        stopServer: async () => {
            outputChannel.appendLine('Custom server shutdown logic');
            // Add custom shutdown logic here
        },
        isApplicable: (pathToTrace: string) => {
            // Check if this contributor should handle this trace
            outputChannel.appendLine(`Checking applicability for: ${pathToTrace}`);
            return pathToTrace.endsWith('.custom');
        }
    };

    traceAPI.addTraceServerContributor(contributor);
}

function showActiveTraceInfo() {
    if (!traceAPI) {
        vscode.window.showErrorMessage('Trace API not available');
        return;
    }

    const activeExperiment = traceAPI.getActiveExperiment();
    if (activeExperiment) {
        const info = `
Active Trace Information:
- Name: ${activeExperiment.name}
- UUID: ${activeExperiment.UUID}
- Path: ${activeExperiment.traces?.[0]?.path || 'N/A'}
- Number of traces: ${activeExperiment.traces?.length || 0}
        `;
        vscode.window.showInformationMessage(info);
        outputChannel.appendLine(info);
    } else {
        vscode.window.showInformationMessage('No active trace');
    }
}

function runCustomAnalysis() {
    if (!traceAPI) return;

    const activeExperiment = traceAPI.getActiveExperiment();
    if (!activeExperiment) {
        vscode.window.showWarningMessage('No active trace for analysis');
        return;
    }

    // Simulate custom analysis
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Running Custom Analysis',
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Analyzing trace data...' });
        
        // Simulate analysis work
        await new Promise(resolve => setTimeout(resolve, 2000));
        progress.report({ increment: 50, message: 'Processing results...' });
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        progress.report({ increment: 100, message: 'Complete!' });
        
        vscode.window.showInformationMessage('Custom analysis completed!');
        outputChannel.appendLine(`Analysis completed for: ${activeExperiment.name}`);
    });
}

export function deactivate() {
    if (traceAPI) {
        // Clean up signal listeners if needed
        outputChannel.appendLine('Extension deactivated');
    }
}
```

**tsconfig.json**
```json
{
    "compilerOptions": {
        "module": "commonjs",
        "target": "ES2020",
        "outDir": "out",
        "lib": ["ES2020"],
        "sourceMap": true,
        "rootDir": "src",
        "strict": true
    },
    "exclude": ["node_modules", ".vscode-test"]
}
```

### Key Integration Points

1. **Extension Dependencies**: Declare `eclipse-cdt.vscode-trace-extension` as a dependency
2. **Activation Events**: Use `onExtension:eclipse-cdt.vscode-trace-extension` to activate when the trace extension loads
3. **API Access**: Get the API through `vscode.extensions.getExtension().exports`
4. **Signal Handling**: Listen for trace events and custom menu interactions
5. **Webview Integration**: Handle both existing and new webviews/panels
6. **Server Contribution**: Add custom logic to trace server lifecycle
7. **Resource Configuration**: Customize which trace types to handle

This example demonstrates a complete integration that:
- Shows active trace information via a command
- Adds a custom menu item to timegraph views
- Handles trace lifecycle events
- Processes webview messages
- Contributes to trace server operations
- Provides custom analysis functionality

### Extending TSP Client with Custom Endpoints

When your extension needs to call custom TSP (Trace Server Protocol) endpoints not available in the standard tsp-typescript-client, you can extend the client with additional methods.

**Installing Dependencies**
```json
{
    "dependencies": {
        "tsp-typescript-client": "^0.4.0"
    }
}
```

**Creating Extended TSP Client**

**src/extended-tsp-client.ts**
```typescript
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { HttpRequest } from 'tsp-typescript-client/lib/protocol/http-request';
import { GenericResponse } from 'tsp-typescript-client/lib/models/response/responses';

export interface CustomAnalysisRequest {
    experimentUUID: string;
    analysisType: string;
    parameters?: { [key: string]: any };
}

export interface CustomAnalysisResponse {
    analysisId: string;
    status: string;
    results?: any;
}

export class ExtendedTspClient extends TspClient {
    
    /**
     * Start custom analysis on an experiment
     */
    async startCustomAnalysis(request: CustomAnalysisRequest): Promise<GenericResponse<CustomAnalysisResponse>> {
        const url = this.baseUrl + '/experiments/' + request.experimentUUID + '/analysis/custom';
        const httpRequest = new HttpRequest(url, {
            method: 'POST',
            body: JSON.stringify({
                analysisType: request.analysisType,
                parameters: request.parameters || {}
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return this.performRequest(httpRequest);
    }

    /**
     * Get custom analysis status
     */
    async getCustomAnalysisStatus(experimentUUID: string, analysisId: string): Promise<GenericResponse<CustomAnalysisResponse>> {
        const url = this.baseUrl + '/experiments/' + experimentUUID + '/analysis/custom/' + analysisId;
        const httpRequest = new HttpRequest(url, { method: 'GET' });
        return this.performRequest(httpRequest);
    }

    /**
     * Cancel custom analysis
     */
    async cancelCustomAnalysis(experimentUUID: string, analysisId: string): Promise<GenericResponse<void>> {
        const url = this.baseUrl + '/experiments/' + experimentUUID + '/analysis/custom/' + analysisId;
        const httpRequest = new HttpRequest(url, { method: 'DELETE' });
        return this.performRequest(httpRequest);
    }

    /**
     * Get custom trace metadata
     */
    async getCustomMetadata(experimentUUID: string): Promise<GenericResponse<any>> {
        const url = this.baseUrl + '/experiments/' + experimentUUID + '/metadata/custom';
        const httpRequest = new HttpRequest(url, { method: 'GET' });
        return this.performRequest(httpRequest);
    }

    /**
     * Update experiment configuration
     */
    async updateExperimentConfig(experimentUUID: string, config: any): Promise<GenericResponse<void>> {
        const url = this.baseUrl + '/experiments/' + experimentUUID + '/config';
        const httpRequest = new HttpRequest(url, {
            method: 'PUT',
            body: JSON.stringify(config),
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return this.performRequest(httpRequest);
    }
}
```

**Using Extended Client in Extension**

**src/tsp-service.ts**
```typescript
import { ExtendedTspClient, CustomAnalysisRequest } from './extended-tsp-client';

export class TspService {
    private client: ExtendedTspClient;

    constructor(baseUrl: string = 'http://localhost:8080/tsp/api') {
        this.client = new ExtendedTspClient(baseUrl);
    }

    async runCustomAnalysis(experimentUUID: string, analysisType: string, parameters?: any): Promise<string | undefined> {
        try {
            const request: CustomAnalysisRequest = {
                experimentUUID,
                analysisType,
                parameters
            };

            const response = await this.client.startCustomAnalysis(request);
            
            if (response.isOk() && response.getModel()) {
                return response.getModel()?.analysisId;
            } else {
                console.error('Failed to start analysis:', response.getStatusMessage());
                return undefined;
            }
        } catch (error) {
            console.error('Error starting custom analysis:', error);
            return undefined;
        }
    }

    async pollAnalysisStatus(experimentUUID: string, analysisId: string): Promise<any> {
        try {
            const response = await this.client.getCustomAnalysisStatus(experimentUUID, analysisId);
            
            if (response.isOk()) {
                return response.getModel();
            } else {
                console.error('Failed to get analysis status:', response.getStatusMessage());
                return null;
            }
        } catch (error) {
            console.error('Error getting analysis status:', error);
            return null;
        }
    }

    async getTraceMetadata(experimentUUID: string): Promise<any> {
        try {
            const response = await this.client.getCustomMetadata(experimentUUID);
            
            if (response.isOk()) {
                return response.getModel();
            } else {
                console.error('Failed to get metadata:', response.getStatusMessage());
                return null;
            }
        } catch (error) {
            console.error('Error getting metadata:', error);
            return null;
        }
    }
}
```

**Integration with Main Extension**

**Updated src/extension.ts**
```typescript
import { TspService } from './tsp-service';

let tspService: TspService;

export function activate(context: vscode.ExtensionContext) {
    // ... existing code ...
    
    // Initialize TSP service
    tspService = new TspService();
    
    // ... rest of activation code ...
}

async function runCustomAnalysis() {
    if (!traceAPI || !tspService) return;

    const activeExperiment = traceAPI.getActiveExperiment();
    if (!activeExperiment) {
        vscode.window.showWarningMessage('No active trace for analysis');
        return;
    }

    try {
        // Start custom analysis using extended TSP client
        const analysisId = await tspService.runCustomAnalysis(
            activeExperiment.UUID,
            'performance-analysis',
            { threshold: 100, includeDetails: true }
        );

        if (!analysisId) {
            vscode.window.showErrorMessage('Failed to start analysis');
            return;
        }

        // Poll for results
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Running Custom TSP Analysis',
            cancellable: true
        }, async (progress, token) => {
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30;

            while (!completed && attempts < maxAttempts && !token.isCancellationRequested) {
                const status = await tspService.pollAnalysisStatus(activeExperiment.UUID, analysisId);
                
                if (status) {
                    progress.report({ 
                        increment: (attempts / maxAttempts) * 100,
                        message: `Status: ${status.status}` 
                    });

                    if (status.status === 'COMPLETED') {
                        completed = true;
                        vscode.window.showInformationMessage('Custom TSP analysis completed!');
                        outputChannel.appendLine(`Analysis results: ${JSON.stringify(status.results)}`);
                    } else if (status.status === 'FAILED') {
                        vscode.window.showErrorMessage('Analysis failed');
                        break;
                    }
                }

                if (!completed) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;
                }
            }

            if (!completed && !token.isCancellationRequested) {
                vscode.window.showWarningMessage('Analysis timed out');
            }
        });

    } catch (error) {
        vscode.window.showErrorMessage(`Analysis error: ${error}`);
        outputChannel.appendLine(`Analysis error: ${error}`);
    }
}
```

**Key Points for TSP Extension:**

1. **Extend TspClient**: Create a class that extends the base TspClient with your custom methods
2. **HTTP Requests**: Use HttpRequest class for making calls to custom endpoints
3. **Response Handling**: Use GenericResponse for type-safe response handling
4. **Error Management**: Implement proper error handling for network calls
5. **Async Operations**: Handle long-running operations with progress indication
6. **Service Layer**: Create a service class to encapsulate TSP operations
7. **Integration**: Use the extended client within your extension's analysis functions

This approach allows you to:
- Add custom analysis endpoints
- Extend trace metadata retrieval
- Implement custom configuration updates
- Handle asynchronous operations with proper user feedback
- Maintain type safety with TypeScript interfaces
