import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Messenger } from 'vscode-messenger-webview';
import TraceViewerContainer from './vscode-trace-viewer-container';
import './index.css';

// @ts-expect-error "will be available when running the app"
export const vscode = acquireVsCodeApi();
export const messenger = new Messenger(vscode);
messenger.start();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<TraceViewerContainer />);
