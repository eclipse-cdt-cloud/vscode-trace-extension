import { StatusBarItem, ThemeColor } from 'vscode';

export class TraceServerConnectionStatusService {

    private statusBarItem: StatusBarItem;

    public constructor(statusBarItem: StatusBarItem) {
        this.statusBarItem = statusBarItem;
        this.statusBarItem.hide();
    }

    public async render(status: boolean): Promise<void> {
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
    }
}
