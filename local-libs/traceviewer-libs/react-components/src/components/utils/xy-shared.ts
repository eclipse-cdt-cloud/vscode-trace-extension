/* eslint-disable @typescript-eslint/no-explicit-any */
import { Entry } from 'tsp-typescript-client';
import { XyEntry } from 'tsp-typescript-client/lib/models/xy';
import { TimeRange } from 'traceviewer-base/lib/utils/time-range';
import { BIMath } from 'timeline-chart/lib/bigint-utils';
import { listToTree, getCollapsedNodesFromAutoExpandLevel } from './filter-tree/utils';
import { axisLeft } from 'd3-axis';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';

/**
 * This file contains shared utilities between time-based
 * xy view and generic xy view.
 */

export interface HeaderSpec {
    name: string;
    tooltip?: string;
}

export interface ColumnSpec {
    title: string;
    sortable?: boolean;
    resizable?: boolean;
    tooltip?: string;
}

export interface TreeState {
    columns: ColumnSpec[];
    checkedSeries: number[];
    collapsedNodes: number[];
    defaultOrderedIds: number[];
    xyTree: Entry[];
}

function buildColumns(headers?: HeaderSpec[]): ColumnSpec[] {
    if (headers?.length) {
        return headers.map(h => ({
            title: h.name,
            sortable: true,
            resizable: true,
            tooltip: h.tooltip
        }));
    }
    return [{ title: 'Name', sortable: true }];
}

function computeAutoCollapsedNodes(
    entries: Entry[],
    columns: ColumnSpec[],
    autoExpandLevel: number | undefined
): number[] {
    return getCollapsedNodesFromAutoExpandLevel(listToTree(entries, columns as any), autoExpandLevel);
}

export function buildTreeStateFromModel(model: {
    headers?: HeaderSpec[];
    entries: XyEntry[];
    autoExpandLevel?: number;
    status?: any;
}): TreeState {
    const columns = buildColumns(model.headers);
    const checkedSeries = model.entries.filter(e => (e as any).isDefault).map(e => e.id);
    const collapsedNodes = computeAutoCollapsedNodes(model.entries, columns, model.autoExpandLevel);
    const defaultOrderedIds = model.entries.map(e => e.id);
    return { columns, checkedSeries, collapsedNodes, defaultOrderedIds, xyTree: model.entries };
}

function csvEscape(cell: any): string {
    const s = String(cell ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/** Build a CSV string from columns + tree rows (rows use .labels like in your components). */
export function rowsToCsv(columns: ColumnSpec[], rows: Entry[]): string {
    const header = columns.map(c => csvEscape(c.title)).join(',');
    const body = rows.map(r => (r as any).labels?.map(csvEscape).join(',') ?? '').join('\n');
    return header + '\n' + body;
}

/** Abbreviate large magnitudes: 1.2K, 3.4M, 5.6B, 7.8G */
function abbrNumber(n: number): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return String(n);
    const A = Math.abs(v);
    if (A >= 1e12) return (Math.round(v / 1e11) / 10).toString() + 'G';
    if (A >= 1e9) return (Math.round(v / 1e8) / 10).toString() + 'B';
    if (A >= 1e6) return (Math.round(v / 1e5) / 10).toString() + 'M';
    if (A >= 1e3) return (Math.round(v / 1e2) / 10).toString() + 'K';
    return (Math.round(v * 10) / 10).toString();
}

export function applyYAxis(
    yAxisRef: React.RefObject<SVGGElement>,
    chartHeight: number,
    marginTop: number,
    marginBottom: number,
    min: number,
    max: number
): void {
    if (!yAxisRef.current) return;
    const yScale = scaleLinear()
        .domain([min, Math.max(max, 1)])
        .range([chartHeight - marginBottom, marginTop]);
    const axis = axisLeft(yScale).tickSizeOuter(0).ticks(4);
    select(yAxisRef.current)
        .call(axis as any)
        .call(g => g.select('.domain').remove());
    select(yAxisRef.current)
        .selectAll<SVGTextElement, number>('.tick text')
        .style('font-size', '11px')
        .text((d: any) => abbrNumber(d));
}

export class ColorAllocator {
    private readonly map = new Map<string, number>();
    private i = 0;
    constructor(
        private readonly palette: string[] = [
            'rgba(191, 33, 30, 1)',
            'rgba(30, 56, 136, 1)',
            'rgba(71, 168, 189, 1)',
            'rgba(245, 230, 99, 1)',
            'rgba(255, 173, 105, 1)',
            'rgba(216, 219, 226, 1)',
            'rgba(212, 81, 19, 1)',
            'rgba(187, 155, 176, 1)',
            'rgba(6, 214, 160, 1)',
            'rgba(239, 71, 111, 1)'
        ]
    ) {}
    get(key: string): string {
        let idx = this.map.get(key);
        if (idx === undefined) {
            idx = this.i % this.palette.length;
            this.map.set(key, idx);
            this.i++;
        }
        return this.palette[idx];
    }
}

type DatasetLike = { data: number[] } | { data: Array<{ y: number }> };

export function computeYRange(datasets: DatasetLike[] | undefined, isScatter = false): { min: number; max: number } {
    if (!datasets?.length) return { min: 0, max: 1 };
    let localMax = Number.NEGATIVE_INFINITY;
    let localMin = Number.POSITIVE_INFINITY;

    datasets.forEach((d: any) => {
        const arr: number[] = isScatter ? (d.data as any[]).map(p => Number(p?.y)) : (d.data as number[]);
        const nums = arr.map(Number).filter(v => Number.isFinite(v));
        if (!nums.length) return;
        const rMax = Math.max(...nums);
        const rMin = Math.min(...nums);
        localMax = Math.max(localMax, rMax);
        localMin = Math.min(localMin, rMin);
    });

    if (!Number.isFinite(localMax) || !Number.isFinite(localMin) || localMax === localMin) {
        return { min: 0, max: 1 };
    }
    return { min: localMin * 0.99, max: localMax * 1.01 };
}

export function getTimeForX(range: TimeRange, chartWidth: number, x: number): bigint {
    const offset = range.getOffset?.() ?? BigInt(0);
    const duration = range.getDuration();
    const W = Math.max(1, chartWidth);
    const clamped = Math.max(0, Math.min(x, W));
    return range.getStart() - offset + BIMath.round((clamped / W) * Number(duration));
}

export function getXForTime(range: TimeRange, chartWidth: number, time: bigint): number {
    const start = range.getStart();
    const duration = range.getDuration();
    const W = Math.max(1, chartWidth);
    return (Number(time - start) / Number(duration)) * W;
}

export const ZOOM_IN_RATE = 0.8;
export const ZOOM_OUT_RATE = 1.25;

export function zoomRange(
    view: { start: bigint; end: bigint },
    absoluteRange: bigint,
    center: bigint,
    isZoomIn: boolean,
    rateIn = ZOOM_IN_RATE,
    rateOut = ZOOM_OUT_RATE
): { start: bigint; end: bigint } {
    const length = view.end - view.start;
    if (length < 1) return view;
    const factor = isZoomIn ? rateIn : rateOut;
    const startDist = center - view.start;
    const newDuration = BIMath.clamp(Number(length) * factor, BigInt(2), absoluteRange);
    const newStart = BIMath.max(0, center - BIMath.round(Number(startDist) * factor));
    const newEnd = newStart + newDuration;
    return { start: newStart, end: newEnd };
}

export function panRange(
    view: { start: bigint; end: bigint },
    absoluteRange: bigint,
    panLeft: boolean,
    panFactor = 0.1
): { start: bigint; end: bigint } {
    const length = view.end - view.start;
    const step = BIMath.round(Number(length) * panFactor);
    const dir = panLeft ? BigInt(-1) : BigInt(1);
    let start = view.start + dir * step;
    let end = view.end + dir * step;
    if (start < BigInt(0)) {
        start = BigInt(0);
        end = length;
    } else if (end > absoluteRange) {
        end = absoluteRange;
        start = end - length;
    }
    return { start, end };
}

export function setSpinnerVisible(outputDomId: string, visible: boolean): void {
    const el = document.getElementById(outputDomId + 'handleSpinner');
    if (el) el.style.visibility = visible ? 'visible' : 'hidden';
}
