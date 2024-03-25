import { ThemeColor, StatusBarItem } from 'vscode';
import { isTraceServerUp } from './backend-tsp-client-provider';
import { traceExtensionWebviewManager } from '../extension';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';

export class TraceServerConnectionStatusService {
    private _status = false;

    public constructor(private _statusBarItem: StatusBarItem) {
        _statusBarItem.hide();
        this.checkAndUpdateServerStatus();
    }

    public checkAndUpdateServerStatus = async (): Promise<void> => {
        const isUp = await isTraceServerUp();
        if (isUp === this._status) {
            return;
        }
        this._status = isUp;
        this.emitServerStatusChangeToViews();
        this.render(isUp);
    };

    private emitServerStatusChangeToViews = () => {
        // TODO - this is like kinda weird idk maybe make method in class.
        const webviews = [
            ...traceExtensionWebviewManager.getAllActiveWebviews().map(_view => _view.webview),
            ...traceExtensionWebviewManager.getAllActiveWebviewPanels().map(_view => _view.webview)
        ];

        webviews.forEach(webview => {
            webview.postMessage({ command: VSCODE_MESSAGES.CONNECTION_STATUS, data: this._status });
        });
    };

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
