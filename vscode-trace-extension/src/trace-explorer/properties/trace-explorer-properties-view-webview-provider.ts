/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import * as vscode from 'vscode';
import { sourceCodeLookup, updateProperties } from 'vscode-trace-common/lib/messages/vscode-messages';
import { TraceViewerPanel } from 'vscode-trace-extension/src/trace-viewer-panel/trace-viewer-webview-panel';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

export class TraceExplorerItemPropertiesProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.itemPropertiesView';
    public readonly _webviewScript = 'propertiesPanel.js';
    protected propertiesMap: Map<string, ItemPropertiesSignalPayload> = new Map();
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'pack'),
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
        ]
    };

    // VSCODE message handlers
    private _onVscodeSourceCodeLookup = (data: { path: string; line: number }): void => {
        // open an editor window with the file contents,
        // reveal the line and position the cursor at the beginning of the line
        const path: string = data.path;
        vscode.workspace
            .openTextDocument(path)
            .then(doc => vscode.window.showTextDocument(doc))
            .then(editor => {
                const zeroBasedLine = data.line - 1;
                const range = new vscode.Range(zeroBasedLine, 0, zeroBasedLine, 0);
                editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
                const selection = new vscode.Selection(zeroBasedLine, 0, zeroBasedLine, 0);
                editor.selection = selection;
            });
    };

    protected init(): void {
        this._view?.onDidChangeVisibility(() => {
            if (this._view?.visible) {
                const currExp = TraceViewerPanel.getCurrentExperiment();
                if (currExp) {
                    const props = this.propertiesMap?.get(currExp.UUID);
                    if (props) this.handleUpdatedProperties(props);
                }
            }
        });

        const options = {
            sender: this._webviewParticipant
        };
        this._disposables.push(
            this._messenger.onNotification<{ path: string; line: number }>(
                sourceCodeLookup,
                this._onVscodeSourceCodeLookup,
                options
            )
        );

        signalManager().on('ITEM_PROPERTIES_UPDATED', this.handleUpdatedProperties);
        signalManager().on('EXPERIMENT_SELECTED', this.handleExperimentChanged);
        signalManager().on('CLOSE_TRACEVIEWERTAB', this.handleTabClosed);
    }

    handleExperimentChanged = (exp?: Experiment) => {
        const payload = exp
            ? this.propertiesMap.get(exp.UUID) || new ItemPropertiesSignalPayload({})
            : new ItemPropertiesSignalPayload({});
        this.handleUpdatedProperties(payload);
    };

    protected dispose(): void {
        signalManager().off('ITEM_PROPERTIES_UPDATED', this.handleUpdatedProperties);
        signalManager().off('EXPERIMENT_SELECTED', this.handleExperimentChanged);
        signalManager().off('CLOSE_TRACEVIEWERTAB', this.handleTabClosed);
        this._disposables.forEach(disposable => disposable.dispose());
        super.dispose();
    }

    handleTabClosed = (expUUID: string) => {
        this.propertiesMap.delete(expUUID);
        // Update the view based on current active experiment
        const currExp = TraceViewerPanel.getCurrentExperiment();
        if (currExp) {
            const props = this.propertiesMap.get(currExp.UUID);
            if (props) {
                this.handleUpdatedProperties(props);
                return;
            }
        }
        const emptyPayload = new ItemPropertiesSignalPayload({});
        this.handleUpdatedProperties(emptyPayload);
    };

    handleUpdatedProperties = (payload: ItemPropertiesSignalPayload) => {
        this.propertiesMap?.set(payload.getExperimentUUID() ?? '', payload);
        this._messenger.sendNotification(updateProperties, this._webviewParticipant, payload);
    };
}
