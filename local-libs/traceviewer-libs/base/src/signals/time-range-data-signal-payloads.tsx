import { ITimeRange, TimeRange } from '../utils/time-range';

import { createNormalizer } from 'tsp-typescript-client/lib/protocol/serialization';

export const TimeRangeUpdatePayload = createNormalizer<TimeRangeUpdatePayload>({
    timeRange: ITimeRange
});

export interface TimeRangeUpdatePayload {
    experimentUUID: string;
    timeRange?: ITimeRange;
}
