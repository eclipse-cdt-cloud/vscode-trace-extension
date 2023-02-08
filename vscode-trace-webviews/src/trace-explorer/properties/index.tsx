/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import './index.css';
import TraceExplorerProperties from './vscode-trace-explorer-properties-widget';

ReactDOM.render(
    <TraceExplorerProperties />,
    (document.getElementById('root') as HTMLElement)
);
