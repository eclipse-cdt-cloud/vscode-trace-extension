/* eslint-disable @typescript-eslint/ban-types */
import * as React from 'react';
import { ReactOpenTracesWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-opened-traces-widget';
import { VsCodeMessageManager, VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { Menu, Item, useContextMenu, ItemParams } from 'react-contexify';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { ITspClientProvider } from 'traceviewer-base/lib/tsp-client-provider';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import '../../style/trace-viewer.css';
import 'traceviewer-react-components/style/trace-explorer.css';
import '../../style/react-contextify.css';
import { ExperimentManager } from 'traceviewer-base/lib/experiment-manager';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import JSONBigConfig from 'json-bigint';
import { OpenedTracesUpdatedSignalPayload } from 'traceviewer-base/lib/signals/opened-traces-updated-signal-payload';
import { ReactExplorerPlaceholderWidget } from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-placeholder-widget';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

interface OpenedTracesAppState {
  tspClientProvider: ITspClientProvider | undefined;
  experimentsOpened: boolean;
}

const MENU_ID = 'traceExplorer.openedTraces.menuId';

class TraceExplorerOpenedTraces extends React.Component<{}, OpenedTracesAppState>  {
  private _signalHandler: VsCodeMessageManager;
  private _experimentManager: ExperimentManager;

  static ID = 'trace-explorer-opened-traces-widget';
  static LABEL = 'Opened Traces';

  private _onExperimentSelected = (openedExperiment: Experiment | undefined): void => this.doHandleExperimentSelectedSignal(openedExperiment);
  private _onRemoveTraceButton = (traceUUID: string): void => this.doHandleRemoveTraceSignal(traceUUID);
  protected onUpdateSignal = (payload: OpenedTracesUpdatedSignalPayload): void => this.doHandleOpenedTracesChanged(payload);
  private loading = false;

  private doHandleRemoveTraceSignal(traceUUID: string) {
      this._experimentManager.getExperiment(traceUUID).then( experimentOpen => {
          if (experimentOpen) {
              this._signalHandler.deleteTrace(experimentOpen);
          }
      }).catch( error => {
          console.error('Error: Unable to find experiment for the trace UUID, ', error);
      });
  }

  constructor(props: {}) {
      super(props);
      this.state = {
          tspClientProvider: undefined,
          experimentsOpened: true,
      };
      this._signalHandler = new VsCodeMessageManager();
      window.addEventListener('message', event => {

          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
          case VSCODE_MESSAGES.SET_TSP_CLIENT:
              const tspClientProvider: ITspClientProvider = new TspClientProvider(message.data, this._signalHandler);
              this._experimentManager = tspClientProvider.getExperimentManager();
              this.setState({ tspClientProvider: tspClientProvider });
              if (this.state.tspClientProvider) {
                  this.state.tspClientProvider.addTspClientChangeListener(() => {
                      if (this.state.tspClientProvider) {
                          this._experimentManager = this.state.tspClientProvider.getExperimentManager();
                      }
                  });
              }
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
                      this.setState({experimentsOpened: true});
                  }
              }
              break;
          case VSCODE_MESSAGES.TRACE_SERVER_STARTED:
              signalManager().fireTraceServerStartedSignal();
              this.setState({experimentsOpened: true});
          }
      });
      // this.onOutputRemoved = this.onOutputRemoved.bind(this);
      signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
  }

  componentDidMount(): void {
      this._signalHandler.notifyReady();
      // ExperimentSelected handler is registered in the constructor (upstream code), but it's
      // better to register it here when the react component gets mounted.
      signalManager().on(Signals.CLOSE_TRACEVIEWERTAB, this._onRemoveTraceButton);
      signalManager().on(Signals.OPENED_TRACES_UPDATED, this.onUpdateSignal);
  }

  componentWillUnmount(): void {
      signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
      signalManager().off(Signals.CLOSE_TRACEVIEWERTAB, this._onRemoveTraceButton);
      signalManager().off(Signals.OPENED_TRACES_UPDATED, this.onUpdateSignal);
  }

  protected doHandleOpenedTracesChanged(payload: OpenedTracesUpdatedSignalPayload): void {
      this._signalHandler.updateOpenedTraces(payload.getNumberOfOpenedTraces());
      if (payload.getNumberOfOpenedTraces()>0) {
          this.setState({experimentsOpened: true});
      } else if (payload.getNumberOfOpenedTraces()===0){
          this.setState({experimentsOpened: false});
      }
  }

  protected doHandleContextMenuEvent(event: React.MouseEvent<HTMLDivElement>, experiment: Experiment): void {
      const { show } = useContextMenu({
          id: MENU_ID,
      });

      show(event, {
          props: {
              experiment: experiment,
          }
      });
  }

  protected doHandleClickEvent(event: React.MouseEvent<HTMLDivElement>, experiment: Experiment): void {
      this._signalHandler.reOpenTrace(experiment);
  }

  protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
      this._signalHandler.experimentSelected(experiment);
  }

  public render(): React.ReactNode {
      return ( this.state.experimentsOpened ? <><div>
          {this.state.tspClientProvider && <ReactOpenTracesWidget
              id={TraceExplorerOpenedTraces.ID}
              title={TraceExplorerOpenedTraces.LABEL}
              tspClientProvider={this.state.tspClientProvider}
              contextMenuRenderer={(event: React.MouseEvent<HTMLDivElement, MouseEvent>, experiment: Experiment) => this.doHandleContextMenuEvent(event, experiment)}
              onClick={(event: React.MouseEvent<HTMLDivElement, MouseEvent>, experiment: Experiment) => this.doHandleClickEvent(event, experiment) }
          ></ReactOpenTracesWidget>
          }
      </div>
      <Menu id={MENU_ID} theme={'dark'} animation={'fade'}>
          <Item id="open-id" onClick={this.handleItemClick}>Open Trace</Item>
          <Item id="close-id" onClick={this.handleItemClick}>Close Trace</Item>
          <Item id="remove-id" onClick={this.handleItemClick}>Remove Trace</Item>
      </Menu>
      </> :
          <ReactExplorerPlaceholderWidget
              loading={this.loading}
              handleOpenTrace={this.handleOpenTrace}
          ></ReactExplorerPlaceholderWidget>
      );
  }

  protected handleOpenTrace = async (): Promise<void> => this.doHandleOpenTrace();

  private async doHandleOpenTrace() {
      this.loading = true;
      this._signalHandler.openTrace();
      this.loading = false;
  }

  protected handleItemClick = (args: ItemParams): void => {
      switch (args.event.currentTarget.id) {
      case 'open-id':
          this._signalHandler.reOpenTrace(args.props.experiment as Experiment);
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
}

export default TraceExplorerOpenedTraces;
