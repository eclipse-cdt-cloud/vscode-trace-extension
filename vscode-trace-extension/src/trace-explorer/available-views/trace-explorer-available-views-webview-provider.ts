import JSONBigConfig from 'json-bigint';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import * as vscode from 'vscode';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { getTraceServerUrl, getTspClientUrl } from '../../utils/tspClient';
import { convertSignalExperiment } from 'vscode-trace-extension/src/common/signal-converter';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

export class TraceExplorerAvailableViewsProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'traceExplorer.availableViews';

	private _view?: vscode.WebviewView;
	private _disposables: vscode.Disposable[] = [];
	private _selectionOngoing = false;

	private _onExperimentSelected = (experiment: Experiment | undefined): void => this.doHandleExperimentSelectedSignal(experiment);

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
	    webviewView: vscode.WebviewView,
	    _context: vscode.WebviewViewResolveContext,
	    _token: vscode.CancellationToken,
	): void {
	    this._view = webviewView;

	    webviewView.webview.options = {
	        // Allow scripts in the webview
	        enableScripts: true,

	        localResourceRoots: [
	            vscode.Uri.joinPath(this._extensionUri, 'pack')
	        ]
	    };

	    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

	    // Handle messages from the webview
	    webviewView.webview.onDidReceiveMessage(message => {
	        switch (message.command) {
	        case 'webviewReady':
	            // Post the tspTypescriptClient
	            webviewView.webview.postMessage({command: 'set-tspClient', data: getTspClientUrl()});
	            return;
	        case 'outputAdded':
	            if (message.data && message.data.descriptor) {
	                 // FIXME: JSONBig.parse() created bigint if numbers are small.
					 // Not an issue right now for output descriptors.
	                const descriptor = JSONBig.parse(message.data.descriptor) as OutputDescriptor;
	                // TODO: Don't use static current panel, i.e. find better design to add output...

	                TraceViewerPanel.addOutputToCurrent(descriptor);
	                // const panel = TraceViewerPanel.createOrShow(this._extensionUri, message.data.experiment.name);
	                // panel.setExperiment(message.data.experiment);
	            }
	            return;
	        case 'experimentSelected': {
	            if (message.data && message.data.wrapper) {
	                try {
	                    // Avoid endless forwarding of signal
	                    this._selectionOngoing = true;
	                    const experiment = convertSignalExperiment(JSONBig.parse(message.data.wrapper));
	                    signalManager().fireExperimentSelectedSignal(experiment);
	                } finally {
	                    this._selectionOngoing = false;
	                }
	            }
	        }
	        }
	    }, undefined, this._disposables);

	    signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	    webviewView.onDidDispose(_event => {
	        signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	    }, undefined, this._disposables);signalManager().off(Signals.EXPERIMENT_SELECTED, (experiment: Experiment | undefined) => this._onExperimentSelected(experiment));
	}

	protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
	    if (!this._selectionOngoing && this._view) {
	        const wrapper: string = JSONBig.stringify(experiment);
	        this._view.webview.postMessage({command: 'experimentSelected', data: wrapper});
	    }
	}

	/* eslint-disable max-len */
	private _getHtmlForWebview(webview: vscode.Webview) {
	    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
	    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'analysisPanel.js'));

	    // Use a nonce to only allow a specific script to be run.
	    const nonce = getNonce();

	    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
				<meta name="theme-color" content="#000000">
				<title>React App</title>
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}' 'unsafe-eval';style-src vscode-resource: 'unsafe-inline' http: https: data:;connect-src ${getTraceServerUrl()};">
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
