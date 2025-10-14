/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-balham.css';
import * as React from 'react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
    ContextMenuContributedSignalPayload,
    ContextMenuItems
} from 'traceviewer-base/lib/signals/context-menu-contributed-signal-payload';
import { ContextMenuItemClickedSignalPayload } from 'traceviewer-base/lib/signals/context-menu-item-clicked-signal-payload';
import { ItemPropertiesSignalPayload } from 'traceviewer-base/lib/signals/item-properties-signal-payload';
import { RowSelectionsChangedSignalPayload } from 'traceviewer-base/lib/signals/row-selections-changed-signal-payload';
import { signalManager } from 'traceviewer-base/lib/signals/signal-manager';
import { TimeRangeUpdatePayload } from 'traceviewer-base/lib/signals/time-range-data-signal-payloads';
import { TraceContextComponent } from 'traceviewer-react-components/lib/components/trace-context-component';
import 'traceviewer-react-components/style/trace-context-style.css';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { MarkerSet } from 'tsp-typescript-client/lib/models/markerset';
import { OutputDescriptor } from 'tsp-typescript-client/lib/models/output-descriptor';
import { array } from 'tsp-typescript-client/lib/protocol/serialization';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import {
    addOutput,
    connectionStatus,
    contributeContextMenu,
    experimentSelected,
    getMarkerCategories,
    getMarkerSets,
    openOverview,
    outputDataChanged,
    redo,
    requestSelectionChange,
    resetZoom,
    setExperiment,
    setTheme,
    setTspClient,
    traceServerUrlChanged,
    undo,
    updateMarkerCategoryState,
    updateMarkerSetState,
    updateZoom
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { messenger } from '.';
import { VsCodeMessageManager } from '../common/vscode-message-manager';
import '../style/trace-viewer.css';
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

    /** Signal Handlers */
    private onViewRangeUpdated = (payload: TimeRangeUpdatePayload): void => {
        this._signalHandler.viewRangeUpdated(payload);
    };
    private onSelectionRangeUpdated = (payload: TimeRangeUpdatePayload): void => {
        this._signalHandler.selectionRangeUpdated(payload);
    };
    private onExperimentUpdated = (payload: Experiment): void => {
        this._signalHandler.experimentUpdated(payload);
    };

    private _onProperties = (properties: ItemPropertiesSignalPayload): void => {
        this._signalHandler.propertiesUpdated(properties);
    };

    private _onSaveAsCSV = (traceId: string, data: string): void => {
        this._signalHandler.saveAsCSV({ traceId, data });
    };

    private _onRowSelectionChanged = (payload: RowSelectionsChangedSignalPayload): void => {
        this._signalHandler.rowSelectChanged(payload);
    };
    private _onContextMenuItemClicked = (payload: ContextMenuItemClickedSignalPayload): void => {
        this._signalHandler.contextMenuItemClicked(payload);
    };

    private _onOverviewSelected = (traceId: string, outputDescriptor: OutputDescriptor): void =>
        this.doHandleOverviewSelectedSignal(traceId, outputDescriptor);
    private onMarkerCategoryClosedSignal = (traceViewerId: string, markerCategory: string) =>
        this.doHandleMarkerCategoryClosedSignal(traceViewerId, markerCategory);

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

    // VSCODE message handlers
    private _onVscodeSetTspClient = (data: any): void => {
        this.setState(
            {
                tspClientProvider: new TspClientProvider(data.data, this._signalHandler)
            },
            () => {
                if (data.experiment) {
                    this.doHandleExperimentSetSignal(JSONBigUtils.parse(data.experiment, Experiment), true);
                }
            }
        );
    };

    private _onVscodeExperimentSelected = (data: any): void => {
        if (data?.wrapper) {
            this.doHandleExperimentSelectedSignal(JSONBigUtils.parse(data.wrapper, Experiment));
        }
    };

    private _onVscodeUrlChanged = (data: string): void => {
        if (data && this.state.tspClientProvider) {
            this.state.tspClientProvider.updateTspClientUrl(data);
        }
    };

    private _onVscodeSetExperiment = (data: any): void => {
        if (data?.wrapper) {
            this.doHandleExperimentSetSignal(JSONBigUtils.parse(data.wrapper, Experiment), false);
        }
    };

    private _onVscodeAddOutput = (data: any): void => {
        if (data?.wrapper) {
            const descriptor: OutputDescriptor = JSONBigUtils.parse(data.wrapper, OutputDescriptor);
            this.doHandleOutputAddedMessage(descriptor);
        }
    };

    private _onVscodeOutputDataChanged = (data: any): void => {
        if (data) {
            const descriptors: OutputDescriptor[] = JSONBigUtils.parse(data, array(OutputDescriptor));
            this.doHandleOutputDataChanged(descriptors);
        }
    };

    private _onVscodeSetTheme = (data: any): void => {
        this.doHandleThemeChanged(data);
    };

    private _onVscodeOpenOverview = (): void => {
        this.doHandleExperimentSetSignal(this.state.experiment, false);
    };

    private _onVscodeResetZoom = (): void => {
        this.resetZoom();
    };

    private _onVscodeUndo = (): void => {
        this.undo();
    };

    private _onVscodeRedo = (): void => {
        this.redo();
    };

    private _onVscodeUpdateZoom = (data: any): void => {
        this.updateZoom(data);
        const result = JSONBigUtils.parse<TimeRangeUpdatePayload>(data);
        signalManager().emit('VIEW_RANGE_UPDATED', result);
    };

    private _onVscodeGetMarkerCategories = (): void => {
        this._signalHandler.fetchMarkerCategories(this.toolbarMarkerCategoriesMap);
    };

    private _onVscodeGetMarkerSets = (): void => {
        this._signalHandler.fetchMarkerSets(this.markerSetsMap);
    };

    private _onVscodeUpdateMarkerCategoryState = (data: any): void => {
        if (data?.wrapper) {
            const selection: string[] = JSON.parse(data.wrapper);
            this.updateAllMarkerCategoryState(selection);
        }
    };

    private _onVscodeUpdateMarkerSetState = (data: any): void => {
        if (data) {
            this.updateMarkerSetState(data);
        }
    };

    private _onVscodeUpdateContributeContextMenu = (data: any): void => {
        if (data) {
            const ctxMenuPayload: ContextMenuContributedSignalPayload = new ContextMenuContributedSignalPayload(
                data.outputDescriptorId,
                data.menuItems as ContextMenuItems
            );
            this.contributeContextMenu(ctxMenuPayload);
        }
    };

    private _onVscodeConnectionStatus = (data: any): void => {
        if (data) {
            const serverStatus: boolean = JSONBigUtils.parse(data);
            this.setState({ serverStatus });
        }
    };

    private _onRequestSelectionChanged = (data: any): void => {
        if (data) {
            const payload = JSONBigUtils.parse(data, TimeRangeUpdatePayload);
            signalManager().emit('REQUEST_SELECTION_RANGE_CHANGE', payload);
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
        this._signalHandler = new VsCodeMessageManager(messenger);
        messenger.onNotification(setTspClient, this._onVscodeSetTspClient);
        messenger.onNotification(traceServerUrlChanged, this._onVscodeUrlChanged);
        messenger.onNotification(experimentSelected, this._onVscodeExperimentSelected);
        messenger.onNotification(setExperiment, this._onVscodeSetExperiment);
        messenger.onNotification(addOutput, this._onVscodeAddOutput);
        messenger.onNotification(outputDataChanged, this._onVscodeOutputDataChanged);
        messenger.onNotification(setTheme, this._onVscodeSetTheme);
        messenger.onNotification(openOverview, this._onVscodeOpenOverview);
        messenger.onNotification(resetZoom, this._onVscodeResetZoom);
        messenger.onNotification(undo, this._onVscodeUndo);
        messenger.onNotification(redo, this._onVscodeRedo);
        messenger.onNotification(updateZoom, this._onVscodeUpdateZoom);
        messenger.onNotification(getMarkerCategories, this._onVscodeGetMarkerCategories);
        messenger.onNotification(getMarkerSets, this._onVscodeGetMarkerSets);
        messenger.onNotification(updateMarkerCategoryState, this._onVscodeUpdateMarkerCategoryState);
        messenger.onNotification(updateMarkerSetState, this._onVscodeUpdateMarkerSetState);
        messenger.onNotification(contributeContextMenu, this._onVscodeUpdateContributeContextMenu);
        messenger.onNotification(connectionStatus, this._onVscodeConnectionStatus);
        messenger.onNotification(requestSelectionChange, this._onRequestSelectionChanged);

        window.addEventListener('resize', this.onResize);
        this.onOutputRemoved = this.onOutputRemoved.bind(this);
        this.onOverviewRemoved = this.onOverviewRemoved.bind(this);
        signalManager().on('OVERVIEW_OUTPUT_SELECTED', this._onOverviewSelected);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
        signalManager().on('CONTEXT_MENU_ITEM_CLICKED', this._onContextMenuItemClicked);
        signalManager().on('ROW_SELECTIONS_CHANGED', this._onRowSelectionChanged);
        signalManager().on('ITEM_PROPERTIES_UPDATED', this._onProperties);
        signalManager().on('SAVE_AS_CSV', this._onSaveAsCSV);
        signalManager().on('MARKER_CATEGORY_CLOSED', this.onMarkerCategoryClosedSignal);
        signalManager().on('VIEW_RANGE_UPDATED', this.onViewRangeUpdated);
        signalManager().on('SELECTION_RANGE_UPDATED', this.onSelectionRangeUpdated);
        signalManager().on('EXPERIMENT_UPDATED', this.onExperimentUpdated);
    }

    componentWillUnmount(): void {
        signalManager().off('CONTEXT_MENU_ITEM_CLICKED', this._onContextMenuItemClicked);
        signalManager().off('ROW_SELECTIONS_CHANGED', this._onRowSelectionChanged);
        signalManager().off('ITEM_PROPERTIES_UPDATED', this._onProperties);
        signalManager().off('OVERVIEW_OUTPUT_SELECTED', this._onOverviewSelected);
        signalManager().off('SAVE_AS_CSV', this._onSaveAsCSV);
        signalManager().off('MARKER_CATEGORY_CLOSED', this.onMarkerCategoryClosedSignal);
        signalManager().off('VIEW_RANGE_UPDATED', this.onViewRangeUpdated);
        signalManager().off('SELECTION_RANGE_UPDATED', this.onSelectionRangeUpdated);
        signalManager().off('EXPERIMENT_UPDATED', this.onExperimentUpdated);
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
        signalManager().emit('RESET_ZOOM');
    }

    protected undo(): void {
        signalManager().emit('UNDO');
    }

    protected redo(): void {
        signalManager().emit('REDO');
    }

    protected contributeContextMenu(payload: ContextMenuContributedSignalPayload): void {
        signalManager().emit('CONTRIBUTE_CONTEXT_MENU', payload);
    }

    protected doHandleOutputDataChanged(descriptors: OutputDescriptor[]): void {
        signalManager().emit('OUTPUT_DATA_CHANGED', descriptors);
    }

    protected updateZoom(hasZoomedIn: boolean): void {
        signalManager().emit('UPDATE_ZOOM', hasZoomedIn);
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
            this.setState({ outputs: [...this.state.outputs, descriptor] });
            await this.fetchAnnotationCategories(descriptor);
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

    private doHandleMarkerCategoryClosedSignal(traceViewerId: string, markerCategory: string) {
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

    protected doHandleOverviewSelectedSignal(traceId: string, outputDescriptor: OutputDescriptor): void {
        if (this.state.experiment && traceId === this.state.experiment.UUID && outputDescriptor) {
            this.setState({ overviewOutputDescriptor: outputDescriptor });
        }
    }

    protected doHandleThemeChanged(theme: string): void {
        this.setState({ theme }, () => {
            signalManager().emit('THEME_CHANGED', theme);
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
