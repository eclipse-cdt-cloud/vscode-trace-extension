import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import * as vscode from 'vscode';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';

/**
 * Functional paradigm approach for a singleton TspClientProvider
 *  for the Trace Extension's VSCode Backend
 */

let _rootBE: string;
let _rootFE: string;
let _urlBE: string;
let _urlFE: string;
let _provider: TspClientProvider;

// eslint-disable-next-line no-shadow
export enum ClientType {
    BACKEND = 'backend',
    FRONTEND = 'frontend'
}

export const getTraceServerUrl = (clientType: ClientType): string =>
    clientType === ClientType.FRONTEND ? _rootFE : _rootBE;
export const getTspClientUrl = (clientType: ClientType): string =>
    clientType === ClientType.FRONTEND ? _urlFE : _urlBE;

export const getTspClient = (): TspClient => _provider.getTspClient();
export const getExperimentManager = (): ExperimentManager => _provider.getExperimentManager();
export const getTraceManager = (): TraceManager => _provider.getTraceManager();

export const updateTspClientUrl = async (): Promise<void> => {
    const extUri = await getExternalUriFromUserSettings(ClientType.BACKEND);
    _rootBE = extUri.toString();
    const apiPath = getApiPathFromUserSettings();
    _urlBE = _rootBE + apiPath;

    const extUriFE = await getExternalUriFromUserSettings(ClientType.FRONTEND);
    _rootFE = extUriFE.toString();
    _urlFE = _rootFE + apiPath;

    if (!_provider) {
        _provider = new TspClientProvider(_urlBE, undefined);
    } else {
        _provider.updateTspClientUrl(_urlBE);
    }
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

async function getExternalUriFromUserSettings(clientType: ClientType): Promise<vscode.Uri> {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    let traceServerUrl: string;
    switch (clientType) {
        case ClientType.FRONTEND:
            traceServerUrl = tsConfig.get<string>('url') || 'http://localhost:8080';
            break;
        case ClientType.BACKEND:
            traceServerUrl = tsConfig.get<boolean>('enableSeparateBackendUrl')
                ? tsConfig.get<string>('backendUrl') || tsConfig.get<string>('url') || 'http://localhost:8080'
                : tsConfig.get<string>('url') || 'http://localhost:8080';
            break;
        default:
            throw new Error(`Invalid client type ${clientType}`);
    }
    const url = traceServerUrl.endsWith('/') ? traceServerUrl : traceServerUrl + '/';
    const baseUri = vscode.Uri.parse(url);
    return vscode.env.asExternalUri(baseUri);
}

function getApiPathFromUserSettings(): string {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    return tsConfig.get<string>('apiPath') || 'tsp/api';
}
