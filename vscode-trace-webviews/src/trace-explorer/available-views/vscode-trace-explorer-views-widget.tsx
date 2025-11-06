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
import { CustomizationConfigObject, CustomizationSubmission } from 'vscode-trace-common/lib/types/customization';
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';
import { OutputConfigurationQuery, OutputDescriptor } from 'tsp-typescript-client';

interface AvailableViewsAppState {
    tspClientProvider: TspClientProvider | undefined;
    experiment: Experiment | undefined;
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
        this.setState({ experiment });
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
            tspClientProvider: undefined,
            experiment: undefined
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

    protected handleOutputCustomization = async (output: OutputDescriptor, experiment: Experiment): Promise<void> => {
        if (!this.state.tspClientProvider) {
            return;
        }

        const tsp = this.state.tspClientProvider.getTspClient();
        const configSourceArray = (await tsp
            .fetchOutputConfigurationTypes(experiment.UUID, output.id)
            .then(res => res.getModel())) as CustomizationConfigObject[];

        if (!configSourceArray || !configSourceArray[0]) {
            // TODO some nice error handling or something
            return;
        }

        const payload = await this._signalHandler.userCustomizedOutput({ configs: configSourceArray }); // TODO fix typing

        const userConfig = payload.userConfig as CustomizationSubmission;

        if (!userConfig) {
            return;
        }

        const { name, description, sourceTypeId, parameters } = userConfig;

        const options = new OutputConfigurationQuery(name, description, sourceTypeId, parameters);
        const response = await tsp.createDerivedOutput(experiment.UUID, output.id, options);
        if (!response.isOk()) {
            const errorResponse = response.getErrorResponse();
            let message: string = `Customization failed (${response.getStatusCode()}): '${response.getStatusMessage()}'`;
            if (errorResponse) {
                message = `Customization failed (${response.getStatusCode()}): '${errorResponse.title}'`;
                // TODO Remove workaround when following fix is available
                // https://github.com/eclipse-cdt-cloud/tsp-typescript-client/issues/148
                if ('detail' in errorResponse) {
                    message = message + `. Details: '${errorResponse.detail}'`;
                }
            }
            this._signalHandler.notifyError(message);
            return;
        }
        this._signalHandler.notifyInfo('Configuration submitted successfully');
    };

    public render(): React.ReactNode {
        return (
            <div>
                {this.state.tspClientProvider && (
                    <ReactAvailableViewsWidget
                        id={TraceExplorerViewsWidget.ID}
                        title={TraceExplorerViewsWidget.LABEL}
                        tspClientProvider={this.state.tspClientProvider}
                        onCustomizationClick={this.handleOutputCustomization}
                    ></ReactAvailableViewsWidget>
                )}
            </div>
        );
    }
}

export default TraceExplorerViewsWidget;
