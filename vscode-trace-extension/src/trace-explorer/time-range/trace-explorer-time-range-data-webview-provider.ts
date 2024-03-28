import * as vscode from 'vscode';
import JSONBigConfig from 'json-bigint';
import { Signals, signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { TimeRangeDataMap } from 'traceviewer-react-components/lib/components/utils/time-range-data-map';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

export class TraceExplorerTimeRangeDataProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.timeRangeDataView';
    protected readonly _webviewScript = 'timeRangePanel.js';
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'pack')]
    };
    private _experimentDataMap = new TimeRangeDataMap();

    protected init(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        webviewView.webview.onDidReceiveMessage(
            message => {
                const command = message?.command;
                const parsedData = message?.data ? JSONBig.parse(message.data) : undefined;

                switch (command) {
                    case VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE:
                        signalManager().fireRequestSelectionRangeChange(parsedData);
                        break;
                }
            },
            undefined,
            this._disposables
        );

        webviewView.onDidChangeVisibility(() => {
            if (this._view?.visible) {
                const data = {
                    mapArray: Array.from(this._experimentDataMap.experimentDataMap.values()),
                    activeData: this._experimentDataMap.activeData
                };
                this._view?.webview.postMessage({
                    command: VSCODE_MESSAGES.RESTORE_VIEW,
                    data: JSONBig.stringify(data)
                });
            }
        });

        signalManager().on(Signals.VIEW_RANGE_UPDATED, this.onViewRangeUpdated);
        signalManager().on(Signals.SELECTION_RANGE_UPDATED, this.onSelectionRangeUpdated);
        signalManager().on(Signals.EXPERIMENT_SELECTED, this.onExperimentSelected);
        signalManager().on(Signals.EXPERIMENT_UPDATED, this.onExperimentUpdated);
        signalManager().on(Signals.EXPERIMENT_CLOSED, this.onExperimentClosed);
        signalManager().on(Signals.CLOSE_TRACEVIEWERTAB, this.onExperimentTabClosed);
    }

    protected dispose() {
        signalManager().off(Signals.VIEW_RANGE_UPDATED, this.onViewRangeUpdated);
        signalManager().off(Signals.SELECTION_RANGE_UPDATED, this.onSelectionRangeUpdated);
        signalManager().off(Signals.EXPERIMENT_SELECTED, this.onExperimentSelected);
        signalManager().off(Signals.EXPERIMENT_UPDATED, this.onExperimentUpdated);
        signalManager().off(Signals.EXPERIMENT_CLOSED, this.onExperimentClosed);
        signalManager().off(Signals.CLOSE_TRACEVIEWERTAB, this.onExperimentTabClosed);
        super.dispose();
    }

    private onViewRangeUpdated = (update: TimeRangeUpdatePayload) => {
        this._view?.webview.postMessage({
            command: VSCODE_MESSAGES.VIEW_RANGE_UPDATED,
            data: JSONBig.stringify(update)
        });
        this._experimentDataMap.updateViewRange(update);
    };

    private onSelectionRangeUpdated = (update: TimeRangeUpdatePayload) => {
        this._view?.webview.postMessage({
            command: VSCODE_MESSAGES.SELECTION_RANGE_UPDATED,
            data: JSONBig.stringify(update)
        });
        this._experimentDataMap.updateSelectionRange(update);
    };

    private onExperimentSelected = (experiment: Experiment | undefined) => {
        const data = { wrapper: experiment ? JSONBig.stringify(experiment) : undefined };
        this._view?.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data });
        if (experiment) {
            this._experimentDataMap.updateAbsoluteRange(experiment);
        }
        this._experimentDataMap.setActiveExperiment(experiment);
    };

    private onExperimentUpdated = (experiment: Experiment) => {
        const data = { wrapper: JSONBig.stringify(experiment) };
        this._view?.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_UPDATED, data });
        this._experimentDataMap.updateAbsoluteRange(experiment);
    };

    private onExperimentClosed = (experiment: Experiment) => {
        const data = { wrapper: JSONBig.stringify(experiment) };
        this._view?.webview.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_CLOSED, data });
        this._experimentDataMap.delete(experiment);
    };

    private onExperimentTabClosed = (experimentUUID: string) => {
        this._view?.webview.postMessage({ command: VSCODE_MESSAGES.TRACE_VIEWER_TAB_CLOSED, data: experimentUUID });
        this._experimentDataMap.delete(experimentUUID);
    };
}
