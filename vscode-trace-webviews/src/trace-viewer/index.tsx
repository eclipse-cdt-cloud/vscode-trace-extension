import * as React from 'react';
import ReactDOM from 'react-dom/client';
import TraceViewerContainer from './vscode-trace-viewer-container';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <TraceViewerContainer />
);
