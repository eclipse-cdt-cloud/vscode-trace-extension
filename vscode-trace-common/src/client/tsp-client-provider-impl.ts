import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { ITspClientProvider } from 'traceviewer-base/lib/tsp-client-provider';
import { RestClient } from 'tsp-typescript-client/lib/protocol/rest-client';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { StatusNotifier } from '../messages/vscode-messages';

export class TspClientProvider implements ITspClientProvider {
    private _tspClient: TspClient;
    private _traceManager: TraceManager;
    private _experimentManager: ExperimentManager;
    private _listeners: ((tspClient: TspClient) => void)[] = [];
    private _initialized = false;

    constructor(
        private _url: string,
        private _signalHandler: StatusNotifier | undefined
    ) {
        this.updateClients();

        RestClient.addConnectionStatusListener(status => {
            // Ignore the first update that is sent when calling addConnectionStatusListener
            if (!this._initialized) {
                this._initialized = true;
                return;
            }
            this._signalHandler?.notifyConnection(status);
        });
        // this._tspClient.checkHealth(); // When this is called in the remote use-case, it will block the port-forwarding service-worker.
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

    public updateTspClientUrl(url: string): void {
        this._url = url;
        this.updateClients();
    }

    /**
     * Add a listener for trace server url changes
     * @param listener The listener function to be called when the url is
     * changed
     */
    addTspClientChangeListener(listener: (tspClient: TspClient) => void): void {
        this._listeners.push(listener);
    }

    handleTspClientChange(): void {
        this._listeners.forEach(fn => fn(this._tspClient));
    }

    private updateClients(): void {
        this._tspClient = new TspClient(this._url);
        this._traceManager = new TraceManager(this._tspClient);
        this._experimentManager = new ExperimentManager(this._tspClient, this._traceManager);
        this.handleTspClientChange();
    }
}
