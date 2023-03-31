/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import JSONBigConfig from 'json-bigint';
import * as React from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import { TraceContextComponent } from 'traceviewer-react-components/lib/components/trace-context-component';
import 'traceviewer-react-components/style/trace-context-style.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { TspClientProvider } from '../common/tsp-client-provider-impl';
import { VsCodeMessageManager, VSCODE_MESSAGES } from 'vscode-trace-common/lib/vscode-message-manager';
import { convertSignalExperiment } from '../common/vscode-signal-converter';
import '../style/trace-viewer.css';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

interface VscodeAppState {
  experiment: Experiment | undefined;
  tspClientProvider: TspClientProvider | undefined;
  outputs: OutputDescriptor[];
  overviewOutputDescriptor: OutputDescriptor| undefined;
  theme: string;
}

class TraceViewerContainer extends React.Component<{}, VscodeAppState>  {
  private DEFAULT_OVERVIEW_DATA_PROVIDER_ID = 'org.eclipse.tracecompass.internal.tmf.core.histogram.HistogramDataProvider';

  private _signalHandler: VsCodeMessageManager;

  private _onProperties = (properties: { [key: string]: string }): void => this.doHandlePropertiesSignal(properties);
  private _onSaveAsCSV = (payload: {traceId: string, data: string}): void => this.doHandleSaveAsCSVSignal(payload);
  /** Signal Handlers */
  private doHandlePropertiesSignal(properties: { [key: string]: string }) {
      this._signalHandler.propertiesUpdated(properties);
  }

  private doHandleSaveAsCSVSignal(payload: {traceId: string, data: string}) {
      this._signalHandler.saveAsCSV(payload);
  }

  // TODO add support for marker sets
  private selectedMarkerCategoriesMap: Map<string, string[]> = new Map<string, string[]>();
  private selectedMarkerSetId = '';

  private _onOverviewSelected = (payload: {traceId: string, outputDescriptor: OutputDescriptor}): void => this.doHandleOverviewSelectedSignal(payload);

  protected resizeHandlers: (() => void)[] = [];
  protected readonly addResizeHandler = (h: () => void): void => {
      this.resizeHandlers.push(h);
  };
  protected readonly removeResizeHandler = (h: () => void): void => {
      const index = this.resizeHandlers.indexOf(h, 0);
      if (index > -1) {
          this.resizeHandlers.splice(index, 1);
      }
  };

  constructor(props: {}) {
      super(props);
      this.state = {
          experiment: undefined,
          tspClientProvider: undefined,
          outputs: [],
          overviewOutputDescriptor: undefined,
          theme: 'light'
      };
      this._signalHandler = new VsCodeMessageManager();

      window.addEventListener('message', event => {

          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
          case VSCODE_MESSAGES.SET_EXPERIMENT:
              this.doHandleExperimentSetSignal(convertSignalExperiment(JSONBig.parse(message.data)));
              break;
          case VSCODE_MESSAGES.SET_TSP_CLIENT:
              this.setState({tspClientProvider: new TspClientProvider(message.data, this._signalHandler)}, () => {
                  if (message.experiment) {
                      this.doHandleExperimentSetSignal(convertSignalExperiment(JSONBig.parse(message.experiment)));
                  }
              });
              break;
          case VSCODE_MESSAGES.ADD_OUTPUT:
              // FIXME: JSONBig.parse() create bigint if numbers are small
              // Not an issue right now for output descriptors.
              const descriptor = JSONBig.parse(message.data);
              this.setState({outputs: [...this.state.outputs, descriptor] });
              break;
          case VSCODE_MESSAGES.OPEN_OVERVIEW:
              this.doHandleExperimentSetSignal(this.state.experiment);
              break;
          case VSCODE_MESSAGES.SET_THEME:
              this.doHandleThemeChanged(message.data);
              break;
          case VSCODE_MESSAGES.RESET_ZOOM:
              this.resetZoom();
              break;
          }
      });
      window.addEventListener('resize', this.onResize);
      this.onOutputRemoved = this.onOutputRemoved.bind(this);
      this.onOverviewRemoved = this.onOverviewRemoved.bind(this);
      signalManager().on(Signals.OVERVIEW_OUTPUT_SELECTED, this._onOverviewSelected);
  }

  componentDidMount(): void {
      this._signalHandler.notifyReady();
      signalManager().on(Signals.ITEM_PROPERTIES_UPDATED, this._onProperties);
      signalManager().on(Signals.SAVE_AS_CSV, this._onSaveAsCSV);
  }

  componentWillUnmount(): void {
      signalManager().off(Signals.ITEM_PROPERTIES_UPDATED, this._onProperties);
      signalManager().off(Signals.OVERVIEW_OUTPUT_SELECTED, this._onOverviewSelected);
      signalManager().off(Signals.SAVE_AS_CSV, this._onSaveAsCSV);
      window.removeEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
      this.resizeHandlers.forEach(h => h());
  };

  private onOutputRemoved(outputId: string) {
      const outputToKeep = this.state.outputs.filter(output => output.id !== outputId);
      this.setState({outputs: outputToKeep});
  }

  protected onOverviewRemoved(): void {
      this.setState({overviewOutputDescriptor: undefined});
  }

  protected resetZoom(): void {
      signalManager().fireResetZoomSignal();
  }

  protected async doHandleExperimentSetSignal(experiment: Experiment| undefined): Promise<void> {
      if (experiment) {
          const defaultOverviewDescriptor: OutputDescriptor | undefined  = await this.getDefaultTraceOverviewOutputDescriptor(experiment);
          this.setState({
              experiment: experiment,
              overviewOutputDescriptor: defaultOverviewDescriptor});
      }
  }

  protected doHandleOverviewSelectedSignal(payload: {traceId: string, outputDescriptor: OutputDescriptor}): void {
      if (this.state.experiment && payload && payload?.traceId === this.state.experiment.UUID && payload.outputDescriptor){
          this.setState({overviewOutputDescriptor: payload.outputDescriptor});
      }
  }

  protected doHandleThemeChanged(theme: string): void {
      this.setState({ theme }, () => {
          signalManager().fireThemeChangedSignal(theme);
      });
  }

  protected async getDefaultTraceOverviewOutputDescriptor(experiment: Experiment| undefined): Promise<OutputDescriptor | undefined> {
      const availableDescriptors = await this.getAvailableTraceOverviewOutputDescriptor(experiment);
      return availableDescriptors?.find(output => output.id === this.DEFAULT_OVERVIEW_DATA_PROVIDER_ID);
  }

  protected async getAvailableTraceOverviewOutputDescriptor(experiment: Experiment| undefined): Promise<OutputDescriptor[] | undefined> {
      let descriptors: OutputDescriptor[] | undefined;
      if (experiment && this.state.tspClientProvider) {
          const outputsResponse = await this.state.tspClientProvider.getTspClient().experimentOutputs(experiment.UUID);
          if (outputsResponse && outputsResponse.isOk()) {
              descriptors = outputsResponse.getModel();
          }
          const overviewOutputDescriptors = descriptors?.filter(output => output.type === 'TREE_TIME_XY');
          return overviewOutputDescriptors;
      }
  }

  public render(): React.ReactNode {
      return (
          <div className="trace-viewer-container">
              { this.state.experiment && this.state.tspClientProvider && <TraceContextComponent
                  experiment={this.state.experiment}
                  tspClient={this.state.tspClientProvider.getTspClient()}
                  outputs={this.state.outputs}
                  overviewDescriptor={this.state.overviewOutputDescriptor}
                  markerCategoriesMap={this.selectedMarkerCategoriesMap}
                  markerSetId={this.selectedMarkerSetId}
                  messageManager={this._signalHandler}
                  onOutputRemove={this.onOutputRemoved}
                  onOverviewRemove={this.onOverviewRemoved}
                  // eslint-disable-next-line @typescript-eslint/no-empty-function
                  addResizeHandler={this.addResizeHandler}
                  removeResizeHandler={this.removeResizeHandler}
                  backgroundTheme={this.state.theme}></TraceContextComponent>
              }
          </div>
      );
  }
}

export default TraceViewerContainer;
