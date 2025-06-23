import * as vscode from 'vscode';
import * as path from 'path';
import { Trace as TspTrace } from 'tsp-typescript-client/lib/models/trace';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';
import { getExperimentManager, getTraceManager } from '../utils/backend-tsp-client-provider';
import { updateNoExperimentsContext } from '../utils/backend-tsp-client-provider';
import { messenger, traceLogger } from '../extension';
import { KeyboardShortcutsPanel } from '../trace-viewer-panel/keyboard-shortcuts-panel';
import { Experiment } from 'tsp-typescript-client';

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
    async (context: vscode.ExtensionContext, traceUri: vscode.Uri): Promise<Experiment | undefined> => {
        const resolvedTraceURI: vscode.Uri = traceUri;
        const { traceManager, experimentManager } = getManagers();
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: getProgressBarTitle(resolvedTraceURI),
                cancellable: true
            },
            async (progress, token) => {
                try {
                    if (token.isCancellationRequested) {
                        progress.report({ message: ProgressMessages.COMPLETE, increment: 100 });
                        return undefined;
                    }

                    const filePath: string = resolvedTraceURI.fsPath;
                    if (!filePath) {
                        traceLogger.showError(
                            'Cannot open trace: could not retrieve path from URI for trace ' + resolvedTraceURI
                        );
                        return undefined;
                    }

                    const name = path.basename(filePath);
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

                            // No CTF traces found. Add root directory as trace directory.
                            // Back-end will reject if it is not a trace
                            if (foundTraces.length === 0) {
                                foundTraces.push(filePath);
                            }
                            foundTraces.forEach(trace => tracesArray.push(trace));
                        } else {
                            // Open single trace file
                            tracesArray.push(filePath);
                        }
                    }

                    if (tracesArray.length === 0) {
                        progress.report({ message: ProgressMessages.COMPLETE, increment: 100 });
                        traceLogger.showError('No valid traces found in the selected directory: ' + resolvedTraceURI);
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
                            traceLogger.showError(
                                'Failed to open trace: ' +
                                    traceName +
                                    '. There may be an issue with the server or the trace is invalid.'
                            );
                        }
                    }

                    if (token.isCancellationRequested) {
                        rollbackTraces(traces, 20, progress);
                        progress.report({ message: ProgressMessages.COMPLETE, increment: 50 });
                        return;
                    }

                    progress.report({ message: ProgressMessages.MERGING_TRACES, increment: 40 });
                    if (traces === undefined || traces.length === 0) {
                        progress.report({ message: ProgressMessages.COMPLETE, increment: 30 });
                        return;
                    }

                    const experiment = await experimentManager.openExperiment(name, traces);
                    const panel = TraceViewerPanel.createOrShow(
                        context.extensionUri,
                        experiment?.name ?? name,
                        undefined,
                        messenger
                    );
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
                        return undefined;
                    }
                    progress.report({ message: ProgressMessages.COMPLETE, increment: 30 });
                    return experiment;
                } finally {
                    updateNoExperimentsContext();
                }
            }
        );
    };

export const deleteExperiment = async (extensionUri: vscode.Uri, uuid: string) => {
    // dispose any open panels associated with the experiment
    for (const key of Object.keys(TraceViewerPanel.activePanels)) {
        const panel = TraceViewerPanel.activePanels[key];
        const experimentUuid = panel?.getExperiment()?.UUID;
        if (experimentUuid === uuid) {
            TraceViewerPanel.disposePanel(extensionUri, key);
        }
    }
    // remove experiment from the experiment manager
    const experimentManager = getManagers().experimentManager;
    experimentManager.deleteExperiment(uuid);
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
