import * as vscode from 'vscode';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { getTspClientUrl, getTraceServerUrl } from '../utils/tspClient';
import { TraceServerConnectionStatusService } from '../utils/trace-server-status';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { handleStatusMessage, handleRemoveMessage, setStatusFromPanel } from '../common/trace-message';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import JSONBigConfig from 'json-bigint';
import * as fs from 'fs';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

// TODO: manage multiple panels (currently just a hack around, need to be fixed)

/**
 * Manages react webview panels
 */
export class TraceViewerPanel {
	/**
	 * Track the currently panels. Only allow a single panel to exist at a time.
	 */
	public static activePanels = {} as {
		[key: string]: TraceViewerPanel | undefined;
	};

	private static readonly viewType = 'react';
	private static currentPanel: TraceViewerPanel | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _statusService: TraceServerConnectionStatusService | undefined;

	private _disposables: vscode.Disposable[] = [];
	private _experiment: Experiment | undefined = undefined;
	private _onExperimentSelected = (openedExperiment: Experiment | undefined): void => this.doHandleExperimentSelectedSignal(openedExperiment);

	public static createOrShow(extensionUri: vscode.Uri, name: string, statusService: TraceServerConnectionStatusService | undefined): TraceViewerPanel {

	    const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

	    // If we already have a panel, show it.
	    // Otherwise, create a new panel.
	    let openedPanel = TraceViewerPanel.activePanels[name];
	    if (openedPanel) {
	        openedPanel._panel.reveal(column);
	    } else {
	        openedPanel = new TraceViewerPanel(extensionUri, column || vscode.ViewColumn.One, name, statusService);
	        TraceViewerPanel.activePanels[name] = openedPanel;
	        setStatusFromPanel(name);
	    }
	    TraceViewerPanel.currentPanel = openedPanel;
	    return openedPanel;
	}

	public static disposePanel(extensionUri: vscode.Uri, name: string): void {
	    // If we already have a panel, show it.
	    // Otherwise, create a new panel.
	    const openedPanel = TraceViewerPanel.activePanels[name];
	    if (openedPanel) {
	        openedPanel._panel.dispose();
	        TraceViewerPanel.activePanels[name] = undefined;
	        TraceViewerPanel.currentPanel = undefined;
	    }
	}

	public static addOutputToCurrent(descriptor: OutputDescriptor): void {
		TraceViewerPanel.currentPanel?.addOutput(descriptor);
	}

	public static showOverviewToCurrent(): void {
		TraceViewerPanel.currentPanel?.showOverview();
	}

	public static resetZoomOnCurrent(): void {
		TraceViewerPanel.currentPanel?.resetZoom();
	}

	private static async saveTraceCsv(csvData: string, defaultFileName: string) {
	    const saveDialogOptions = {
	        defaultUri: vscode.workspace.workspaceFolders
	            ? vscode.Uri.file(vscode.workspace.workspaceFolders[0].uri.path + '/' + defaultFileName)
	            : undefined,
	        saveLabel: 'Save as CSV',
	        filters: {
	        'CSV Files': ['csv']
	        }
	    };
	    const uri = await vscode.window.showSaveDialog(saveDialogOptions);
	    if (uri) {
	        fs.writeFile(uri.fsPath, csvData, err => {
	            if (err) {
	            	vscode.window.showErrorMessage(`Failed to save CSV: ${err.message}`);
	            } else {
	            	vscode.window.showInformationMessage('CSV saved successfully');
	            }
	        });
	    }
	}

	private constructor(extensionUri: vscode.Uri, column: vscode.ViewColumn, name: string, statusService: TraceServerConnectionStatusService | undefined) {
	    this._extensionUri = extensionUri;
	    this._statusService = statusService;

	    // Create and show a new webview panel
	    this._panel = vscode.window.createWebviewPanel(TraceViewerPanel.viewType, name, column, {
	        // Enable javascript in the webview
	        enableScripts: true,

	        // Do not destroy the content when hidden
		    retainContextWhenHidden: true,
	        enableCommandUris: true,

	        // And restrict the webview to only loading content from our extension's `media` directory.
	        localResourceRoots: [
	            vscode.Uri.joinPath(this._extensionUri, 'pack'),
	            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons'),
	        ]
	    });

	    // Set the webview's initial html content
	    this._panel.webview.html = this._getHtmlForWebview();

	    // Listen for when the panel is disposed
	    // This happens when the user closes the panel or when the panel is closed programmatically
	    this._panel.onDidDispose(() => {
	        this.dispose();
	        TraceViewerPanel.activePanels[name] = undefined;
	        signalManager().fireExperimentSelectedSignal(undefined);
	        return this._disposables;
	    });

	    this._panel.onDidChangeViewState(e => {
	        if (e.webviewPanel.active) {
	            TraceViewerPanel.currentPanel = this;
	            setStatusFromPanel(name);
	            if (this._experiment) {
	                signalManager().fireTraceViewerTabActivatedSignal(this._experiment);
	                signalManager().fireExperimentSelectedSignal(this._experiment);
	            }
	        }
	    });

	    vscode.window.onDidChangeActiveColorTheme(e => {
	    	const wrapper = e.kind === 1 ? 'light' : 'dark';
	    	this._panel.webview.postMessage({ command: VSCODE_MESSAGES.SET_THEME, data: wrapper });
	    });

	    // Handle messages from the webview
	    this._panel.webview.onDidReceiveMessage(message => {
	        switch (message.command) {
	        case VSCODE_MESSAGES.ALERT:
	            vscode.window.showErrorMessage(message.text);
	            return;
	        case VSCODE_MESSAGES.NEW_STATUS:
	            handleStatusMessage(name, message.data);
	            return;
	        case VSCODE_MESSAGES.REMOVE_STATUS:
	            handleRemoveMessage(name, message.data);
	            return;
	        case VSCODE_MESSAGES.WEBVIEW_READY:
	            // Post the tspTypescriptClient
	            if (this._experiment) {
	                const wrapper: string = JSONBig.stringify(this._experiment);
	                this._panel.webview.postMessage({command: VSCODE_MESSAGES.SET_TSP_CLIENT, data: getTspClientUrl(), experiment: wrapper});
	            } else {
	                this._panel.webview.postMessage({command: VSCODE_MESSAGES.SET_TSP_CLIENT, data: getTspClientUrl()});
	            }
	            this.loadTheme();
	            return;
	        case VSCODE_MESSAGES.UPDATE_PROPERTIES:
	            vscode.commands.executeCommand('messages.post.propertiespanel', 'receivedProperties', message.data);
	            return;
	        case VSCODE_MESSAGES.SAVE_AS_CSV:
	            if (message.payload.data && typeof message.payload.data === 'string') {
	            	TraceViewerPanel.saveTraceCsv(message.payload.data, ((this._experiment !== undefined) ? this._experiment.name : 'trace')+'.csv');
	            }
	            return;
	        case VSCODE_MESSAGES.CONNECTION_STATUS:
	            if (message.data && message.data.status && this._statusService) {
	                const status: boolean = JSON.parse(message.data.status);
	                this._statusService.render(status);
	            }
	            return;
	        }
	    }, undefined, this._disposables);
	    signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	}

	public doRefactor(): void {
	    // Send a message to the webview webview.
	    // You can send any JSON serializable data.
	    this._panel.webview.postMessage({ command: VSCODE_MESSAGES.REFACTOR });
	}

	public dispose(): void {
	    // ReactPanel.currentPanel = undefined;

	    // Clean up our resources
	    this._panel.dispose();

	    while (this._disposables.length) {
	        const x = this._disposables.pop();
	        if (x) {
	            x.dispose();
	        }
	    }
	    signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	}

	protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
	    if (this._experiment && experiment && this._experiment.UUID === experiment.UUID) {
	        this._panel.reveal();
	    }
	}

	setExperiment(experiment: Experiment): void {
	    this._experiment = experiment;
	    const wrapper: string = JSONBig.stringify(experiment);
	    this._panel.webview.postMessage({command: VSCODE_MESSAGES.SET_EXPERIMENT, data: wrapper});
	    signalManager().fireExperimentOpenedSignal(experiment);
	    signalManager().fireTraceViewerTabActivatedSignal(experiment);
	}

	addOutput(descriptor: OutputDescriptor): void {
	    const wrapper: string = JSONBig.stringify(descriptor);
	    this._panel.webview.postMessage({command: VSCODE_MESSAGES.ADD_OUTPUT, data: wrapper});
	}

	showOverview(): void {
	    this._panel.webview.postMessage({command: VSCODE_MESSAGES.OPEN_OVERVIEW});
	}

	resetZoom(): void {
	    this._panel.webview.postMessage({ command: VSCODE_MESSAGES.RESET_ZOOM });
	}

	loadTheme(): void {
	    const wrapper = vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark';
	    this._panel.webview.postMessage({ command: VSCODE_MESSAGES.SET_THEME, data: wrapper });
	}

	private _getHtmlForWebview() {
	    const webview = this._panel.webview;
	    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css'));
	    const nonce = getNonce();

	    try {
	        return this._getReactHtmlForWebview();
	    } catch (e) {
	        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<title>React App</title>
				<meta http-equiv="Content-Security-Policy"
					content="default-src 'none';
					img-src vscode-resource: https:;
					script-src 'nonce-${nonce}' 'unsafe-eval';
					style-src ${webview.cspSource} vscode-resource: 'unsafe-inline' http: https: data:;
					connect-src ${getTraceServerUrl()};
					font-src ${webview.cspSource}">
				<link href="${codiconsUri}" rel="stylesheet" />
				<base href="${vscode.Uri.joinPath(this._extensionUri, 'pack').with({ scheme: 'vscode-resource' })}/">
			</head>

			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div>${'Error initializing trace viewer'}</div>
			</body>
			</html>`;
	    }
	}

	/* eslint-disable max-len */
	private _getReactHtmlForWebview(): string {
	    // eslint-disable-next-line @typescript-eslint/no-var-requires
	    const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'pack', 'trace_panel.js');
	    const scriptUri = scriptPathOnDisk.with({ scheme: 'vscode-resource' });
	    // const stylePathOnDisk = vscode.Uri.file(path.join(this._extensionPath, 'build', mainStyle));
	    // const styleUri = stylePathOnDisk.with({ scheme: 'vscode-resource' });

	    // Fetching codicons styles
	    const webview = this._panel.webview;
	    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css'));

	    // Use a nonce to whitelist which scripts can be run
	    const nonce = getNonce();

	    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<title>React App</title>
				<meta http-equiv="Content-Security-Policy"
					content="default-src 'none';
					img-src vscode-resource: https:;
					script-src 'nonce-${nonce}' 'unsafe-eval';
					style-src ${webview.cspSource} vscode-resource: 'unsafe-inline' http: https: data:;
					connect-src ${getTraceServerUrl()};
					font-src ${webview.cspSource}">
				<link href="${codiconsUri}" rel="stylesheet" />
				<base href="${vscode.Uri.joinPath(this._extensionUri, 'pack').with({ scheme: 'vscode-resource' })}/">
			</head>

			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>

				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
				</script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
