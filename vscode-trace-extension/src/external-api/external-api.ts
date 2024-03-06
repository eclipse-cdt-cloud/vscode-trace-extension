/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';
import * as vscode from 'vscode';
import { traceExtensionWebviewManager, traceServerManager } from '../extension';
import { TraceServerContributor } from '../utils/trace-server-manager';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';

export interface ExternalAPI {
    getActiveExperiment(): Experiment | undefined;
    getActiveWebviewPanels(): { [key: string]: TraceViewerPanel | undefined };
    getActiveWebviews(): vscode.WebviewView[];
    onWebviewCreated(listener: (data: vscode.WebviewView) => void): void;
    onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void;
    onSignalManagerSignal(event: string | symbol, listener: (...args: unknown[]) => void): void;
    offSignalManagerSignal(event: string | symbol, listener: (...args: unknown[]) => void): void;
    addTraceServerContributor(contributor: TraceServerContributor): void;
}

export const traceExtensionAPI: ExternalAPI = {
    /**
     * Retrieves the currently active experiment
     *
     * @returns Experiment if one is currently active, otherwise undefined
     */
    getActiveExperiment(): Experiment | undefined {
        return TraceViewerPanel.getCurrentExperiment();
    },

    /**
     * Retrieves active trace panels
     *
     * @returns Key value pairs where the value is of TraceViewerPanel type if panel with that key is active, otherwise undefined
     */
    getActiveWebviewPanels(): { [key: string]: TraceViewerPanel | undefined } {
        return TraceViewerPanel.activePanels;
    },

    /**
     * Retrieves active webviews
     *
     * @returns List of active webviews
     */
    getActiveWebviews(): vscode.WebviewView[] {
        return traceExtensionWebviewManager.getAllActiveWebviews();
    },

    /**
     * Registers an event listener for onWebviewCreated event
     *
     * @param listener event listener
     */
    onWebviewCreated(listener: (data: vscode.WebviewView) => void): void {
        traceExtensionWebviewManager.onWebviewCreated(listener);
    },

    /**
     * Registers an event listener for onWebviewPanelCreated event
     *
     * @param listener event listener
     */
    onWebviewPanelCreated(listener: (data: vscode.WebviewPanel) => void): void {
        traceExtensionWebviewManager.onWebviewPanelCreated(listener);
    },

    /**
     * Attach a listener to signal propagated by signalManager within the trace extension
     *
     * @param event event for which a listener should be attached
     * @param listener event listener
     */
    onSignalManagerSignal(event: string | symbol, listener: (...args: unknown[]) => void): void {
        signalManager().on(event, listener);
    },

    /**
     * Remove a listener for a signal managed by signalManager within the trace extension
     *
     * @param event event for which a listener should be removed
     * @param listener event listener to remove
     */
    offSignalManagerSignal(event: string | symbol, listener: (...args: unknown[]) => void): void {
        signalManager().off(event, listener);
    },

    /**
     * Registers a server contributor
     *
     * @param contributor Contributor object that contains startServer, stopServer handlers and a traceValidator
     */
    addTraceServerContributor(contributor: TraceServerContributor): void {
        traceServerManager.addTraceServerContributor(contributor);
    }
};
