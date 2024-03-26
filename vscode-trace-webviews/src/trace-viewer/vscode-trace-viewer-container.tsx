/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
import 'ag-grid-community/dist/styles/ag-grid.css';
import 'ag-grid-community/dist/styles/ag-theme-balham-dark.css';
import 'ag-grid-community/dist/styles/ag-theme-balham.css';
import JSONBigConfig from 'json-bigint';
import * as React from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { signalManager, Signals } from 'traceviewer-base/lib/signals/signal-manager';
import {
    ContextMenuItems,
    ContextMenuContributedSignalPayload
} from 'traceviewer-base/lib/signals/context-menu-contributed-signal-payload';
import { RowSelectionsChangedSignalPayload } from 'traceviewer-base/lib/signals/row-selections-changed-signal-payload';
import { ContextMenuItemClickedSignalPayload } from 'traceviewer-base/lib/signals/context-menu-item-clicked-signal-payload';
import { TraceContextComponent } from 'traceviewer-react-components/lib/components/trace-context-component';
import 'traceviewer-react-components/style/trace-context-style.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import { VsCodeMessageManager, VSCODE_MESSAGES } from 'vscode-trace-common/lib/messages/vscode-message-manager';
import { convertSignalExperiment } from 'vscode-trace-common/lib/signals/vscode-signal-converter';
import '../style/trace-viewer.css';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { TimeRange } from 'traceviewer-base/lib/utils/time-range';

const JSONBig = JSONBigConfig({
    useNativeBigInt: true
});

interface VscodeAppState {
    experiment: Experiment | undefined;
    tspClientProvider: TspClientProvider | undefined;
    outputs: OutputDescriptor[];
    overviewOutputDescriptor: OutputDescriptor | undefined;
    theme: string;
    serverStatus: boolean;
}

class TraceViewerContainer extends React.Component<{}, VscodeAppState> {
    private DEFAULT_OVERVIEW_DATA_PROVIDER_ID =
        'org.eclipse.tracecompass.internal.tmf.core.histogram.HistogramDataProvider';

    private _signalHandler: VsCodeMessageManager;

    private onViewRangeUpdated = (payload: TimeRangeUpdatePayload): void =>
        this._signalHandler.viewRangeUpdated(payload);
    private onSelectionRangeUpdated = (payload: TimeRangeUpdatePayload): void =>
        this._signalHandler.selectionRangeUpdated(payload);
    private onExperimentUpdated = (payload: Experiment): void => this._signalHandler.experimentUpdated(payload);

    private _onProperties = (properties: { [key: string]: string }): void => this.doHandlePropertiesSignal(properties);
    private _onSaveAsCSV = (payload: { traceId: string; data: string }): void => this.doHandleSaveAsCSVSignal(payload);
    private _onRowSelectionChanged = (payload: RowSelectionsChangedSignalPayload): void =>
        this.doHandleRowSelectSignal(payload);
    private _onContextMenuItemClicked = (payload: ContextMenuItemClickedSignalPayload): void =>
        this.doHandleContextMenuItemClicked(payload);

    /** Signal Handlers */
    private doHandlePropertiesSignal(properties: { [key: string]: string }) {
        this._signalHandler.propertiesUpdated(properties);
    }

    private doHandleSaveAsCSVSignal(payload: { traceId: string; data: string }) {
        this._signalHandler.saveAsCSV(payload);
    }

    private doHandleRowSelectSignal(payload: RowSelectionsChangedSignalPayload) {
        this._signalHandler.rowSelectChanged(payload);
    }

    private doHandleContextMenuItemClicked(payload: ContextMenuItemClickedSignalPayload) {
        this._signalHandler.contextMenuItemClicked(payload);
    }

    private _onOverviewSelected = (payload: { traceId: string; outputDescriptor: OutputDescriptor }): void =>
        this.doHandleOverviewSelectedSignal(payload);
    private onMarkerCategoryClosedSignal = (payload: { traceViewerId: string; markerCategory: string }) =>
        this.doHandleMarkerCategoryClosedSignal(payload);

    protected resizeHandlers: (() => void)[] = [];
    protected readonly addResizeHandler = (h: () => void): void => {
        this.resizeHandlers.push(h);
    };
    protected readonly removeResizeHandler = (h: () => void): void => {
        const index = this.resizeHandlers.indexOf(h, 0);
        if (index > -1) {
            this.resizeHandlers.splice(index, 1);
        }
    };

    private markerCategoriesMap = new Map<string, string[]>();
    private toolbarMarkerCategoriesMap = new Map<string, { categoryCount: number; toggleInd: boolean }>();
    private selectedMarkerCategoriesMap = new Map<string, string[]>();
    private markerSetsMap = new Map<string, { marker: MarkerSet; enabled: boolean }>();
    private selectedMarkerSetId = '';

    constructor(props: {}) {
        super(props);
        this.state = {
            experiment: undefined,
            tspClientProvider: undefined,
            outputs: [],
            overviewOutputDescriptor: undefined,
            theme: 'light',
            serverStatus: true
        };
        this._signalHandler = new VsCodeMessageManager();

        window.addEventListener('message', event => {
            const message = event.data; // The JSON data our extension sent
            switch (message.command) {
                case VSCODE_MESSAGES.SET_EXPERIMENT:
                    this.doHandleExperimentSetSignal(convertSignalExperiment(JSONBig.parse(message.data)), false);
                    break;
                case VSCODE_MESSAGES.SET_TSP_CLIENT:
                    this.setState(
                        {
                            tspClientProvider: new TspClientProvider(message.data, this._signalHandler)
                        },
                        () => {
                            if (message.experiment) {
                                this.doHandleExperimentSetSignal(
                                    convertSignalExperiment(JSONBig.parse(message.experiment)),
                                    true
                                );
                            }
                        }
                    );
                    break;
                case VSCODE_MESSAGES.ADD_OUTPUT:
                    // FIXME: JSONBig.parse() create bigint if numbers are small
                    // Not an issue right now for output descriptors.
                    if (message?.data) {
                        const descriptor: OutputDescriptor = JSONBig.parse(message.data);
                        this.doHandleOutputAddedMessage(descriptor);
                    }
                    break;
                case VSCODE_MESSAGES.OUTPUT_DATA_CHANGED:
                    if (message?.data) {
                        const descriptors: OutputDescriptor[] = JSONBig.parse(message.data);
                        this.doHandleOutputDataChanged(descriptors);
                    }
                    break;
                case VSCODE_MESSAGES.OPEN_OVERVIEW:
                    this.doHandleExperimentSetSignal(this.state.experiment, false);
                    break;
                case VSCODE_MESSAGES.SET_THEME:
                    this.doHandleThemeChanged(message.data);
                    break;
                case VSCODE_MESSAGES.RESET_ZOOM:
                    this.resetZoom();
                    break;
                case VSCODE_MESSAGES.UNDO:
                    this.undo();
                    break;
                case VSCODE_MESSAGES.REDO:
                    this.redo();
                    break;
                case VSCODE_MESSAGES.UPDATE_ZOOM:
                    this.updateZoom(message.data);
                case VSCODE_MESSAGES.VIEW_RANGE_UPDATED:
                    signalManager().fireViewRangeUpdated(JSONBig.parse(message.data));
                    break;
                case VSCODE_MESSAGES.SELECTION_RANGE_UPDATED:
                    signalManager().fireSelectionRangeUpdated(JSONBig.parse(message.data));
                    break;
                case VSCODE_MESSAGES.REQUEST_SELECTION_RANGE_CHANGE:
                    const { experimentUUID, timeRange } = JSONBig.parse(message.data);
                    const payload = {
                        experimentUUID,
                        timeRange: new TimeRange(BigInt(timeRange.start), BigInt(timeRange.end))
                    } as TimeRangeUpdatePayload;
                    signalManager().fireRequestSelectionRangeChange(payload);
                    break;
                case VSCODE_MESSAGES.UPDATE_MARKER_CATEGORY_STATE:
                    if (message?.data) {
                        const selection: string[] = JSON.parse(message.data);
                        this.updateAllMarkerCategoryState(selection);
                    }
                    break;
                case VSCODE_MESSAGES.UPDATE_MARKER_SET_STATE:
                    if (message?.data) {
                        this.updateMarkerSetState(message.data);
                    }
                    break;
                case VSCODE_MESSAGES.GET_MARKER_CATEGORIES:
                    this._signalHandler.fetchMarkerCategories(this.toolbarMarkerCategoriesMap);
                    break;
                case VSCODE_MESSAGES.GET_MARKER_SETS:
                    this._signalHandler.fetchMarkerSets(this.markerSetsMap);
                    break;
                case VSCODE_MESSAGES.EXPERIMENT_SELECTED:
                    this.doHandleExperimentSelectedSignal(convertSignalExperiment(JSONBig.parse(message.data)));
                    break;
                case VSCODE_MESSAGES.TRACE_SERVER_URL_CHANGED:
                    if (message.data && this.state.tspClientProvider) {
                        this.state.tspClientProvider.updateTspClientUrl(message.data);
                    }
                    break;
                case VSCODE_MESSAGES.CONTRIBUTE_CONTEXT_MENU:
                    if (message.data) {
                        const ctxMenuPayload: ContextMenuContributedSignalPayload =
                            new ContextMenuContributedSignalPayload(
                                message.data.outputDescriptorId,
                                message.data.menuItems as ContextMenuItems
                            );
                        this.contributeContextMenu(ctxMenuPayload);
                    }
                    break;
                case VSCODE_MESSAGES.CONNECTION_STATUS:
                    const serverStatus: boolean = JSONBig.parse(message.data);
                    console.log('CONNECTION STATUS:', serverStatus);
                    this.setState({ serverStatus });
                    break;
            }
        });
        window.addEventListener('resize', this.onResize);
        this.onOutputRemoved = this.onOutputRemoved.bind(this);
        this.onOverviewRemoved = this.onOverviewRemoved.bind(this);
        signalManager().on(Signals.OVERVIEW_OUTPUT_SELECTED, this._onOverviewSelected);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        signalManager().on(Signals.CONTEXT_MENU_ITEM_CLICKED, this._onContextMenuItemClicked);
        signalManager().on(Signals.ROW_SELECTIONS_CHANGED, this._onRowSelectionChanged);
        signalManager().on(Signals.ITEM_PROPERTIES_UPDATED, this._onProperties);
        signalManager().on(Signals.SAVE_AS_CSV, this._onSaveAsCSV);
        signalManager().on(Signals.MARKER_CATEGORY_CLOSED, this.onMarkerCategoryClosedSignal);
        signalManager().on(Signals.VIEW_RANGE_UPDATED, this.onViewRangeUpdated);
        signalManager().on(Signals.SELECTION_RANGE_UPDATED, this.onSelectionRangeUpdated);
        signalManager().on(Signals.EXPERIMENT_UPDATED, this.onExperimentUpdated);
    }

    componentWillUnmount(): void {
        signalManager().off(Signals.CONTEXT_MENU_ITEM_CLICKED, this._onContextMenuItemClicked);
        signalManager().off(Signals.ROW_SELECTIONS_CHANGED, this._onRowSelectionChanged);
        signalManager().off(Signals.ITEM_PROPERTIES_UPDATED, this._onProperties);
        signalManager().off(Signals.OVERVIEW_OUTPUT_SELECTED, this._onOverviewSelected);
        signalManager().off(Signals.SAVE_AS_CSV, this._onSaveAsCSV);
        signalManager().off(Signals.MARKER_CATEGORY_CLOSED, this.onMarkerCategoryClosedSignal);
        signalManager().off(Signals.VIEW_RANGE_UPDATED, this.onViewRangeUpdated);
        signalManager().off(Signals.SELECTION_RANGE_UPDATED, this.onSelectionRangeUpdated);
        signalManager().off(Signals.EXPERIMENT_UPDATED, this.onExperimentUpdated);
        window.removeEventListener('resize', this.onResize);
    }

    private onResize = (): void => {
        this.resizeHandlers.forEach(h => h());
    };

    private onOutputRemoved(outputId: string) {
        const outputToKeep = this.state.outputs.filter(output => output.id !== outputId);
        this.removeMarkerCategories(outputId);
        this.setState({ outputs: outputToKeep });
    }

    protected onOverviewRemoved(): void {
        this.setState({ overviewOutputDescriptor: undefined });
    }

    protected resetZoom(): void {
        signalManager().fireResetZoomSignal();
    }

    protected undo(): void {
        signalManager().fireUndoSignal();
    }

    protected redo(): void {
        signalManager().fireRedoSignal();
    }

    protected contributeContextMenu(payload: ContextMenuContributedSignalPayload): void {
        signalManager().fireContributeContextMenu(payload);
    }

    protected doHandleOutputDataChanged(descriptors: OutputDescriptor[]): void {
        signalManager().fireOutputDataChanged(descriptors);
    }

    protected updateZoom(hasZoomedIn: boolean): void {
        signalManager().fireUpdateZoomSignal(hasZoomedIn);
    }

    protected async doHandleExperimentSetSignal(
        experiment: Experiment | undefined,
        fetchMarkerSets: boolean
    ): Promise<void> {
        if (experiment) {
            if (fetchMarkerSets) {
                await this.fetchMarkerSets(experiment.UUID);
            }
            const defaultOverviewDescriptor: OutputDescriptor | undefined =
                await this.getDefaultTraceOverviewOutputDescriptor(experiment);
            this.setState({
                experiment: experiment,
                overviewOutputDescriptor: defaultOverviewDescriptor
            });
            this._signalHandler.setMarkerSetsContext(this.markerSetsMap.size > 0);
            this._signalHandler.setMarkerCategoriesContext(this.toolbarMarkerCategoriesMap.size > 0);
        }
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (experiment?.UUID === this.state.experiment?.UUID) {
            this._signalHandler.setMarkerSetsContext(this.markerSetsMap.size > 0);
            this._signalHandler.setMarkerCategoriesContext(this.toolbarMarkerCategoriesMap.size > 0);
        }
    }

    protected async doHandleOutputAddedMessage(descriptor: OutputDescriptor): Promise<void> {
        if (!this.state.outputs.find(output => output.id === descriptor.id)) {
            await this.fetchAnnotationCategories(descriptor);
            this.setState({ outputs: [...this.state.outputs, descriptor] });
        }
    }

    private async fetchMarkerSets(expUUID: string): Promise<void> {
        if (this.state.tspClientProvider) {
            const markers = await this.state.tspClientProvider.getTspClient().fetchMarkerSets(expUUID);
            const markersResponse = markers.getModel();
            if (markersResponse && markers.isOk()) {
                const markerSets = markersResponse.model;
                this.markerSetsMap.clear();
                if (markerSets.length) {
                    this.markerSetsMap.set('-1', { marker: { name: 'None', id: '-1' } as MarkerSet, enabled: true });
                }
                markerSets.forEach(markerSet => {
                    if (!this.markerSetsMap.has(markerSet.id)) {
                        this.markerSetsMap.set(markerSet.id, { marker: markerSet, enabled: false });
                    }
                });
            }
        }
    }

    private async fetchAnnotationCategories(output: OutputDescriptor) {
        if (this.state.experiment && this.state.tspClientProvider) {
            const annotationCategories = await this.state.tspClientProvider
                .getTspClient()
                .fetchAnnotationsCategories(this.state.experiment.UUID, output.id, this.selectedMarkerSetId);
            const annotationCategoriesResponse = annotationCategories.getModel();
            if (annotationCategories.isOk() && annotationCategoriesResponse) {
                const markerCategories = annotationCategoriesResponse.model
                    ? annotationCategoriesResponse.model.annotationCategories
                    : [];
                this.addMarkerCategories(output.id, markerCategories);
            }
        }
    }

    private addMarkerCategories(outputId: string, markerCategories: string[]) {
        this.removeMarkerCategories(outputId);
        const selectedMarkerCategories: string[] = [];
        markerCategories.forEach(category => {
            const categoryInfo = this.toolbarMarkerCategoriesMap.get(category);
            const categoryCount = categoryInfo ? categoryInfo.categoryCount + 1 : 1;
            const toggleInd = categoryInfo ? categoryInfo.toggleInd : true;
            this.toolbarMarkerCategoriesMap.set(category, { categoryCount, toggleInd });
            if (toggleInd) {
                selectedMarkerCategories.push(category);
            }
        });
        this.selectedMarkerCategoriesMap.set(outputId, selectedMarkerCategories);
        this.markerCategoriesMap.set(outputId, markerCategories);
        this._signalHandler.setMarkerCategoriesContext(this.toolbarMarkerCategoriesMap.size > 0);
    }

    private removeMarkerCategories(outputId: string) {
        const categoriesToRemove = this.markerCategoriesMap.get(outputId);
        if (categoriesToRemove) {
            categoriesToRemove.forEach(category => {
                const categoryInfo = this.toolbarMarkerCategoriesMap.get(category);
                const categoryCount = categoryInfo ? categoryInfo.categoryCount - 1 : 0;
                const toggleInd = categoryInfo ? categoryInfo.toggleInd : true;
                if (categoryCount === 0) {
                    this.toolbarMarkerCategoriesMap.delete(category);
                } else {
                    this.toolbarMarkerCategoriesMap.set(category, { categoryCount, toggleInd });
                }
            });
        }
        this.markerCategoriesMap.delete(outputId);
        this.selectedMarkerCategoriesMap.delete(outputId);
        this._signalHandler.setMarkerCategoriesContext(this.toolbarMarkerCategoriesMap.size > 0);
    }

    private doHandleMarkerCategoryClosedSignal(payload: { traceViewerId: string; markerCategory: string }) {
        const traceViewerId = payload.traceViewerId;
        const markerCategory = payload.markerCategory;
        if (traceViewerId === this.state.experiment?.UUID) {
            this.updateMarkerCategoryState(markerCategory, false);
        }
    }

    updateMarkerCategoryState(categoryName: string, toggleInd: boolean, skipUpdate?: boolean): void {
        const toggledmarkerCategory = this.toolbarMarkerCategoriesMap.get(categoryName);
        if (toggledmarkerCategory) {
            const categoryCount = toggledmarkerCategory?.categoryCount;
            this.toolbarMarkerCategoriesMap.set(categoryName, { categoryCount, toggleInd });
            this.markerCategoriesMap.forEach((categoriesList, outputId) => {
                const selectedMarkerCategories = categoriesList.filter(category => {
                    const currCategoryInfo = this.toolbarMarkerCategoriesMap.get(category);
                    return currCategoryInfo ? currCategoryInfo.toggleInd : false;
                });
                this.selectedMarkerCategoriesMap.set(outputId, selectedMarkerCategories);
            });
        }
        if (!skipUpdate) {
            this.forceUpdate();
        }
    }

    updateAllMarkerCategoryState(selection: string[]): void {
        const set: Set<string> = new Set<string>();

        for (const categoryName of selection) {
            set.add(categoryName);
        }

        const markerCategories = this.toolbarMarkerCategoriesMap;
        for (const [key] of markerCategories) {
            if (set.has(key)) {
                this.updateMarkerCategoryState(key, true, true);
            } else {
                this.updateMarkerCategoryState(key, false, true);
            }
        }
        this.forceUpdate();
    }

    async updateMarkerSetState(markerSetId: string): Promise<void> {
        if (this.markerSetsMap.get(markerSetId)?.enabled) {
            return;
        }
        this.selectedMarkerSetId = markerSetId;
        const prevSelectedMarkerSet = Array.from(this.markerSetsMap.values()).find(
            markerSetItem => markerSetItem.enabled
        );
        if (prevSelectedMarkerSet) {
            prevSelectedMarkerSet.enabled = false;
        }

        const markerSetEntry = this.markerSetsMap.get(markerSetId);
        if (markerSetEntry) {
            this.markerSetsMap.set(markerSetId, { ...markerSetEntry, enabled: true });
        }

        if (await Promise.all(this.state.outputs.map(output => this.fetchAnnotationCategories(output)))) {
            this.forceUpdate();
        }
    }

    protected doHandleOverviewSelectedSignal(payload: { traceId: string; outputDescriptor: OutputDescriptor }): void {
        if (
            this.state.experiment &&
            payload &&
            payload?.traceId === this.state.experiment.UUID &&
            payload.outputDescriptor
        ) {
            this.setState({ overviewOutputDescriptor: payload.outputDescriptor });
        }
    }

    protected doHandleThemeChanged(theme: string): void {
        this.setState({ theme }, () => {
            signalManager().fireThemeChangedSignal(theme);
        });
    }

    protected async getDefaultTraceOverviewOutputDescriptor(
        experiment: Experiment | undefined
    ): Promise<OutputDescriptor | undefined> {
        const availableDescriptors = await this.getAvailableTraceOverviewOutputDescriptor(experiment);
        return availableDescriptors?.find(output => output.id === this.DEFAULT_OVERVIEW_DATA_PROVIDER_ID);
    }

    protected async getAvailableTraceOverviewOutputDescriptor(
        experiment: Experiment | undefined
    ): Promise<OutputDescriptor[] | undefined> {
        let descriptors: OutputDescriptor[] | undefined;
        if (experiment && this.state.tspClientProvider) {
            const outputsResponse = await this.state.tspClientProvider
                .getTspClient()
                .experimentOutputs(experiment.UUID);
            if (outputsResponse && outputsResponse.isOk()) {
                descriptors = outputsResponse.getModel();
            }
            const overviewOutputDescriptors = descriptors?.filter(output => output.type === 'TREE_TIME_XY');
            return overviewOutputDescriptors;
        }
    }

    public render(): React.ReactNode {
        return (
            <div className="trace-viewer-container">
                {this.state.experiment && this.state.tspClientProvider && (
                    <TraceContextComponent
                        experiment={this.state.experiment}
                        tspClient={this.state.tspClientProvider.getTspClient()}
                        outputs={this.state.outputs}
                        overviewDescriptor={this.state.overviewOutputDescriptor}
                        markerCategoriesMap={this.selectedMarkerCategoriesMap}
                        markerSetId={this.selectedMarkerSetId}
                        messageManager={this._signalHandler}
                        onOutputRemove={this.onOutputRemoved}
                        onOverviewRemove={this.onOverviewRemoved}
                        // eslint-disable-next-line @typescript-eslint/no-empty-function
                        addResizeHandler={this.addResizeHandler}
                        removeResizeHandler={this.removeResizeHandler}
                        backgroundTheme={this.state.theme}
                    ></TraceContextComponent>
                )}
                {this.state.serverStatus === false && (
                    <div className="overlay">
                        <div className="overlay-message">
                            Please start a trace server to resume using the Trace Viewer.
                        </div>
                    </div>
                )}
            </div>
        );
    }
}

export default TraceViewerContainer;
