import * as Messages from 'traceviewer-base/lib/message-manager';
import { ContextMenuItemClickedSignalPayload } from 'traceviewer-base/lib/signals/context-menu-item-clicked-signal-payload';
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { OutputAddedSignalPayload } from 'traceviewer-base/lib/signals/output-added-signal-payload';
import { RowSelectionsChangedSignalPayload } from 'traceviewer-base/lib/signals/row-selections-changed-signal-payload';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import { HOST_EXTENSION, MessageParticipant, MessengerAPI } from 'vscode-messenger-common';
import {
    alert,
    closeTrace,
    contextMenuItemClicked,
    deleteTrace,
    experimentClosed,
    experimentSelected,
    experimentUpdated,
    info,
    markerCategoryContext,
    markerSetsContext,
    newStatus,
    connectionStatus,
    openTrace,
    openTracesUpdated,
    outputAdded,
    removeStatus,
    reOpenTrace,
    requestSelectionChange,
    rowSelectionChanged,
    saveAsCSV,
    selectionRangeUpdated,
    sendMarkerSets,
    showMarkerCategories,
    sourceCodeLookup,
    updateProperties,
    viewRangeUpdated,
    webviewReady,
    StatusNotifier,
    userCustomizedOutput
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { CustomizationConfigObject } from 'vscode-trace-common/lib/types/customization';

/* eslint-disable  @typescript-eslint/no-explicit-any */

export class VsCodeMessageManager extends Messages.MessageManager implements StatusNotifier {
    private _messenger: MessengerAPI;
    constructor(messenger: MessengerAPI) {
        super();

        this._messenger = messenger;
    }

    addStatusMessage(
        messageKey: string,
        {
            text,
            category = Messages.MessageCategory.SERVER_MESSAGE,
            severity = Messages.MessageSeverity.INFO
        }: Messages.StatusMessage
    ): void {
        this._messenger.sendNotification(newStatus, HOST_EXTENSION, { messageKey, text, category, severity });
    }

    removeStatusMessage(messageKey: string): void {
        this._messenger.sendNotification(removeStatus, HOST_EXTENSION, { messageKey });
    }

    notifyReady(_receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(webviewReady, _receiver ?? HOST_EXTENSION);
    }

    notifyConnection(serverStatus: boolean, _receiver?: MessageParticipant | undefined): void {
        const status: string = JSON.stringify(serverStatus);
        this._messenger.sendNotification(connectionStatus, _receiver ?? HOST_EXTENSION, { status });
    }

    notifyError(message: string, _receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(alert, _receiver ?? HOST_EXTENSION, message);
    }

    notifyInfo(message: string, _receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(info, _receiver ?? HOST_EXTENSION, message);
    }

    /**************************************************************************
     * Trace Explorer React APP
     *************************************************************************/

    openTrace(_receiver?: MessageParticipant): void {
        this._messenger.sendNotification(openTrace, _receiver ?? HOST_EXTENSION);
    }

    updateOpenedTraces(numberOfOpenedTraces: number, _receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(openTracesUpdated, _receiver ?? HOST_EXTENSION, numberOfOpenedTraces);
    }

    reOpenTrace(experiment: Experiment, _receiver?: MessageParticipant | undefined): void {
        const wrapper = JSONBigUtils.stringify(experiment);
        this._messenger.sendNotification(reOpenTrace, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    closeTrace(experiment: Experiment, _receiver?: MessageParticipant | undefined): void {
        const wrapper = JSONBigUtils.stringify(experiment);
        this._messenger.sendNotification(closeTrace, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    deleteTrace(experiment: Experiment, _receiver?: MessageParticipant | undefined): void {
        const wrapper = JSONBigUtils.stringify(experiment);
        this._messenger.sendNotification(deleteTrace, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    experimentSelected(experiment?: Experiment | undefined, _receiver?: MessageParticipant | undefined): void {
        const wrapper = experiment ? JSONBigUtils.stringify(experiment) : undefined;
        this._messenger.sendNotification(experimentSelected, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    experimentUpdated(experiment: Experiment, _receiver?: MessageParticipant | undefined): void {
        const data = JSONBigUtils.stringify(experiment);
        this._messenger.sendNotification(experimentUpdated, _receiver ?? HOST_EXTENSION, data);
    }

    experimentClosed(experiment: Experiment, _receiver?: MessageParticipant | undefined): void {
        const data = JSONBigUtils.stringify(experiment);
        this._messenger.sendNotification(experimentClosed, _receiver ?? HOST_EXTENSION, data);
    }

    outputAdded(payload: OutputAddedSignalPayload, _receiver?: MessageParticipant | undefined): void {
        const expWrapper = JSONBigUtils.stringify(payload.getExperiment());
        const descWrapper = JSONBigUtils.stringify(payload.getOutputDescriptor());
        this._messenger.sendNotification(outputAdded, _receiver ?? HOST_EXTENSION, {
            data: expWrapper,
            descriptor: descWrapper
        });
    }

    propertiesUpdated(properties: ItemPropertiesSignalPayload, _receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(updateProperties, _receiver ?? HOST_EXTENSION, properties);
    }

    viewRangeUpdated(payload: TimeRangeUpdatePayload, _receiver?: MessageParticipant | undefined): void {
        const data = JSONBigUtils.stringify(payload);
        this._messenger.sendNotification(viewRangeUpdated, _receiver ?? HOST_EXTENSION, data);
    }

    selectionRangeUpdated(payload: TimeRangeUpdatePayload, _receiver?: MessageParticipant | undefined): void {
        const data = JSONBigUtils.stringify(payload);
        this._messenger.sendNotification(selectionRangeUpdated, _receiver ?? HOST_EXTENSION, data);
    }

    requestSelectionRangeChange(payload: TimeRangeUpdatePayload, _receiver?: MessageParticipant | undefined): void {
        const data = JSONBigUtils.stringify(payload);
        this._messenger.sendNotification(requestSelectionChange, _receiver ?? HOST_EXTENSION, data);
    }

    saveAsCSV(payload: { traceId: string; data: string }, _receiver?: MessageParticipant | undefined): void {
        this._messenger.sendNotification(saveAsCSV, _receiver ?? HOST_EXTENSION, payload);
    }

    fetchMarkerCategories(
        payload: Map<string, { categoryCount: number; toggleInd: boolean }>,
        _receiver?: MessageParticipant | undefined
    ): void {
        const wrapper: string = JSON.stringify([...payload]);
        this._messenger.sendNotification(showMarkerCategories, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    fetchMarkerSets(
        payload: Map<string, { marker: MarkerSet; enabled: boolean }>,
        _receiver?: MessageParticipant | undefined
    ): void {
        const wrapper: string = JSON.stringify([...payload]);
        this._messenger.sendNotification(sendMarkerSets, _receiver ?? HOST_EXTENSION, { wrapper });
    }

    setMarkerSetsContext(context: boolean, _receiver?: MessageParticipant | undefined): void {
        const status: string = JSON.stringify(context);
        this._messenger.sendNotification(markerSetsContext, _receiver ?? HOST_EXTENSION, { status });
    }

    setMarkerCategoriesContext(context: boolean, _receiver?: MessageParticipant | undefined): void {
        const status: string = JSON.stringify(context);
        this._messenger.sendNotification(markerCategoryContext, _receiver ?? HOST_EXTENSION, { status });
    }

    rowSelectChanged(payload: RowSelectionsChangedSignalPayload, _receiver?: MessageParticipant | undefined): void {
        const data = JSON.stringify(payload);
        this._messenger.sendNotification(rowSelectionChanged, _receiver ?? HOST_EXTENSION, data);
    }

    contextMenuItemClicked(
        payload: ContextMenuItemClickedSignalPayload,
        _receiver?: MessageParticipant | undefined
    ): void {
        const data = JSON.stringify(payload);
        this._messenger.sendNotification(contextMenuItemClicked, _receiver ?? HOST_EXTENSION, data);
    }

    sourceLookup(path: string, line: number, _receiver?: MessageParticipant | undefined): void {
        const data = { path: path, line: line };
        this._messenger.sendNotification(sourceCodeLookup, _receiver ?? HOST_EXTENSION, data);
    }

    async userCustomizedOutput(
        payload: { configs: CustomizationConfigObject[] },
        _receiver?: MessageParticipant
    ): Promise<{ userConfig: object }> {
        return this._messenger.sendRequest(userCustomizedOutput, HOST_EXTENSION, payload);
    }
}
