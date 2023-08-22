import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { Trace } from 'tsp-typescript-client/lib/models/trace';

export function convertSignalExperiment(signalExperiment: Experiment): Experiment {
    const experiment: Experiment = {
        name: signalExperiment.name,
        UUID: signalExperiment.UUID,
        indexingStatus: signalExperiment.indexingStatus,
        end: BigInt(signalExperiment.end),
        start: BigInt(signalExperiment.start),
        nbEvents: signalExperiment.nbEvents,
        traces: convertSignalTraces(signalExperiment)
    };
    return experiment;
}

export function convertSignalTraces(signalExperiment: Experiment): Trace[] {
    const traces: Trace[] = [];

    signalExperiment.traces.forEach(t => {
        const trace: Trace = {
            name: t.name,
            UUID: t.UUID,
            end: BigInt(t.end),
            start: BigInt(t.start),
            indexingStatus: t.indexingStatus,
            nbEvents: t.nbEvents,
            path: t.path
        };
        traces.push(trace);
    });
    return traces;
}
