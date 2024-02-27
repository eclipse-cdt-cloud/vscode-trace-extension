import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import * as vscode from 'vscode';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { TraceServerUrlProvider } from 'vscode-trace-common/lib/server/trace-server-url-provider';

/**
 * Functional paradigm approach for a singleton TspClientProvider
 *  for the Trace Extension's VSCode Backend
 */

let _root = getUriRootFromUserSettings();
let _path = getApiPathFromUserSettings();
let _url = _root + _path;

const _urlProvider = new TraceServerUrlProvider();
const _provider = new TspClientProvider(_url, undefined, _urlProvider);

export const getTraceServerUrl = (): string => _root;
export const getTspApiEndpoint = (): string => _path;
export const getTspClientUrl = (): string => _url;

export const getTspClient = (): TspClient => _provider.getTspClient();
export const getExperimentManager = (): ExperimentManager => _provider.getExperimentManager();
export const getTraceManager = (): TraceManager => _provider.getTraceManager();

export const updateTspClientUrl = (): void => {
    _root = getUriRootFromUserSettings();
    _path = getApiPathFromUserSettings();
    _url = _root + _path;
    _urlProvider.updateTraceServerUrl(_url);
};

export const addTspClientChangeListener = (listenerFunction: (tspClient: TspClient) => void): void => {
    _provider.addTspClientChangeListener(listenerFunction);
};

/**
 * Get the status of the server.
 * @returns server status as boolean
 */
export async function isUp(): Promise<boolean> {
    const health = await getTspClient().checkHealth();
    const status = health.getModel()?.status;
    return health.isOk() && status === 'UP';
}

function getUriRootFromUserSettings(): string {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    const traceServerUrl: string = tsConfig.get<string>('url') || 'http://localhost:8080';
    return traceServerUrl.endsWith('/') ? traceServerUrl : traceServerUrl + '/';
}

function getApiPathFromUserSettings(): string {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    return tsConfig.get<string>('apiPath') || 'tsp/api';
}
