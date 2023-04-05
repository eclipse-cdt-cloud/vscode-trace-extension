'use strict';
import * as vscode from 'vscode';
import { AnalysisProvider } from './trace-explorer/analysis-tree';
import { TraceExplorerItemPropertiesProvider } from './trace-explorer/properties/trace-explorer-properties-view-webview-provider';
import { TraceExplorerAvailableViewsProvider } from './trace-explorer/available-views/trace-explorer-available-views-webview-provider';
import { TraceExplorerOpenedTracesViewProvider } from './trace-explorer/opened-traces/trace-explorer-opened-traces-webview-provider';
import { fileHandler, openOverviewHandler, resetZoomHandler } from './trace-explorer/trace-tree';
import { TraceServerConnectionStatusService } from './utils/trace-server-status';
import { TraceServerService } from './utils/trace-server-service';
import { updateTspClient } from './utils/tspClient';

export function activate(context: vscode.ExtensionContext): void {

    const serverStatusBarItemPriority = 1;
    const serverStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, serverStatusBarItemPriority);
    context.subscriptions.push(serverStatusBarItem);
    const serverStatusService = new TraceServerConnectionStatusService(serverStatusBarItem);

    const tracesProvider = new TraceExplorerOpenedTracesViewProvider(context.extensionUri, serverStatusService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerOpenedTracesViewProvider.viewType, tracesProvider));

    const myAnalysisProvider = new TraceExplorerAvailableViewsProvider(context.extensionUri, serverStatusService);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerAvailableViewsProvider.viewType, myAnalysisProvider));

    const propertiesProvider = new TraceExplorerItemPropertiesProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerItemPropertiesProvider.viewType, propertiesProvider));

    context.subscriptions.push(vscode.commands.registerCommand('messages.post.propertiespanel', (command: string, data) => {
        if (propertiesProvider) {
            propertiesProvider.postMessagetoWebview(command, data);
        }
    }));

    const analysisProvider = new AnalysisProvider();
    // TODO: For now, a different command opens traces from file explorer. Remove when we have a proper trace finder
    const fileOpenHandler = fileHandler(analysisProvider);
    context.subscriptions.push(vscode.commands.registerCommand('traces.openTraceFile', file => {
        fileOpenHandler(context, file);
    }));

    // Listening to configuration change for the trace server URL
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('trace-compass.traceserver.url') || e.affectsConfiguration('trace-compass.traceserver.apiPath')) {
            updateTspClient();
        }
    }));

    const overViewOpenHandler = openOverviewHandler();

    const zoomResetHandler = resetZoomHandler();
    context.subscriptions.push(vscode.commands.registerCommand('outputs.reset', () => {
        zoomResetHandler();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('outputs.openOverview', () => {
        overViewOpenHandler();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('openedTraces.openTraceFolder', () => {
        fileOpenHandler(context, undefined);
    }));

    const traceServerService = new TraceServerService();

    context.subscriptions.push(vscode.commands.registerCommand('traceServer.start', () => {
        traceServerService.startTraceServer();
        // TODO: Revisit this list of events; event loop empties on Exit => cancels such handling:
        process.on('beforeExit', () => {
            process.stdin.resume();
            traceServerService.stopTraceServerNow();});
        process.on('disconnect', () => {
            process.stdin.resume();
            traceServerService.stopTraceServerNow();});
        process.on('exit', () => {
            process.stdin.resume();
            traceServerService.stopTraceServerNow();});
        // TODO: Thus, consider introducing a backend that holds/stops this trace-server, if quit.
        // TODO: Also, automatically start the (configured) server if stopped while opening trace.
    }));

    context.subscriptions.push(vscode.commands.registerCommand('traceServer.stop', () => {
        traceServerService.stopTraceServer();
    }));
}
