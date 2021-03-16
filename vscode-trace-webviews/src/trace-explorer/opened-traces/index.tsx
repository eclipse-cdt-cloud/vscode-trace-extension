import * as React from 'react';
import * as ReactDOM from 'react-dom';
import './index.css';
import TraceExplorerOpenedTraces from './vscode-trace-explorer-opened-traces-widget';

ReactDOM.render(
  <TraceExplorerOpenedTraces />,
  (document.getElementById('root') as HTMLElement)
);
