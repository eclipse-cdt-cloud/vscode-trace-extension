/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
import * as React from 'react';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { TspClient } from 'tsp-typescript-client/lib/protocol/tsp-client';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { TraceContextComponent } from '@trace-viewer/react-components/lib/components/trace-context-component';
import { VsCodeMessageManager } from '../common/vscode-message-manager';
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '../style/trace-viewer.css';
import '@trace-viewer/react-components/style/trace-context-style.css';

interface VscodeAppState {
  experiment: Experiment | undefined;
  tspClient: TspClient | undefined;
  outputs: OutputDescriptor[];
}

class App extends React.Component<{}, VscodeAppState>  {
  private _signalHandler: VsCodeMessageManager;

  constructor(props: {}) {
      super(props);
      this.state = {
          experiment: undefined,
          tspClient: undefined,
          outputs: []
      };
      this._signalHandler = new VsCodeMessageManager();

      window.addEventListener('message', event => {

          const message = event.data; // The JSON data our extension sent
          switch (message.command) {
          case 'set-experiment':
              this.setState({experiment: message.data as Experiment});
              break;
          case 'set-tspClient':
              this.setState({tspClient: new TspClient(message.data)});
              break;
          case 'add-output':
              this.setState({outputs: [...this.state.outputs, message.data] });
              break;
          }
      });
      this.onOutputRemoved = this.onOutputRemoved.bind(this);
  }

  componentDidMount(): void {
      this._signalHandler.notifyReady();
  }

  private onOutputRemoved(outputId: string) {
      const outputToKeep = this.state.outputs.filter(output => output.id !== outputId);
      this.setState({outputs: outputToKeep});
  }

  public render(): React.ReactNode {
      return (
          <div className="trace-viewer-container">
              { this.state.experiment && this.state.tspClient && <TraceContextComponent
                  experiment={this.state.experiment}
                  tspClient={this.state.tspClient}
                  outputs={this.state.outputs}
                  messageManager={this._signalHandler}
                  onOutputRemove={this.onOutputRemoved}
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
