/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
import * as vscode from 'vscode';
import { AbstractTraceExplorerProvider } from '../abstract-trace-explorer-provider';

export class TraceExplorerItemPropertiesProvider extends AbstractTraceExplorerProvider {
    public static readonly viewType = 'traceExplorer.itemPropertiesView';
    public readonly _webviewScript = 'propertiesPanel.js';
    protected readonly _webviewOptions = {
        enableScripts: true,
        localResourceRoots: [
            vscode.Uri.joinPath(this._extensionUri, 'pack'),
            vscode.Uri.joinPath(this._extensionUri, 'lib', 'codicons')
        ]
    };

    protected init(): void {
        return;
    }
}
