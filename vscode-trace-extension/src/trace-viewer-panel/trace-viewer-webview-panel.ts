/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import * as path from 'path';
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import * as vscode from 'vscode';
import type { Messenger } from 'vscode-messenger';
import { NotificationType, WebviewIdMessageParticipant } from 'vscode-messenger-common';
import {
    VSCODE_MESSAGES,
    webviewReady,
    alert,
    newStatus,
    removeStatus,
    updateProperties,
    saveAsCSV,
    connectionStatus,
    showMarkerCategories,
    sendMarkerSets,
    markerSetsContext,
    markerCategoryContext,
    viewRangeUpdated,
    selectionRangeUpdated,
    experimentUpdated,
    setTheme,
    setTspClient,
    experimentSelected,
    setExperiment,
    addOutput,
    openOverview,
    resetZoom,
    undo,
    redo,
    updateZoom,
    getMarkerCategories,
    getMarkerSets,
    updateMarkerCategoryState,
    updateMarkerSetState
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { handleRemoveMessage, handleStatusMessage, setStatusFromPanel } from '../common/trace-message';
import { traceExtensionWebviewManager } from '../extension';
import { ClientType, getTraceServerUrl, getTspClientUrl } from '../utils/backend-tsp-client-provider';
import { TraceServerConnectionStatusService } from '../utils/trace-server-status';

interface QuickPickItem extends vscode.QuickPickItem {
    id: string;
}

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
    private readonly _messenger: Messenger;
    protected _webviewParticipant: WebviewIdMessageParticipant;
    private _experiment: Experiment | undefined = undefined;
    private _onExperimentSelected = (openedExperiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(openedExperiment);
    private _onRequestSelectionRangeChange = (payload: TimeRangeUpdatePayload): void =>
        this.doHandleRequestSelectionRangeChange(payload);

    // VSCODE message handlers
    private _onVscodeWebviewReady = (): void => {
        this.doHandleVscodeWebViewReady();
    };

    private _onVscodeAlert = (text: any): void => {
        this.doHandleVscodeAlert(text);
    };

    private _onVscodeNewStatus = (data: any): void => {
        this.doHandleVscodeNewStatus(data);
    };

    private _onVscodeRemoveStatus = (data: any): void => {
        this.doHandleVscodeRemoveStatus(data);
    };

    private _onVscodeUpdateProperties = (data: any): void => {
        this.doHandleVscodeUpdateProperties(data);
    };

    private _onVscodeSaveAsCsv = (data: any): void => {
        this.doHandleVscodeSaveAsCsv(data);
    };

    private _onVscodeConnectionStatus = (data: any): void => {
        this.doHandleConnectionStatus(data);
    };

    private _onVscodeShowMarkerCategories = (data: any): void => {
        this.doHandleVscodeShowMarkerCategories(data);
    };

    private _onVscodeSendMarkerSets = (data: any): void => {
        this.doHandleVscodeSendMarkerSets(data);
    };

    private _onVscodeMarkerSetsContext = (data: any): void => {
        this.doHandleVscodeMarkerSetsContext(data);
    };

    private _onVscodeMarkerCategoryContext = (data: any): void => {
        this.doHandleVscodeMarkerCategoryContext(data);
    };

    private _onVscodeViewRangeUpdated = (data: any): void => {
        this.doHandleVscodeViewRangeUpdated(data);
    };

    private _onVscodeSelectionRangeUpdated = (data: any): void => {
        this.doHandleVscodeSelectionRangeUpdated(data);
    };

    private _onVscodeExperimentUpdated = (data: any): void => {
        this.doHandleExperimentUpdated(data);
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
        name: string,
        statusService: TraceServerConnectionStatusService | undefined,
        messenger: Messenger
    ): TraceViewerPanel {
        const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

        // If we already have a panel, show it.
        // Otherwise, create a new panel.
        let openedPanel = TraceViewerPanel.activePanels[name];
        if (openedPanel) {
            // Only call reveal if it's not active
            if (!openedPanel._panel.active) {
                openedPanel._panel.reveal(column);
            }
        } else {
            openedPanel = new TraceViewerPanel(
                extensionUri,
                column || vscode.ViewColumn.One,
                name,
                statusService,
                messenger
            );
            TraceViewerPanel.activePanels[name] = openedPanel;
            setStatusFromPanel(name);
        }
        TraceViewerPanel.currentPanel = openedPanel;
        return openedPanel;
    }

    /**
     * Gets an existing panel
     * @param name The name of the experiment / panel
     * @returns the existing panel or undefined
     */
    public static getExistingPanel(name: string): TraceViewerPanel | undefined {
        // If we already have a panel, return it.
        return TraceViewerPanel.activePanels[name];
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

    public static undoRedoOnCurrent(isUndo: boolean): void {
        TraceViewerPanel.currentPanel?.undoRedo(isUndo);
    }

    public static zoomOnCurrent(hasZoomedIn: boolean): void {
        TraceViewerPanel.currentPanel?.updateZoom(hasZoomedIn);
    }

    public static showMarkerSetsOnCurrent(): void {
        TraceViewerPanel.currentPanel?.showMarkerSets();
    }

    public static showMarkersFilterOnCurrent(): void {
        TraceViewerPanel.currentPanel?.showMarkersFilter();
    }

    public static getCurrentExperiment(): Experiment | undefined {
        return TraceViewerPanel.currentPanel?._experiment;
    }

    private static async saveTraceCsv(csvData: string, defaultFileName: string) {
        const saveDialogOptions = {
            defaultUri: vscode.workspace.workspaceFolders
                ? vscode.Uri.file(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, defaultFileName))
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

    /**
     * Directly sends a VSCode Message to all activePanel's webviews.
     * @param {string} command - command from `VSCODE_MESSAGES` object
     * @param {unknown} data - payload
     */
    public static postMessageToWebviews(command: string, data: unknown): void {
        Object.values(TraceViewerPanel.activePanels).forEach(activePanel => {
            if (!activePanel?._panel) {
                return;
            }
            activePanel.postMessageToWebview(command, data);
        });
    }

    public static updateTraceServerUrl(newUrl: string): void {
        Object.values(TraceViewerPanel.activePanels).forEach(panel => {
            if (panel) {
                panel.postMessageToWebview(VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED, newUrl);
                panel._panel.webview.html = panel._getHtmlForWebview(panel._panel.webview);
            }
        });
    }

    private constructor(
        extensionUri: vscode.Uri,
        column: vscode.ViewColumn,
        name: string,
        statusService: TraceServerConnectionStatusService | undefined,
        messenger: Messenger
    ) {
        this._extensionUri = extensionUri;
        this._statusService = statusService;
        this._messenger = messenger;

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
                vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
            ]
        });

        // Register webview panel to messenger
        this._webviewParticipant = this._messenger.registerWebviewPanel(this._panel);

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        traceExtensionWebviewManager.fireWebviewPanelCreated(this._panel);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => {
            const isActivePanel = TraceViewerPanel.activePanels[name] === TraceViewerPanel.currentPanel;
            const traceUUID = TraceViewerPanel.activePanels[name]?._experiment?.UUID;
            this.dispose();
            TraceViewerPanel.activePanels[name] = undefined;
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
                TraceViewerPanel.currentPanel = this;
                setStatusFromPanel(name);
                if (this._experiment) {
                    // tabActivatedSignal will select the experiment in the opened-traces view
                    // which will then update available-views view
                    signalManager().emit('TRACEVIEWERTAB_ACTIVATED', this._experiment);
                }
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
        this._disposables.push(this._messenger.onNotification<string>(alert, this._onVscodeAlert, options));
        this._disposables.push(this._messenger.onNotification<string>(newStatus, this._onVscodeNewStatus, options));
        this._disposables.push(
            this._messenger.onNotification<string>(removeStatus, this._onVscodeRemoveStatus, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(updateProperties, this._onVscodeUpdateProperties, options)
        );
        this._disposables.push(this._messenger.onNotification<any>(saveAsCSV, this._onVscodeSaveAsCsv, options));
        this._disposables.push(
            this._messenger.onNotification<any>(connectionStatus, this._onVscodeConnectionStatus, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(showMarkerCategories, this._onVscodeShowMarkerCategories, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(sendMarkerSets, this._onVscodeSendMarkerSets, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(markerSetsContext, this._onVscodeMarkerSetsContext, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(markerCategoryContext, this._onVscodeMarkerCategoryContext, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(viewRangeUpdated, this._onVscodeViewRangeUpdated, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(selectionRangeUpdated, this._onVscodeSelectionRangeUpdated, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(experimentUpdated, this._onVscodeExperimentUpdated, options)
        );

        // Handle messages from the webview
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().on('REQUEST_SELECTION_RANGE_CHANGE', this._onRequestSelectionRangeChange);
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
        signalManager().off('REQUEST_SELECTION_RANGE_CHANGE', this._onRequestSelectionRangeChange);
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

    protected doHandleRequestSelectionRangeChange(payload: TimeRangeUpdatePayload): void {
        this._messenger.sendNotification(experimentSelected, this._webviewParticipant, JSONBigUtils.stringify(payload));
    }
    setExperiment(experiment: Experiment): void {
        this._experiment = experiment;
        const wrapper = JSONBigUtils.stringify(experiment);
        const data = { wrapper };
        this._messenger.sendNotification(setExperiment, this._webviewParticipant, data);
        signalManager().emit('EXPERIMENT_OPENED', experiment);
        signalManager().emit('TRACEVIEWERTAB_ACTIVATED', experiment);
    }
    getExperiment(): Experiment | undefined {
        return this._experiment;
    }

    addOutput(descriptor: OutputDescriptor): void {
        const wrapper = JSONBigUtils.stringify(descriptor);
        const data = { wrapper };
        this._messenger.sendNotification(addOutput, this._webviewParticipant, data);
    }

    showOverview(): void {
        this._messenger.sendNotification(openOverview, this._webviewParticipant);
    }

    resetZoom(): void {
        this._messenger.sendNotification(resetZoom, this._webviewParticipant);
    }

    undoRedo(isUndo: boolean): void {
        if (isUndo) {
            this._messenger.sendNotification(undo, this._webviewParticipant);
        } else {
            this._messenger.sendNotification(redo, this._webviewParticipant);
        }
    }

    updateZoom(hasZoomedIn: boolean): void {
        this._messenger.sendNotification(updateZoom, this._webviewParticipant, hasZoomedIn);
    }

    showMarkersFilter(): void {
        this._messenger.sendNotification(getMarkerCategories, this._webviewParticipant);
    }

    showMarkerSets(): void {
        this._messenger.sendNotification(getMarkerSets, this._webviewParticipant);
    }

    renderMarkersFilter(
        markerCategories: Map<
            string,
            {
                categoryCount: number;
                toggleInd: boolean;
            }
        >
    ): void {
        const items: vscode.QuickPickItem[] = [];

        markerCategories.forEach((categoryInfo, categoryName) => {
            items.push({
                label: categoryName,
                picked: categoryInfo.toggleInd
            });
        });

        vscode.window
            .showQuickPick(items, {
                title: 'Select Markers Filter',
                placeHolder: 'Filter',
                canPickMany: true
            })
            .then(selection => {
                // the user canceled the selection
                if (!selection) {
                    return;
                }

                const selectedCategories: string[] = [];
                for (const category of selection) {
                    selectedCategories.push(category.label);
                }
                const wrapper = JSON.stringify(selectedCategories);
                this._messenger.sendNotification(updateMarkerCategoryState, this._webviewParticipant, { wrapper });
            });
    }

    renderMarkerSets(markerSetsMap: Map<string, { marker: MarkerSet; enabled: boolean }>): void {
        const items: QuickPickItem[] = [];

        markerSetsMap.forEach((value: { marker: MarkerSet; enabled: boolean }, key: string) => {
            const item: QuickPickItem = {
                id: key,
                label: value.marker.name,
                picked: value.enabled
            };
            if (value.enabled) {
                item.detail = 'Selected';
            }
            items.push(item);
        });

        vscode.window
            .showQuickPick(items, {
                title: 'Select Marker Set',
                placeHolder: 'Filter'
            })
            .then(selection => {
                // the user canceled the selection
                if (!selection) {
                    return;
                }

                if (markerSetsMap.has(selection.id)) {
                    this._messenger.sendNotification(updateMarkerSetState, this._webviewParticipant, selection.id);
                }
            });
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

    private doHandleVscodeAlert(text: any): void {
        vscode.window.showErrorMessage(text);
    }

    private doHandleVscodeNewStatus(data: any): void {
        handleStatusMessage(this._panel?.title, data);
    }

    private doHandleVscodeRemoveStatus(data: any): void {
        handleRemoveMessage(this._panel?.title, data);
    }

    private doHandleVscodeUpdateProperties(data: any): void {
        if (data?.properties) {
            signalManager().emit(
                'ITEM_PROPERTIES_UPDATED',
                new ItemPropertiesSignalPayload(data.properties, data.experimentUUID, data.outputDescriptorId)
            );
        }
    }
    private doHandleVscodeSaveAsCsv(payload: any): void {
        if (payload.data && typeof payload.data === 'string') {
            TraceViewerPanel.saveTraceCsv(
                payload.data,
                (this._experiment !== undefined ? this._experiment.name : 'trace') + '.csv'
            );
        }
    }

    private doHandleConnectionStatus(data: any): void {
        if (data?.status && this._statusService) {
            const status: boolean = JSON.parse(data.status);
            this._statusService.updateServerStatus(status);
        }
    }

    private doHandleVscodeShowMarkerCategories(data: any): void {
        if (data?.wrapper) {
            const markerCategories = new Map<string, { categoryCount: number; toggleInd: boolean }>(
                JSON.parse(data.wrapper)
            );
            TraceViewerPanel.currentPanel?.renderMarkersFilter(markerCategories);
        }
    }

    private doHandleVscodeSendMarkerSets(data: any): void {
        if (data?.wrapper) {
            const markerSetsMap = new Map<string, { marker: MarkerSet; enabled: boolean }>(JSON.parse(data.wrapper));
            TraceViewerPanel.currentPanel?.renderMarkerSets(markerSetsMap);
        }
    }

    private doHandleVscodeMarkerSetsContext(data: any): void {
        if (data?.status) {
            const status: boolean = JSON.parse(data.status);
            vscode.commands.executeCommand('setContext', 'traceViewer.markerSetsPresent', status);
        }
    }

    private doHandleVscodeMarkerCategoryContext(data: any): void {
        if (data?.status) {
            const status: boolean = JSON.parse(data.status);
            vscode.commands.executeCommand('setContext', 'traceViewer.markerCategoriesPresent', status);
        }
    }

    private doHandleVscodeViewRangeUpdated(data: any): void {
        if (data) {
            const result = JSONBigUtils.parse<TimeRangeUpdatePayload>(data);
            signalManager().emit('VIEW_RANGE_UPDATED', result);
        }
    }

    private doHandleVscodeSelectionRangeUpdated(data: any): void {
        if (data) {
            signalManager().emit('SELECTION_RANGE_UPDATED', JSONBigUtils.parse<TimeRangeUpdatePayload>(data));
        }
    }

    private doHandleExperimentUpdated(data: any): void {
        if (data) {
            signalManager().emit('EXPERIMENT_UPDATED', JSONBigUtils.parse(data, Experiment));
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
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'pack', 'trace_panel.js'));
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
