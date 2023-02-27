import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TraceExplorerOpenedTraces from './vscode-trace-explorer-opened-traces-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <TraceExplorerOpenedTraces />
);
