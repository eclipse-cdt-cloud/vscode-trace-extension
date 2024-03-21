import * as vscode from 'vscode';
import * as path from 'path';
import { Trace as TspTrace } from 'tsp-typescript-client/lib/models/trace';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';
import { getExperimentManager, getTraceManager } from '../utils/backend-tsp-client-provider';
import { traceLogger } from '../extension';
import { KeyboardShortcutsPanel } from '../trace-viewer-panel/keyboard-shortcuts-panel';

// eslint-disable-next-line no-shadow
export enum ProgressMessages {
    COMPLETE = 'Complete',
    MERGING_TRACES = 'Merging trace(s)',
    FINDING_TRACES = 'Finding trace(s)',
    OPENING_TRACES = 'Opening trace(s)',
    ROLLING_BACK_TRACES = 'Rolling back trace(s)'
}

export const openOverviewHandler = () => (): void => {
    TraceViewerPanel.showOverviewToCurrent();
};

export const resetZoomHandler = () => (): void => {
    TraceViewerPanel.resetZoomOnCurrent();
};

export const keyboardShortcutsHandler = (extensionUri: vscode.Uri): void => {
    KeyboardShortcutsPanel.createOrShow(extensionUri, 'Trace Viewer Shortcuts');
};

export const undoRedoHandler = (undo: boolean): void => {
    TraceViewerPanel.undoRedoOnCurrent(undo);
};

export const zoomHandler = (hasZoomedIn: boolean): void => {
    TraceViewerPanel.zoomOnCurrent(hasZoomedIn);
};

export const openDialog = async (selectFiles = false): Promise<vscode.Uri | undefined> => {
    const props: vscode.OpenDialogOptions = {
        title: selectFiles ? 'Open Trace File' : 'Open Trace Folder',
        canSelectFolders: !selectFiles,
        canSelectFiles: selectFiles,
        canSelectMany: false
    };
    let traceURI = undefined;
    traceURI = await vscode.window.showOpenDialog(props);
    if (traceURI && traceURI[0]) {
        return traceURI[0];
    }
    return undefined;
};

export const fileHandler =
    () =>
    async (context: vscode.ExtensionContext, traceUri: vscode.Uri): Promise<void> => {
        const resolvedTraceURI: vscode.Uri = traceUri;
        const { traceManager, experimentManager } = getManagers();
        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: getProgressBarTitle(resolvedTraceURI),
                cancellable: true
            },
            async (progress, token) => {
                if (token.isCancellationRequested) {
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 100 });
                    return;
                }

                const filePath: string = resolvedTraceURI.fsPath;
                if (!filePath) {
                    traceLogger.addLogMessage(
                        'Cannot open trace: could not retrieve path from URI for trace ' + resolvedTraceURI,
                        fileHandler.name
                    );
                    return;
                }

                const name = path.basename(filePath);
                const panel = TraceViewerPanel.createOrShow(context.extensionUri, name, undefined);

                progress.report({ message: ProgressMessages.FINDING_TRACES, increment: 10 });
                /*
                 * TODO: use backend service to find traces
                 */
                const tracesArray: string[] = [];
                const fileStat = await vscode.workspace.fs.stat(resolvedTraceURI);
                if (fileStat) {
                    if (fileStat.type === vscode.FileType.Directory) {
                        // Find recursively CTF traces
                        const foundTraces = await findTraces(filePath);
                        foundTraces.forEach(trace => tracesArray.push(trace));
                    } else {
                        // Open single trace file
                        tracesArray.push(filePath);
                    }
                }

                if (tracesArray.length === 0) {
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 100 });
                    traceLogger.addLogMessage(
                        'No valid traces found in the selected directory: ' + resolvedTraceURI,
                        fileHandler.name
                    );
                    panel.dispose();
                    return;
                }

                progress.report({ message: ProgressMessages.OPENING_TRACES, increment: 20 });
                const traces = new Array<TspTrace>();
                for (let i = 0; i < tracesArray.length; i++) {
                    const traceName = path.basename(tracesArray[i]);
                    const trace = await traceManager.openTrace(tracesArray[i], traceName);
                    if (trace) {
                        traces.push(trace);
                    } else {
                        traceLogger.addLogMessage('Failed to open trace: ' + traceName, fileHandler.name);
                        traceLogger.addLogMessage(
                            'There may be an issue with the server or the trace is invalid.',
                            fileHandler.name
                        );
                    }
                }

                if (token.isCancellationRequested) {
                    rollbackTraces(traces, 20, progress);
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 50 });
                    panel.dispose();
                    return;
                }

                progress.report({ message: ProgressMessages.MERGING_TRACES, increment: 40 });
                if (traces === undefined || traces.length === 0) {
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 30 });
                    panel.dispose();
                    return;
                }

                const experiment = await experimentManager.openExperiment(name, traces);
                if (experiment) {
                    panel.setExperiment(experiment);
                }

                if (token.isCancellationRequested) {
                    if (experiment) {
                        experimentManager.deleteExperiment(experiment.UUID);
                    }
                    rollbackTraces(traces, 20, progress);
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 10 });
                    panel.dispose();
                    return;
                }
                progress.report({ message: ProgressMessages.COMPLETE, increment: 30 });
            }
        );
    };

const rollbackTraces = async (
    traces: Array<TspTrace>,
    progressIncrement: number,
    progress: vscode.Progress<{
        message: string | undefined;
        increment: number | undefined;
    }>
) => {
    const { traceManager } = getManagers();
    progress.report({ message: ProgressMessages.ROLLING_BACK_TRACES, increment: progressIncrement });
    for (let i = 0; i < traces.length; i++) {
        await traceManager.deleteTrace(traces[i].UUID);
    }
};

/*
 * TODO: Make a proper trace finder, not just CTF
 */
const findTraces = async (directory: string): Promise<string[]> => {
    const traces: string[] = [];
    const uri = vscode.Uri.file(directory);
    /**
     * If single file selection then return single trace in traces, if directory then find
     * recursively CTF traces in starting from root directory.
     */
    const ctf = await isCtf(directory);
    if (ctf) {
        traces.push(directory);
    } else {
        // Look at the sub-directories of this
        await vscode.workspace.fs.stat(uri);
        const childrenArr = await vscode.workspace.fs.readDirectory(uri);
        for (const child of childrenArr) {
            if (child[1] === vscode.FileType.Directory) {
                const subTraces = await findTraces(path.join(directory, child[0]));
                subTraces.forEach(trace => traces.push(trace));
            }
        }
    }
    return traces;
};

const isCtf = async (directory: string): Promise<boolean> => {
    const uri = vscode.Uri.file(directory);
    const childrenArr = await vscode.workspace.fs.readDirectory(uri);
    for (const child of childrenArr) {
        if (child[0] === 'metadata') {
            return true;
        }
    }
    return false;
};

function getProgressBarTitle(traceUri: vscode.Uri | undefined): string {
    if (!traceUri || !traceUri.fsPath) {
        return 'undefined';
    }
    return path.basename(traceUri.fsPath);
}

function getManagers() {
    return {
        traceManager: getTraceManager(),
        experimentManager: getExperimentManager()
    };
}
