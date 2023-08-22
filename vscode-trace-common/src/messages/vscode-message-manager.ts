import * as Messages from 'traceviewer-base/lib/message-manager';
import { OutputAddedSignalPayload } from 'traceviewer-base/lib/signals/output-added-signal-payload';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import JSONBigConfig from 'json-bigint';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
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
    EXPERIMENT_UPDATED: 'experimentUpdated',
    EXPERIMENT_CLOSED: 'experimentClosed',
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
    TRACE_VIEWER_TAB_CLOSED: 'traceViewerTabClosed',
    UPDATE_PROPERTIES: 'updateProperties',
    WEBVIEW_READY: 'webviewReady',
    UNDO: 'undo',
    REDO: 'redo',
    UPDATE_ZOOM: 'updateZoom',
    OPEN_TRACE: 'openTrace',
    TRACE_SERVER_STARTED: 'traceServerStarted',
    SHOW_MARKER_CATEGORIES: 'showMarkerCategories',
    SEND_MARKER_SETS: 'sendMarkerSets',
    GET_MARKER_CATEGORIES: 'getMarkerCategories',
    GET_MARKER_SETS: 'getMarkerSets',
    UPDATE_MARKER_CATEGORY_STATE: 'updateMarkerCategoryState',
    UPDATE_MARKER_SET_STATE: 'updateMarkerSetState',
    MARKER_SETS_CONTEXT: 'markerSetsContext',
    MARKER_CATEGORIES_CONTEXT: 'markerCategoriesContext',
    TRACE_SERVER_URL_CHANGED: 'traceServerUrlChanged',
    VIEW_RANGE_UPDATED: 'viewRangeUpdated',
    SELECTION_RANGE_UPDATED: 'selectionRangeUpdated',
    REQUEST_SELECTION_RANGE_CHANGE: 'requestSelectionRangeChange',
    RESTORE_VIEW: 'restoreView',
    RESTORE_COMPLETE: 'restoreComplete'
};

export class VsCodeMessageManager extends Messages.MessageManager {
    constructor() {
        super();
    }

    addStatusMessage(
        messageKey: string,
        {
            text,
            category = Messages.MessageCategory.SERVER_MESSAGE,
            severity = Messages.MessageSeverity.INFO
        }: Messages.StatusMessage
    ): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.NEW_STATUS, data: { messageKey, text, category, severity } });
    }

    removeStatusMessage(messageKey: string): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.REMOVE_STATUS, data: { messageKey } });
    }

    notifyReady(): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.WEBVIEW_READY });
    }

    notifyConnection(serverStatus: boolean): void {
        const status: string = JSON.stringify(serverStatus);
        vscode.postMessage({ command: VSCODE_MESSAGES.CONNECTION_STATUS, data: { status } });
    }

    /**************************************************************************
     * Trace Explorer React APP
     *************************************************************************/

    openTrace(): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.OPEN_TRACE });
    }

    updateOpenedTraces(numberOfOpenedTraces: number): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.OPENED_TRACES_UPDATED, numberOfOpenedTraces });
    }

    reOpenTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({ command: VSCODE_MESSAGES.RE_OPEN_TRACE, data: { wrapper } });
    }

    closeTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({ command: VSCODE_MESSAGES.CLOSE_TRACE, data: { wrapper } });
    }

    deleteTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({ command: VSCODE_MESSAGES.DELETE_TRACE, data: { wrapper } });
    }

    experimentSelected(experiment?: Experiment | undefined): void {
        const wrapper = experiment ? JSONBig.stringify(experiment) : undefined;
        const data = { wrapper };
        vscode.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_SELECTED, data });
    }

    experimentUpdated(experiment: Experiment): void {
        const data = JSONBig.stringify(experiment);
        vscode.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_UPDATED, data });
    }

    experimentClosed(experiment: Experiment): void {
        const data = JSONBig.stringify(experiment);
        vscode.postMessage({ command: VSCODE_MESSAGES.EXPERIMENT_CLOSED, data });
    }

    outputAdded(payload: OutputAddedSignalPayload): void {
        const expWrapper = JSONBig.stringify(payload.getExperiment());
        const descWrapper = JSONBig.stringify(payload.getOutputDescriptor());
        vscode.postMessage({
            command: VSCODE_MESSAGES.OUTPUT_ADDED,
            data: { data: expWrapper, descriptor: descWrapper }
        });
    }

    propertiesUpdated(properties: { [key: string]: string }): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.UPDATE_PROPERTIES, data: { properties } });
    }

    viewRangeUpdated(payload: TimeRangeUpdatePayload): void {
        const data = JSONBig.stringify(payload);
        vscode.postMessage({ command: VSCODE_MESSAGES.VIEW_RANGE_UPDATED, data });
    }

    selectionRangeUpdated(payload: TimeRangeUpdatePayload): void {
        const data = JSONBig.stringify(payload);
        vscode.postMessage({ command: VSCODE_MESSAGES.SELECTION_RANGE_UPDATED, data });
    }

    requestSelectionRangeChange(payload: TimeRangeUpdatePayload): void {
        const data = JSONBig.stringify(payload);
        vscode.postMessage({ command: VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE, data });
    }

    saveAsCSV(payload: { traceId: string; data: string }): void {
        vscode.postMessage({ command: VSCODE_MESSAGES.SAVE_AS_CSV, payload });
    }

    fetchMarkerCategories(payload: Map<string, { categoryCount: number; toggleInd: boolean }>): void {
        const wrapper: string = JSON.stringify([...payload]);
        vscode.postMessage({ command: VSCODE_MESSAGES.SHOW_MARKER_CATEGORIES, data: { wrapper } });
    }

    fetchMarkerSets(payload: Map<string, { marker: MarkerSet; enabled: boolean }>): void {
        const wrapper: string = JSON.stringify([...payload]);
        vscode.postMessage({ command: VSCODE_MESSAGES.SEND_MARKER_SETS, data: { wrapper } });
    }

    setMarkerSetsContext(context: boolean): void {
        const status: string = JSON.stringify(context);
        vscode.postMessage({ command: VSCODE_MESSAGES.MARKER_SETS_CONTEXT, data: { status } });
    }

    setMarkerCategoriesContext(context: boolean): void {
        const status: string = JSON.stringify(context);
        vscode.postMessage({ command: VSCODE_MESSAGES.MARKER_CATEGORIES_CONTEXT, data: { status } });
    }
}
