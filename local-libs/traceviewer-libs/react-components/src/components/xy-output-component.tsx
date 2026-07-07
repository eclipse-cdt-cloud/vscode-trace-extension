/* eslint-disable @typescript-eslint/no-explicit-any */
import { AbstractOutputProps } from './abstract-output-component';
import * as React from 'react';
import { ResponseStatus } from 'tsp-typescript-client/lib/models/response/responses';
import Chart = require('chart.js');
import { BIMath } from 'timeline-chart/lib/bigint-utils';
import { scaleLinear } from 'd3-scale';
import {
    AbstractXYOutputComponent,
    AbstractXYOutputState,
    FLAG_PAN_LEFT,
    FLAG_PAN_RIGHT,
    FLAG_ZOOM_IN,
    FLAG_ZOOM_OUT,
    MouseButton
} from './abstract-xy-output-component';
import { TimeRange } from 'traceviewer-base/lib/utils/time-range';
import { validateNumArray } from './utils/filter-tree/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faWaveSquare, faChartLine } from '@fortawesome/free-solid-svg-icons';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { Line } from 'react-chartjs-2';
import { computePeriodogram, formatPeriod } from './utils/frequency-utils';

type XYOutputState = AbstractXYOutputState & {
    /** When true, the chart shows the frequency/period spectrum instead of the time-domain XY plot. */
    frequencyMode: boolean;
    /** When true, the frequency plot's period (x) axis uses a logarithmic scale instead of linear. */
    xAxisLogScale: boolean;
};

export class XYOutputComponent extends AbstractXYOutputComponent<AbstractOutputProps, XYOutputState> {
    private mousePanningStart = BigInt(0);
    private resolution = 0;

    // Memoization for the (potentially expensive) periodogram computation.
    private freqCache?: { xyData: unknown; width: number; data: { datasets: any[] } };

    constructor(props: AbstractOutputProps) {
        super(props);
        this.state = {
            outputStatus: ResponseStatus.RUNNING,
            selectedSeriesId: [],
            xyTree: [],
            defaultOrderedIds: [],
            checkedSeries: validateNumArray(this.props.persistChartState?.checkedSeries)
                ? (this.props.persistChartState.checkedSeries as number[])
                : [],
            collapsedNodes: validateNumArray(this.props.persistChartState?.collapsedNodes)
                ? (this.props.persistChartState.collapsedNodes as number[])
                : [],
            xyData: {},
            columns: [{ title: 'Name', sortable: true }],
            allMax: 0,
            allMin: 0,
            cursor: 'default',
            showTree: true,
            frequencyMode: false,
            xAxisLogScale: false
        };
        this.addPinViewOptions(() => ({
            checkedSeries: this.state.checkedSeries,
            collapsedNodes: this.state.collapsedNodes
        }));
        this.addOptions('Export table to CSV...', () => this.exportOutput());
    }

    renderChart(): React.ReactNode {
        if (this.state.outputStatus === ResponseStatus.COMPLETED && this.state.xyData?.datasets?.length === 0) {
            return (
                <React.Fragment>
                    <div className="chart-message">Select a checkbox to see analysis results</div>
                </React.Fragment>
            );
        }
        return (
            <React.Fragment>
                {this.state.frequencyMode ? this.renderFrequencyChart() : this.renderXYChart()}
                {this.state.outputStatus === ResponseStatus.RUNNING && (
                    <div
                        id={this.props.traceId + this.props.outputDescriptor.id + 'focusContainer'}
                        className="analysis-running-overflow"
                        style={{ width: this.getChartWidth() }}
                    >
                        <div>
                            <FontAwesomeIcon icon={faSpinner} spin style={{ marginRight: '5px' }} />
                            <span>Analysis running</span>
                        </div>
                    </div>
                )}
            </React.Fragment>
        );
    }

    /**
     * The time-domain XY chart (line/scatter/bar) with all the mouse/keyboard
     * interactions for panning, zooming and selection.
     */
    private renderXYChart(): JSX.Element {
        return (
            <div
                id={this.props.traceId + this.props.outputDescriptor.id + 'focusContainer'}
                className="xy-main"
                tabIndex={0}
                onKeyDown={event => this.onKeyDown(event)}
                onKeyUp={event => this.onKeyUp(event)}
                onWheel={event => this.onWheel(event)}
                onMouseMove={event => this.onMouseMove(event)}
                onContextMenu={event => event.preventDefault()}
                onMouseLeave={event => this.onMouseLeave(event)}
                onMouseDown={event => this.onMouseDown(event)}
                style={{ height: this.props.style.height, position: 'relative', cursor: this.state.cursor }}
                ref={this.divRef}
            >
                {this.renderFrequencyToggle()}
                {this.isBarPlot ? this.drawD3Chart() : this.chooseChart()}
            </div>
        );
    }

    /**
     * Transparent corner button that toggles between the XY plot and the
     * frequency/period spectrum.
     */
    private renderFrequencyToggle(): JSX.Element {
        const active = this.state.frequencyMode;
        const label = active ? 'Show XY plot' : 'Show frequency (period) plot';
        return (
            <button
                type="button"
                className={`xy-chart-toggle xy-frequency-toggle${active ? ' active' : ''}`}
                title={label}
                aria-label={label}
                aria-pressed={active}
                onMouseDown={event => event.stopPropagation()}
                onMouseMove={event => event.stopPropagation()}
                onWheel={event => event.stopPropagation()}
                onClick={event => {
                    event.stopPropagation();
                    this.toggleFrequencyMode();
                }}
            >
                <FontAwesomeIcon icon={active ? faChartLine : faWaveSquare} />
            </button>
        );
    }

    private toggleFrequencyMode(): void {
        this.setState(prev => ({ frequencyMode: !prev.frequencyMode }));
    }

    /**
     * Transparent corner button (frequency mode only) that toggles the period
     * (x) axis between a linear and a logarithmic scale.
     */
    private renderScaleToggle(): JSX.Element {
        const log = this.state.xAxisLogScale;
        const label = `Switch to ${log ? 'linear' : 'logarithmic'} period axis`;
        return (
            <button
                type="button"
                className={`xy-chart-toggle xy-scale-toggle${log ? ' active' : ''}`}
                title={label}
                aria-label={label}
                aria-pressed={log}
                onMouseDown={event => event.stopPropagation()}
                onMouseMove={event => event.stopPropagation()}
                onWheel={event => event.stopPropagation()}
                onClick={event => {
                    event.stopPropagation();
                    this.toggleXAxisScale();
                }}
            >
                {log ? 'log' : 'lin'}
            </button>
        );
    }

    private toggleXAxisScale(): void {
        this.setState(prev => ({ xAxisLogScale: !prev.xAxisLogScale }));
    }

    /**
     * Builds the periodogram data for every currently displayed series as
     * numeric {x: period, y: power} points. Cached on the current xyData/width
     * so repeated renders are cheap.
     */
    private buildFrequencyData(): { datasets: any[] } {
        const width = this.getChartWidth();
        if (this.freqCache && this.freqCache.xyData === this.state.xyData && this.freqCache.width === width) {
            return this.freqCache.data;
        }

        const datasets: any[] = this.state.xyData?.datasets ?? [];
        const range = this.getDisplayedRange();
        const timeSpan = range ? Number(range.getEnd() - range.getStart()) : 0;

        const outDatasets = datasets.map((dSet: any) => {
            const yValues: number[] = this.isScatterPlot
                ? (dSet.data as any[]).map((p: any) => Number(p.y))
                : (dSet.data as any[]).map((v: any) => Number(v));
            const spectrum = computePeriodogram(yValues, timeSpan);
            // Render each spectral component as a vertical bar (stem): a segment
            // from the power baseline (0) up to the component's power, followed
            // by a break (NaN) so consecutive bars are not joined by a line.
            // This keeps the period (x) axis a real linear/logarithmic scale,
            // which Chart.js v2 bar charts cannot do.
            const barData: { x: number; y: number }[] = [];
            spectrum.forEach(s => {
                barData.push({ x: s.period, y: 0 });
                barData.push({ x: s.period, y: s.power });
                // NaN y breaks the line so consecutive bars are not connected.
                barData.push({ x: s.period, y: NaN });
            });
            return {
                label: dSet.label,
                // Numeric points so the x-axis can be linear or logarithmic.
                data: barData,
                backgroundColor: dSet.borderColor,
                borderColor: dSet.borderColor,
                // Bar thickness.
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                showLine: true,
                spanGaps: false,
                lineTension: 0
            };
        });

        const data = { datasets: outDatasets };
        this.freqCache = { xyData: this.state.xyData, width, data };
        return data;
    }

    /**
     * The frequency-domain chart: spectral power (y) versus period (x).
     * Uses Chart.js' own axes since the values are unrelated to the time-domain
     * y-axis rendered with D3. The x-axis can be linear or logarithmic.
     */
    private renderFrequencyChart(): JSX.Element {
        const data = this.buildFrequencyData();
        const chartHeight = parseInt(this.props.style.height.toString());
        const gridColor = this.props.backgroundTheme === 'light' ? '#dddddd' : '#34383c';
        const fontColor = this.props.backgroundTheme === 'light' ? '#333333' : '#bbbbbb';
        const log = this.state.xAxisLogScale;

        const options: any = {
            responsive: true,
            maintainAspectRatio: false,
            legend: { display: false },
            elements: { line: { tension: 0 }, point: { radius: 0 } },
            tooltips: {
                enabled: true,
                mode: 'nearest',
                intersect: false,
                callbacks: {
                    title: (items: any[]) =>
                        items && items.length ? `Period: ${formatPeriod(Number(items[0].xLabel))}` : '',
                    label: (item: any, chartData: any) => {
                        const name = chartData.datasets[item.datasetIndex]?.label ?? '';
                        const power = Number(item.yLabel);
                        return `${name}: ${Number.isFinite(power) ? power.toPrecision(4) : power}`;
                    }
                }
            },
            layout: { padding: { left: 5, right: 10, top: 15, bottom: 5 } },
            scales: {
                xAxes: [
                    {
                        type: log ? 'logarithmic' : 'linear',
                        position: 'bottom',
                        display: true,
                        scaleLabel: { display: true, labelString: 'Period', fontColor },
                        gridLines: { display: false, drawBorder: true, color: gridColor },
                        ticks: {
                            fontColor,
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 10,
                            callback: (value: number) => formatPeriod(Number(value))
                        }
                    }
                ],
                yAxes: [
                    {
                        display: true,
                        scaleLabel: { display: true, labelString: 'Power', fontColor },
                        gridLines: { color: gridColor, drawBorder: true },
                        ticks: { beginAtZero: true, fontColor }
                    }
                ]
            },
            animation: { duration: 0 }
        };

        const isEmpty = !data.datasets.length || data.datasets.every((d: any) => !d.data.length);

        return (
            <div className="xy-main" style={{ height: this.props.style.height, position: 'relative' }}>
                {this.renderFrequencyToggle()}
                {this.renderScaleToggle()}
                {isEmpty ? (
                    <div className="chart-message">Not enough data to compute a frequency spectrum</div>
                ) : (
                    <Line data={data} height={chartHeight} width={this.getChartWidth()} options={options} />
                )}
            </div>
        );
    }

    /**
     * Hide the D3-rendered y-axis while in frequency mode: the frequency chart
     * draws its own (power) axis, so the time-domain value axis is irrelevant.
     */
    renderYAxis(): React.ReactNode {
        if (this.state.frequencyMode) {
            return <React.Fragment />;
        }
        return super.renderYAxis();
    }

    private drawD3Chart(): JSX.Element {
        const chartHeight = parseInt(this.props.style.height.toString());
        const chartWidth = this.getChartWidth();

        if (this.state.xyData.labels?.length > 0) {
            const data: any[] = [];

            this.state.xyData?.datasets?.forEach((dSet: any) => {
                const row: any = [];
                if (this.isScatterPlot) {
                    dSet.data.forEach((tupple: any) => {
                        row.push({ xValue: tupple.x, yValue: tupple.y });
                    });
                } else {
                    dSet.data.forEach((y: number, j: number) => {
                        row.push({ xValue: this.state.xyData.labels[j], yValue: y });
                    });
                }
                data.push(row);
            });

            const yScale = scaleLinear()
                .domain([this.state.allMin, Math.max(this.state.allMax, 1)])
                .range([chartHeight - this.margin.bottom, this.margin.top]);

            const xDomain = this.state.xyData.labels.length - 1;
            const start = this.getXForTime(this.state.xyData.labels[0]);
            const end = this.getXForTime(this.state.xyData.labels[xDomain]);

            const xScale = scaleLinear().domain([start, end].map(Number)).range([0, chartWidth]);

            if (this.chartRef.current) {
                const ctx = this.chartRef.current.getContext('2d');

                // Fix blurred lines in retina displays
                const dpr = window.devicePixelRatio;
                this.chartRef.current.width = dpr * chartWidth;
                this.chartRef.current.height = dpr * chartHeight;
                this.chartRef.current.style.width = chartWidth + 'px';
                this.chartRef.current.style.height = chartHeight + 'px';
                ctx.scale(dpr, dpr);

                // Bar chart
                if (ctx) {
                    ctx.clearRect(0, 0, chartWidth, chartHeight);
                    ctx.save();
                    data.forEach((row, i) => {
                        ctx.fillStyle = this.state.xyData.datasets[i].borderColor;
                        row.forEach((tupple: any) => {
                            ctx.beginPath();
                            const xPos = this.getXForTime(tupple.xValue);
                            ctx.fillRect(xScale(xPos), chartHeight, 2, -chartHeight + yScale(+tupple.yValue));
                            ctx.closePath();
                        });
                    });
                    ctx.restore();
                    this.afterChartDraw(this.chartRef.current.getContext('2d'));
                }
            }
        }

        return <canvas ref={this.chartRef} height={chartHeight} width={chartWidth} />;
    }

    protected afterChartDraw(ctx: CanvasRenderingContext2D | null, chartArea?: Chart.ChartArea | null): void {
        if (ctx) {
            if (this.props.selectionRange) {
                const startPixel = this.getXForTime(this.props.selectionRange.getStart());
                const endPixel = this.getXForTime(this.props.selectionRange.getEnd());
                ctx.strokeStyle = '#259fd8';
                ctx.fillStyle = '#259fd8';
                this.drawSelection(ctx, chartArea, startPixel, endPixel);
            }
            if (this.clickedMouseButton === MouseButton.RIGHT) {
                const offset = this.props.viewRange.getOffset() ?? BigInt(0);
                const startPixel = this.getXForTime(this.startPositionMouseRightClick + offset);
                const endPixel = this.positionXMove;
                ctx.strokeStyle = '#9f9f9f';
                ctx.fillStyle = '#9f9f9f';
                this.drawSelection(ctx, chartArea, startPixel, endPixel);
            }
        }
    }

    private drawSelection(
        ctx: CanvasRenderingContext2D | null,
        chartArea: Chart.ChartArea | undefined | null,
        startPixel: number,
        endPixel: number
    ) {
        const minPixel = Math.min(startPixel, endPixel);
        const maxPixel = Math.max(startPixel, endPixel);
        const initialPoint = this.isBarPlot ? 0 : (chartArea?.left ?? 0);
        const chartHeight = parseInt(this.props.style.height.toString());
        const finalPoint = this.isBarPlot ? chartHeight : (chartArea?.bottom ?? 0);
        if (ctx) {
            ctx.save();

            ctx.lineWidth = 1;
            // Selection borders
            if (startPixel > initialPoint) {
                ctx.beginPath();
                ctx.moveTo(minPixel, 0);
                ctx.lineTo(minPixel, finalPoint);
                ctx.stroke();
            }
            if (endPixel < this.props.viewRange.getEnd()) {
                ctx.beginPath();
                ctx.moveTo(maxPixel, 0);
                ctx.lineTo(maxPixel, finalPoint);
                ctx.stroke();
            }
            // Selection fill
            ctx.globalAlpha = 0.2;
            ctx.fillRect(minPixel, 0, maxPixel - minPixel, finalPoint);
            ctx.restore();
        }
    }

    private onMouseDown(event: React.MouseEvent<HTMLDivElement, MouseEvent>): void {
        this.isMouseLeave = false;
        this.mouseIsDown = true;
        this.posPixelSelect = event.nativeEvent.screenX;
        const startTime = this.getTimeForX(event.nativeEvent.offsetX);
        this.clickedMouseButton = event.button;

        if (this.clickedMouseButton === MouseButton.RIGHT) {
            this.isSelecting = false;
            this.setState({ cursor: 'col-resize' });
            this.startPositionMouseRightClick = startTime;
        } else {
            if (event.shiftKey && !event.ctrlKey && this.props.unitController.selectionRange) {
                this.isSelecting = true;
                this.setState({ cursor: 'crosshair' });
                this.props.unitController.selectionRange = {
                    start: this.props.unitController.selectionRange.start,
                    end: startTime
                };
            } else if (
                (event.ctrlKey && !event.shiftKey) ||
                (!(event.shiftKey && event.ctrlKey) && this.clickedMouseButton === MouseButton.MID)
            ) {
                this.resolution = this.getChartWidth() / Number(this.props.unitController.viewRangeLength);
                this.mousePanningStart =
                    this.props.unitController.viewRange.start + BIMath.round(event.nativeEvent.x / this.resolution);
                this.isPanning = true;
                this.setState({ cursor: 'grabbing' });
            } else if (!(event.shiftKey && event.ctrlKey)) {
                this.isSelecting = true;
                this.setState({ cursor: 'crosshair' });
                this.props.unitController.selectionRange = {
                    start: startTime,
                    end: startTime
                };
            }
            this.onMouseMove(event);
        }
        document.addEventListener('mouseup', this.endSelection);
    }

    private panHorizontally(event: React.MouseEvent) {
        const delta = event.nativeEvent.x;
        const change = Number(this.mousePanningStart) - delta / this.resolution;
        const min = BigInt(0);
        const max = this.props.unitController.absoluteRange - this.props.unitController.viewRangeLength;
        const start = BIMath.clamp(change, min, max);
        const end = start + this.props.unitController.viewRangeLength;
        this.props.unitController.viewRange = {
            start,
            end
        };
    }

    private onWheel(wheel: React.WheelEvent): void {
        this.isMouseLeave = false;
        if (wheel.shiftKey) {
            if (wheel.deltaY < 0) {
                this.pan(FLAG_PAN_LEFT);
            } else if (wheel.deltaY > 0) {
                this.pan(FLAG_PAN_RIGHT);
            }
        } else if (wheel.ctrlKey) {
            if (wheel.deltaY < 0) {
                this.zoom(FLAG_ZOOM_IN);
            } else if (wheel.deltaY > 0) {
                this.zoom(FLAG_ZOOM_OUT);
            }
        }
    }

    private onMouseMove(event: React.MouseEvent): void {
        this.positionXMove = event.nativeEvent.offsetX;
        this.positionYMove = event.nativeEvent.offsetY;
        this.isMouseLeave = false;

        if (this.mouseIsDown) {
            if (this.isPanning) {
                this.panHorizontally(event);
            } else if (this.isSelecting) {
                this.updateSelection();
            } else {
                this.forceUpdate();
            }
        }
        if (this.state.xyData.datasets.length > 0) {
            this.tooltip();
        }
    }

    private onMouseLeave(event: React.MouseEvent) {
        this.isMouseLeave = true;
        const width = this.isBarPlot ? this.getChartWidth() : this.chartRef.current.chartInstance.width;
        this.positionXMove = Math.max(0, Math.min(event.nativeEvent.offsetX, width));
        this.forceUpdate();
        if (this.mouseIsDown && !(this.clickedMouseButton === MouseButton.RIGHT)) {
            this.updateSelection();
        }
        this.closeTooltip();
    }

    private onKeyDown(key: React.KeyboardEvent): void {
        this.closeTooltip();
        if (!this.isMouseLeave) {
            switch (key.key) {
                case 'W':
                case 'w':
                case 'i':
                case 'I': {
                    this.zoom(FLAG_ZOOM_IN);
                    break;
                }
                case 'S':
                case 's':
                case 'K':
                case 'k': {
                    this.zoom(FLAG_ZOOM_OUT);
                    break;
                }
                case 'A':
                case 'a':
                case 'J':
                case 'j':
                case 'ArrowLeft': {
                    this.pan(FLAG_PAN_LEFT);
                    break;
                }
                case 'D':
                case 'd':
                case 'L':
                case 'l':
                case 'ArrowRight': {
                    this.pan(FLAG_PAN_RIGHT);
                    break;
                }
                case 'Shift': {
                    if (!this.isPanning && !(this.clickedMouseButton === MouseButton.RIGHT) && !this.isSelecting) {
                        if (key.ctrlKey) {
                            this.setState({ cursor: 'default' });
                        } else {
                            this.setState({ cursor: 'crosshair' });
                        }
                    }
                    break;
                }
                case 'Control': {
                    if (!this.isSelecting && !this.isPanning) {
                        if (key.shiftKey) {
                            this.setState({ cursor: 'default' });
                        } else {
                            this.setState({ cursor: 'grabbing' });
                        }
                    }
                    break;
                }
            }
        }
    }

    private onKeyUp(key: React.KeyboardEvent): void {
        if (!this.isSelecting && !this.isPanning) {
            let keyCursor: string | undefined = this.state.cursor ?? 'default';
            if (key.key === 'Shift') {
                if (key.ctrlKey) {
                    keyCursor = 'grabbing';
                } else if (!this.mouseIsDown) {
                    keyCursor = 'default';
                }
            } else if (key.key === 'Control') {
                if (key.shiftKey) {
                    keyCursor = 'crosshair';
                } else if (!this.mouseIsDown) {
                    this.isPanning = false;
                    keyCursor = 'default';
                }
            }
            this.setState({ cursor: keyCursor });
        }
    }

    protected getDisplayedRange(): TimeRange {
        return this.props.viewRange;
    }

    protected getZoomTime(): bigint {
        return this.getTimeForX(this.positionXMove);
    }

    private exportOutput() {
        const columnLabels = this.state.columns.map(col => col.title);
        const tableContent = this.state.xyTree.map(rowData => rowData.labels);
        const tableString = columnLabels.join(',') + '\n' + tableContent.map(row => row.join(',')).join('\n');
        signalManager().emit('SAVE_AS_CSV', this.props.traceId, tableString);
        this.setState({
            dropDownOpen: false
        });
    }
}
