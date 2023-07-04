import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { RestClient, ConnectionStatusListener } from 'tsp-typescript-client/lib/protocol/rest-client';
import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { TraceManager } from 'traceviewer-base/lib/trace-manager';
import { ITspClientProvider } from 'traceviewer-base/lib/tsp-client-provider';
import { VsCodeMessageManager } from '../messages/vscode-message-manager';
import { TraceServerUrlProvider } from '../server/trace-server-url-provider';

export class TspClientProvider implements ITspClientProvider {

    private _tspClient: TspClient;
    private _traceManager: TraceManager;
    private _experimentManager: ExperimentManager;
    private _signalHandler: VsCodeMessageManager | undefined;
    private _statusListener: ConnectionStatusListener;
    private _urlProvider: TraceServerUrlProvider;
    private _listeners: ((tspClient: TspClient) => void)[];

    constructor(traceServerUrl: string, signalHandler: VsCodeMessageManager | undefined, _urlProvider: TraceServerUrlProvider
    ) {
        this._tspClient = new TspClient(traceServerUrl);
        this._traceManager = new TraceManager(this._tspClient);
        this._experimentManager = new ExperimentManager(this._tspClient, this._traceManager);

        this._signalHandler = signalHandler;
        this._statusListener = ((status: boolean) => {
            this._signalHandler?.notifyConnection(status);
        });
        RestClient.addConnectionStatusListener(this._statusListener);
        this._tspClient.checkHealth();

        this._urlProvider = _urlProvider;
        this._listeners = [];
        this._urlProvider.onTraceServerUrlChange((url: string) => {
            this._tspClient = new TspClient(url);
            this._traceManager = new TraceManager(this._tspClient);
            this._experimentManager = new ExperimentManager(this._tspClient, this._traceManager);
            this._listeners.forEach(listener => listener(this._tspClient));
        });
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
