/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import TraceExplorerProperties from './vscode-trace-explorer-properties-widget';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
    <TraceExplorerProperties />
);
