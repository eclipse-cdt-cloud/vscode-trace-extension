import * as vscode from 'vscode';
import * as path from 'path';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { getTspClientUrl, getTraceServerUrl } from '../utils/backend-tsp-client-provider';
import { TraceServerConnectionStatusService } from '../utils/trace-server-status';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { handleStatusMessage, handleRemoveMessage, setStatusFromPanel } from '../common/trace-message';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import JSONBigConfig from 'json-bigint';
import * as fs from 'fs';
import { traceExtensionWebviewManager } from '../extension';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

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
    private _experiment: Experiment | undefined = undefined;
    private _onExperimentSelected = (openedExperiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(openedExperiment);
    private _onRequestSelectionRangeChange = (payload: TimeRangeUpdatePayload): void =>
        this.doHandleRequestSelectionRangeChange(payload);

    public static createOrShow(
        extensionUri: vscode.Uri,
        name: string,
        statusService: TraceServerConnectionStatusService | undefined
    ): TraceViewerPanel {
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

    public static undoRedoOnCurrent(undo: boolean): void {
        TraceViewerPanel.currentPanel?.undoRedo(undo);
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

    public static updateTraceServerUrl(newUrl: string): void {
        Object.values(TraceViewerPanel.activePanels).forEach(trace => {
            if (trace) {
                trace._panel.webview.postMessage({
                    command: VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED,
                    data: newUrl
                });
                trace._panel.webview.html = trace._getHtmlForWebview(trace._panel.webview);
            }
        });
    }

    private constructor(
        extensionUri: vscode.Uri,
        column: vscode.ViewColumn,
        name: string,
        statusService: TraceServerConnectionStatusService | undefined
    ) {
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
                vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
            ]
        });

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
                signalManager().fireCloseTraceViewerTabSignal(traceUUID);
            }
            if (isActivePanel) {
                signalManager().fireExperimentSelectedSignal(undefined);
            }
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
        this._panel.webview.onDidReceiveMessage(
            message => {
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
                            this._panel.webview.postMessage({
                                command: VSCODE_MESSAGES.SET_TSP_CLIENT,
                                data: getTspClientUrl(),
                                experiment: wrapper
                            });
                        } else {
                            this._panel.webview.postMessage({
                                command: VSCODE_MESSAGES.SET_TSP_CLIENT,
                                data: getTspClientUrl()
                            });
                        }
                        this.loadTheme();
                        return;
                    case VSCODE_MESSAGES.UPDATE_PROPERTIES:
                        vscode.commands.executeCommand(
                            'messages.post.propertiespanel',
                            'receivedProperties',
                            message.data
                        );
                        return;
                    case VSCODE_MESSAGES.SAVE_AS_CSV:
                        if (message.payload.data && typeof message.payload.data === 'string') {
                            TraceViewerPanel.saveTraceCsv(
                                message.payload.data,
                                (this._experiment !== undefined ? this._experiment.name : 'trace') + '.csv'
                            );
                        }
                        return;
                    case VSCODE_MESSAGES.CONNECTION_STATUS:
                        if (message.data?.status && this._statusService) {
                            const status: boolean = JSON.parse(message.data.status);
                            this._statusService.render(status);
                        }
                        return;
                    case VSCODE_MESSAGES.SHOW_MARKER_CATEGORIES:
                        if (message.data?.wrapper) {
                            const markerCategories = new Map<string, { categoryCount: number; toggleInd: boolean }>(
                                JSON.parse(message.data.wrapper)
                            );
                            TraceViewerPanel.currentPanel?.renderMarkersFilter(markerCategories);
                        }
                        return;
                    case VSCODE_MESSAGES.SEND_MARKER_SETS:
                        if (message.data?.wrapper) {
                            const markerSetsMap = new Map<string, { marker: MarkerSet; enabled: boolean }>(
                                JSON.parse(message.data.wrapper)
                            );
                            TraceViewerPanel.currentPanel?.renderMarkerSets(markerSetsMap);
                        }
                        return;
                    case VSCODE_MESSAGES.MARKER_SETS_CONTEXT:
                        if (message.data?.status) {
                            const status: boolean = JSON.parse(message.data.status);
                            vscode.commands.executeCommand('setContext', 'traceViewer.markerSetsPresent', status);
                        }
                        return;
                    case VSCODE_MESSAGES.MARKER_CATEGORIES_CONTEXT:
                        if (message.data?.status) {
                            const status: boolean = JSON.parse(message.data.status);
                            vscode.commands.executeCommand('setContext', 'traceViewer.markerCategoriesPresent', status);
                        }
                        return;
                    case VSCODE_MESSAGES.VIEW_RANGE_UPDATED:
                        signalManager().fireViewRangeUpdated(JSONBig.parse(message.data));
                        break;
                    case VSCODE_MESSAGES.SELECTION_RANGE_UPDATED:
                        signalManager().fireSelectionRangeUpdated(JSONBig.parse(message.data));
                        break;
                    case VSCODE_MESSAGES.EXPERIMENT_UPDATED:
                        const experiment = convertSignalExperiment(JSONBig.parse(message.data));
                        signalManager().fireExperimentUpdatedSignal(experiment);
                        break;
                }
            },
            undefined,
            this._disposables
        );
        signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
        signalManager().on(Signals.REQUEST_SELECTION_RANGE_CHANGE, this._onRequestSelectionRangeChange);
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
        signalManager().off(Signals.REQUEST_SELECTION_RANGE_CHANGE, this._onRequestSelectionRangeChange);
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (this._experiment && experiment && this._experiment.UUID === experiment.UUID) {
            this._panel.reveal();
            const wrapper: string = JSONBig.stringify(experiment);
            this._panel.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data: wrapper });
        }
    }

    protected doHandleExperimentUpdatedSignal(experiment: Experiment): void {
        signalManager().fireExperimentUpdatedSignal(experiment);
    }

    protected doHandleRequestSelectionRangeChange(payload: TimeRangeUpdatePayload): void {
        this._panel.webview.postMessage({
            command: VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE,
            data: JSONBig.stringify(payload)
        });
    }
    setExperiment(experiment: Experiment): void {
        this._experiment = experiment;
        const wrapper: string = JSONBig.stringify(experiment);
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.SET_EXPERIMENT, data: wrapper });
        signalManager().fireExperimentOpenedSignal(experiment);
        signalManager().fireTraceViewerTabActivatedSignal(experiment);
    }

    addOutput(descriptor: OutputDescriptor): void {
        const wrapper: string = JSONBig.stringify(descriptor);
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.ADD_OUTPUT, data: wrapper });
    }

    showOverview(): void {
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.OPEN_OVERVIEW });
    }

    resetZoom(): void {
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.RESET_ZOOM });
    }

    undoRedo(undo: boolean): void {
        if (undo) {
            this._panel.webview.postMessage({ command: VSCODE_MESSAGES.UNDO });
        } else {
            this._panel.webview.postMessage({ command: VSCODE_MESSAGES.REDO });
        }
    }

    updateZoom(hasZoomedIn: boolean): void {
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.UPDATE_ZOOM, data: hasZoomedIn });
    }

    showMarkersFilter(): void {
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.GET_MARKER_CATEGORIES });
    }

    showMarkerSets(): void {
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.GET_MARKER_SETS });
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
                this._panel.webview.postMessage({
                    command: VSCODE_MESSAGES.UPDATE_MARKER_CATEGORY_STATE,
                    data: wrapper
                });
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
                    this._panel.webview.postMessage({
                        command: VSCODE_MESSAGES.UPDATE_MARKER_SET_STATE,
                        data: selection.id
                    });
                }
            });
    }

    loadTheme(): void {
        const wrapper = vscode.window.activeColorTheme.kind === 1 ? 'light' : 'dark';
        this._panel.webview.postMessage({ command: VSCODE_MESSAGES.SET_THEME, data: wrapper });
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
