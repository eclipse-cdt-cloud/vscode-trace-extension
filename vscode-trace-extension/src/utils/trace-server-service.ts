import { ChildProcess, spawn } from 'child_process';
import treeKill from 'tree-kill';

// TODO: Finish implementing this class based on [1,2] right below.
// [1] theia-trace-extension/theia-extensions/viewer-prototype/src/node/trace-server/trace-server-service.ts
// [2] https://nodejs.org/api/child_process.html
export class TraceServerService {

    private server: ChildProcess;

    async startTraceServer(): Promise<void> {
        // TODO: Revisit the 2 children being detached only to support the process.kill call below.
        this.server = spawn('/usr/bin/tracecompass-server', { detached: true }); // Configure path!
    }

    async stopTraceServer(): Promise<void> {
        await new Promise<void>(() => {
            treeKill(this.server.pid);
        });
    }

    stopTraceServerNow(): void {
        // TODO: Likely works only on Linux; kills both server processes (child, sub-child).
        process.kill(-this.server.pid); // Known as "the PID hack"; treeKill failed on Exit.
    }
}
