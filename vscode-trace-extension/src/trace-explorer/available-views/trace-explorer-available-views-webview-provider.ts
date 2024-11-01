/* eslint-disable @typescript-eslint/no-explicit-any */
import JSONBigConfig from 'json-bigint';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import * as vscode from 'vscode';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { getTspClientUrl } from '../../utils/backend-tsp-client-provider';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

export class TraceExplorerAvailableViewsProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.availableViews';
    public readonly _webviewScript = 'analysisPanel.js';
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'pack'),
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
        ]
    };

    private _selectionOngoing = false;
    private _selectedExperiment: Experiment | undefined;

    protected init(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        webviewView.webview.onDidReceiveMessage(
            message => {
                const command: string = message.command;
                const data: any = message.data;
                switch (command) {
                    case VSCODE_MESSAGES.CONNECTION_STATUS:
                        if (data?.status) {
                            const status: boolean = JSON.parse(message.data.status);
                            this._statusService.updateServerStatus(status);
                        }
                        return;
                    case VSCODE_MESSAGES.WEBVIEW_READY:
                        // Post the tspTypescriptClient
                        this._view?.webview.postMessage({
                            command: VSCODE_MESSAGES.SET_TSP_CLIENT,
                            data: getTspClientUrl()
                        });
                        if (this._selectedExperiment !== undefined) {
                            signalManager().emit('EXPERIMENT_SELECTED', this._selectedExperiment);
                        }
                        return;
                    case VSCODE_MESSAGES.OUTPUT_ADDED:
                        if (data && data.descriptor) {
                            // FIXME: JSONBig.parse() created bigint if numbers are small.
                            // Not an issue right now for output descriptors.
                            const descriptor = JSONBig.parse(data.descriptor) as OutputDescriptor;
                            // TODO: Don't use static current panel, i.e. find better design to add output...

                            TraceViewerPanel.addOutputToCurrent(descriptor);
                            // const panel = TraceViewerPanel.createOrShow(this._extensionUri, data.experiment.name);
                            // panel.setExperiment(data.experiment);
                        }
                        return;
                    case VSCODE_MESSAGES.EXPERIMENT_SELECTED: {
                        try {
                            this._selectionOngoing = true;
                            if (data && data.wrapper) {
                                // Avoid endless forwarding of signal
                                this._selectedExperiment = convertSignalExperiment(JSONBig.parse(data.wrapper));
                            } else {
                                this._selectedExperiment = undefined;
                            }
                            signalManager().emit('EXPERIMENT_SELECTED', this._selectedExperiment);
                        } finally {
                            this._selectionOngoing = false;
                        }
                    }
                }
            },
            undefined,
            this._disposables
        );

        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
    }

    protected dispose() {
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
        super.dispose();
    }

    private _onExperimentSelected = (experiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(experiment);

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (!this._selectionOngoing && this._view) {
            this._selectedExperiment = experiment;
            const wrapper: string = JSONBig.stringify(experiment);
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data: wrapper });
        }
    }
}
