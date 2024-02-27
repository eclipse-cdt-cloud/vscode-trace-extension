/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as vscode from 'vscode';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { traceExtensionWebviewManager } from 'vscode-trace-extension/src/extension';
import { getTraceServerUrl } from 'vscode-trace-extension/src/utils/backend-tsp-client-provider';

export class TraceExplorerItemPropertiesProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'traceExplorer.itemPropertiesView';
    private _view?: vscode.WebviewView;
    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
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
    }

    postMessagetoWebview(_command: string, _data: unknown): void {
        if (this._view && _command && _data) {
            this._view.webview.postMessage({ command: _command, data: _data });
        }
    }

    public updateTraceServerUrl(newUrl: string): void {
        if (this._view) {
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED, data: newUrl });
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /* eslint-disable max-len */
    private _getHtmlForWebview(webview: vscode.Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'propertiesPanel.js'));
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
