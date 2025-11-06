/* eslint-disable @typescript-eslint/no-explicit-any */
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import * as vscode from 'vscode';
import {
    webviewReady,
    connectionStatus,
    outputAdded,
    experimentSelected,
    setTspClient,
    alert,
    info
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { ClientType, getTspClientUrl } from 'vscode-trace-extension/src/utils/backend-tsp-client-provider';
import { TraceViewerPanel } from '../../trace-viewer-panel/trace-viewer-webview-panel';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';
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

    // VSCODE message handlers
    private _onVscodeWebviewReady = (): void => {
        // Post the tspTypescriptClient
        this._messenger.sendNotification(setTspClient, this._webviewParticipant, getTspClientUrl(ClientType.FRONTEND));
        if (this._selectedExperiment !== undefined) {
            signalManager().emit('EXPERIMENT_SELECTED', this._selectedExperiment);
        }
    };

    private _onVscodeConnectionStatus = (data: any): void => {
        if (data?.status) {
            const status: boolean = JSON.parse(data.status);
            this._statusService.updateServerStatus(status);
        }
    };

    private _onVscodeOutputAdded = (data: any): void => {
        if (data?.descriptor) {
            const descriptor: OutputDescriptor = JSONBigUtils.parse(data.descriptor, OutputDescriptor);
            TraceViewerPanel.addOutputToCurrent(descriptor);
        }
    };

    private _onVscodeExperimentSelected = (data: any): void => {
        try {
            this._selectionOngoing = true;
            if (data?.wrapper) {
                // Avoid endless forwarding of signal
                this._selectedExperiment = JSONBigUtils.parse(data.wrapper, Experiment);
            } else {
                this._selectedExperiment = undefined;
            }
            signalManager().emit('EXPERIMENT_SELECTED', this._selectedExperiment);
        } finally {
            this._selectionOngoing = false;
        }
    };

    private readonly _onVscodeAlert = (text: any): void => {
        vscode.window.showErrorMessage(text);
    };

    private readonly _onVscodeInfo = (text: any): void => {
        vscode.window.showInformationMessage(text);
    };

    protected init(
        _webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        const options = {
            sender: this._webviewParticipant
        };
        this._disposables.push(this._messenger.onNotification<void>(webviewReady, this._onVscodeWebviewReady, options));
        this._disposables.push(
            this._messenger.onNotification<any>(connectionStatus, this._onVscodeConnectionStatus, options)
        );
        this._disposables.push(this._messenger.onNotification<any>(outputAdded, this._onVscodeOutputAdded, options));
        this._disposables.push(
            this._messenger.onNotification<any>(experimentSelected, this._onVscodeExperimentSelected, options)
        );
        this._disposables.push(this._messenger.onNotification<string>(alert, this._onVscodeAlert, options));
        this._disposables.push(this._messenger.onNotification<string>(info, this._onVscodeInfo, options));
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
    }

    protected dispose() {
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
        this._disposables.forEach(disposable => disposable.dispose());
        super.dispose();
    }

    private _onExperimentSelected = (experiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(experiment);

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (!this._selectionOngoing && this._view) {
            this._selectedExperiment = experiment;
            const wrapper = experiment ? JSONBigUtils.stringify(experiment) : undefined;
            this._messenger.sendNotification(experimentSelected, this._webviewParticipant, { wrapper });
        }
    }
}
