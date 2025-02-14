/***************************************************************************************
 * Copyright (c) 2023, 2025 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { Messenger } from 'vscode-messenger-webview';
import './index.css';
import TraceExplorerProperties from './vscode-trace-explorer-properties-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// @ts-expect-error "will be available when running the app"
export const vscode = acquireVsCodeApi();
export const messenger = new Messenger(vscode);
messenger.start();

root.render(<TraceExplorerProperties />);
