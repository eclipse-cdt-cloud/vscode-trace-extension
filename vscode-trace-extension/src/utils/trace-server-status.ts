import { ThemeColor, StatusBarItem } from 'vscode';
import { isTraceServerUp } from './backend-tsp-client-provider';
import * as vscode from 'vscode';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-messages';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';

export class TraceServerConnectionStatusService {
    private _status = false;

    public constructor(private _statusBarItem: StatusBarItem) {
        _statusBarItem.hide();
        this.checkAndUpdateServerStatus();
    }

    public checkAndUpdateServerStatus = async (): Promise<void> => {
        const isUp = await isTraceServerUp();
        await this.updateServerStatus(isUp);
    };

    public async updateServerStatus(status: boolean): Promise<void> {
        if (status === this._status) {
            return;
        }
        this._status = status;

        await vscode.commands.executeCommand('setContext', 'traceViewer.serverUp', status);

        const command = VSCODE_MESSAGES.CONNECTION_STATUS;
        const data = this._status.toString();

        // Send status change to WebviewPanels
        TraceViewerPanel.postMessageToWebviews(command, data);

        this.render(status);
    }

    private render = (status: boolean): void => {
        if (status) {
            this._statusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
            this._statusBarItem.text = '$(check) Trace Server';
            this._statusBarItem.tooltip = 'Trace Viewer: server found';
        } else {
            this._statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
            this._statusBarItem.text = '$(error) Trace Server';
            this._statusBarItem.tooltip = 'Trace Viewer: server not found';
        }
        this._statusBarItem.show();
    };
}
