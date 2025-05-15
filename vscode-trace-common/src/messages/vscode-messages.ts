/* eslint-disable  @typescript-eslint/no-explicit-any */
import type { MessageParticipant, NotificationType, RequestType } from 'vscode-messenger-common';
import { CustomizationConfigObject, CustomizationSubmission } from '../types/customization';
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
    ROW_SELECTION_CHANGED: 'rowSelectionsChanged',
    REQUEST_SELECTION_RANGE_CHANGE: 'requestSelectionRangeChange',
    RESTORE_VIEW: 'restoreView',
    RESTORE_COMPLETE: 'restoreComplete',
    OUTPUT_DATA_CHANGED: 'outputDataChanged',
    CONTRIBUTE_CONTEXT_MENU: 'contributeContextMenu',
    CONTEXT_MENU_ITEM_CLICKED: 'contextMenuItemClicked',
    SOURCE_LOOKUP: 'sourceLookup',
    USER_CUSTOMIZATION_JSON_INPUT: 'userCustomizationJsonInput'
};

export interface StatusNotifier {
    notifyConnection(serverStatus: boolean, _receiver?: MessageParticipant | undefined): void;
}

export const webviewReady: NotificationType<void> = { method: VSCODE_MESSAGES.WEBVIEW_READY };
export const setTspClient: NotificationType<any> = { method: VSCODE_MESSAGES.SET_TSP_CLIENT };
export const connectionStatus: NotificationType<any> = { method: VSCODE_MESSAGES.CONNECTION_STATUS };

export const alert: NotificationType<any> = { method: VSCODE_MESSAGES.ALERT };
export const newStatus: NotificationType<any> = { method: VSCODE_MESSAGES.NEW_STATUS };
export const removeStatus: NotificationType<any> = { method: VSCODE_MESSAGES.REMOVE_STATUS };

export const saveAsCSV: NotificationType<any> = { method: VSCODE_MESSAGES.SAVE_AS_CSV };
export const showMarkerCategories: NotificationType<any> = { method: VSCODE_MESSAGES.SHOW_MARKER_CATEGORIES };
export const sendMarkerSets: NotificationType<any> = { method: VSCODE_MESSAGES.SEND_MARKER_SETS };
export const markerSetsContext: NotificationType<any> = { method: VSCODE_MESSAGES.MARKER_SETS_CONTEXT };
export const markerCategoryContext: NotificationType<any> = { method: VSCODE_MESSAGES.MARKER_CATEGORIES_CONTEXT };
export const viewRangeUpdated: NotificationType<any> = { method: VSCODE_MESSAGES.VIEW_RANGE_UPDATED };
export const selectionRangeUpdated: NotificationType<any> = { method: VSCODE_MESSAGES.SELECTION_RANGE_UPDATED };
export const experimentUpdated: NotificationType<any> = { method: VSCODE_MESSAGES.EXPERIMENT_UPDATED };
export const setTheme: NotificationType<any> = { method: VSCODE_MESSAGES.SET_THEME };
export const traceServerUrlChanged: NotificationType<string> = { method: VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED };
export const experimentSelected: NotificationType<any> = { method: VSCODE_MESSAGES.EXPERIMENT_SELECTED };
export const requestSelectionChange: NotificationType<any> = { method: VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE };
export const setExperiment: NotificationType<any> = { method: VSCODE_MESSAGES.SET_EXPERIMENT };
export const addOutput: NotificationType<any> = { method: VSCODE_MESSAGES.ADD_OUTPUT };
export const openOverview: NotificationType<void> = { method: VSCODE_MESSAGES.OPEN_OVERVIEW };
export const resetZoom: NotificationType<void> = { method: VSCODE_MESSAGES.RESET_ZOOM };
export const undo: NotificationType<void> = { method: VSCODE_MESSAGES.UNDO };
export const redo: NotificationType<void> = { method: VSCODE_MESSAGES.REDO };
export const updateZoom: NotificationType<any> = { method: VSCODE_MESSAGES.UPDATE_ZOOM };
export const getMarkerCategories: NotificationType<void> = { method: VSCODE_MESSAGES.GET_MARKER_CATEGORIES };
export const getMarkerSets: NotificationType<void> = { method: VSCODE_MESSAGES.GET_MARKER_SETS };
export const updateMarkerCategoryState: NotificationType<any> = {
    method: VSCODE_MESSAGES.UPDATE_MARKER_CATEGORY_STATE
};
export const updateMarkerSetState: NotificationType<any> = { method: VSCODE_MESSAGES.UPDATE_MARKER_SET_STATE };
export const outputDataChanged: NotificationType<any> = { method: VSCODE_MESSAGES.OUTPUT_DATA_CHANGED };
export const contributeContextMenu: NotificationType<any> = { method: VSCODE_MESSAGES.CONTRIBUTE_CONTEXT_MENU };
export const updateProperties: NotificationType<any> = { method: VSCODE_MESSAGES.UPDATE_PROPERTIES };
export const rowSelectionChanged: NotificationType<any> = { method: VSCODE_MESSAGES.ROW_SELECTION_CHANGED };
export const contextMenuItemClicked: NotificationType<any> = { method: VSCODE_MESSAGES.CONTEXT_MENU_ITEM_CLICKED };
export const reOpenTrace: NotificationType<any> = { method: VSCODE_MESSAGES.RE_OPEN_TRACE };
export const closeTrace: NotificationType<any> = { method: VSCODE_MESSAGES.CLOSE_TRACE };
export const deleteTrace: NotificationType<any> = { method: VSCODE_MESSAGES.DELETE_TRACE };
export const openTracesUpdated: NotificationType<number> = { method: VSCODE_MESSAGES.OPENED_TRACES_UPDATED };
export const openTrace: NotificationType<any> = { method: VSCODE_MESSAGES.OPEN_TRACE };
export const traceViewerTabActivated: NotificationType<any> = { method: VSCODE_MESSAGES.TRACE_VIEWER_TAB_ACTIVATED };
export const experimentOpened: NotificationType<any> = { method: VSCODE_MESSAGES.EXPERIMENT_OPENED };
export const outputAdded: NotificationType<any> = { method: VSCODE_MESSAGES.OUTPUT_ADDED };
export const requestSelectionRangeChange: NotificationType<any> = {
    method: VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE
};
export const experimentClosed: NotificationType<any> = { method: VSCODE_MESSAGES.EXPERIMENT_CLOSED };
export const traceViewerTabClosed: NotificationType<any> = { method: VSCODE_MESSAGES.TRACE_VIEWER_TAB_CLOSED };
export const restoreView: NotificationType<any> = { method: VSCODE_MESSAGES.RESTORE_VIEW };
export const sourceCodeLookup: NotificationType<{ path: string; line: number }> = {
    method: VSCODE_MESSAGES.SOURCE_LOOKUP
};

export const userCustomizedOutput: RequestType<
    { configs: CustomizationConfigObject[] },
    { userConfig: CustomizationSubmission }
> = { method: VSCODE_MESSAGES.USER_CUSTOMIZATION_JSON_INPUT };
