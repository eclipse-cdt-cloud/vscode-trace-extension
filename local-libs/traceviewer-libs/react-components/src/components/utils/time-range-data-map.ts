import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { ExperimentTimeRangeData } from '../../trace-explorer/trace-explorer-time-range-data-widget';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';

export class TimeRangeDataMap {
    private static _experimentDataMap: Map<string, ExperimentTimeRangeData> = new Map<string, ExperimentTimeRangeData>();
    private static _activeData?: ExperimentTimeRangeData;
    constructor() {
        // Static class pattern: no instance initialization required
    }

    public static updateViewRange = (payload: TimeRangeUpdatePayload): void => {
        const { experimentUUID: UUID, timeRange } = payload;

        const update = {
            UUID,
            viewRange: timeRange
        } as ExperimentTimeRangeData;

        this.updateExperimentTimeRangeData(update);
    };

    public static updateSelectionRange = (payload: TimeRangeUpdatePayload): void => {
        const { experimentUUID: UUID, timeRange } = payload;

        const update = {
            UUID,
            selectionRange: timeRange
        } as ExperimentTimeRangeData;

        this.updateExperimentTimeRangeData(update);
    };

    public static updateAbsoluteRange = (experiment: Experiment): void => {
        if (!experiment) {
            return;
        }

        const { UUID, start, end } = experiment;

        const update = {
            UUID,
            absoluteRange: {
                start,
                end
            }
        } as ExperimentTimeRangeData;

        this.updateExperimentTimeRangeData(update);
    };

    /**
     * Updates the data stored in experimentDataMap.  Works similar to setState() where
     * you only input the data to change and the existing values persist.
     * @param data Partial data of Experiment Time Range Data.
     */
    private static updateExperimentTimeRangeData = (data: ExperimentTimeRangeData): void => {
        const map = this._experimentDataMap;
        const id = data.UUID;
        const existingData = map.get(id) || {};
        const newData = {
            ...existingData,
            ...data
        };
        map.set(id, newData);

        // If the experiment is currently displayed, we need to render it
        if (id === this._activeData?.UUID) {
            this.setActiveExperiment(newData);
        }
    };

    public static setActiveExperiment(data?: ExperimentTimeRangeData): void {
        this._activeData = data;
    }

    public static delete = (experiment: Experiment | string): void => {
        const id = typeof experiment === 'string' ? experiment : experiment.UUID;
        this._experimentDataMap.delete(id);
    };

    public static get(UUID: string): ExperimentTimeRangeData | undefined {
        return this._experimentDataMap.get(UUID);
    }

    public static set(data: ExperimentTimeRangeData): void {
        this._experimentDataMap.set(data.UUID, data);
    }

    public static clear(): void {
        this._experimentDataMap.clear();
    }

    public static get activeData(): ExperimentTimeRangeData | undefined {
        return this._activeData;
    }

    public static get experimentDataMap(): Map<string, ExperimentTimeRangeData> {
        return this._experimentDataMap;
    }
}
