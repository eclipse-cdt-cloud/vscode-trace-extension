import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { RestClient, ConnectionStatusListener } from 'tsp-typescript-client/lib/protocol/rest-client';
import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { ITspClientProvider } from 'traceviewer-base/lib/tsp-client-provider';
import { VsCodeMessageManager } from '../messages/vscode-message-manager';

export class TspClientProvider implements ITspClientProvider {
    protected _tspClient: TspClient;
    protected _traceManager: TraceManager;
    protected _experimentManager: ExperimentManager;
    protected _statusListener: ConnectionStatusListener;
    protected _listeners: ((tspClient: TspClient) => void)[] = [];

    constructor(
        protected _uri: string,
        protected _signalHandler: VsCodeMessageManager | undefined
    ) {
        this.createNewClients(_uri);

        this._statusListener = (status: boolean) => {
            this._signalHandler?.notifyConnection(status);
        };

        RestClient.addConnectionStatusListener(this._statusListener);
    }

    private createNewClients(tspClientUri: string): void {
        this._tspClient = new TspClient(tspClientUri);
        this._traceManager = new TraceManager(this._tspClient);
        this._experimentManager = new ExperimentManager(this._tspClient, this._traceManager);
    }

    public updateTspClientUri(tspClientUri: string): void {
        this._uri = tspClientUri;
        this.createNewClients(tspClientUri);
        this._listeners.forEach(fn => fn(this._tspClient));
    }

    public getTspClientUri(): string {
        return this._uri;
    }

    public getTspClient(): TspClient {
        return this._tspClient;
    }

    public getTraceManager(): TraceManager {
        return this._traceManager;
    }

    public getExperimentManager(): ExperimentManager {
        return this._experimentManager;
    }

    /**
     * Add a listener for trace server url changes
     * @param listener The listener function to be called when the url is
     * changed
     */
    addTspClientChangeListener(listener: (tspClient: TspClient) => void): void {
        this._listeners.push(listener);
    }
}
