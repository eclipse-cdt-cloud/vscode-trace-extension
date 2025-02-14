/* eslint-disable @typescript-eslint/no-explicit-any */
import JSONBigConfig from 'json-bigint';
import * as React from 'react';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import {
    ExperimentTimeRangeData,
    ReactTimeRangeDataWidget
} from 'traceviewer-react-components/lib/trace-explorer/trace-explorer-time-range-data-widget';
import 'traceviewer-react-components/style/trace-explorer.css';
import {
    experimentClosed,
    experimentSelected,
    experimentUpdated,
    restoreView,
    selectionRangeUpdated,
    traceViewerTabClosed,
    viewRangeUpdated
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

interface TimeRangeDataWidgetProps {
    data: boolean;
}

class TimeRangeDataWidget extends React.Component {
    private _signalHandler: VsCodeMessageManager;
    private _reactRef: React.RefObject<ReactTimeRangeDataWidget>;

    static ID = 'trace-explorer-time-range-data-widget';
    static LABEL = 'Time Range Data';

    // VSCODE message handlers
    private _onVscodeExperimentSelected = (data: any): void => {
        signalManager().emit(
            'EXPERIMENT_SELECTED',
            data?.wrapper ? convertSignalExperiment(JSONBig.parse(data.wrapper)) : undefined
        );
    };

    private _onVscodeExperimentUpdated = (data: any): void => {
        if (data?.wrapper) {
            signalManager().emit('EXPERIMENT_UPDATED', convertSignalExperiment(JSONBig.parse(data.wrapper)));
        }
    };

    private _onVscodeExperimentClosed = (data: any): void => {
        if (data?.wrapper) {
            signalManager().emit('EXPERIMENT_CLOSED', convertSignalExperiment(JSONBig.parse(data.wrapper)));
        }
    };

    private _onVscodeTraceViewerTabClosed = (data: any): void => {
        if (data) {
            signalManager().emit('CLOSE_TRACEVIEWERTAB', data);
        }
    };

    private _onVscodeSelectionRangeUpdated = (data: any): void => {
        if (data) {
            const result = JSONBig.parse(data);
            signalManager().emit('SELECTION_RANGE_UPDATED', result);
        }
    };

    private _onVscodeViewRangeUpdated = (data: any): void => {
        if (data) {
            signalManager().emit('VIEW_RANGE_UPDATED', JSONBig.parse(data));
        }
    };

    private _onVscodeRestoreView = (data: any): void => {
        if (data) {
            const { mapArray, activeData } = JSONBig.parse(data);
            this.restoreState(mapArray, activeData);
        }
    };

    constructor(props: TimeRangeDataWidgetProps) {
        super(props);
        this._signalHandler = new VsCodeMessageManager(messenger);
        this._reactRef = React.createRef();
        messenger.onNotification(experimentSelected, this._onVscodeExperimentSelected);
        messenger.onNotification(experimentUpdated, this._onVscodeExperimentUpdated);
        messenger.onNotification(experimentClosed, this._onVscodeExperimentClosed);
        messenger.onNotification(traceViewerTabClosed, this._onVscodeTraceViewerTabClosed);
        messenger.onNotification(selectionRangeUpdated, this._onVscodeSelectionRangeUpdated);
        messenger.onNotification(viewRangeUpdated, this._onVscodeViewRangeUpdated);
        messenger.onNotification(restoreView, this._onVscodeRestoreView);
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
