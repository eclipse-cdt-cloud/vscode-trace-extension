import * as vscode from 'vscode';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { VsCodeMessageManager } from 'vscode-trace-common/lib/messages/vscode-message-manager';

/**
 * This is a TspClientProvider that has additional functionality that should only be
 * utilized from the extension's backend.
 */
export class VSCodeBackendTspClientProvider extends TspClientProvider {
    constructor(
        private _baseUri: vscode.Uri,
        private _apiPath: string,
        signalHandler: VsCodeMessageManager | undefined
    ) {
        super(fullUriString(_baseUri, _apiPath), signalHandler);
    }

    /**
     * We should only check the server status from the backend.
     * Frontend server checks can crash the port-forwarding worker if
     * the server is offline.
     *
     * @returns the server status
     */
    async serverOnline(): Promise<boolean> {
        const health = await this._tspClient.checkHealth();
        const status = health.getModel()?.status;
        return health.isOk() && status === 'UP';
    }

    /**
     * This updates the baseUri that points to the trace server.
     * Generates a new baseUri using vscode.asExternalUri
     * Updates the TspUri
     * Handles all listeners
     *
     * @returns the new uri as a string
     */
    async updateTraceServerUri(): Promise<string> {
        this._baseUri = await generateTraceServerUri();
        return this.updateTspApiPath();
    }

    /**
     * This updates the apiPath used to access the tsp.
     * Gets the api path from the user's settings
     * Updates the TspUri with new path
     * Handles all listeners
     *
     * @returns the new uri as a string
     */
    public updateTspApiPath(): string {
        this._apiPath = getTspApiPath();
        const newUri = fullUriString(this._baseUri, this._apiPath);
        super.updateTspClientUri(newUri);
        return newUri;
    }

    public getBaseUri(): string {
        return this._baseUri.toString();
    }
}

const fullUriString = (baseUri: vscode.Uri, apiPath: string): string => `${baseUri.toString()}${apiPath}`;

async function generateTraceServerUri(): Promise<vscode.Uri> {
    // Get the local-case Url
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    const traceServerUrl: string = tsConfig.get<string>('url') || 'http://localhost:8080';
    const url = traceServerUrl.endsWith('/') ? traceServerUrl : traceServerUrl + '/';

    // Convert the url to a vscode.Uri to support the remote use case
    const baseUri = vscode.Uri.parse(url);
    const externalUri = await vscode.env.asExternalUri(baseUri);
    return externalUri;
}

function getTspApiPath(): string {
    const tsConfig = vscode.workspace.getConfiguration('trace-compass.traceserver');
    return tsConfig.get<string>('apiPath') || 'tsp/api';
}

/**
 * Get the first TraceServerUri and create the TspClientProvider
 * @returns VSCodeBackendTspClientProvider
 */
export async function initialize(signalHandler?: VsCodeMessageManager): Promise<VSCodeBackendTspClientProvider> {
    // Constructors cannot be asynchronous.
    return new VSCodeBackendTspClientProvider(await generateTraceServerUri(), getTspApiPath(), signalHandler);
}
