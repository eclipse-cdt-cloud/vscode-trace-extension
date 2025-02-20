/* eslint-disable @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { OutputAddedSignalPayload } from 'traceviewer-base/lib/signals/output-added-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { ReactAvailableViewsWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-views-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import {
    experimentSelected,
    setTspClient,
    traceServerUrlChanged
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';

interface AvailableViewsAppState {
    tspClientProvider: TspClientProvider | undefined;
}

class TraceExplorerViewsWidget extends React.Component<{}, AvailableViewsAppState> {
    private _signalHandler: VsCodeMessageManager;

    static ID = 'trace-explorer-analysis-widget';
    static LABEL = 'Available Analyses';

    private _onOutputAdded = (payload: OutputAddedSignalPayload): void => this.doHandleOutputAddedSignal(payload);

    // VSCODE message handlers
    private _onVscodeSetTspClient = (data: string): void => {
        this.setState({
            tspClientProvider: new TspClientProvider(data, this._signalHandler)
        });
    };

    private _onVscodeExperimentSelected = (data: any): void => {
        let experiment: Experiment | undefined = undefined;
        if (data?.wrapper) {
            experiment = JSONBigUtils.parse(data.wrapper, Experiment);
        }
        signalManager().emit('EXPERIMENT_SELECTED', experiment);
    };

    private _onVscodeUrlChanged = (data: string): void => {
        if (data && this.state.tspClientProvider) {
            this.state.tspClientProvider.updateTspClientUrl(data);
        }
    };

    constructor(props: {}) {
        super(props);
        this.state = {
            tspClientProvider: undefined
        };

        this._signalHandler = new VsCodeMessageManager(messenger);
        messenger.onNotification(setTspClient, this._onVscodeSetTspClient);
        messenger.onNotification(experimentSelected, this._onVscodeExperimentSelected);
        messenger.onNotification(traceServerUrlChanged, this._onVscodeUrlChanged);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        signalManager().on('OUTPUT_ADDED', this._onOutputAdded);
    }

    componentWillUnmount(): void {
        signalManager().off('OUTPUT_ADDED', this._onOutputAdded);
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
