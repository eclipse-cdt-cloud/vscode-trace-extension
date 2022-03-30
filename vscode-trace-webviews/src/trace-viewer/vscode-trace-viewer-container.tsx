/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import * as React from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { TraceContextComponent } from 'traceviewer-react-components/lib/components/trace-context-component';
import 'traceviewer-react-components/style/trace-context-style.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { VsCodeMessageManager } from '../common/vscode-message-manager';
import '../style/trace-viewer.css';
import JSONBigConfig from 'json-bigint';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true,
});

interface VscodeAppState {
  experiment: Experiment | undefined;
  tspClient: TspClient | undefined;
  outputs: OutputDescriptor[];
  overviewOutputDescriptor: OutputDescriptor| undefined;
}

class App extends React.Component<{}, VscodeAppState>  {
  private DEFAULT_OVERVIEW_DATA_PROVIDER_ID = 'org.eclipse.tracecompass.internal.tmf.core.histogram.HistogramDataProvider';

  private _signalHandler: VsCodeMessageManager;

  // TODO add support for marker sets
  private selectedMarkerCategoriesMap: Map<string, string[]> = new Map<string, string[]>();
  private selectedMarkerSetId = '';

  constructor(props: {}) {
      super(props);
      this.state = {
          experiment: undefined,
          tspClient: undefined,
          outputs: [],
          overviewOutputDescriptor: undefined
      };
      this._signalHandler = new VsCodeMessageManager();

      window.addEventListener('message', event => {

          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
          case 'set-experiment':
              // FIXME: JSONBig.parse() create bigint if numbers are small
              const experiment = JSONBig.parse(message.data);
              this.doHandleExperimentSetSignal(experiment);
              break;
          case 'set-tspClient':
              this.setState({tspClient: new TspClient(message.data)});
              break;
          case 'add-output':
              // FIXME: JSONBig.parse() create bigint if numbers are small
              const descriptor = JSONBig.parse(message.data);
              this.setState({outputs: [...this.state.outputs, descriptor] });
              break;
          }
      });
      this.onOutputRemoved = this.onOutputRemoved.bind(this);
      this.onOverviewRemoved = this.onOverviewRemoved.bind(this);
  }

  componentDidMount(): void {
      this._signalHandler.notifyReady();
  }

  private onOutputRemoved(outputId: string) {
      const outputToKeep = this.state.outputs.filter(output => output.id !== outputId);
      this.setState({outputs: outputToKeep});
  }

  protected onOverviewRemoved(): void {
      this.setState({overviewOutputDescriptor: undefined});
  }

  protected async doHandleExperimentSetSignal(experiment: Experiment| undefined): Promise<void> {
      if (experiment) {
          const defaultOverviewDescriptor: OutputDescriptor | undefined  = await this.getDefaultTraceOverviewOutputDescriptor(experiment);
          this.setState({
              experiment: experiment,
              overviewOutputDescriptor: defaultOverviewDescriptor});
      }
  }

  protected async getDefaultTraceOverviewOutputDescriptor(experiment: Experiment| undefined): Promise<OutputDescriptor | undefined> {
      const availableDescriptors = await this.getAvailableTraceOverviewOutputDescriptor(experiment);
      return availableDescriptors?.find(output => output.id === this.DEFAULT_OVERVIEW_DATA_PROVIDER_ID);
  }

  protected async getAvailableTraceOverviewOutputDescriptor(experiment: Experiment| undefined): Promise<OutputDescriptor[] | undefined> {
      let descriptors: OutputDescriptor[] | undefined;
      if (experiment && this.state.tspClient) {
          const outputsResponse = await this.state.tspClient.experimentOutputs(experiment.UUID);
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
              { this.state.experiment && this.state.tspClient && <TraceContextComponent
                  experiment={this.state.experiment}
                  tspClient={this.state.tspClient}
                  outputs={this.state.outputs}
                  overviewDescriptor={this.state.overviewOutputDescriptor}
                  markerCategoriesMap={this.selectedMarkerCategoriesMap}
                  markerSetId={this.selectedMarkerSetId}
                  messageManager={this._signalHandler}
                  onOutputRemove={this.onOutputRemoved}
                  onOverviewRemove={this.onOverviewRemoved}
                  // eslint-disable-next-line @typescript-eslint/no-empty-function
                  addResizeHandler={() => {}}
                  removeResizeHandler={() => {}}
                  backgroundTheme={'dark'}></TraceContextComponent>
              }
          </div>
      );
  }
}

export default App;
