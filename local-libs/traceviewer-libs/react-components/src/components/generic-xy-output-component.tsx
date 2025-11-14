/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { flushSync } from 'react-dom';
import { Line, Scatter, Bar } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { ResponseStatus } from 'tsp-typescript-client/lib/models/response/responses';
import { AbstractOutputProps } from './abstract-output-component';
import { AbstractTreeOutputComponent, AbstractTreeOutputState } from './abstract-tree-output-component';
import { Entry, QueryHelper, XYSeries } from 'tsp-typescript-client';
import { validateNumArray } from './utils/filter-tree/utils';
import {
    isCategorySampling,
    isRangeSampling,
    isTimestampSampling,
    Sampling
} from 'tsp-typescript-client/lib/models/sampling';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { EntryTree } from './utils/filter-tree/entry-tree';
import { TimeRange } from 'traceviewer-base/src/utils/time-range';
import { BIMath } from 'timeline-chart/lib/bigint-utils';
import { debounce } from 'lodash';

import {
    applyYAxis,
    buildTreeStateFromModel,
    ColorAllocator,
    getTimeForX as timeForX,
    zoomRange,
    panRange,
    setSpinnerVisible,
    rowsToCsv,
    computeYRange
} from './utils/xy-shared';

interface XYDataset {
    id?: number | string;
    label: string;
    type: 'bar' | 'line' | 'scatter';
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    borderWidth?: number;
    pointRadius?: number;
    pointHoverRadius?: number;
    pointHitRadius?: number;
    barPercentage?: number;
    categoryPercentage?: number;
    yAxisID?: string;
    stack?: string;
    fill?: boolean;
    showLine?: boolean;
}

interface GenericXYData {
    labels: string[]; // Note: Array<string> is the same as string[]
    labelIndices: number[];
    datasets: XYDataset[];
}

interface GenericXYState extends AbstractTreeOutputState {
    outputStatus: ResponseStatus;
    columns: Array<{ title: string; sortable?: boolean }>;
    xyData: GenericXYData;
    xyTree: Entry[];
    defaultOrderedIds: number[];
    checkedSeries: number[];
    collapsedNodes: number[];
    allMax: number;
    allMin: number;
    cursor: string;
}

interface GenericXYProps extends AbstractOutputProps {
    formatX?: (x: number | bigint | string) => string;
    formatY?: (y: number) => string;
    stacked?: boolean;
}

enum ChartMode {
    BAR = 'bar',
    LINE = 'line',
    SCATTER = 'scatter'
}

/**
 * Generic XY chart with possible time or categorical X-axis.
 * - All chart types (Bar, Line, Scatter) are rendered using react-chartjs-2 for unified behavior.
 * - One unified custom HTML tooltip used for all modes so UI matches.
 */
export class GenericXYOutputComponent extends AbstractTreeOutputComponent<GenericXYProps, GenericXYState> {
    private readonly chartRef = React.createRef<any>();
    private readonly yAxisRef: any;
    private readonly divRef = React.createRef<HTMLDivElement>();

    private readonly margin = { top: 15, right: 0, bottom: 6, left: this.getYAxisWidth() };

    private mouseIsDown = false;
    private isPanning = false;
    private isSelecting = false;
    private positionXMove = 0;
    private startPositionMouseRightClick = BigInt(0);

    private resolution = 0;
    private mousePanningStart = BigInt(0);

    private mode: ChartMode = ChartMode.BAR;
    private isTimeAxis = false;

    private readonly ZOOM_IN_RATE = 0.8;
    private readonly ZOOM_OUT_RATE = 1.25;

    // -1: None, 0: Left, 1: Middle, 2: Right
    private clickedMouseButton = -1;

    private readonly colors = new ColorAllocator();

    private readonly _debouncedUpdateXY = debounce(() => this.updateXY(), 500);

    constructor(props: GenericXYProps) {
        super(props);
        this.yAxisRef = React.createRef();
        this.state = {
            outputStatus: ResponseStatus.RUNNING,
            xyTree: [],
            defaultOrderedIds: [],
            checkedSeries: validateNumArray(this.props.persistChartState?.checkedSeries)
                ? (this.props.persistChartState.checkedSeries as number[])
                : [],
            collapsedNodes: validateNumArray(this.props.persistChartState?.collapsedNodes)
                ? (this.props.persistChartState.collapsedNodes as number[])
                : [],
            xyData: { labels: [], datasets: [], labelIndices: [] },
            columns: [{ title: 'Name', sortable: true }],
            allMax: 0,
            allMin: 0,
            cursor: 'default',
            showTree: true
        };

        this.addPinViewOptions(() => ({
            checkedSeries: this.state.checkedSeries,
            collapsedNodes: this.state.collapsedNodes
        }));
        this.addOptions('Export table to CSV...', () => this.exportOutput());
    }

    private readonly onToggleCollapse = (id: number) => {
        const collapsed = new Set(this.state.collapsedNodes);
        if (collapsed.has(id)) collapsed.delete(id);
        else collapsed.add(id);
        this.setState({ collapsedNodes: Array.from(collapsed) });
    };

    private readonly onOrderChange = (ids: number[]) => {
        const ordered = this.state.xyTree.slice().sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        this.setState({ xyTree: ordered });
    };

    private readonly onOrderReset = () => {
        this.onOrderChange(this.state.defaultOrderedIds);
    };

    private readonly onToggleCheck = (ids: number[]) => {
        const checked = [...this.state.checkedSeries];
        ids.forEach(id => {
            const i = checked.indexOf(id);
            if (i >= 0) checked.splice(i, 1);
            else checked.push(id);
        });
        this.setState({ checkedSeries: checked }, () => {
            if (this.getChartWidth() > 0) this._debouncedUpdateXY();
        });
    };

    renderTree(): React.ReactNode | undefined {
        return this.state.xyTree.length ? (
            <div className="scrollable" style={{ height: this.props.style.height }}>
                <EntryTree
                    entries={this.state.xyTree}
                    showCheckboxes={true}
                    showPinIcons={false}
                    collapsedNodes={this.state.collapsedNodes}
                    checkedSeries={this.state.checkedSeries}
                    onToggleCheck={this.onToggleCheck}
                    onToggleCollapse={this.onToggleCollapse}
                    onOrderChange={this.onOrderChange}
                    onOrderReset={this.onOrderReset}
                    headers={this.state.columns}
                />
            </div>
        ) : undefined;
    }

    renderYAxis(): React.ReactNode {
        const chartHeight = parseInt(String(this.props.style.height), 10);
        let yMin = this.state.allMin;
        let yMax = this.state.allMax;
        if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
            yMin = 0;
            yMax = 1;
        }

        applyYAxis(this.yAxisRef, chartHeight, this.margin.top, this.margin.bottom, yMin, yMax);

        const yTransform = `translate(${this.margin.left},0)`;
        return (
            <svg height={chartHeight} width={this.margin.left}>
                <g className="y-axis" ref={this.yAxisRef as any} transform={yTransform} />
            </svg>
        );
    }

    async fetchTree(): Promise<ResponseStatus> {
        setSpinnerVisible(this.getOutputComponentDomId(), true);
        const parameters = QueryHelper.timeRangeQuery(this.props.range.getStart(), this.props.range.getEnd());
        const rsp = await this.props.tspClient.fetchGenericXYTree(
            this.props.traceId,
            this.props.outputDescriptor.id,
            parameters
        );
        const treeResponse = rsp.getModel();
        if (rsp.isOk() && treeResponse) {
            if (treeResponse.model) {
                const built = buildTreeStateFromModel(treeResponse.model);
                this.setState(
                    {
                        outputStatus: treeResponse.status,
                        xyTree: built.xyTree,
                        defaultOrderedIds: built.defaultOrderedIds,
                        collapsedNodes: built.collapsedNodes,
                        checkedSeries: built.checkedSeries,
                        columns: built.columns as any
                    },
                    () => {
                        this._debouncedUpdateXY();
                    }
                );
            } else {
                this.setState({ outputStatus: treeResponse.status });
            }
            setSpinnerVisible(this.getOutputComponentDomId(), false);
            return treeResponse.status;
        }
        this.setState({ outputStatus: ResponseStatus.FAILED });
        setSpinnerVisible(this.getOutputComponentDomId(), false);
        return ResponseStatus.FAILED;
    }

    resultsAreEmpty(): boolean {
        return this.state.xyTree.length === 0;
    }

    private computeDesiredSampleNb(): number {
        // TODO: Currently the number of samples is calculated only for bars.
        // Modification is needed in the tsp to send display type in fetchTree
        // endpoint, otherwise the display type is unknown here.
        const plotW = Math.max(1, this.getChartWidth());
        const dpr = window.devicePixelRatio || 1;
        const seriesPerGroup = Math.max(1, this.state.checkedSeries.length);
        return this.computeDesiredSampleNbBar(plotW, dpr, seriesPerGroup);
    }

    private computeDesiredSampleNbBar(
        plotWidthCss: number,
        dpr: number,
        seriesPerGroup: number,
        { minBarPx = 3, intraGapPx = 1, interGroupGapPx = 4, quantStep = 5, max = 50, min = 5 } = {}
    ): number {
        const px = Math.max(1, plotWidthCss) * Math.max(1, dpr || 1);
        const perGroup = Math.max(1, seriesPerGroup);
        const minGroupPx = Math.max(8, perGroup * minBarPx + (perGroup - 1) * intraGapPx + interGroupGapPx);
        const rough = Math.floor(px / Math.max(1, minGroupPx));
        const quantize = (n: number) => Math.max(quantStep, Math.floor(n / quantStep) * quantStep);
        return Math.max(min, Math.min(quantize(rough), max));
    }

    private async updateXY(): Promise<void> {
        if (!this.props.viewRange || this.props.viewRange.getEnd() <= this.props.viewRange.getStart()) {
            return;
        }

        let start = BigInt(0);
        let end = BigInt(0);
        if (this.props.viewRange) {
            start = this.props.viewRange.getStart();
            end = this.props.viewRange.getEnd();
        }

        const params = QueryHelper.selectionTimeRangeQuery(
            start,
            end,
            this.computeDesiredSampleNb(),
            this.state.checkedSeries,
            undefined,
            true
        );

        const rsp = await this.props.tspClient.fetchGenericXY(
            this.props.traceId,
            this.props.outputDescriptor.id,
            params
        );
        const model = rsp.getModel();

        if (!(rsp.isOk() && model?.model?.series)) {
            this.setState({ outputStatus: ResponseStatus.FAILED });
            return;
        }

        const series = model.model.series;
        if (!series.length) {
            flushSync(() =>
                this.setState({
                    xyData: { labels: [], datasets: [], labelIndices: [] },
                    outputStatus: model.status ?? ResponseStatus.COMPLETED
                })
            );
            this.calculateYRange();
            return;
        }

        const style = (series[0] as any)?.style?.values?.['series-type'] as string | undefined;
        const st = style?.toLowerCase();
        this.isTimeAxis = !!series[0].xValues;
        this.mode = st === 'scatter' ? ChartMode.SCATTER : st === 'line' ? ChartMode.LINE : ChartMode.BAR;

        const xy = this.buildXYData(series, this.mode);
        flushSync(() => this.setState({ xyData: xy, outputStatus: model.status ?? ResponseStatus.COMPLETED }));
        this.calculateYRange();
    }

    private buildXYData(seriesObj: XYSeries[], mode: ChartMode): GenericXYData {
        if (!seriesObj.length) {
            return { labels: [], labelIndices: [], datasets: [] };
        }

        if (mode === ChartMode.BAR) {
            return this.buildBarChartData(seriesObj);
        } else {
            return this.buildLineOrScatterChartData(seriesObj, mode);
        }
    }

    private buildBarChartData(seriesObj: XYSeries[]): GenericXYData {
        const xValues = seriesObj[0].xValues ?? seriesObj[0].xRanges ?? seriesObj[0].xCategories;
        const unit = seriesObj[0]?.xValuesDescription?.unit || '';
        const labels = this.buildLabels(xValues as Sampling, unit);
        const datasets: GenericXYData['datasets'] = seriesObj.map(s => {
            const color = this.colors.get(s.seriesName);
            return {
                label: s.seriesName,
                type: 'bar',
                data: s.yValues as number[],
                backgroundColor: color,
                borderColor: color
            };
        });

        const labelIndices = Array.from({ length: labels.length }, (_, i) => i);
        return { labels, labelIndices, datasets };
    }

    private buildLineOrScatterChartData(seriesObj: XYSeries[], mode: ChartMode): GenericXYData {
        const xValues = seriesObj[0].xValues ?? seriesObj[0].xRanges ?? seriesObj[0].xCategories;
        const unit = seriesObj[0]?.xValuesDescription?.unit || '';
        const labels = this.buildLabels(xValues as Sampling, unit);

        const datasets: GenericXYData['datasets'] = seriesObj.map(s => {
            const color = this.colors.get(s.seriesName);
            return {
                label: s.seriesName,
                // Use 'line' engine for both line and scatter-on-time/category
                type: 'line',
                data: s.yValues,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 2,
                pointRadius: mode === ChartMode.SCATTER ? 3 : 0,
                pointHoverRadius: mode === ChartMode.SCATTER ? 3 : 0,
                showLine: mode === ChartMode.LINE,
                fill: false
            };
        });

        const labelIndices = Array.from({ length: labels.length }, (_, i) => i);
        return { labels, labelIndices, datasets };
    }

    private buildLabels(xValues: Sampling, unit: string): string[] {
        if (isRangeSampling(xValues)) {
            return xValues.map(range => `[${range.start} ${unit}, ${range.end} ${unit}]`);
        } else if (isCategorySampling(xValues)) {
            return xValues.map(val => `${val} ${unit}`);
        } else if (isTimestampSampling(xValues)) {
            const offset = this.props.viewRange.getOffset() ?? BigInt(0);
            return xValues.map(val => {
                const relativeTimeStamp = val - offset;
                if (this.props.unitController.numberTranslator) {
                    return `${this.props.unitController.numberTranslator(relativeTimeStamp)} s`;
                }
                return String(val);
            });
        }
        return (xValues as any[]).map(v => String(v));
    }

    private exportOutput() {
        const csv = rowsToCsv(this.state.columns as any, this.state.xyTree);
        signalManager().emit('SAVE_AS_CSV', this.props.traceId, csv);
    }

    private calculateYRange() {
        const ds = this.state.xyData?.datasets ?? [];
        if (!ds.length) {
            this.setState({ allMin: 0, allMax: 1 });
            return;
        }
        const first = ds[0]?.data as any[];
        const isObjData = Array.isArray(first) && first.length > 0 && typeof first[0] === 'object';
        const { min, max } = computeYRange(ds as any, isObjData);
        this.setState({ allMax: max, allMin: min });
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.waitAnalysisCompletion();
    }

    componentDidUpdate(prevProps: GenericXYProps, prevState: GenericXYState): void {
        const sizeChanged =
            prevProps.outputWidth !== this.props.outputWidth ||
            prevProps.style.height !== this.props.style.height ||
            prevProps.style.chartOffset !== this.props.style.chartOffset ||
            prevState.showTree !== this.state.showTree;

        const viewChanged =
            prevProps.viewRange.getStart() !== this.props.viewRange.getStart() ||
            prevProps.viewRange.getEnd() !== this.props.viewRange.getEnd();

        const checksChanged = prevState.checkedSeries !== this.state.checkedSeries;

        if (sizeChanged || viewChanged || checksChanged) {
            if (this.getChartWidth() > 0) this._debouncedUpdateXY();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        this._debouncedUpdateXY.cancel();
    }

    private computeAllYZeroForReact(): boolean {
        const datasets = (this.state.xyData?.datasets ?? []) as any[];
        if (datasets.length === 0) return false;
        return datasets.every(ds => {
            const data = Array.isArray(ds.data) ? ds.data : [];
            if (!data.length) return false;
            const first = (data as any[])[0];
            const isPoint = typeof first === 'object' && first !== undefined && 'y' in first;
            if (isPoint) return (data as any[]).every((pt: any) => Number(pt?.y) === 0);
            return (data as any[]).every((v: any) => Number(v) === 0);
        });
    }

    private makeChartOptions(allYZero: boolean): ChartOptions {
        const yTickFix = allYZero ? { min: 0, suggestedMax: 1, beginAtZero: true } : { beginAtZero: true };

        return {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 0,
                    right: 0,
                    top: this.margin.top,
                    bottom: this.margin.bottom
                }
            },
            legend: { display: false },
            tooltips: { enabled: false },
            hover: { mode: 'nearest', intersect: false },
            elements: { line: { fill: false }, point: { radius: 0, hoverRadius: 0, hitRadius: 0 } },
            plugins: { filler: { propagate: false } } as any,
            scales: {
                xAxes: [
                    {
                        type: 'category',
                        position: 'bottom',
                        display: false,
                        gridLines: { display: false, drawBorder: false, drawTicks: false },
                        ticks: {
                            display: false
                        }
                    }
                ],
                yAxes: [
                    {
                        display: false,
                        gridLines: { display: false, drawBorder: false, drawTicks: false },
                        ticks: yTickFix as any
                    }
                ]
            } as any
        };
    }

    private chooseReactChart(): JSX.Element {
        const allYZero = this.computeAllYZeroForReact();
        const options = this.makeChartOptions(allYZero);

        const data = {
            labels: (this.state.xyData.labels ?? []).map(v => String(v)),
            datasets: this.state.xyData.datasets
        };

        const chartProps = {
            data: data,
            height: parseInt(String(this.props.style.height)),
            options: options,
            ref: this.chartRef
        };

        switch (this.mode) {
            case ChartMode.BAR:
                return <Bar {...chartProps} />;
            case ChartMode.SCATTER:
                return <Scatter {...chartProps} />;
            case ChartMode.LINE:
            default:
                return <Line {...chartProps} />;
        }
    }

    private getPlotGeom(): { left: number; width: number } {
        const inst = this.chartRef.current?.chartInstance;
        const ca = inst?.chartArea;

        // If the chart instance or its chartArea isn't available,
        // fall back to the full width of the component.
        if (!ca) {
            return { left: 0, width: Math.max(1, this.getChartWidth()) };
        }

        const left = ca.left ?? 0;
        const right = ca.right ?? Math.max(1, this.getChartWidth());
        const width = Math.max(1, right - left);
        return { left, width };
    }

    private endSelection = (_e: MouseEvent): void => {
        if (this.clickedMouseButton === 2) {
            // Right-click
            if (this.isTimeAxis) {
                // zooming is disabled for non-time x-axis
                const newStart = this.startPositionMouseRightClick;
                const newEnd = this.getTimeForX(this.positionXMove);
                this.updateViewRange(newStart, newEnd);
            }
        }
        this.mouseIsDown = false;
        this.isSelecting = false;
        this.isPanning = false;
        this.clickedMouseButton = -1; // None
        this.setState({ cursor: 'default' });
        document.removeEventListener('mouseup', this.endSelection);
    };

    private onMouseDown = (ev: React.MouseEvent<HTMLDivElement, MouseEvent>): void => {
        this.mouseIsDown = true;
        this.clickedMouseButton = ev.button;
        const startTime = this.getTimeForX(ev.nativeEvent.offsetX);
        if (this.clickedMouseButton === 2) {
            // Right-click
            if (this.isTimeAxis) {
                // zooming is disabled for non-time x-axis
                this.isSelecting = false;
                this.setState({ cursor: 'col-resize' });
                this.startPositionMouseRightClick = startTime;
            }
        } else {
            if (
                (ev.ctrlKey && !ev.shiftKey) ||
                (!(ev.shiftKey && ev.ctrlKey) && this.clickedMouseButton === 1) // Middle-click
            ) {
                const chartWidth = this.getChartWidth();
                const viewRangeLength = Number(this.props.unitController.viewRangeLength);

                if (chartWidth > 0 && viewRangeLength > 0) {
                    this.resolution = chartWidth / viewRangeLength;
                    this.mousePanningStart =
                        this.props.unitController.viewRange.start +
                        BIMath.round(ev.nativeEvent.clientX / this.resolution);
                } else {
                    this.resolution = 0;
                }
                this.isPanning = true;
                this.setState({ cursor: 'grabbing' });
            }
            // TODO: Left-click selection feature is not implemented yet.
            this.onMouseMove(ev);
        }
        document.addEventListener('mouseup', this.endSelection);
    };

    private onMouseMove = (ev: React.MouseEvent): void => {
        this.positionXMove = ev.nativeEvent.offsetX;
        if (this.mouseIsDown) {
            if (this.isPanning) this.panHorizontally(ev);
            else if (this.isSelecting) this.updateSelection();
            else this.forceUpdate();
        } else {
            this.tooltip();
        }
    };

    private onMouseLeave = (ev: React.MouseEvent): void => {
        const chartWidth = this.getChartWidth();
        this.positionXMove = Math.max(0, Math.min(ev.nativeEvent.offsetX, chartWidth));
        this.forceUpdate();
        if (this.mouseIsDown && this.clickedMouseButton !== 2) {
            // Not Right-click
            this.updateSelection();
        }
        this.closeTooltip?.();
    };

    private onWheel = (wheel: React.WheelEvent): void => {
        if (this.isTimeAxis) {
            if (wheel.shiftKey) {
                if (wheel.deltaY < 0) this.pan(true);
                else if (wheel.deltaY > 0) this.pan(false);
            } else if (wheel.ctrlKey) {
                if (wheel.deltaY < 0) this.zoom(true);
                else if (wheel.deltaY > 0) this.zoom(false);
            }
        }
    };

    private onKeyDown = (key: React.KeyboardEvent): void => {
        if (this.isTimeAxis) {
            switch (key.key) {
                case 'W':
                case 'w':
                case 'I':
                case 'i':
                    this.zoom(true);
                    break;
                case 'S':
                case 's':
                case 'K':
                case 'k':
                    this.zoom(false);
                    break;
                case 'A':
                case 'a':
                case 'J':
                case 'j':
                case 'ArrowLeft':
                    this.pan(true);
                    break;
                case 'D':
                case 'd':
                case 'L':
                case 'l':
                case 'ArrowRight':
                    this.pan(false);
                    break;
            }
        }
        switch (key.key) {
            case 'Control':
                if (!this.isSelecting && !this.isPanning) {
                    this.setState({ cursor: key.shiftKey ? 'default' : 'grabbing' });
                }
                break;
        }
    };

    private onKeyUp = (key: React.KeyboardEvent): void => {
        if (!this.isSelecting && !this.isPanning) {
            let cur = this.state.cursor ?? 'default';
            if (key.key === 'Shift') {
                cur = key.ctrlKey ? 'grabbing' : !this.mouseIsDown ? 'default' : cur;
            } else if (key.key === 'Control') {
                cur = key.shiftKey ? 'crosshair' : !this.mouseIsDown ? 'default' : cur;
            }
            this.setState({ cursor: cur });
        }
    };

    private panHorizontally(ev: React.MouseEvent) {
        if (this.isTimeAxis && this.resolution > 0) {
            const xNow = ev.nativeEvent.clientX;
            const newStartFloat = Number(this.mousePanningStart) - xNow / this.resolution;

            const min = BigInt(0);
            const max = this.props.unitController.absoluteRange - this.props.unitController.viewRangeLength;
            const start = BIMath.clamp(newStartFloat, min, max);
            const end = start + this.props.unitController.viewRangeLength;
            this.props.unitController.viewRange = { start, end };
        }
    }

    private updateSelection(): void {
        if (this.props.unitController.selectionRange) {
            const xStart = this.props.unitController.selectionRange.start;
            this.props.unitController.selectionRange = {
                start: xStart,
                end: this.getTimeForX(this.positionXMove)
            };
        }
    }

    renderChart(): React.ReactNode {
        const isEmpty =
            this.state.outputStatus === ResponseStatus.COMPLETED && (this.state.xyData?.datasets?.length ?? 0) === 0;

        if (isEmpty) {
            return <div className="chart-message">Select a checkbox to see analysis results</div>;
        }

        return (
            <div
                id={this.getOutputComponentDomId() + 'focusContainer'}
                className="xy-main"
                tabIndex={0}
                onKeyDown={e => this.onKeyDown(e)}
                onKeyUp={e => this.onKeyUp(e)}
                onWheel={e => this.onWheel(e)}
                onMouseMove={e => this.onMouseMove(e)}
                onContextMenu={e => e.preventDefault()}
                onMouseLeave={e => this.onMouseLeave(e)}
                onMouseDown={e => this.onMouseDown(e)}
                style={{ height: this.props.style.height, position: 'relative', cursor: this.state.cursor }}
                ref={this.divRef}
            >
                {this.chooseReactChart()}
                {this.state.outputStatus === ResponseStatus.RUNNING && (
                    <div className="analysis-running-overflow" style={{ width: this.getChartWidth() }}>
                        <div>
                            <span>Analysis running</span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    private tooltip(): void {
        const { datasets, labels } = this.state.xyData;
        if (!datasets?.length || !labels?.length) {
            this.closeTooltip?.();
            return;
        }

        interface Pt {
            label: string;
            color?: string;
            background?: string;
            value: string;
            _num?: number;
        }
        const points: Pt[] = [];
        const zerosRef = { count: 0 };

        const { width, left } = this.getPlotGeom();
        const xPlot = Math.max(0, Math.min(this.positionXMove - left, width));

        // Calculate the data index based on the mouse's relative position.
        const bins = labels.length;
        const binW = width / Math.max(1, bins);
        const index = Math.max(0, Math.min(bins - 1, Math.floor(xPlot / binW)));
        const rawLabel = labels[index];
        const title = this.props.formatX ? this.props.formatX(rawLabel) : String(rawLabel);

        datasets.forEach(ds => {
            const yVal = (ds.data as number[])[index];
            this.addTooltipPoint(points, zerosRef, ds, yVal);
        });

        points.sort((a, b) => (b._num ?? 0) - (a._num ?? 0));
        if (points.length || zerosRef.count > 0) {
            this.setTooltipContent?.(this.generateXYTooltip(title, points, zerosRef.count));
        } else {
            this.closeTooltip?.();
        }
    }

    /**
     * A helper to create a formatted data point and add it to the tooltip list,
     * or to increment the zero count if conditions are met.
     */
    private addTooltipPoint(
        points: Array<{ label: string; color?: string; background?: string; value: string; _num?: number }>,
        zerosRef: { count: number },
        dataset: GenericXYData['datasets'][0],
        yVal: number | undefined
    ): void {
        if (yVal === undefined || !Number.isFinite(yVal)) {
            return;
        }

        const rounded = Math.round(yVal * 100) / 100;

        // For charts with many series, don't show individual entries for zero values.
        if ((this.state.xyData.datasets?.length || 0) > 10 && rounded === 0) {
            zerosRef.count++;
            return;
        }

        const value = this.props.formatY ? this.props.formatY(rounded) : new Intl.NumberFormat().format(rounded);
        points.push({
            label: dataset.label,
            color: dataset.borderColor as string,
            background: dataset.backgroundColor as string,
            value,
            _num: rounded
        });
    }

    private generateXYTooltip = (
        title: string,
        points: Array<{ label: string; color?: string; background?: string; value: string }>,
        zeros: number
    ) => (
        <>
            <p style={{ margin: '0 0 5px 0' }}>{title}</p>
            <ul style={{ padding: 0 }}>
                {points.map((p, i) => (
                    <li key={i} style={{ listStyle: 'none', display: 'flex', marginBottom: 5 }}>
                        <div
                            style={{
                                height: 10,
                                width: 10,
                                margin: 'auto 0',
                                border: 'solid thin',
                                borderColor: p.color ?? '#666',
                                backgroundColor: p.background ?? p.color ?? '#666'
                            }}
                        />
                        <span style={{ marginLeft: 5 }}>
                            {p.label} {p.value}
                        </span>
                    </li>
                ))}
            </ul>
            {zeros > 0 && (
                <p style={{ marginBottom: 0 }}>
                    {zeros} other{zeros > 1 ? 's' : ''}: 0
                </p>
            )}
        </>
    );

    public setFocus(): void {
        this.divRef.current?.focus();
    }

    protected getOutputComponentDomId(): string {
        return this.props.traceId + this.props.outputDescriptor.id;
    }

    private getDisplayedRange(): TimeRange {
        return this.props.viewRange;
    }

    private getTimeForX(x: number): bigint {
        const chartWidth = this.getChartWidth();
        return timeForX(this.getDisplayedRange(), chartWidth === 0 ? 1 : chartWidth, x);
    }

    private updateViewRange(start: bigint, end: bigint): void {
        if (this.isTimeAxis) {
            const [s, e] = start < end ? [start, end] : [end, start];
            this.props.unitController.viewRange = { start: s, end: e };
        }
    }

    private getZoomTime(): bigint {
        return this.getTimeForX(this.positionXMove);
    }

    private zoom(isZoomIn: boolean): void {
        if (this.isTimeAxis) {
            if (this.props.unitController.viewRangeLength >= 1) {
                const vr = this.props.unitController.viewRange;
                const abs = this.props.unitController.absoluteRange;
                const center = this.getZoomTime();
                this.props.unitController.viewRange = zoomRange(
                    vr,
                    abs,
                    center,
                    isZoomIn,
                    this.ZOOM_IN_RATE,
                    this.ZOOM_OUT_RATE
                );
            }
        }
    }

    private pan(left: boolean): void {
        if (this.isTimeAxis) {
            const vr = this.props.unitController.viewRange;
            const abs = this.props.unitController.absoluteRange;
            this.props.unitController.viewRange = panRange(vr, abs, left);
        }
    }
}
