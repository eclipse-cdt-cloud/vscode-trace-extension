import { ThemeColor, StatusBarItem } from 'vscode';
import { isTraceServerUp } from './backend-tsp-client-provider';
import * as vscode from 'vscode';

export class TraceServerConnectionStatusService {
    private statusBarItem: StatusBarItem;

    public constructor(statusBarItem: StatusBarItem) {
        this.statusBarItem = statusBarItem;
        this.statusBarItem.hide();
    }

    public checkAndUpdateServerStatus = async (): Promise<void> => {
        const isUp = await isTraceServerUp();
        await this.updateServerStatus(isUp);
    };

    public async updateServerStatus(status: boolean): Promise<void> {
        await vscode.commands.executeCommand('setContext', 'traceViewer.serverUp', status);
        this.render(status);
    }

    private render = (status: boolean): void => {
        if (status) {
            this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
            this.statusBarItem.text = '$(check) Trace Server';
            this.statusBarItem.tooltip = 'Trace Viewer: server found';
        } else {
            this.statusBarItem.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
            this.statusBarItem.text = '$(error) Trace Server';
            this.statusBarItem.tooltip = 'Trace Viewer: server not found';
        }
        this.statusBarItem.show();
    };
}
