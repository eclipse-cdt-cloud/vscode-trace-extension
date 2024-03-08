import { ThemeColor, StatusBarItem } from 'vscode';
import { isTraceServerUp } from './backend-tsp-client-provider';

export class TraceServerConnectionStatusService {
    private statusBarItem: StatusBarItem;

    public constructor(statusBarItem: StatusBarItem) {
        this.statusBarItem = statusBarItem;
        this.statusBarItem.hide();
    }

    public checkAndUpdateServerStatus = async (): Promise<void> => {
        const isUp = await isTraceServerUp();
        this.render(isUp);
    };

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
