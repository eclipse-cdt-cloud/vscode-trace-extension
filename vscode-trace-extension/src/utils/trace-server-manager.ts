/***************************************************************************************
 * Copyright (c) 2023 BlackBerry Limited and others.
 *
 * Licensed under the MIT license. See LICENSE file in the project root for details.
 ***************************************************************************************/
export interface TraceServerContributor {
    startServer: () => Promise<void>;
    stopServer?: () => Promise<void>;
    isApplicable?: (pathToTrace: string) => boolean;
}

export class TraceServerManager {
    private traceServersContributors: TraceServerContributor[] = [];
    private isManagerDisposed = false;
    private indexOfTraceServerContributor = -1;

    /**
     * Add new contributor (groups of functions that runs on adopting extension to start/stop its trace server) to the manager
     *
     * @param contributor Contributor object that contains startServer, stopServer handlers and a traceValidator
     */
    addTraceServerContributor(contributor: TraceServerContributor): void {
        if (!this.isDisposed()) {
            this.traceServersContributors.push(contributor);
        }
    }

    /**
     * Look for appropriate startServer handler and execute it, also assign the index of current contributor
     *
     * @param pathToTrace path to trace file
     */
    async startServer(pathToTrace: string): Promise<void> {
        this.indexOfTraceServerContributor = -1;
        if (!this.isDisposed()) {
            // find an adopting extension that has successfully validated the trace
            let index = this.traceServersContributors.findIndex(traceServerContributor =>
                traceServerContributor.isApplicable?.(pathToTrace)
            );
            if (index === -1) {
                // find an adopting extension with no validator
                index = this.traceServersContributors.findIndex(
                    traceServerContributor => !traceServerContributor.isApplicable
                );
            }
            // if found
            if (index !== -1) {
                await this.traceServersContributors[index].startServer();
                this.indexOfTraceServerContributor = index;
                return;
            }
        }
    }

    /**
     * execute server stopping handler
     */
    async stopServer(): Promise<void> {
        if (this.indexOfTraceServerContributor !== -1) {
            await this.traceServersContributors[this.indexOfTraceServerContributor].stopServer?.();
            this.indexOfTraceServerContributor = -1;
        }
    }

    /**
     * remove all contributors, set manager to disposed status
     */
    dispose(): void {
        if (!this.isDisposed()) {
            this.traceServersContributors = [];
            this.isManagerDisposed = true;
            this.indexOfTraceServerContributor = -1;
        }
    }

    /**
     * whether manager is disposed
     *
     * @returns disposed status
     */
    isDisposed(): boolean {
        return this.isManagerDisposed;
    }
}
