import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TraceExplorerViewsWidget from './vscode-trace-explorer-views-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<TraceExplorerViewsWidget />);
