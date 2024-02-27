import * as vscode from 'vscode';
import { getTraceServerUrl } from '../utils/backend-tsp-client-provider';

/**
 * Manages the keyboard and mouse shortcuts panel
 */
export class KeyboardShortcutsPanel {
    private static readonly viewType = 'trace.viewer.shortcuts';
    private static _panel: vscode.WebviewPanel | undefined = undefined;

    public static createOrShow(extensionUri: vscode.Uri, name: string): void {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        if (this._panel) {
            this._panel.reveal(column);
        } else {
            this._panel = vscode.window.createWebviewPanel(
                KeyboardShortcutsPanel.viewType,
                name,
                column || vscode.ViewColumn.One,
                {
                    // Enable javascript in the webview
                    enableScripts: true
                }
            );

            // Set the webview's initial html content
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);

            // Listen for when the panel is disposed
            // This happens when the user closes the panel or when the panel is closed programmatically
            this._panel.onDidDispose(() => {
                this._panel = undefined;
            });
        }
    }

    /* eslint-disable max-len */
    private static _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'pack', 'shortcutsPanel.js'));
        const packUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'pack'));

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
