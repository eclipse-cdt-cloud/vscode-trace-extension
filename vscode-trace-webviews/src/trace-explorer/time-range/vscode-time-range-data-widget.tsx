/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { messenger } from '.';
import { VsCodeMessageManager } from '../../common/vscode-message-manager';
import { Experiment } from 'tsp-typescript-client';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import '../../style/react-contextify.css';
import '../../style/trace-viewer.css';
import { createNormalizer, array } from 'tsp-typescript-client/lib/protocol/serialization';

interface TimeRangeDataWidgetProps {
    data: boolean;
}

const ExperimentTimeRangeDataNormalizer = createNormalizer<ExperimentTimeRangeData>({
    absoluteRange: { start: BigInt, end: BigInt },
    viewRange: { start: BigInt, end: BigInt },
    selectionRange: { start: BigInt, end: BigInt }
});

const RestoreViewNormalizer = createNormalizer<{
    mapArray: ExperimentTimeRangeData[];
    activeData: ExperimentTimeRangeData;
}>({
    mapArray: array(ExperimentTimeRangeDataNormalizer),
    activeData: ExperimentTimeRangeDataNormalizer
});

class TimeRangeDataWidget extends React.Component {
    private _signalHandler: VsCodeMessageManager;
    private _reactRef: React.RefObject<ReactTimeRangeDataWidget>;

    static ID = 'trace-explorer-time-range-data-widget';
    static LABEL = 'Time Range Data';

    // VSCODE message handlers
    private _onVscodeExperimentSelected = (data: any): void => {
        signalManager().emit(
            'EXPERIMENT_SELECTED',
            data?.wrapper ? JSONBigUtils.parse(data.wrapper, Experiment) : undefined
        );
    };

    private _onVscodeExperimentUpdated = (data: any): void => {
        if (data?.wrapper) {
            signalManager().emit('EXPERIMENT_UPDATED', JSONBigUtils.parse(data.wrapper, Experiment));
        }
    };

    private _onVscodeExperimentClosed = (data: any): void => {
        if (data?.wrapper) {
            signalManager().emit('EXPERIMENT_CLOSED', JSONBigUtils.parse(data.wrapper, Experiment));
        }
    };

    private _onVscodeTraceViewerTabClosed = (data: any): void => {
        if (data) {
            signalManager().emit('CLOSE_TRACEVIEWERTAB', data);
        }
    };

    private _onVscodeSelectionRangeUpdated = (data: any): void => {
        if (data) {
            signalManager().emit('SELECTION_RANGE_UPDATED', JSONBigUtils.parse(data));
        }
    };

    private _onVscodeViewRangeUpdated = (data: any): void => {
        if (data) {
            signalManager().emit('VIEW_RANGE_UPDATED', JSONBigUtils.parse(data));
        }
    };

    private _onVscodeRestoreView = (data: any): void => {
        if (data) {
            const { mapArray, activeData } = JSONBigUtils.parse(data, RestoreViewNormalizer);
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
