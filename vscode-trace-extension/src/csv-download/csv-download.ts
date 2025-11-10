import { TimeRangeDataMap } from "traceviewer-react-components/lib/components/utils/time-range-data-map";
import * as vscode from 'vscode'
import * as fs from 'fs';
import * as path from 'path';
import { getTspClient } from "../utils/backend-tsp-client-provider";
import { QueryHelper } from "tsp-typescript-client";

export const exportCSV = async (outputID: string) => {
    
    // Helper FUnctions
    const REQUEST_SIZE = 1000;
    const WRITE_HIGH_WATERMARK = 1 << 20; // 1 MiB

    function csvEscape(value: unknown): string {
        // Always quote to keep logic simple; double any embedded quotes
        const s = (value ?? '').toString().replace(/"/g, '""');
        return `"${s}"`;
    }

    function createBatchWriter(filePath: string) {
        const stream = fs.createWriteStream(filePath, { flags: 'w', highWaterMark: WRITE_HIGH_WATERMARK });

        const write = (data: string | Buffer) =>
            new Promise<void>((resolve, reject) => {
                const ok = stream.write(data);
                if (ok) return resolve();
                stream.once('drain', resolve);
                stream.once('error', reject);
            });

        const end = () =>
            new Promise<void>((resolve, reject) => {
                stream.end();
                stream.once('finish', resolve);
                stream.once('error', reject);
            });

        return { write, end };
    }
    const { activeData } = TimeRangeDataMap;
    if (!activeData) {
        vscode.window.showErrorMessage('No trace is open or selected.');
        return;
    }

    const { absoluteRange, selectionRange } = activeData;
    if (!absoluteRange || !selectionRange) {
        vscode.window.showErrorMessage('No selection range found.');
        return;
    }

    const uri = await vscode.window.showSaveDialog({
        title: 'Save CSV File',
        defaultUri: vscode.Uri.file(
            path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '', 'data.csv')
        ),
        filters: { 'CSV Files': ['csv'] },
        saveLabel: 'Save CSV',
    });
    if (!uri) {
        vscode.window.showInformationMessage('Save cancelled.');
        return;
    }

    const tsp = getTspClient();

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting CSV…', cancellable: true },
        async (progress, token) => {
            const measureStart = Date.now();

            try {
                // 1) Resolve headers
                progress.report({ message: 'Fetching column headers…', increment: 2 });
                // todo fix
                const headersResp = await tsp.fetchTableColumns(activeData.UUID, outputID, QueryHelper.query());
                const headersModel = headersResp.getModel()?.model;
                if (!headersModel) {
                    vscode.window.showErrorMessage('Failed to fetch table columns.');
                    return;
                }
                const headerNames: string[] = headersModel.map((c: { name: string }) => c.name);

                // 2) Compute absolute timestamps for selection
                const t1 = BigInt(absoluteRange.start) + BigInt(selectionRange.start);
                const t2 = BigInt(absoluteRange.start) + BigInt(selectionRange.end);

                // Normalize
                const START_TIME = t1 < t2 ? t1 : t2;
                const END_TIME = t1 < t2 ? t2 : t1;

                // 3) Resolve start/end indices by time (like your POC)
                progress.report({ message: 'Resolving table indices…', increment: 2 });

                const indexBody = (requestedTime: bigint) => ({
                    requested_times: [requestedTime],
                    requested_table_count: 1,
                });

                const t1Req = await tsp.fetchTableLines(
                    activeData.UUID,
                    outputID,
                    QueryHelper.query(indexBody(START_TIME))
                );
                const t2Req = await tsp.fetchTableLines(
                    activeData.UUID,
                    outputID,
                    QueryHelper.query(indexBody(END_TIME))
                );

                const startIndex: number | undefined = t1Req.getModel()?.model?.lowIndex;
                const endIndex: number | undefined = t2Req.getModel()?.model?.lowIndex;

                if (startIndex === undefined || endIndex === undefined) {
                    vscode.window.showErrorMessage('Failed to locate table indices for the selected range.');
                    return;
                }

                const totalRows = Math.max(0, endIndex - startIndex);
                if (totalRows === 0) {
                    // Still write header-only CSV to honor user’s save request
                    const writer = createBatchWriter(uri.fsPath);
                    await writer.write(headerNames.map(csvEscape).join(',') + '\n');
                    await writer.end();
                    vscode.window.showInformationMessage(`No rows in selection. Wrote headers to ${uri.fsPath}`);
                    return;
                }

                // 4) Prepare writer and write header
                const writer = createBatchWriter(uri.fsPath);
                await writer.write(headerNames.map(csvEscape).join(',') + '\n');

                // 5) Batching + pipelined fetching (like the POC)
                let rowsLeft = totalRows;
                let nextIndex = startIndex;
                let nextCount = Math.min(REQUEST_SIZE, rowsLeft);

                const makeLinesBody = (index: number, count: number) => ({
                    requested_table_column_ids: headerNames.map((_, i) => i),
                    requested_table_count: count,
                    requested_table_index: index,
                    table_search_expressions: {},
                });

                // Prime first request
                let ongoing = tsp.fetchTableLines(activeData.UUID, outputID, QueryHelper.query(makeLinesBody(nextIndex, nextCount)));

                const writeLines = async (lines: any[]) => {
                    const lineStrings: string[] = [];
                    for (const line of lines) {
                        const cells = (line.cells ?? []).map((cell: { content: unknown }) => csvEscape(cell?.content));
                        lineStrings.push(cells.join(','));
                    }
                    if (lineStrings.length > 0) {
                        await writer.write(lineStrings.join('\n') + '\n');
                    }
                };

                let processed = 0;
                progress.report({ message: `Exporting ${totalRows.toLocaleString()} rows…`, increment: 2 });

                while (rowsLeft > 0 && !token.isCancellationRequested) {
                    // Advance iterators for the *next* request before awaiting current
                    nextIndex += nextCount;
                    rowsLeft -= nextCount;
                    nextCount = Math.min(REQUEST_SIZE, rowsLeft);

                    // Await current, kick off next
                    const currentModel = await ongoing;
                    const currentLines = currentModel.getModel()?.model?.lines ?? [];

                    // Start next request (or a resolved empty promise when done)
                    ongoing =
                        nextCount > 0
                            ? tsp.fetchTableLines(
                                activeData.UUID,
                                outputID,
                                QueryHelper.query(makeLinesBody(nextIndex, nextCount))
                            )
                            : Promise.resolve({ getModel: () => ({ model: { lines: [] } }) } as any);

                    await writeLines(currentLines);
                    processed += currentLines.length;

                    // Progress update (cap increments to avoid >100%)
                    const pct = 10 + Math.min(80, Math.floor((processed / totalRows) * 80));
                    progress.report({
                        message: `Exported ${processed.toLocaleString()} / ${totalRows.toLocaleString()}…`,
                        increment: pct - (progress as any)._lastPct
                    });
                    (progress as any)._lastPct = pct;

                }

                if (token.isCancellationRequested) {
                    await writer.end();
                    vscode.window.showWarningMessage('CSV export cancelled. Partial file may be present.');
                    return;
                }

                // Flush the final pending request
                const finalModel = await ongoing;
                const finalLines = finalModel.getModel()?.model?.lines ?? [];
                if (finalLines.length) {
                    await writeLines(finalLines);
                    processed += finalLines.length;
                }

                await writer.end();

                const elapsedMs = Date.now() - measureStart;
                vscode.window.showInformationMessage(
                    `CSV export complete: ${processed.toLocaleString()} rows → ${uri.fsPath} in ${(elapsedMs / 1000).toFixed(1)}s (batch=${REQUEST_SIZE}).`
                );
            } catch (err: any) {
                console.error(err);
                vscode.window.showErrorMessage(`CSV export failed: ${err?.message ?? err}`);
            }
        }
    );
}

export const queryForOutputType = async () => {
    const tsp = getTspClient();
    const { activeData } = TimeRangeDataMap;
    if (!activeData) {
        console.log('no active data');
        return;
    }
    const outputsResponse = await tsp.experimentOutputs(activeData?.UUID);
    console.dir(outputsResponse);
    const outputDescriptors = outputsResponse.getModel();
    if (!outputDescriptors || outputDescriptors.length <= 0) {
        console.log('no outputs');
        return;
    }
    const tables = outputDescriptors?.filter(output => output.type === 'TABLE');
    const items = tables.map(descriptor => ({ label: descriptor.name, id: descriptor.id }));
    const selection = await vscode.window.showQuickPick(items, {
        title: 'Select a table output',
        placeHolder: 'pick one',
        matchOnDescription: true,
        canPickMany: false,
    })

    return selection?.id;

}
