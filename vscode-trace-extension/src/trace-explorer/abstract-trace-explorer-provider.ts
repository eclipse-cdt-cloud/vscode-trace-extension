/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import { TraceServerConnectionStatusService } from '../utils/trace-server-status';
import { getTraceServerUrl } from '../utils/backend-tsp-client-provider';
import { traceExtensionWebviewManager } from 'vscode-trace-extension/src/extension';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';

export abstract class AbstractTraceExplorerProvider implements vscode.WebviewViewProvider {
    protected _view: vscode.WebviewView | undefined;
    protected _disposables: vscode.Disposable[] = [];

    /**
     * Bundled JS script file for the webview.
     * The bundle files are defined in `vscode-trace-webviews/webpack.config.js`
     */
    protected abstract readonly _webviewScript: string;

    /**
     * The `vscode.WebviewOptions` that will be used inside `vscode.WebviewViewProvider.resolveWebviewView`
     */
    protected abstract readonly _webviewOptions: vscode.WebviewOptions;

    constructor(
        protected readonly _extensionUri: vscode.Uri,
        protected readonly _statusService: TraceServerConnectionStatusService
    ) {}

    /**
     * Sends the updated URL to the front-end webview.
     * Refreshes the HTML to prevent CORS errors.
     * @param {string} newUrl
     */
    public updateTraceServerUrl(newUrl: string): void {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({ command: VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED, data: newUrl });
        this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }

    /**
     * Directly sends a VSCode Message to the Provider's Webview.
     * @param {string} command - command from `VSCODE_MESSAGES` object
     * @param {unknown} data - payload
     */
    public postMessagetoWebview(command: string, data: unknown): void {
        if (!this._view || !command) {
            return;
        }
        this._view.webview.postMessage({ command, data });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.options = this._webviewOptions;

        traceExtensionWebviewManager.fireWebviewCreated(webviewView);

        this.init(webviewView, _context, _token);
        webviewView.onDidDispose(_event => this.dispose(), undefined, this._disposables);
    }

    protected dispose() {
        this._view = undefined;
    }

    /* eslint-disable max-len */
    protected _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', this._webviewScript));
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
					img-src ${webview.cspSource};
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

    /**
     * Initialize the WebviewViewProvider.
     * Executes inside of `vscode.WebviewViewProvider.resolveWebviewView`
     * @param {vscode.WebviewView} webviewView
     * @param {vscode.WebviewViewResolveContext} _context
     * @param {vscode.CancellationToken} _token
     */
    protected abstract init(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void;
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
