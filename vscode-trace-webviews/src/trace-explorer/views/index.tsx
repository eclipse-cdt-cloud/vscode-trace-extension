import * as React from 'react';
import * as ReactDOM from 'react-dom';
import './index.css';
import TraceExplorerViewsWidget from './vscode-trace-explorer-views-widget';

ReactDOM.render(
    <TraceExplorerViewsWidget />,
    (document.getElementById('root') as HTMLElement)
);
