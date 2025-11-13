import * as React from 'react';
import { ResponseStatus } from 'tsp-typescript-client/lib/models/response/responses';
import { EntryTree } from './utils/filter-tree/entry-tree';
import { validateNumArray } from './utils/filter-tree/utils';
import '../../style/react-contextify.css';
import { AbstractGanttOutputComponent, AbstractGanttOutputProps } from './abstract-gantt-output-component';

export class TimegraphOutputComponent extends AbstractGanttOutputComponent {
    constructor(props: AbstractGanttOutputProps) {
        super(props);
        this.state = {
            outputStatus: ResponseStatus.RUNNING,
            chartTree: [],
            defaultOrderedIds: [],
            markerCategoryEntries: [],
            markerLayerData: undefined,
            collapsedNodes: validateNumArray(this.props.persistChartState?.collapsedNodes)
                ? (this.props.persistChartState.collapsedNodes as number[])
                : [],
            selectedRow: undefined,
            multiSelectedRows: [],
            pinnedRows: [],
            selectedMarkerRow: undefined,
            columns: [],
            collapsedMarkerNodes: validateNumArray(this.props.persistChartState?.collapsedMarkerNodes)
                ? (this.props.persistChartState.collapsedMarkerNodes as number[])
                : [],
            showTree: true,
            searchString: '',
            filters: [],
            emptyNodes: [],
            marginTop: 0
        };
    }

    renderTree(): React.ReactNode {
        this.onOrderChange = this.onOrderChange.bind(this);
        this.onOrderReset = this.onOrderReset.bind(this);

        // Add pinned entries at the top, maintaining tree order
        const pinnedEntries = this.state.pinnedRows
            ? this.state.pinnedRows
                  .map(id => this.state.chartTree.find(entry => entry.id === id))
                  .filter(entry => entry !== undefined)
                  .map(entry => ({ ...entry, id: AbstractGanttOutputComponent.createNewId(entry.id), parentId: -1 }))
            : [];
        const entriesWithPinned = [...pinnedEntries, ...this.state.chartTree];

        // Show pin icons on both original and duplicate rows
        const extendedPinnedRows = this.state.pinnedRows
            ? [
                  ...this.state.pinnedRows,
                  ...this.state.pinnedRows.map(id => AbstractGanttOutputComponent.createNewId(id))
              ]
            : [];

        return (
            <>
                <div
                    ref={this.chartTreeRef}
                    className="scrollable"
                    onScroll={() => this.synchronizeTreeScroll()}
                    style={{
                        height:
                            parseInt(this.props.style.height.toString()) -
                            this.getMarkersLayerHeight() -
                            (document.getElementById(this.props.traceId + this.props.outputDescriptor.id + 'searchBar')
                                ?.offsetHeight ?? 0)
                    }}
                    tabIndex={0}
                >
                    {this.renderContextMenu()}
                    <EntryTree
                        collapsedNodes={this.state.collapsedNodes}
                        showFilter={false}
                        entries={entriesWithPinned}
                        showCheckboxes={false}
                        showPinIcons={true}
                        pinnedRows={extendedPinnedRows}
                        onPin={this.onPin}
                        onToggleCollapse={this.onToggleCollapse}
                        onRowClick={this.onRowClick}
                        onMultipleRowClick={this.onMultipleRowClick}
                        selectedRow={this.state.selectedRow}
                        multiSelectedRows={this.state.multiSelectedRows}
                        showHeader={true}
                        onContextMenu={this.onCtxMenu}
                        className="table-tree timegraph-tree"
                        emptyNodes={this.state.emptyNodes}
                        hideEmptyNodes={this.shouldHideEmptyNodes}
                        onOrderChange={this.onOrderChange}
                        onOrderReset={this.onOrderReset}
                        headers={this.state.columns}
                        hideFillers={true}
                    />
                </div>
                <div ref={this.markerTreeRef} className="scrollable" style={{ height: this.getMarkersLayerHeight() }}>
                    <EntryTree
                        collapsedNodes={this.state.collapsedMarkerNodes}
                        showFilter={false}
                        entries={this.state.markerCategoryEntries}
                        showCheckboxes={false}
                        showCloseIcons={true}
                        onRowClick={this.onMarkerRowClick}
                        selectedRow={this.state.selectedMarkerRow}
                        onToggleCollapse={this.onToggleAnnotationCollapse}
                        onClose={this.onMarkerCategoryRowClose}
                        showHeader={false}
                        className="table-tree timegraph-tree"
                        hideFillers={true}
                    />
                </div>
            </>
        );
    }
}
