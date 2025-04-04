/* eslint-disable @typescript-eslint/no-explicit-any */
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import * as vscode from 'vscode';
import type { Messenger } from 'vscode-messenger';
import { NotificationType, WebviewIdMessageParticipant } from 'vscode-messenger-common';
import {
    VSCODE_MESSAGES,
    webviewReady,
    connectionStatus,
    setTheme,
    setTspClient,
    experimentSelected,
    setExperiment
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { ClientType, getTraceServerUrl, getTspClientUrl } from '../utils/backend-tsp-client-provider';
import { TraceServerConnectionStatusService } from '../utils/trace-server-status';

/**
 * Manages react webview panels
 */
export class CustomViewerPanel {
    /**
     * Track the currently panels. Only allow a single panel to exist at a time.
     */
    public static activePanels = {} as {
        [key: string]: CustomViewerPanel | undefined;
    };

    private static readonly viewType = 'react';
    private static currentPanel: CustomViewerPanel | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _statusService: TraceServerConnectionStatusService | undefined;

    private _disposables: vscode.Disposable[] = [];
    private readonly _messenger: Messenger;
    protected _webviewParticipant: WebviewIdMessageParticipant;
    private _experiment: Experiment | undefined = undefined;
    private _onExperimentSelected = (openedExperiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(openedExperiment);
    // private _onRequestSelectionRangeChange = (payload: TimeRangeUpdatePayload): void =>
    //     this.doHandleRequestSelectionRangeChange(payload);

    private _onVscodeConnectionStatus = (data: any): void => {
        this.doHandleConnectionStatus(data);
    };

    // VSCODE message handlers
    private _onVscodeWebviewReady = (): void => {
        this.doHandleVscodeWebViewReady();
    };

    /**
     * Creates a new or gets an existing panel by name. Shows existing if not active.
     * @param extensionUri The extension URI
     * @param name The name of the experiment / panel
     * @param statusService  The status service that the panel will use
     * @returns The new or existing panel
     */
    public static createOrShow(
        extensionUri: vscode.Uri,
        experiment: Experiment,
        statusService: TraceServerConnectionStatusService | undefined,
        messenger: Messenger
    ): CustomViewerPanel {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it.
        // Otherwise, create a new panel.
        let openedPanel = CustomViewerPanel.activePanels[experiment.name];
        if (openedPanel) {
            // Only call reveal if it's not active
            if (!openedPanel._panel.active) {
                openedPanel._panel.reveal(column);
            }
        } else {
            openedPanel = new CustomViewerPanel(
                extensionUri,
                column || vscode.ViewColumn.One,
                experiment,
                statusService,
                messenger
            );
            CustomViewerPanel.activePanels[experiment.name] = openedPanel;
        }
        CustomViewerPanel.currentPanel = openedPanel;
        return openedPanel;
    }

    /**
     * Gets an existing panel
     * @param name The name of the experiment / panel
     * @returns the existing panel or undefined
     */
    public static getExistingPanel(name: string): CustomViewerPanel | undefined {
        // If we already have a panel, return it.
        return CustomViewerPanel.activePanels[name];
    }

    public static disposePanel(extensionUri: vscode.Uri, name: string): void {
        // If we already have a panel, show it.
        // Otherwise, create a new panel.
        const openedPanel = CustomViewerPanel.activePanels[name];
        if (openedPanel) {
            openedPanel._panel.dispose();
            CustomViewerPanel.activePanels[name] = undefined;
            CustomViewerPanel.currentPanel = undefined;
        }
    }

    /**
     * Directly sends a VSCode Message to all activePanel's webviews.
     * @param {string} command - command from `VSCODE_MESSAGES` object
     * @param {unknown} data - payload
     */
    public static postMessageToWebviews(command: string, data: unknown): void {
        Object.values(CustomViewerPanel.activePanels).forEach(activePanel => {
            if (!activePanel?._panel) {
                return;
            }
            activePanel.postMessageToWebview(command, data);
        });
    }

    public static updateTraceServerUrl(newUrl: string): void {
        Object.values(CustomViewerPanel.activePanels).forEach(panel => {
            if (panel) {
                panel.postMessageToWebview(VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED, newUrl);
                panel._panel.webview.html = panel._getHtmlForWebview(panel._panel.webview);
            }
        });
    }

    private constructor(
        extensionUri: vscode.Uri,
        column: vscode.ViewColumn,
        experiment: Experiment,
        statusService: TraceServerConnectionStatusService | undefined,
        messenger: Messenger
    ) {
        this._extensionUri = extensionUri;
        this._statusService = statusService;
        this._messenger = messenger;
        this._experiment = experiment;
        // Create and show a new webview panel
        this._panel = vscode.window.createWebviewPanel(CustomViewerPanel.viewType, "Custom Views", column, {
            // Enable javascript in the webview
            enableScripts: true,

            // Do not destroy the content when hidden
            retainContextWhenHidden: true,
            enableCommandUris: true,

            // And restrict the webview to only loading content from our extension's `media` directory.
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'pack'),
                vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
            ]
        });

        // Register webview panel to messenger
        this._webviewParticipant = this._messenger.registerWebviewPanel(this._panel);

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => {
            const isActivePanel = CustomViewerPanel.activePanels[experiment.name] === CustomViewerPanel.currentPanel;
            const traceUUID = CustomViewerPanel.activePanels[experiment.name]?._experiment?.UUID;
            this.dispose();
            CustomViewerPanel.activePanels[experiment.name] = undefined;
            if (traceUUID) {
                signalManager().emit('CLOSE_TRACEVIEWERTAB', traceUUID);
            }
            if (isActivePanel) {
                signalManager().emit('EXPERIMENT_SELECTED', undefined);
            }
            return this._disposables;
        });

        this._panel.onDidChangeViewState(e => {
            if (e.webviewPanel.active) {
                CustomViewerPanel.currentPanel = this;
            }
        });

        vscode.window.onDidChangeActiveColorTheme(e => {
            const data = e.kind === 1 ? 'light' : 'dark';
            this._messenger.sendNotification(setTheme, this._webviewParticipant, data);
        });

        const options = {
            sender: this._webviewParticipant
        };

        this._disposables.push(this._messenger.onNotification<void>(webviewReady, this._onVscodeWebviewReady, options));
        this._disposables.push(
            this._messenger.onNotification<any>(connectionStatus, this._onVscodeConnectionStatus, options)
        );

        // Handle messages from the webview
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
    }

    public dispose(): void {
        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
    }

    /**
     * Directly sends a VSCode Message to all activePanel's webviews.
     * @param {string} command - command from `VSCODE_MESSAGES` object
     * @param {unknown} data - payload
     */
    public postMessageToWebview(command: string, data: unknown): void {
        const message: NotificationType<any> = { method: command };
        this._messenger.sendNotification(message, this._webviewParticipant, data);
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (this._experiment && experiment && this._experiment.UUID === experiment.UUID) {
            const wrapper = JSONBigUtils.stringify(experiment);
            const data = { wrapper };
            this._messenger.sendNotification(experimentSelected, this._webviewParticipant, data);
        }
    }

    protected doHandleExperimentUpdatedSignal(experiment: Experiment): void {
        signalManager().emit('EXPERIMENT_UPDATED', experiment);
    }

    // protected doHandleRequestSelectionRangeChange(payload: TimeRangeUpdatePayload): void {
    //     this._messenger.sendNotification(experimentSelected, this._webviewParticipant, JSONBigUtils.stringify(payload));
    // }

    setExperiment(experiment: Experiment): void {
        this._experiment = experiment;
        const wrapper = JSONBigUtils.stringify(experiment);
        const data = { wrapper };
        this._messenger.sendNotification(setExperiment, this._webviewParticipant, data);
    }


    loadTheme(): void {
        const data = vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark';
        this._messenger.sendNotification(setTheme, this._webviewParticipant, data);
    }

    private doHandleVscodeWebViewReady(): void {
        // Post the tspTypescriptClient
        if (this._experiment) {
            const wrapper = JSONBigUtils.stringify(this._experiment);
            const data = { data: getTspClientUrl(ClientType.FRONTEND), experiment: wrapper };
            this._messenger.sendNotification(setTspClient, this._webviewParticipant, data);
        } else {
            const data = { data: getTspClientUrl(ClientType.FRONTEND) };
            this._messenger.sendNotification(setTspClient, this._webviewParticipant, data);
        }
        this.loadTheme();
    }

    private doHandleConnectionStatus(data: any): void {
        if (data?.status && this._statusService) {
            const status: boolean = JSON.parse(data.status);
            this._statusService.updateServerStatus(status);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css')
        );
        const packUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack'));
        const nonce = getNonce();

        try {
            return this._getReactHtmlForWebview(webview);
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
					img-src ${webview.cspSource} data:;
					script-src 'nonce-${nonce}' 'unsafe-eval';
					style-src ${webview.cspSource} 'unsafe-inline';
					connect-src ${getTraceServerUrl(ClientType.BACKEND)} ${getTraceServerUrl(ClientType.FRONTEND)};
					font-src ${webview.cspSource} data:">
				<link href="${codiconsUri}" rel="stylesheet" />
				<base href="${packUri}/">
			</head>

			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div>${'Error initializing trace viewer'}</div>
			</body>
			</html>`;
        }
    }

    /* eslint-disable max-len */
    private _getReactHtmlForWebview(webview: vscode.Webview): string {
        // Fetching codicons styles
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'customViewerPanel.js'));
        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons', 'codicon.css')
        );
        const packUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack'));

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
					img-src ${webview.cspSource} data:;
					script-src 'nonce-${nonce}' 'unsafe-eval';
					style-src ${webview.cspSource} 'unsafe-inline';
					connect-src ${getTraceServerUrl(ClientType.BACKEND)} ${getTraceServerUrl(ClientType.FRONTEND)};
					font-src ${webview.cspSource} data:">
				<link href="${codiconsUri}" rel="stylesheet" />
				<base href="${packUri}/">
			</head>

			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<div id="root"></div>

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
