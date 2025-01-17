/* eslint-disable @typescript-eslint/no-explicit-any */
import JSONBigConfig from 'json-bigint';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import * as vscode from 'vscode';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { ClientType, getTspClientUrl, updateNoExperimentsContext } from '../../utils/backend-tsp-client-provider';
import {
    webviewReady,
    connectionStatus,
    reOpenTrace,
    closeTrace,
    deleteTrace,
    openTracesUpdated,
    openTrace,
    experimentSelected,
    traceViewerTabActivated,
    setTspClient,
    experimentOpened
} from 'vscode-trace-common/lib/messages/vscode-messages';
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

    // Signal handlers
    private _onOpenedTracesWidgetActivated = (experiment: Experiment): void =>
        this.doHandleTracesWidgetActivatedSignal(experiment);
    private _onExperimentSelected = (experiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(experiment);
    private _onExperimentOpened = (experiment: Experiment): void => this.doHandleExperimentOpenedSignal(experiment);

    // VSCODE message handlers
    private _onVscodeWebviewReady = (): void => {
        // Post the tspTypescriptClient
        this._messenger.sendNotification(setTspClient, this._webviewParticipant, getTspClientUrl(ClientType.FRONTEND));
        if (this._selectedExperiment !== undefined) {
            signalManager().emit('TRACEVIEWERTAB_ACTIVATED', this._selectedExperiment);
        }
    };

    private _onVscodeConnectionStatus = (data: any): void => {
        if (data?.status) {
            const status: boolean = JSON.parse(data.status);
            this._statusService.updateServerStatus(status);
        }
    };

    private _onVscodeOpenTrace = (): void => {
        vscode.commands.executeCommand('openedTraces.openTrace');
    };

    private _onVscodeReOpenTrace = (data: any): void => {
        if (data?.wrapper) {
            const experiment = convertSignalExperiment(JSONBig.parse(data.wrapper));
            const existingPanel = TraceViewerPanel.getExistingPanel(experiment.name);
            const panel = TraceViewerPanel.createOrShow(
                this._extensionUri,
                experiment.name,
                this._statusService,
                this._messenger
            );
            // Only set the experiment if it's actually re-opend and not just a re-selection
            if (existingPanel === undefined) {
                panel.setExperiment(experiment);
            }
        }
    };

    private _onVscodeCloseTrace = (data: any): void => {
        if (data?.wrapper) {
            // just remove the panel here
            TraceViewerPanel.disposePanel(this._extensionUri, JSONBig.parse(data.wrapper).name);
            signalManager().emit('EXPERIMENT_SELECTED', undefined);
        }
    };

    private _onVscodeOpenTracesUpdated = (_numberOfOpenedTraces: number): void => {
        updateNoExperimentsContext();
    };

    private _onVscodeExperimentSelected = (data: any): void => {
        let experiment: Experiment | undefined;
        if (data?.wrapper) {
            experiment = convertSignalExperiment(JSONBig.parse(data.wrapper));
        } else {
            experiment = undefined;
        }
        signalManager().emit('EXPERIMENT_SELECTED', experiment);
    };

    protected doHandleExperimentOpenedSignal(experiment: Experiment): void {
        if (this._view && experiment) {
            const wrapper: string = JSONBig.stringify(experiment);
            this._messenger.sendNotification(experimentOpened, this._webviewParticipant, wrapper);
        }
    }

    protected doHandleTracesWidgetActivatedSignal(experiment: Experiment): void {
        if (!experiment) {
            return;
        }
        if (this._view) {
            this._selectedExperiment = experiment;
            const wrapper: string = JSONBig.stringify(experiment);
            this._messenger.sendNotification(traceViewerTabActivated, this._webviewParticipant, wrapper);

            if (!this._view.visible) {
                // Note that the open-traces webview will send experimentSelectedSignal signal to update the
                // available-views view. If the webview is not visible (e.g. it's minimized) then send the signal
                // here to update the available-views view.
                signalManager().emit('EXPERIMENT_SELECTED', this._selectedExperiment);
            }
        }
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (this._view) {
            this._selectedExperiment = experiment;
        }
    }

    protected init(
        _webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const options = {
            sender: this._webviewParticipant
        };
        this._disposables.push(this._messenger.onNotification<any>(webviewReady, this._onVscodeWebviewReady, options));
        this._disposables.push(
            this._messenger.onNotification<any>(connectionStatus, this._onVscodeConnectionStatus, options)
        );
        this._disposables.push(this._messenger.onNotification<any>(openTrace, this._onVscodeOpenTrace, options));
        this._disposables.push(this._messenger.onNotification<any>(reOpenTrace, this._onVscodeReOpenTrace, options));
        this._disposables.push(this._messenger.onNotification<any>(closeTrace, this._onVscodeCloseTrace, options));
        this._disposables.push(this._messenger.onNotification<any>(deleteTrace, this._onVscodeCloseTrace, options));
        this._disposables.push(
            this._messenger.onNotification<number>(openTracesUpdated, this._onVscodeOpenTracesUpdated, options)
        );
        this._disposables.push(
            this._messenger.onNotification<any>(experimentSelected, this._onVscodeExperimentSelected, options)
        );

        signalManager().on('TRACEVIEWERTAB_ACTIVATED', this._onOpenedTracesWidgetActivated);
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().on('EXPERIMENT_OPENED', this._onExperimentOpened);
    }
    protected dispose() {
        signalManager().off('TRACEVIEWERTAB_ACTIVATED', this._onOpenedTracesWidgetActivated);
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().off('EXPERIMENT_OPENED', this._onExperimentOpened);
        this._disposables.forEach(disposable => disposable.dispose());
        super.dispose();
    }
}
