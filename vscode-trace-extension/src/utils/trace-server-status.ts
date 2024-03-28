import { ThemeColor, StatusBarItem } from 'vscode';
import { isTraceServerUp } from './backend-tsp-client-provider';
import { traceExtensionWebviewManager } from '../extension';
import { VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { TraceViewerPanel } from '../trace-viewer-panel/trace-viewer-webview-panel';

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
        const command = VSCODE_MESSAGES.CONNECTION_STATUS;
        const data = this._status.toString();
        // WebviewViews
        traceExtensionWebviewManager.getAllActiveWebviews().forEach(_view => {
            _view.webview.postMessage({ command, data });
        });
        // activePanels
        TraceViewerPanel.postMessageToWebviews(command, data);
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
