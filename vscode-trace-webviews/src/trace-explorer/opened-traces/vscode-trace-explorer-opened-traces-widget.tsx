/* eslint-disable @typescript-eslint/ban-types, @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Item, ItemParams, Menu, useContextMenu } from 'react-contexify';
import { OpenedTracesUpdatedSignalPayload } from 'traceviewer-base/lib/signals/opened-traces-updated-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { ReactOpenTracesWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-opened-traces-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import {
    experimentOpened,
    setTspClient,
    traceServerUrlChanged,
    traceViewerTabActivated
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';

interface OpenedTracesAppState {
    tspClientProvider: TspClientProvider | undefined;
}

const MENU_ID = 'traceExplorer.openedTraces.menuId';

class TraceExplorerOpenedTraces extends React.Component<{}, OpenedTracesAppState> {
    private _signalHandler: VsCodeMessageManager;

    static ID = 'trace-explorer-opened-traces-widget';
    static LABEL = 'Opened Traces';

    // Signal handlers
    private _onExperimentSelected = (openedExperiment: Experiment | undefined): void =>
        this.doHandleExperimentSelectedSignal(openedExperiment);
    private _onRemoveTraceButton = (traceUUID: string): void => this.doHandleRemoveTraceSignal(traceUUID);
    protected onUpdateSignal = (payload: OpenedTracesUpdatedSignalPayload): void =>
        this.doHandleOpenedTracesChanged(payload);

    private doHandleRemoveTraceSignal(traceUUID: string) {
        this.state.tspClientProvider
            ?.getExperimentManager()
            .getExperiment(traceUUID)
            .then(experimentOpen => {
                if (experimentOpen) {
                    this._signalHandler.deleteTrace(experimentOpen);
                }
            })
            .catch(error => {
                console.error('Error: Unable to find experiment for the trace UUID, ', error);
            });
    }

    // VSCODE message handlers
    private _onVscodeSetTspClient = (data: string): void => {
        this.setState({
            tspClientProvider: new TspClientProvider(data, this._signalHandler)
        });
    };

    private _onVscodeUrlChanged = (data: string): void => {
        if (data && this.state.tspClientProvider) {
            this.state.tspClientProvider.updateTspClientUrl(data);
        }
    };

    private _onVscodeExperimentOpened = (data: any): void => {
        if (data) {
            signalManager().emit('EXPERIMENT_OPENED', JSONBigUtils.parse(data, Experiment));
        }
    };

    private _onVscodeUrlTraceViewerTabActivated = (data: any): void => {
        if (data) {
            signalManager().emit('TRACEVIEWERTAB_ACTIVATED', JSONBigUtils.parse(data, Experiment));
        }
    };

    constructor(props: {}) {
        super(props);
        this.state = {
            tspClientProvider: undefined
        };

        this._signalHandler = new VsCodeMessageManager(messenger);

        messenger.onNotification(setTspClient, this._onVscodeSetTspClient);
        messenger.onNotification(traceServerUrlChanged, this._onVscodeUrlChanged);
        messenger.onNotification(experimentOpened, this._onVscodeExperimentOpened);
        messenger.onNotification(traceViewerTabActivated, this._onVscodeUrlTraceViewerTabActivated);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        // ExperimentSelected handler is registered in the constructor (upstream code), but it's
        // better to register it here when the react component gets mounted.
        signalManager().on('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().on('CLOSE_TRACEVIEWERTAB', this._onRemoveTraceButton);
        signalManager().on('OPENED_TRACES_UPDATED', this.onUpdateSignal);
    }

    componentWillUnmount(): void {
        signalManager().off('EXPERIMENT_SELECTED', this._onExperimentSelected);
        signalManager().off('CLOSE_TRACEVIEWERTAB', this._onRemoveTraceButton);
        signalManager().off('OPENED_TRACES_UPDATED', this.onUpdateSignal);
    }

    private initialized = false;
    protected doHandleOpenedTracesChanged(payload: OpenedTracesUpdatedSignalPayload): void {
        if (!this.initialized) {
            this.initialized = true;
            return;
        }
        this._signalHandler.updateOpenedTraces(payload.getNumberOfOpenedTraces());
    }

    protected doHandleContextMenuEvent(event: React.MouseEvent<HTMLDivElement>, experiment: Experiment): void {
        const { show } = useContextMenu({
            id: MENU_ID
        });

        show(event, {
            props: {
                experiment: experiment
            }
        });
    }

    protected doHandleClickEvent(event: React.MouseEvent<HTMLDivElement>, experiment: Experiment): void {
        this.doHandleReOpenTrace(experiment);
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        this._signalHandler.experimentSelected(experiment);
    }

    public render(): React.ReactNode {
        return (
            <>
                <div>
                    {this.state.tspClientProvider && (
                        <ReactOpenTracesWidget
                            id={TraceExplorerOpenedTraces.ID}
                            title={TraceExplorerOpenedTraces.LABEL}
                            tspClientProvider={this.state.tspClientProvider}
                            contextMenuRenderer={(
                                event: React.MouseEvent<HTMLDivElement, MouseEvent>,
                                experiment: Experiment
                            ) => this.doHandleContextMenuEvent(event, experiment)}
                            onClick={(event: React.MouseEvent<HTMLDivElement, MouseEvent>, experiment: Experiment) =>
                                this.doHandleClickEvent(event, experiment)
                            }
                        ></ReactOpenTracesWidget>
                    )}
                </div>
                <Menu id={MENU_ID} theme={'dark'} animation={'fade'}>
                    <Item id="open-id" onClick={this.handleItemClick}>
                        Open Trace
                    </Item>
                    <Item id="close-id" onClick={this.handleItemClick}>
                        Close Trace
                    </Item>
                    <Item id="remove-id" onClick={this.handleItemClick}>
                        Remove Trace
                    </Item>
                </Menu>
            </>
        );
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
            case 'close-id': {
                this._signalHandler.closeTrace(args.props.experiment as Experiment);
                return;
            }
            case 'remove-id': {
                this._signalHandler.deleteTrace(args.props.experiment as Experiment);
                this.state.tspClientProvider
                    ?.getExperimentManager()
                    .deleteExperiment((args.props.experiment as Experiment).UUID);

                return;
            }
            default:
            // Do nothing
        }
    };
}

export default TraceExplorerOpenedTraces;
