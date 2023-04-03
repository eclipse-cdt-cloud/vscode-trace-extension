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

export class VsCodeMessageManager extends Messages.MessageManager {
    constructor() {
        super();
    }

    addStatusMessage(messageKey: string, {text,
        category = Messages.MessageCategory.SERVER_MESSAGE,
        severity = Messages.MessageSeverity.INFO }: Messages.StatusMessage): void {
        vscode.postMessage({command: 'newStatus', data: {messageKey, text, category, severity }});
    }

    removeStatusMessage(messageKey: string): void {
        vscode.postMessage({command: 'rmStatus', data: { messageKey }});
    }

    notifyReady(): void {
        vscode.postMessage({command: 'webviewReady'});
    }

    notifyConnection(serverStatus: boolean): void {
        const status: string = JSON.stringify(serverStatus);
        vscode.postMessage({command: 'connectionStatus', data: { status }});
    }

    /**************************************************************************
     * Trace Explorer React APP
     *************************************************************************/

    reOpenTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: 'reopenTrace', data: {wrapper}});
    }

    closeTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: 'closeTrace', data: {wrapper}});
    }

    deleteTrace(experiment: Experiment): void {
        const wrapper: string = JSONBig.stringify(experiment);
        vscode.postMessage({command: 'deleteTrace', data: {wrapper}});
    }

    experimentSelected(experiment: Experiment | undefined): void {
        let wrapper = undefined;
        if (experiment) {
            wrapper = JSONBig.stringify(experiment);
        }
        vscode.postMessage({command: 'experimentSelected', data: {wrapper}});
    }

    outputAdded(payload: OutputAddedSignalPayload): void {
        const expWrapper = JSONBig.stringify(payload.getExperiment());
        const descWrapper = JSONBig.stringify(payload.getOutputDescriptor());
        vscode.postMessage({command: 'outputAdded', data: {data: expWrapper, descriptor: descWrapper }});
    }

    propertiesUpdated(properties: { [key: string]: string }): void {
        vscode.postMessage({command: 'updateProperties', data: {properties}});
    }

    saveAsCSV(payload: {traceId: string, data: string}): void {
        vscode.postMessage({command: 'saveAsCsv', payload});
    }
}
