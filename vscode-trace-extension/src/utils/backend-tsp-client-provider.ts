import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import * as vscode from 'vscode';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';

/**
 * Functional paradigm approach for a singleton TspClientProvider
 *  for the Trace Extension's VSCode Backend
 */

let _extUri: vscode.Uri;
let _root: string;
let _path: string;
let _url: string;
let _provider: TspClientProvider;

export const getTraceServerUrl = (): string => _root;
export const getTspApiEndpoint = (): string => _path;
export const getTspClientUrl = (): string => _url;

export const getTspClient = (): TspClient => _provider.getTspClient();
export const getExperimentManager = (): ExperimentManager => _provider.getExperimentManager();
export const getTraceManager = (): TraceManager => _provider.getTraceManager();

export const updateTspClientUrl = async (): Promise<string> => {
    _extUri = await getExternalUriFromUserSettings();
    _root = _extUri.toString();
    _path = getApiPathFromUserSettings();
    _url = _root + _path;

    if (!_provider) {
        _provider = new TspClientProvider(_url, undefined);
    } else {
        _provider.updateTspClientUrl(_url);
    }

    return _url;
};

export const addTspClientChangeListener = (listenerFunction: (tspClient: TspClient) => void): void => {
    _provider.addTspClientChangeListener(listenerFunction);
};

/**
 * Get the status of the server.
 * Updates the VSCode Context for `traceViewer.serverUp`
 * @returns server status as boolean
 */
export async function isTraceServerUp(): Promise<boolean> {
    const health = await getTspClient().checkHealth();
    const status = health.getModel()?.status;
    const serverIsUp = health.isOk() && status === 'UP';
    vscode.commands.executeCommand('setContext', 'traceViewer.serverUp', serverIsUp);
    return serverIsUp;
}

/**
 * Checks for opened traces and updates the vscode context `trace-explorer.noExperiments`
 */
export async function updateNoExperimentsContext(): Promise<void> {
    const response = await getTspClient().fetchExperiments();
    if (!response.isOk()) {
        return;
    }
    const noExperiments = !response.getModel()?.length;
    vscode.commands.executeCommand('setContext', 'trace-explorer.noExperiments', noExperiments);
    return;
}

async function getExternalUriFromUserSettings(): Promise<vscode.Uri> {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    const traceServerUrl: string = tsConfig.get<string>('url') || 'http://localhost:8080';
    const url = traceServerUrl.endsWith('/') ? traceServerUrl : traceServerUrl + '/';
    const baseUri = vscode.Uri.parse(url);
    return vscode.env.asExternalUri(baseUri);
}

function getApiPathFromUserSettings(): string {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    return tsConfig.get<string>('apiPath') || 'tsp/api';
}
