/* eslint-disable @typescript-eslint/no-explicit-any */
import JSONBigConfig from 'json-bigint';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import * as vscode from 'vscode';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { getTspClientUrl, updateNoExperimentsContext } from '../../utils/backend-tsp-client-provider';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

export class TraceExplorerOpenedTracesViewProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.openedTracesView';
    protected readonly _webviewScript = 'openedTracesPanel.js';
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'pack'),
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
        ]
    };

    private _selectedExperiment: Experiment | undefined;

    private _onOpenedTracesWidgetActivated = (experiment: Experiment): void =>
        this.doHandleTracesWidgetActivatedSignal(experiment);
    private _onExperimentSelected = (experiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(experiment);
    private _onExperimentOpened = (experiment: Experiment): void => this.doHandleExperimentOpenedSignal(experiment);

    protected doHandleExperimentOpenedSignal(experiment: Experiment): void {
        if (this._view && experiment) {
            const wrapper: string = JSONBig.stringify(experiment);
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_OPENED, data: wrapper });
        }
    }

    protected doHandleTracesWidgetActivatedSignal(experiment: Experiment): void {
        if (!experiment) {
            return;
        }
        if (this._view) {
            this._selectedExperiment = experiment;
            const wrapper: string = JSONBig.stringify(experiment);
            this._view.webview.postMessage({ command: VSCODE_MESSAGES.TRACE_VIEWER_TAB_ACTIVATED, data: wrapper });
            if (!this._view.visible) {
                // Note that the open-traces webview will send experimentSelectedSignal signal to update the
                // available-views view. If the webview is not visible (e.g. it's minimized) then send the signal
                // here to update the available-views view.
                signalManager().fireExperimentSelectedSignal(this._selectedExperiment);
            }
        }
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (this._view) {
            this._selectedExperiment = experiment;
        }
    }

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
                            // tabActivatedSignal will select the experiment in the opened-traces view
                            // which will then update available-views view
                            signalManager().fireTraceViewerTabActivatedSignal(this._selectedExperiment);
                        }
                        return;
                    case VSCODE_MESSAGES.RE_OPEN_TRACE:
                        if (data && data.wrapper) {
                            const experiment = convertSignalExperiment(JSONBig.parse(data.wrapper));
                            const existingPanel = TraceViewerPanel.getExistingPanel(experiment.name);
                            const panel = TraceViewerPanel.createOrShow(
                                this._extensionUri,
                                experiment.name,
                                this._statusService
                            );
                            // Only set the experiment if it's actually re-opend and not just a re-selection
                            if (existingPanel === undefined) {
                                panel.setExperiment(experiment);
                            }
                        }
                        return;
                    case VSCODE_MESSAGES.CLOSE_TRACE:
                    case VSCODE_MESSAGES.DELETE_TRACE:
                        if (data && data.wrapper) {
                            // just remove the panel here
                            TraceViewerPanel.disposePanel(this._extensionUri, JSONBig.parse(data.wrapper).name);
                            signalManager().fireExperimentSelectedSignal(undefined);
                        }
                        return;
                    case VSCODE_MESSAGES.OPENED_TRACES_UPDATED:
                        updateNoExperimentsContext();
                        return;
                    case VSCODE_MESSAGES.OPEN_TRACE:
                        vscode.commands.executeCommand('openedTraces.openTrace');
                        return;
                    case VSCODE_MESSAGES.EXPERIMENT_SELECTED: {
                        let experiment: Experiment | undefined;
                        if (data && data.wrapper) {
                            experiment = convertSignalExperiment(JSONBig.parse(data.wrapper));
                        } else {
                            experiment = undefined;
                        }
                        signalManager().fireExperimentSelectedSignal(experiment);
                    }
                }
            },
            undefined,
            this._disposables
        );

        signalManager().on(Signals.TRACEVIEWERTAB_ACTIVATED, this._onOpenedTracesWidgetActivated);
        signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
        signalManager().on(Signals.EXPERIMENT_OPENED, this._onExperimentOpened);
    }
    protected dispose() {
        signalManager().off(Signals.TRACEVIEWERTAB_ACTIVATED, this._onOpenedTracesWidgetActivated);
        signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
        signalManager().off(Signals.EXPERIMENT_OPENED, this._onExperimentOpened);
        super.dispose();
    }
}
