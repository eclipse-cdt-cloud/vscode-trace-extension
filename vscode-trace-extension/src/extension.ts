'use strict';
import * as vscode from 'vscode';
import { AnalysisProvider } from './trace-explorer/analysis-tree';
import { TraceExplorerItemPropertiesProvider } from './trace-explorer/properties/trace-explorer-properties-view-webview-provider';
import { TraceExplorerTimeRangeDataProvider } from './trace-explorer/time-range/trace-explorer-time-range-data-webview-provider';
import { TraceExplorerAvailableViewsProvider } from './trace-explorer/available-views/trace-explorer-available-views-webview-provider';
import { TraceExplorerOpenedTracesViewProvider } from './trace-explorer/opened-traces/trace-explorer-opened-traces-webview-provider';
import {
    fileHandler,
    openOverviewHandler,
    resetZoomHandler,
    undoRedoHandler,
    zoomHandler,
    keyboardShortcutsHandler
} from './trace-explorer/trace-tree';
import { TraceServerConnectionStatusService } from './utils/trace-server-status';
import { getTraceServerUrl, getTspClientUrl, updateTspClient } from './utils/tspClient';
import { TraceExtensionLogger } from './utils/trace-extension-logger';
import { ExternalAPI, traceExtensionAPI } from './external-api/external-api';
import { TraceExtensionWebviewManager } from './utils/trace-extension-webview-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { TraceViewerPanel } from './trace-viewer-panel/trace-viewer-webview-panel';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { TraceServerUrlProvider } from 'vscode-trace-common/lib/server/trace-server-url-provider';

export let traceLogger: TraceExtensionLogger;
export const traceExtensionWebviewManager: TraceExtensionWebviewManager = new TraceExtensionWebviewManager();
const tspClientProvider = new TspClientProvider(getTspClientUrl(), undefined, new TraceServerUrlProvider());

export function activate(context: vscode.ExtensionContext): ExternalAPI {
    traceLogger = new TraceExtensionLogger('Trace Extension');
    vscode.commands.executeCommand('setContext', 'traceViewer.serverOn', true);
    const serverStatusBarItemPriority = 1;
    const serverStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        serverStatusBarItemPriority
    );
    context.subscriptions.push(serverStatusBarItem);
    const serverStatusService = new TraceServerConnectionStatusService(serverStatusBarItem, isUp);

    const tracesProvider = new TraceExplorerOpenedTracesViewProvider(context.extensionUri, serverStatusService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerOpenedTracesViewProvider.viewType, tracesProvider)
    );

    const myAnalysisProvider = new TraceExplorerAvailableViewsProvider(context.extensionUri, serverStatusService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerAvailableViewsProvider.viewType, myAnalysisProvider)
    );

    const propertiesProvider = new TraceExplorerItemPropertiesProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerItemPropertiesProvider.viewType, propertiesProvider)
    );

    const timeRangeDataProvider = new TraceExplorerTimeRangeDataProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerTimeRangeDataProvider.viewType, timeRangeDataProvider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('messages.post.propertiespanel', (command: string, data) => {
            if (propertiesProvider) {
                propertiesProvider.postMessagetoWebview(command, data);
            }
        })
    );

    const updateUris = async (): Promise<void> => {
        const baseUri = vscode.Uri.parse(getTraceServerUrl());
        const extUri = await vscode.env.asExternalUri(baseUri);
        const extUriString = extUri.toString();

        tracesProvider.updateTraceServerUrl(extUriString);
        myAnalysisProvider.updateTraceServerUrl(extUriString);
        TraceViewerPanel.updateTraceServerUrl(extUriString);
    };

    const emitServerStatus = (status: boolean) => {
        console.log('Emitting the server status as: ', status);
        TraceViewerPanel.setServerStatus(status);
        myAnalysisProvider.setServerStatus(status);
        tracesProvider.setServerStatus(status);
    }

    const cancelAllOngoingRequests = () => {
        TraceViewerPanel.cancelHttpRequests();
        myAnalysisProvider.cancelHttpRequests();
        tracesProvider.cancelHttpRequests();
    }

    const analysisProvider = new AnalysisProvider();
    // TODO: For now, a different command opens traces from file explorer. Remove when we have a proper trace finder
    const fileOpenHandler = fileHandler(analysisProvider);
    context.subscriptions.push(vscode.commands.registerCommand('traces.openTraceFile', async file => {
        await startTraceServerIfAvailable();
        await updateUris();
        if (await isUp()) {
            fileOpenHandler(context, file);
        }
    }));

    // Listening to configuration change for the trace server URL
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (
                e.affectsConfiguration('trace-compass.traceserver.url') ||
                e.affectsConfiguration('trace-compass.traceserver.apiPath')
            ) {
                updateTspClient();
            }

        if (e.affectsConfiguration('trace-compass.traceserver.url')) {
            updateUris();
        }
    }));

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

    context.subscriptions.push(vscode.commands.registerCommand('openedTraces.openTraceFolder', async () => {
        await startTraceServerIfAvailable();
        await updateUris();
        if (await isUp()) {
            fileOpenHandler(context, undefined);
        }
    }));

    context.subscriptions.push(
        vscode.commands.registerCommand('traceViewer.shortcuts', () => {
            keyboardShortcutsHandler(context.extensionUri);
        })
    );

    context.subscriptions.push(vscode.commands.registerCommand('serverStatus.started', () => {
        serverStatusService.render(true);
        emitServerStatus(true);
        cancelAllOngoingRequests();
        vscode.commands.executeCommand('setContext', 'traceViewer.serverOn', true);
        updateUris();
        if (tracesProvider) {
            tracesProvider.postMessagetoWebview(VSCODE_MESSAGES.TRACE_SERVER_STARTED, undefined);
        }
    }));

    context.subscriptions.push(
        vscode.commands.registerCommand('serverStatus.stopped', () => {
            vscode.commands.executeCommand('setContext', 'traceViewer.serverOn', false);
            serverStatusService.render(false);
            cancelAllOngoingRequests();
            emitServerStatus(false);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('traceViewer.startServer', () => {
            startTraceServerIfAvailable();
        })
    );

    isUp()
        .then(status => vscode.commands.executeCommand('setContext', 'traceViewer.serverOn', status))
        .catch(()=> vscode.commands.executeCommand('setContext', 'traceViewer.serverOn', false));

    vscode.commands.executeCommand('setContext', 'traceViewer.markerSetsPresent', false);
    vscode.commands.executeCommand('setContext', 'traceViewer.markerCategoriesPresent', false);
    return traceExtensionAPI;
}

export function deactivate(): void {
    traceLogger.disposeChannel();
    traceExtensionWebviewManager.dispose();
}

async function startTraceServerIfAvailable(): Promise<void> {
    const extensionId = 'vscode-trace-server';
    const traceServerExtension = vscode.extensions.getExtension('tracecompass-community.' + extensionId);
    if (!traceServerExtension || (await isUp())) {
        return;
    }
    await vscode.commands.executeCommand(extensionId + '.start-if-stopped');
}

async function isUp() {
    const health = await tspClientProvider.getTspClient().checkHealth();
    const status = health.getModel()?.status;
    return health.isOk() && status === 'UP';
}
