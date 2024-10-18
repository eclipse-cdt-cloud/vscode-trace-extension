/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as vscode from 'vscode';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';
import { Signals, signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { TraceViewerPanel } from 'vscode-trace-extension/src/trace-viewer-panel/trace-viewer-webview-panel';

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

        this._view?.webview?.onDidReceiveMessage(
            (message) => {
                const command = message.command;
                const data = message.data;
                switch (command) {
                    case VSCODE_MESSAGES.GO_TO_SOURCE_FILE:
                        vscode.workspace.openTextDocument(data.path).then(
                            (x) => {
                                const text = x.getText();
                                console.log(text);
                            }
                        );
                        break;
                }
            }
        );

        signalManager().on(Signals.ITEM_PROPERTIES_UPDATED, this.handleUpdatedProperties);
        signalManager().on(Signals.EXPERIMENT_SELECTED, this.handleExperimentChanged);
        signalManager().on(Signals.CLOSE_TRACEVIEWERTAB, this.handleTabClosed);
        return;
    }

    handleExperimentChanged = (exp: Experiment) => {
        const props = this.propertiesMap.get(exp?.UUID);
        if (props) {
            this.handleUpdatedProperties(props);
        } else {
            const emptyPayload = new ItemPropertiesSignalPayload({});
            this.handleUpdatedProperties(emptyPayload);
        }
    };

    protected dispose(): void {
        signalManager().off(Signals.ITEM_PROPERTIES_UPDATED, this.handleUpdatedProperties);
        signalManager().off(Signals.EXPERIMENT_SELECTED, this.handleExperimentChanged);
        signalManager().off(Signals.CLOSE_TRACEVIEWERTAB, this.handleTabClosed);
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
        this.postMessagetoWebview(VSCODE_MESSAGES.UPDATE_PROPERTIES, payload);
    };
}
