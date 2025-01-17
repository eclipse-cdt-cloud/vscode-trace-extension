'use strict';
import * as vscode from 'vscode';
import { Messenger } from 'vscode-messenger';
import { TraceExplorerItemPropertiesProvider } from './trace-explorer/properties/trace-explorer-properties-view-webview-provider';
import { TraceExplorerTimeRangeDataProvider } from './trace-explorer/time-range/trace-explorer-time-range-data-webview-provider';
import { TraceExplorerAvailableViewsProvider } from './trace-explorer/available-views/trace-explorer-available-views-webview-provider';
import { TraceExplorerOpenedTracesViewProvider } from './trace-explorer/opened-traces/trace-explorer-opened-traces-webview-provider';
import {
    openDialog,
    fileHandler,
    openOverviewHandler,
    resetZoomHandler,
    undoRedoHandler,
    zoomHandler,
    keyboardShortcutsHandler
} from './trace-explorer/trace-utils';
import { TraceServerConnectionStatusService } from './utils/trace-server-status';
import {
    updateTspClientUrl,
    isTraceServerUp,
    updateNoExperimentsContext,
    getTspClientUrl,
    ClientType
} from './utils/backend-tsp-client-provider';
import { TraceExtensionLogger } from './utils/trace-extension-logger';
import { ExternalAPI, traceExtensionAPI } from './external-api/external-api';
import { TraceExtensionWebviewManager } from './utils/trace-extension-webview-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-messages';
import { TraceViewerPanel } from './trace-viewer-panel/trace-viewer-webview-panel';
import { TraceServerManager } from './utils/trace-server-manager';
import { ResourceType, TraceExplorerResourceTypeHandler } from './utils/trace-explorer-resource-type-handler';

export let traceLogger: TraceExtensionLogger;
export const traceExtensionWebviewManager: TraceExtensionWebviewManager = new TraceExtensionWebviewManager();
export const traceServerManager: TraceServerManager = new TraceServerManager();

export const messenger = new Messenger({ ignoreHiddenViews: false });

export async function activate(context: vscode.ExtensionContext): Promise<ExternalAPI> {
    traceLogger = new TraceExtensionLogger('Trace Extension');

    const resourceTypeHandler: TraceExplorerResourceTypeHandler = TraceExplorerResourceTypeHandler.getInstance();

    await updateTspClientUrl();
    const serverStatusBarItemPriority = 1;
    const serverStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        serverStatusBarItemPriority
    );
    context.subscriptions.push(serverStatusBarItem);
    const serverStatusService = new TraceServerConnectionStatusService(serverStatusBarItem);

    const tracesProvider = new TraceExplorerOpenedTracesViewProvider(
        context.extensionUri,
        serverStatusService,
        messenger
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerOpenedTracesViewProvider.viewType, tracesProvider)
    );

    const myAnalysisProvider = new TraceExplorerAvailableViewsProvider(
        context.extensionUri,
        serverStatusService,
        messenger
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerAvailableViewsProvider.viewType, myAnalysisProvider)
    );

    const propertiesProvider = new TraceExplorerItemPropertiesProvider(
        context.extensionUri,
        serverStatusService,
        messenger
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerItemPropertiesProvider.viewType, propertiesProvider)
    );

    const timeRangeDataProvider = new TraceExplorerTimeRangeDataProvider(
        context.extensionUri,
        serverStatusService,
        messenger
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerTimeRangeDataProvider.viewType, timeRangeDataProvider)
    );

    // TODO: For now, a different command opens traces from file explorer. Remove when we have a proper trace finder
    const fileOpenHandler = fileHandler();
    context.subscriptions.push(
        vscode.commands.registerCommand('traces.openTraceFile', async (file: vscode.Uri) => {
            await startTraceServerIfAvailable(file.fsPath);
            if (await isTraceServerUp()) {
                await fileOpenHandler(context, file);
                vscode.commands.executeCommand('trace-explorer.refreshContext');
            }
        })
    );

    // Listening to configuration change for the trace server URL
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async e => {
            if (
                e.affectsConfiguration('trace-compass.traceserver.url') ||
                e.affectsConfiguration('trace-compass.traceserver.apiPath') ||
                e.affectsConfiguration('trace-compass.traceserver.backendUrl') ||
                e.affectsConfiguration('trace-compass.traceserver.enableSeparateBackendUrl')
            ) {
                await updateTspClientUrl();
                const newTspClientURL = getTspClientUrl(ClientType.FRONTEND);

                // Signal the change to the `Opened traces` and `Available views` webview
                tracesProvider.updateTraceServerUrl(newTspClientURL);
                myAnalysisProvider.updateTraceServerUrl(newTspClientURL);
                propertiesProvider.updateTraceServerUrl(newTspClientURL);
                timeRangeDataProvider.updateTraceServerUrl(newTspClientURL);

                // Signal the change to all trace panels
                TraceViewerPanel.updateTraceServerUrl(newTspClientURL);

                // Refresh so that either trace explorer or welcome page is rendered
                vscode.commands.executeCommand('trace-explorer.refreshContext');
            }
        })
    );

    const overViewOpenHandler = openOverviewHandler();

    const zoomResetHandler = resetZoomHandler();
    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.reset', () => {
            zoomResetHandler();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.openOverview', () => {
            overViewOpenHandler();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.undo', () => {
            undoRedoHandler(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.redo', () => {
            undoRedoHandler(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.zoomIn', () => {
            zoomHandler(true);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('outputs.zoomOut', () => {
            zoomHandler(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('trace.viewer.toolbar.markersets', () => {
            TraceViewerPanel.showMarkerSetsOnCurrent();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('trace.viewer.toolbar.filter', () => {
            TraceViewerPanel.showMarkersFilterOnCurrent();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('openedTraces.openTrace', async (resourceType?: ResourceType) => {
            let traceUri = undefined;
            if (resourceType && resourceType === 'File') {
                traceUri = await openDialog(true);
            } else if (resourceType && resourceType === 'Folder') {
                traceUri = await openDialog(false);
            } else {
                const type: ResourceType | undefined = await resourceTypeHandler.detectOrPromptForTraceResouceType();
                if (!type) return;
                const selectFiles = type === 'File' ? true : false;
                traceUri = await openDialog(selectFiles);
            }

            if (!traceUri) {
                return;
            }
            await startTraceServerIfAvailable(traceUri.fsPath);
            if (await isTraceServerUp()) {
                fileOpenHandler(context, traceUri);
                serverStatusService.updateServerStatus(true);
                vscode.commands.executeCommand('setContext', 'trace-explorer.noExperiments', false);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('traceViewer.shortcuts', () => {
            keyboardShortcutsHandler(context.extensionUri);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('serverStatus.started', async () => {
            await serverStatusService.updateServerStatus(true);
            if (tracesProvider) {
                // Trigger webview refresh
                tracesProvider.postMessagetoWebview(VSCODE_MESSAGES.TRACE_SERVER_STARTED, undefined);
            }
            // Refresh so that either trace explorer or welcome page is rendered
            updateNoExperimentsContext();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('serverStatus.stopped', async () => {
            await serverStatusService.updateServerStatus(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('trace-explorer.refreshContext', async () => {
            // Refresh so that either trace explorer or welcome page is rendered
            const isUp = await isTraceServerUp();
            await serverStatusService.updateServerStatus(isUp);
            if (isUp) {
                await updateNoExperimentsContext();
            }
        })
    );

    vscode.commands.executeCommand('setContext', 'traceViewer.markerSetsPresent', false);
    vscode.commands.executeCommand('setContext', 'traceViewer.markerCategoriesPresent', false);

    // Initialize noExperiments/serverUp in a way so that trace explorer webviews are initialized
    vscode.commands.executeCommand('setContext', 'trace-explorer.noExperiments', false);
    vscode.commands.executeCommand('setContext', 'traceViewer.serverUp', true);

    // Refresh to trigger rendering trace explorer or welcome page
    vscode.commands.executeCommand('trace-explorer.refreshContext');

    // Workaround for Theia compatibility of welcome screen. See https://github.com/eclipse-theia/theia/issues/9361
    context.subscriptions.push(vscode.window.registerTreeDataProvider('welcome', new EmptyTreeDataProvider()));

    // Append Diagnostic to traceExtensionAPI
    const diagnostics = messenger.diagnosticApi({ withParameterData: true, withResponseData: true });
    return { ...traceExtensionAPI, ...diagnostics };
}

// Workaround for Theia compatibility of welcome screen. See https://github.com/eclipse-theia/theia/issues/9361
export class EmptyTreeDataProvider implements vscode.TreeDataProvider<unknown> {
    getTreeItem(_element: unknown): vscode.TreeItem {
        return {};
    }

    getChildren(_element?: unknown): Thenable<unknown[]> {
        return Promise.resolve([]);
    }
}

export async function deactivate(): Promise<void> {
    await traceServerManager.stopServer();
    traceServerManager.dispose();
    traceLogger.disposeChannel();
    traceExtensionWebviewManager.dispose();
}

async function startTraceServerIfAvailable(pathToTrace: string): Promise<void> {
    if (await isTraceServerUp()) {
        return;
    }
    await traceServerManager.startServer(pathToTrace);
}
