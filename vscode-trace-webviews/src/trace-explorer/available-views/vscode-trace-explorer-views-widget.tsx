/* eslint-disable @typescript-eslint/ban-types */
import * as React from 'react';
import { OutputAddedSignalPayload } from 'traceviewer-base/lib/signals/output-added-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { ReactAvailableViewsWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-views-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { VsCodeMessageManager, VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';
import JSONBigConfig from 'json-bigint';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

interface AvailableViewsAppState {
    tspClientProvider: TspClientProvider | undefined;
}

class TraceExplorerViewsWidget extends React.Component<{}, AvailableViewsAppState> {
    private _signalHandler: VsCodeMessageManager;

    static ID = 'trace-explorer-analysis-widget';
    static LABEL = 'Available Analyses';

    private _onExperimentSelected = (openedExperiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(openedExperiment);
    private _onOutputAdded = (payload: OutputAddedSignalPayload): void => this.doHandleOutputAddedSignal(payload);

    constructor(props: {}) {
        super(props);
        this.state = {
            tspClientProvider: undefined
        };
        this._signalHandler = new VsCodeMessageManager();
        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            switch (message.command) {
                case VSCODE_MESSAGES.SET_TSP_CLIENT:
                    this.setState({
                        tspClientProvider: new TspClientProvider(message.data, this._signalHandler)
                    });
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_SELECTED:
                    let experiment: Experiment | undefined = undefined;
                    if (message.data) {
                        experiment = convertSignalExperiment(JSONBig.parse(message.data));
                    }
                    signalManager().emit('EXPERIMENT_SELECTED', experiment);
                    break;
                case VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED:
                    if (message.data && this.state.tspClientProvider) {
                        this.state.tspClientProvider.updateTspClientUrl(message.data);
                    }
                    break;
            }
        });
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().on('OUTPUT_ADDED', this._onOutputAdded);
    }

    componentWillUnmount(): void {
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().off('OUTPUT_ADDED', this._onOutputAdded);
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        this._signalHandler.experimentSelected(experiment);
    }

    protected doHandleOutputAddedSignal(payload: OutputAddedSignalPayload): void {
        if (payload) {
            this._signalHandler.outputAdded(payload);
        }
    }

    public render(): React.ReactNode {
        return (
            <div>
                {this.state.tspClientProvider && (
                    <ReactAvailableViewsWidget
                        id={TraceExplorerViewsWidget.ID}
                        title={TraceExplorerViewsWidget.LABEL}
                        tspClientProvider={this.state.tspClientProvider}
                    ></ReactAvailableViewsWidget>
                )}
            </div>
        );
    }
}

export default TraceExplorerViewsWidget;
