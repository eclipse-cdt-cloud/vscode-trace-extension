import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ChartShortcutsComponent from './vscode-trace-explorer-shortcuts-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <ChartShortcutsComponent />
);
