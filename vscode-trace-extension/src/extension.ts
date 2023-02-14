'use strict';
import * as vscode from 'vscode';
import { AnalysisProvider } from './trace-explorer/analysis-tree';
import { TraceExplorerAvailableViewsProvider } from './trace-explorer/views/trace-explorer-available-views-webview-provider';
import { TraceExplorerOpenedTracesViewProvider } from './trace-explorer/opened-traces/trace-explorer-opened-traces-webview-provider';
import { fileHandler, openOverviewHandler, resetZoomHandler } from './trace-explorer/trace-tree';
import { updateTspClient } from './utils/tspClient';

export function activate(context: vscode.ExtensionContext): void {

    const tracesProvider = new TraceExplorerOpenedTracesViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerOpenedTracesViewProvider.viewType, tracesProvider));

    const myAnalysisProvider = new TraceExplorerAvailableViewsProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TraceExplorerAvailableViewsProvider.viewType, myAnalysisProvider));

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

}
