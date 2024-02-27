import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Trace as TspTrace } from 'tsp-typescript-client/lib/models/trace';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { AnalysisProvider } from './analysis-tree';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';
import { getTspClient } from '../utils/backend-tsp-client-provider';
import { traceLogger } from '../extension';
import { KeyboardShortcutsPanel } from '../trace-viewer-panel/keyboard-shortcuts-panel';

const rootPath = path.resolve(__dirname, '../../..');

let traceManager = new TraceManager(getTspClient());
let experimentManager = new ExperimentManager(getTspClient(), traceManager);

export const reInitializeTraceManager = (): void => {
    traceManager = new TraceManager(getTspClient());
    experimentManager = new ExperimentManager(getTspClient(), traceManager);
};

// eslint-disable-next-line no-shadow
export enum ProgressMessages {
    COMPLETE = 'Complete',
    MERGING_TRACES = 'Merging trace(s)',
    FINDING_TRACES = 'Finding trace(s)',
    OPENING_TRACES = 'Opening trace(s)',
    ROLLING_BACK_TRACES = 'Rolling back trace(s)'
}

export class TracesProvider implements vscode.TreeDataProvider<Trace> {
    constructor(private workspaceRoot: string) {}

    getTreeItem(element: Trace): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Trace): Thenable<Trace[]> {
        if (!this.workspaceRoot) {
            vscode.window.showInformationMessage('No traces. Empty workspace');
            return Promise.resolve([]);
        }

        if (element) {
            // if (element.children.length > 0) {
            //   return Promise.resolve(element.children.map(child => this.getTrace(element.uri, child)));
            // } else {
            //   return Promise.resolve([]);
            // }
            return Promise.resolve([]);
        } else {
            return Promise.resolve(
                fs
                    .readdirSync(this.workspaceRoot, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name)
                    .map(dir => this.getTrace(this.workspaceRoot, dir))
            );
        }
    }

    private getTrace(source: string, trace: string) {
        const uri = path.resolve(source, trace);
        const children = fs
            .readdirSync(uri, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        if (children.length > 0) {
            // return new Experiment(trace, vscode.TreeItemCollapsibleState.Collapsed, uri, children);
            return new Trace(trace, vscode.TreeItemCollapsibleState.None, uri, children);
        } else {
            return new Trace(trace, vscode.TreeItemCollapsibleState.None, uri, []);
        }
    }
}

export class Trace extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly uri: string,
        public readonly children: string[]
    ) {
        super(name, collapsibleState);
        this.tooltip = `${this.name} ${this.uri}`;
    }

    iconPath = {
        light: path.resolve(rootPath, 'assets', 'resources', 'light', 'dependency.svg'),
        dark: path.resolve(rootPath, 'assets', 'resources', 'dark', 'dependency.svg')
    };
}

export const traceHandler =
    (analysisTree: AnalysisProvider) =>
    (context: vscode.ExtensionContext, trace: Trace): void => {
        const panel = TraceViewerPanel.createOrShow(context.extensionUri, trace.name, undefined);
        (async () => {
            const traces = new Array<TspTrace>();
            const t = await traceManager.openTrace(trace.uri, trace.name);
            if (t) {
                traces.push(t);
            }
            const experiment = await experimentManager.openExperiment(trace.name, traces);
            if (experiment) {
                panel.setExperiment(experiment);
                const descriptors = await experimentManager.getAvailableOutputs(experiment.UUID);
                if (descriptors && descriptors.length) {
                    analysisTree.refresh(descriptors);
                }
            }
        })();
    };

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

export const openDialog = async (): Promise<vscode.Uri | undefined> => {
    const props: vscode.OpenDialogOptions = {
        title: 'Open Trace',
        canSelectFolders: true,
        canSelectFiles: false,
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
    (analysisTree: AnalysisProvider) =>
    async (context: vscode.ExtensionContext, traceUri: vscode.Uri): Promise<void> => {
        const resolvedTraceURI: vscode.Uri = traceUri;
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
                    const descriptors = await experimentManager.getAvailableOutputs(experiment.UUID);
                    if (descriptors && descriptors.length) {
                        analysisTree.refresh(descriptors);
                    }
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
