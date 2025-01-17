/* eslint-disable @typescript-eslint/no-explicit-any */
import * as vscode from 'vscode';
import JSONBigConfig from 'json-bigint';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { TimeRangeDataMap } from 'traceviewer-react-components/lib/components/utils/time-range-data-map';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import {
    requestSelectionRangeChange,
    experimentSelected,
    experimentUpdated,
    experimentClosed,
    traceViewerTabClosed,
    selectionRangeUpdated,
    viewRangeUpdated,
    restoreView
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

export class TraceExplorerTimeRangeDataProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.timeRangeDataView';
    protected readonly _webviewScript = 'timeRangePanel.js';
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'pack'),
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
        ]
    };
    private _experimentDataMap = new TimeRangeDataMap();

    // VSCODE message handlers
    private _onVscodeRequestSelectionRangeChange = (data: any): void => {
        const parsedData = data ? JSONBig.parse(data) : undefined;
        signalManager().emit('REQUEST_SELECTION_RANGE_CHANGE', parsedData);
    };

    protected init(
        _webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const options = {
            sender: this._webviewParticipant
        };

        this._disposables.push(
            this._messenger.onNotification<any>(
                requestSelectionRangeChange,
                this._onVscodeRequestSelectionRangeChange,
                options
            )
        );

        _webviewView.onDidChangeVisibility(() => {
            if (this._view?.visible) {
                const data = {
                    mapArray: Array.from(this._experimentDataMap.experimentDataMap.values()),
                    activeData: this._experimentDataMap.activeData
                };
                this._messenger.sendNotification(restoreView, this._webviewParticipant, {
                    data: JSONBig.stringify(data)
                });
            }
        });

        signalManager().on('VIEW_RANGE_UPDATED', this.onViewRangeUpdated);
        signalManager().on('SELECTION_RANGE_UPDATED', this.onSelectionRangeUpdated);
        signalManager().on('EXPERIMENT_SELECTED', this.onExperimentSelected);
        signalManager().on('EXPERIMENT_UPDATED', this.onExperimentUpdated);
        signalManager().on('EXPERIMENT_CLOSED', this.onExperimentClosed);
        signalManager().on('CLOSE_TRACEVIEWERTAB', this.onExperimentTabClosed);
    }

    protected dispose() {
        signalManager().off('VIEW_RANGE_UPDATED', this.onViewRangeUpdated);
        signalManager().off('SELECTION_RANGE_UPDATED', this.onSelectionRangeUpdated);
        signalManager().off('EXPERIMENT_SELECTED', this.onExperimentSelected);
        signalManager().off('EXPERIMENT_UPDATED', this.onExperimentUpdated);
        signalManager().off('EXPERIMENT_CLOSED', this.onExperimentClosed);
        signalManager().off('CLOSE_TRACEVIEWERTAB', this.onExperimentTabClosed);

        super.dispose();
    }

    private onViewRangeUpdated = (update: TimeRangeUpdatePayload) => {
        this._messenger.sendNotification(viewRangeUpdated, this._webviewParticipant, JSONBig.stringify(update));
        this._experimentDataMap.updateViewRange(update);
    };

    private onSelectionRangeUpdated = (update: TimeRangeUpdatePayload) => {
        this._messenger.sendNotification(selectionRangeUpdated, this._webviewParticipant, JSONBig.stringify(update));
        this._experimentDataMap.updateSelectionRange(update);
    };

    private onExperimentSelected = (experiment: Experiment | undefined) => {
        const data = { wrapper: experiment ? JSONBig.stringify(experiment) : undefined };
        this._messenger.sendNotification(experimentSelected, this._webviewParticipant, data);
        if (experiment) {
            this._experimentDataMap.updateAbsoluteRange(experiment);
        }
        this._experimentDataMap.setActiveExperiment(experiment);
    };

    private onExperimentUpdated = (experiment: Experiment) => {
        const data = { wrapper: JSONBig.stringify(experiment) };
        this._messenger.sendNotification(experimentUpdated, this._webviewParticipant, data);
        this._experimentDataMap.updateAbsoluteRange(experiment);
    };

    private onExperimentClosed = (experiment: Experiment) => {
        const data = { wrapper: JSONBig.stringify(experiment) };
        this._messenger.sendNotification(experimentClosed, this._webviewParticipant, data);
        this._experimentDataMap.delete(experiment);
    };

    private onExperimentTabClosed = (experimentUUID: string) => {
        this._messenger.sendNotification(traceViewerTabClosed, this._webviewParticipant, experimentUUID);
        this._experimentDataMap.delete(experimentUUID);
    };
}
