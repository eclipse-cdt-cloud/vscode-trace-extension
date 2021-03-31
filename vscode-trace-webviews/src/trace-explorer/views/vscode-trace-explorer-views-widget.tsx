/* eslint-disable @typescript-eslint/ban-types */
import { OutputAddedSignalPayload } from '@trace-viewer/base/lib/signals/output-added-signal-payload';
import { signalManager, Signals } from '@trace-viewer/base/lib/signals/signal-manager';
import { ITspClientProvider } from '@trace-viewer/base/lib/tsp-client-provider';
import { ReactAvailableViewsWidget } from '@trace-viewer/react-components/lib/trace-explorer/trace-explorer-views-widget';
import * as React from 'react';
import { TspClientProvider } from '../../common/tsp-client-provider-impl';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/trace-viewer.css';
import '@trace-viewer/react-components/style/trace-explorer.css';
import '../../style/react-contextify.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';

interface AvailableViewsAppState {
  tspClientProvider: ITspClientProvider | undefined;
}

class TraceExplorerViewsWidget extends React.Component<{}, AvailableViewsAppState>  {
  private _signalHandler: VsCodeMessageManager;

  static ID = 'trace-explorer-analysis-widget';
  static LABEL = 'Available Analyses';

  private _onExperimentSelected = (openedExperiment: Experiment | undefined): void => this.doHandleExperimentSelectedSignal(openedExperiment);
  private _onOutputAdded = (payload: OutputAddedSignalPayload): void => this.doHandleOutputAddedSignal(payload);

  constructor(props: {}) {
      super(props);
      this.state = {
          tspClientProvider: undefined,
      };
      this._signalHandler = new VsCodeMessageManager();
      window.addEventListener('message', event => {

          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
          case 'set-tspClient':
              this.setState({ tspClientProvider: new TspClientProvider(message.data) });
              break;
          case 'experimentSelected':
              if (message.data) {
                  signalManager().fireExperimentSelectedSignal(message.data);
              }
              break;
          }
      });
  }

  componentDidMount(): void {
      this._signalHandler.notifyReady();
      signalManager().on(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
      signalManager().on(Signals.OUTPUT_ADDED, this._onOutputAdded);
  }

  componentWillUnmount(): void {
      signalManager().off(Signals.EXPERIMENT_SELECTED, this._onExperimentSelected);
      signalManager().off(Signals.OUTPUT_ADDED, this._onOutputAdded);
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
      return (<div>
          {this.state.tspClientProvider && <ReactAvailableViewsWidget
              id={TraceExplorerViewsWidget.ID}
              title={TraceExplorerViewsWidget.LABEL}
              tspClientProvider={this.state.tspClientProvider}
          ></ReactAvailableViewsWidget>
          }
      </div>
      );
  }
}

export default TraceExplorerViewsWidget;
