import * as React from 'react';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import {
    ExperimentTimeRangeData,
    ReactTimeRangeDataWidget
} from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-time-range-data-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';
import JSONBigConfig from 'json-bigint';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { VSCODE_MESSAGES, VsCodeMessageManager } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

interface TimeRangeDataWidgetProps {
    data: boolean;
}

// declare const vscode: vscode;

class TimeRangeDataWidget extends React.Component {
    private _signalHandler: VsCodeMessageManager;
    private _reactRef: React.RefObject<ReactTimeRangeDataWidget>;

    static ID = 'trace-explorer-time-range-data-widget';
    static LABEL = 'Time Range Data';

    constructor(props: TimeRangeDataWidgetProps) {
        super(props);
        this._signalHandler = new VsCodeMessageManager();
        this._reactRef = React.createRef();

        window.addEventListener('message', event => {
            const { command, data } = event.data;

            switch (command) {
                case VSCODE_MESSAGES.RESTORE_VIEW:
                    const { mapArray, activeData } = JSONBig.parse(data);
                    this.restoreState(mapArray, activeData);
                    return;
                case VSCODE_MESSAGES.TRACE_VIEWER_TAB_CLOSED:
                    signalManager().emit('CLOSE_TRACEVIEWERTAB', data);
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_SELECTED:
                    signalManager().emit(
                        'EXPERIMENT_SELECTED',
                        data?.wrapper ? convertSignalExperiment(JSONBig.parse(data.wrapper)) : undefined
                    );
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_UPDATED:
                    signalManager().emit('EXPERIMENT_UPDATED', convertSignalExperiment(JSONBig.parse(data.wrapper)));
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_CLOSED:
                    signalManager().emit('EXPERIMENT_CLOSED', convertSignalExperiment(JSONBig.parse(data.wrapper)));
                    break;
                case VSCODE_MESSAGES.SELECTION_RANGE_UPDATED:
                    signalManager().emit('SELECTION_RANGE_UPDATED', JSONBig.parse(data));
                    break;
                case VSCODE_MESSAGES.VIEW_RANGE_UPDATED:
                    signalManager().emit('VIEW_RANGE_UPDATED', JSONBig.parse(data));
                    break;
            }
        });
    }

    componentWillUnmount = (): void => {
        signalManager().off('REQUEST_SELECTION_RANGE_CHANGE', this.onRequestSelectionChange);
    };

    onRequestSelectionChange = (payload: TimeRangeUpdatePayload): void => {
        this._signalHandler.requestSelectionRangeChange(payload);
    };

    componentDidMount = (): void => {
        this._signalHandler.notifyReady();
        signalManager().on('REQUEST_SELECTION_RANGE_CHANGE', this.onRequestSelectionChange);
    };

    restoreState = (mapArray: Array<ExperimentTimeRangeData>, activeData: ExperimentTimeRangeData): void => {
        this._reactRef.current?.restoreData(mapArray, activeData);
    };

    public render(): React.ReactNode {
        return (
            <div>
                <ReactTimeRangeDataWidget
                    ref={this._reactRef}
                    id={TimeRangeDataWidget.ID}
                    title={TimeRangeDataWidget.LABEL}
                />
            </div>
        );
    }
}

export default TimeRangeDataWidget;
