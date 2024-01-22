/* eslint-disable @typescript-eslint/ban-types */
import * as React from 'react';
import 'traceviewer-react-components/style/trace-explorer.css';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';
import JSONBigConfig from 'json-bigint';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { VSCODE_MESSAGES, VsCodeMessageManager } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import ReactExplorerPlaceholderWidget from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-placeholder-widget';
import { ITspClientProvider } from 'traceviewer-base/lib/tsp-client-provider';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { ItemParams } from 'react-contexify';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { TraceServerUrlProvider } from 'vscode-trace-common/lib/server/trace-server-url-provider';
import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { OpenedTracesUpdatedSignalPayload } from 'traceviewer-base/lib/signals/opened-traces-updated-signal-payload';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

interface WelcomeViewState {
    tspClientProvider: ITspClientProvider | undefined;
    experimentsOpened: boolean;
    serverOnline: boolean;
}

class WelcomeView extends React.Component<{}, WelcomeViewState> {
    private _signalHandler: VsCodeMessageManager;
    private _experimentManager: ExperimentManager;
    private _urlProvider: TraceServerUrlProvider;
    protected onUpdateSignal = (payload: OpenedTracesUpdatedSignalPayload): void =>
        this.doHandleOpenedTracesChanged(payload);

    static ID = 'trace-explorer-welcome-view';
    static LABEL = 'WelcomeView';

    private loading = false;

    constructor(props: {}) {
        super(props);
        this.state = {
            tspClientProvider: undefined,
            experimentsOpened: true,
            serverOnline: false,
        };
        this._signalHandler = new VsCodeMessageManager();
        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            switch (message.command) {
                case VSCODE_MESSAGES.SET_TSP_CLIENT:
                    this._urlProvider = new TraceServerUrlProvider();
                    const tspClientProvider: ITspClientProvider = new TspClientProvider(
                        message.data,
                        this._signalHandler,
                        this._urlProvider
                    );
                    this._experimentManager = tspClientProvider.getExperimentManager();
                    tspClientProvider.addTspClientChangeListener(() => {
                        if (this.state.tspClientProvider) {
                            this._experimentManager = this.state.tspClientProvider.getExperimentManager();
                        }
                    });
                    this.setState({ tspClientProvider: tspClientProvider });
                    break;
                case VSCODE_MESSAGES.TRACE_VIEWER_TAB_ACTIVATED:
                    if (message.data) {
                        const experiment = convertSignalExperiment(JSONBig.parse(message.data));
                        signalManager().fireTraceViewerTabActivatedSignal(experiment);
                    }
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_OPENED:
                    if (message.data) {
                        const experiment = convertSignalExperiment(JSONBig.parse(message.data));
                        signalManager().fireExperimentOpenedSignal(experiment);
                        if (!this.state.experimentsOpened) {
                            this.setState({ experimentsOpened: true });
                        }
                    }
                    break;
                case VSCODE_MESSAGES.TRACE_SERVER_STARTED:
                    signalManager().fireTraceServerStartedSignal();
                    this.setState({ experimentsOpened: true });
                case VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED:
                    if (message.data && this.state.tspClientProvider && this._urlProvider) {
                        this._urlProvider.updateTraceServerUrl(message.data);
                    }
                    break;
                case VSCODE_MESSAGES.CANCEL_REQUESTS:
                    if (this.state.tspClientProvider instanceof TspClientProvider) {
                        const RequestManager = this.state.tspClientProvider.getRequestManager();
                        if (RequestManager) {
                            RequestManager.cancelAllRequests();
                        }
                    }
                    break;
                case VSCODE_MESSAGES.TRACE_SERVER_STATUS:
                    const serverOnline = message.data === 'true';
                    this.setState({ serverOnline });
                    if (this.state.tspClientProvider instanceof TspClientProvider) {
                        const RequestManager = this.state.tspClientProvider.getRequestManager();
                        if (RequestManager) {
                            console.log('Opend Traces server status is: ' + serverOnline.toString(), typeof serverOnline);
                            RequestManager.serverStatus = serverOnline;
                        }
                    }
                    break;
            }
        });
        // this.onOutputRemoved = this.onOutputRemoved.bind(this);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        // ExperimentSelected handler is registered in the constructor (upstream code), but it's
        // better to register it here when the react component gets mounted.
        signalManager().on(Signals.OPENED_TRACES_UPDATED, this.onUpdateSignal);
    }

    componentWillUnmount(): void {
        signalManager().off(Signals.OPENED_TRACES_UPDATED, this.onUpdateSignal);
    }

    protected doHandleOpenedTracesChanged(payload: OpenedTracesUpdatedSignalPayload): void {
        this._signalHandler.updateOpenedTraces(payload.getNumberOfOpenedTraces());
        if (payload.getNumberOfOpenedTraces() > 0) {
            this.setState({ experimentsOpened: true });
        } else if (payload.getNumberOfOpenedTraces() === 0) {
            this.setState({ experimentsOpened: false });
        }
    }

    protected handleOpenTrace = async (): Promise<void> => this.doHandleOpenTrace();

    private async doHandleOpenTrace() {
        this.loading = true;
        this._signalHandler.openTrace();
        this.loading = false;
    }

    protected startServer(): void {
        console.log('STARTING SERVER');
        this._signalHandler.startServer();
    }

    protected async doHandleReOpenTrace(experiment: Experiment): Promise<void> {
        let myExperiment: Experiment | undefined = experiment;
        if (this.state.tspClientProvider) {
            const exp = await this.state.tspClientProvider.getExperimentManager().updateExperiment(experiment.UUID);
            if (exp) {
                myExperiment = exp;
            }
        }
        this._signalHandler.reOpenTrace(myExperiment);
    }

    protected handleItemClick = (args: ItemParams): void => {
        switch (args.event.currentTarget.id) {
            case 'open-id':
                this.doHandleReOpenTrace(args.props.experiment as Experiment);
                return;
            case 'close-id':
                this._signalHandler.closeTrace(args.props.experiment as Experiment);
                return;
            case 'remove-id':
                this._signalHandler.deleteTrace(args.props.experiment as Experiment);
                if (this._experimentManager) {
                    this._experimentManager.deleteExperiment((args.props.experiment as Experiment).UUID);
                }
                return;
            default:
            // Do nothing
        }
    };

    public render(): React.ReactNode {
        return (
            <div>
                 <ReactExplorerPlaceholderWidget
                    serverOn={this.state.serverOnline}
                    tracesOpen={this.state.experimentsOpened}
                    loading={this.loading}
                    handleOpenTrace={() => this.handleOpenTrace()}
                    handleStartServer={() => this.startServer()}
                />
            </div>
        );
    }
}

export default WelcomeView;
