import * as Messages from '@trace-viewer/base/lib/message-manager';
import { OutputAddedSignalPayload } from '@trace-viewer/base/lib/signals/output-added-signal-payload';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';

/* eslint-disable  @typescript-eslint/no-explicit-any */
interface vscode {
    postMessage(message: any): void;
}

// declare function acquireVsCodeApi(): vscode;
declare const vscode: vscode;

export interface VsCodeTraceAtion {
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

    /**************************************************************************
     * Trace Explorer React APP
     *************************************************************************/
    reOpenTrace(experiment: Experiment): void {
        vscode.postMessage({command: 'reopenTrace', data: {experiment}});
    }

    closeTrace(experiment: Experiment): void {
        vscode.postMessage({command: 'closeTrace', data: {experiment}});
    }

    deleteTrace(experiment: Experiment): void {
        vscode.postMessage({command: 'deleteTrace', data: {experiment}});
    }

    experimentSelected(experiment: Experiment | undefined): void {
        vscode.postMessage({command: 'experimentSelected', data: {experiment}});
    }

    outputAdded(payload: OutputAddedSignalPayload): void {
        vscode.postMessage({command: 'outputAdded', data: {experiment: payload.getExperiment(), descriptor: payload.getOutputDescriptor() }});
    }
}
