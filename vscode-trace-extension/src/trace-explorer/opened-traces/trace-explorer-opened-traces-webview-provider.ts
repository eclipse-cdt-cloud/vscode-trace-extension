import JSONBigConfig from 'json-bigint';
import { OpenedTracesUpdatedSignalPayload } from 'traceviewer-base/lib/signals/opened-traces-updated-signal-payload';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import * as vscode from 'vscode';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { TraceServerConnectionStatusService } from '../../utils/trace-server-status';
import { getTraceServerUrl, getTspClientUrl } from '../../utils/tspClient';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

export class TraceExplorerOpenedTracesViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'traceExplorer.openedTracesView';

	private _view?: vscode.WebviewView;
	private _disposables: vscode.Disposable[] = [];
	private _selectedExperiment: Experiment | undefined;

   	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _statusService: TraceServerConnectionStatusService,
	) {}

	private _onOpenedTracesWidgetActivated = (experiment: Experiment): void => this.doHandleTracesWidgetActivatedSignal(experiment);
	private _onOpenedTracesChanged = (payload: OpenedTracesUpdatedSignalPayload): void => this.doHandleOpenedTracesChangedSignal(payload);
	private _onExperimentSelected = (experiment: Experiment | undefined): void => this.doHandleExperimentSelectedSignal(experiment);
	private _onExperimentOpened = (experiment: Experiment): void => this.doHandleExperimentOpenedSignal(experiment);

	protected doHandleExperimentOpenedSignal(experiment: Experiment): void {
	    if (this._view && experiment) {
	        const wrapper: string = JSONBig.stringify(experiment);
	        this._view.webview.postMessage({command: VSCODE_MESSAGES.EXPERIMENT_OPENED, data: wrapper});
	    }
	}

	protected doHandleTracesWidgetActivatedSignal(experiment: Experiment): void {
	    if (this._view && experiment) {
	        this._selectedExperiment = experiment;
	        const wrapper: string = JSONBig.stringify(experiment);
	        this._view.webview.postMessage({command: VSCODE_MESSAGES.TRACE_VIEWER_TAB_ACTIVATED, data: wrapper});
	        signalManager().fireExperimentSelectedSignal(this._selectedExperiment);
	    }
	}
	protected doHandleOpenedTracesChangedSignal(payload: OpenedTracesUpdatedSignalPayload): void {
	    if (this._view && payload) {
	        this._view.webview.postMessage({command: VSCODE_MESSAGES.OPENED_TRACES_UPDATED, numberOfOpenedTraces: payload.getNumberOfOpenedTraces()});
	    }
	}

	protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
	    if (this._view) {
	        this._selectedExperiment = experiment;
	    }
	}

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
	            vscode.Uri.joinPath(this._extensionUri, 'pack'),
	            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
	        ]
	    };

	    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

	    // Handle messages from the webview
	    webviewView.webview.onDidReceiveMessage(message => {
	        switch (message.command) {
	        case VSCODE_MESSAGES.CONNECTION_STATUS:
	            if (message.data && message.data.status) {
	                const status: boolean = JSON.parse(message.data.status);
	                this._statusService.render(status);
	            }
	            return;
	        case VSCODE_MESSAGES.WEBVIEW_READY:
	            // Post the tspTypescriptClient
	            webviewView.webview.postMessage({command: VSCODE_MESSAGES.SET_TSP_CLIENT, data: getTspClientUrl()});
	            if (this._selectedExperiment !== undefined) {
	                // tabActivatedSignal will select the experiment in the open traces widget
	                signalManager().fireTraceViewerTabActivatedSignal(this._selectedExperiment);
	                // experimentSelectedSignal will update available views widget
	                signalManager().fireExperimentSelectedSignal(this._selectedExperiment);
	            }
	            return;
	        case VSCODE_MESSAGES.RE_OPEN_TRACE:
	            if (message.data && message.data.wrapper) {
	                const experiment = convertSignalExperiment(JSONBig.parse(message.data.wrapper));
	                const panel = TraceViewerPanel.createOrShow(this._extensionUri, experiment.name, this._statusService);
	                panel.setExperiment(experiment);
	                signalManager().fireExperimentSelectedSignal(experiment);
	            }
	            return;
	        case VSCODE_MESSAGES.CLOSE_TRACE:
	        case VSCODE_MESSAGES.DELETE_TRACE:
	            if (message.data && message.data.wrapper) {
	                // just remove the panel here
	                TraceViewerPanel.disposePanel(this._extensionUri, JSONBig.parse(message.data.wrapper).name);
	                signalManager().fireExperimentSelectedSignal(undefined);
	            }
	            return;
	        case VSCODE_MESSAGES.EXPERIMENT_SELECTED: {
	            let experiment: Experiment | undefined;
	            if (message.data && message.data.wrapper) {
	                experiment = convertSignalExperiment(JSONBig.parse(message.data.wrapper));
	            } else {
	                experiment = undefined;
	            }
	            signalManager().fireExperimentSelectedSignal(experiment);
	        }
	        }
	    }, undefined, this._disposables);

	    signalManager().on(Signals.TRACEVIEWERTAB_ACTIVATED, this._onOpenedTracesWidgetActivated);
	    signalManager().on(Signals.OPENED_TRACES_UPDATED, this._onOpenedTracesChanged);
	    signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	    signalManager().on(Signals.EXPERIMENT_OPENED, this._onExperimentOpened);
	    webviewView.onDidDispose(_event => {
	        signalManager().off(Signals.TRACEVIEWERTAB_ACTIVATED, this._onOpenedTracesWidgetActivated);
	        signalManager().off(Signals.OPENED_TRACES_UPDATED, this._onOpenedTracesChanged);
	        signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
	    }, undefined, this._disposables);
	}

	/* eslint-disable max-len */
	private _getHtmlForWebview(webview: vscode.Webview) {
	    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
	    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'openedTracesPanel.js'));
	    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css'));

	    // Use a nonce to only allow a specific script to be run.
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
