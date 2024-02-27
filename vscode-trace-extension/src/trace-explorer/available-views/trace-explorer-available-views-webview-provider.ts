import JSONBigConfig from 'json-bigint';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import * as vscode from 'vscode';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { TraceServerConnectionStatusService } from '../../utils/trace-server-status';
import { getTraceServerUrl, getTspClientUrl } from '../../utils/backend-tsp-client-provider';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { traceExtensionWebviewManager } from 'vscode-trace-extension/src/extension';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

export class TraceExplorerAvailableViewsProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'traceExplorer.availableViews';

    private _view?: vscode.WebviewView;
    private _disposables: vscode.Disposable[] = [];
    private _selectionOngoing = false;
    private _selectedExperiment: Experiment | undefined;

    private _onExperimentSelected = (experiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(experiment);

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _statusService: TraceServerConnectionStatusService
    ) {}

    public updateTraceServerUrl(newUrl: string): void {
        if (this._view) {
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED, data: newUrl });
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
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
        traceExtensionWebviewManager.fireWebviewCreated(webviewView);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case VSCODE_MESSAGES.CONNECTION_STATUS:
                        if (message.data && message.data.status) {
                            const status: boolean = JSON.parse(message.data.status);
                            this._statusService.render(status);
                        }
                        return;
                    case VSCODE_MESSAGES.WEBVIEW_READY:
                        // Post the tspTypescriptClient
                        webviewView.webview.postMessage({
                            command: VSCODE_MESSAGES.SET_TSP_CLIENT,
                            data: getTspClientUrl()
                        });
                        if (this._selectedExperiment !== undefined) {
                            signalManager().fireExperimentSelectedSignal(this._selectedExperiment);
                        }
                        return;
                    case VSCODE_MESSAGES.OUTPUT_ADDED:
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
                    case VSCODE_MESSAGES.EXPERIMENT_SELECTED: {
                        try {
                            this._selectionOngoing = true;
                            if (message.data && message.data.wrapper) {
                                // Avoid endless forwarding of signal
                                this._selectedExperiment = convertSignalExperiment(JSONBig.parse(message.data.wrapper));
                            } else {
                                this._selectedExperiment = undefined;
                            }
                            signalManager().fireExperimentSelectedSignal(this._selectedExperiment);
                        } finally {
                            this._selectionOngoing = false;
                        }
                    }
                }
            },
            undefined,
            this._disposables
        );

        signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
        webviewView.onDidDispose(
            _event => {
                signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
            },
            undefined,
            this._disposables
        );
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (!this._selectionOngoing && this._view) {
            this._selectedExperiment = experiment;
            const wrapper: string = JSONBig.stringify(experiment);
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data: wrapper });
        }
    }

    /* eslint-disable max-len */
    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'analysisPanel.js'));
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css')
        );
        const packUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack'));

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
				<base href="${packUri}/">
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
