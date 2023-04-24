import * as Messages from 'traceviewer-base/lib/message-manager';
import { OutputAddedSignalPayload } from 'traceviewer-base/lib/signals/output-added-signal-payload';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import JSONBigConfig from 'json-bigint';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

/* eslint-disable  @typescript-eslint/no-explicit-any */
interface vscode {
    postMessage(message: any): void;
}

// declare function acquireVsCodeApi(): vscode;
declare const vscode: vscode;

export interface VsCodeTraceAction {
    actionId: string;
    args: any[];
}

export const VSCODE_MESSAGES = {
    ADD_OUTPUT: 'add-output',
    ALERT: 'alert',
    CONNECTION_STATUS: 'connectionStatus',
    CLOSE_TRACE: 'closeTrace',
    DELETE_TRACE: 'deleteTrace',
    EXPERIMENT_OPENED: 'experimentOpened',
    EXPERIMENT_SELECTED: 'experimentSelected',
    NEW_STATUS: 'newStatus',
    OPENED_TRACES_UPDATED: 'openedTracesUpdated',
    OPEN_OVERVIEW: 'open-overview',
    OUTPUT_ADDED: 'outputAdded',
    REFACTOR: 'refactor',
    RE_OPEN_TRACE: 'reopenTrace',
    REMOVE_STATUS: 'rmStatus',
    RESET_ZOOM: 'reset-zoom',
    SAVE_AS_CSV: 'saveAsCsv',
    SET_EXPERIMENT: 'set-experiment',
    SET_THEME: 'set-theme',
    SET_TSP_CLIENT: 'set-tspClient',
    TRACE_VIEWER_TAB_ACTIVATED: 'traceViewerTabActivated',
    UPDATE_PROPERTIES: 'updateProperties',
    WEBVIEW_READY: 'webviewReady',
    UNDO: 'undo',
    REDO: 'redo',
    UPDATE_ZOOM: 'updateZoom',
    OPEN_TRACE: 'openTrace'
};

export class VsCodeMessageManager extends Messages.MessageManager {
    constructor() {
        super();
    }

    addStatusMessage(messageKey: string, {text,
        category = Messages.MessageCategory.SERVER_MESSAGE,
        severity = Messages.MessageSeverity.INFO }: Messages.StatusMessage): void {
        vscode.postMessage({command: VSCODE_MESSAGES.NEW_STATUS, data: {messageKey, text, category, severity }});
    }

    removeStatusMessage(messageKey: string): void {
        vscode.postMessage({command: VSCODE_MESSAGES.REMOVE_STATUS, data: { messageKey }});
    }

    notifyReady(): void {
        vscode.postMessage({command: VSCODE_MESSAGES.WEBVIEW_READY});
    }

    notifyConnection(serverStatus: boolean): void {
        const status: string = JSON.stringify(serverStatus);
        vscode.postMessage({command: VSCODE_MESSAGES.CONNECTION_STATUS, data: { status }});
    }

    /**************************************************************************
     * Trace Explorer React APP
     *************************************************************************/

    openTrace(): void {
        vscode.postMessage({command: VSCODE_MESSAGES.OPEN_TRACE});
    }

    updateOpenedTraces(numberOfOpenedTraces: number): void {
        vscode.postMessage({command: VSCODE_MESSAGES.OPENED_TRACES_UPDATED, numberOfOpenedTraces});
    }

    reOpenTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: VSCODE_MESSAGES.RE_OPEN_TRACE, data: {wrapper}});
    }

    closeTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: VSCODE_MESSAGES.CLOSE_TRACE, data: {wrapper}});
    }

    deleteTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: VSCODE_MESSAGES.DELETE_TRACE, data: {wrapper}});
    }

    experimentSelected(experiment: Experiment | undefined): void {
        let wrapper = undefined;
        if (experiment) {
            wrapper = JSONBig.stringify(experiment);
        }
        vscode.postMessage({command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data: {wrapper}});
    }

    outputAdded(payload: OutputAddedSignalPayload): void {
        const expWrapper = JSONBig.stringify(payload.getExperiment());
        const descWrapper = JSONBig.stringify(payload.getOutputDescriptor());
        vscode.postMessage({command: VSCODE_MESSAGES.OUTPUT_ADDED, data: {data: expWrapper, descriptor: descWrapper }});
    }

    propertiesUpdated(properties: { [key: string]: string }): void {
        vscode.postMessage({command: VSCODE_MESSAGES.UPDATE_PROPERTIES, data: {properties}});
    }

    saveAsCSV(payload: {traceId: string, data: string}): void {
        vscode.postMessage({command: VSCODE_MESSAGES.SAVE_AS_CSV, payload});
    }
}
