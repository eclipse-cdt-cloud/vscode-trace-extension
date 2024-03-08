'use strict';
import * as vscode from 'vscode';
import { AnalysisProvider } from './trace-explorer/analysis-tree';
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
} from './trace-explorer/trace-tree';
import { TraceServerConnectionStatusService } from './utils/trace-server-status';
import { getTspClientUrl, updateTspClientUrl, isTraceServerUp } from './utils/backend-tsp-client-provider';
import { TraceExtensionLogger } from './utils/trace-extension-logger';
import { ExternalAPI, traceExtensionAPI } from './external-api/external-api';
import { TraceExtensionWebviewManager } from './utils/trace-extension-webview-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { TraceViewerPanel } from './trace-viewer-panel/trace-viewer-webview-panel';
import { TraceServerManager } from './utils/trace-server-manager';

export let traceLogger: TraceExtensionLogger;
export const traceExtensionWebviewManager: TraceExtensionWebviewManager = new TraceExtensionWebviewManager();
export const traceServerManager: TraceServerManager = new TraceServerManager();

export function activate(context: vscode.ExtensionContext): ExternalAPI {
    traceLogger = new TraceExtensionLogger('Trace Extension');

    const serverStatusBarItemPriority = 1;
    const serverStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        serverStatusBarItemPriority
    );
    context.subscriptions.push(serverStatusBarItem);
    const serverStatusService = new TraceServerConnectionStatusService(serverStatusBarItem);

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

    const analysisProvider = new AnalysisProvider();
    // TODO: For now, a different command opens traces from file explorer. Remove when we have a proper trace finder
    const fileOpenHandler = fileHandler(analysisProvider);
    context.subscriptions.push(
        vscode.commands.registerCommand('traces.openTraceFile', async (file: vscode.Uri) => {
            await startTraceServerIfAvailable(file.fsPath);
            if (await isTraceServerUp()) {
                fileOpenHandler(context, file);
                vscode.commands.executeCommand('setContext', 'trace-explorer.noExperiments', false);
            }
        })
    );

    // Listening to configuration change for the trace server URL
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (
                e.affectsConfiguration('trace-compass.traceserver.url') ||
                e.affectsConfiguration('trace-compass.traceserver.apiPath')
            ) {
                updateTspClientUrl();
            }

            if (e.affectsConfiguration('trace-compass.traceserver.url')) {
                const newTspClientURL = getTspClientUrl();

                // Signal the change to the `Opened traces` and `Available views` webview
                tracesProvider.updateTraceServerUrl(newTspClientURL);
                myAnalysisProvider.updateTraceServerUrl(newTspClientURL);
                propertiesProvider.updateTraceServerUrl(newTspClientURL);
                timeRangeDataProvider.updateTraceServerUrl(newTspClientURL);

                // Signal the change to all trace panels
                TraceViewerPanel.updateTraceServerUrl(newTspClientURL);
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
        vscode.commands.registerCommand('openedTraces.openTraceFolder', async () => {
            const traceUri = await openDialog();
            if (!traceUri) {
                return;
            }
            await startTraceServerIfAvailable(traceUri.fsPath);
            if (await isTraceServerUp()) {
                fileOpenHandler(context, traceUri);
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
        vscode.commands.registerCommand('serverStatus.started', () => {
            serverStatusService.checkAndUpdateServerStatus();
            if (tracesProvider) {
                tracesProvider.postMessagetoWebview(VSCODE_MESSAGES.TRACE_SERVER_STARTED, undefined);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('serverStatus.stopped', () => {
            serverStatusService.checkAndUpdateServerStatus();
        })
    );

    vscode.commands.executeCommand('setContext', 'traceViewer.markerSetsPresent', false);
    vscode.commands.executeCommand('setContext', 'traceViewer.markerCategoriesPresent', false);
    vscode.commands.executeCommand('setContext', 'trace-explorer.noExperiments', true);
    serverStatusService.checkAndUpdateServerStatus();
    return traceExtensionAPI;
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
