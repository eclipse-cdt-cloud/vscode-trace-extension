/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { Vega } from 'react-vega';

import {
    connectionStatus,
    experimentSelected,
    setExperiment,
    setTspClient,
    setTheme,
    traceServerUrlChanged
} from 'vscode-trace-common/lib/messages/vscode-messages';
import { messenger } from '.';
import { VsCodeMessageManager } from '../common/vscode-message-manager';
import '../style/trace-viewer.css';
interface VscodeAppState {
    experiment: Experiment | undefined;
    tspClientProvider: TspClientProvider | undefined;
    theme: string;
    serverStatus: boolean;
}

class CustomViewerContainer extends React.Component<{}, VscodeAppState> {
    private _signalHandler: VsCodeMessageManager;

    /** Signal Handlers */
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
                    this.doHandleExperimentSetSignal(JSONBigUtils.parse(data.experiment, Experiment));
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
            this.doHandleExperimentSetSignal(JSONBigUtils.parse(data.wrapper, Experiment));
        }
    };

    private _onVscodeSetTheme = (data: any): void => {
        // this.doHandleThemeChanged(data);
    };

    private _onVscodeConnectionStatus = (data: any): void => {
        if (data) {
            const serverStatus: boolean = JSONBigUtils.parse(data);
            this.setState({ serverStatus });
        }
    };


    constructor(props: {}) {
        super(props);
        this.state = {
            experiment: undefined,
            tspClientProvider: undefined,
            theme: 'light',
            serverStatus: true
        };
        this._signalHandler = new VsCodeMessageManager(messenger);
        messenger.onNotification(setTspClient, this._onVscodeSetTspClient);
        messenger.onNotification(traceServerUrlChanged, this._onVscodeUrlChanged);
        messenger.onNotification(experimentSelected, this._onVscodeExperimentSelected);
        messenger.onNotification(setExperiment, this._onVscodeSetExperiment);
        messenger.onNotification(setTheme, this._onVscodeSetTheme);
        messenger.onNotification(connectionStatus, this._onVscodeConnectionStatus);

        window.addEventListener('resize', this.onResize);
    }

    componentDidMount(): void {
        this._signalHandler.notifyReady();
    }

    componentWillUnmount(): void {
        window.removeEventListener('resize', this.onResize);
    }

    private onResize = (): void => {
        this.resizeHandlers.forEach(h => h());
    };

    protected async doHandleExperimentSetSignal(
        experiment: Experiment | undefined
    ): Promise<void> {
        if (experiment) {
            this.setState({
                experiment: experiment,
            });
        }
    }

    protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
        if (experiment?.UUID === this.state.experiment?.UUID) {
        }
    }

    public render(): React.ReactNode {

        const spec = {
            "$schema": "https://vega.github.io/schema/vega/v5.json",
            "description": "A basic bar chart example, with value labels shown upon pointer hover.",
            "width": 400,
            "height": 200,
            "padding": 5,
          
            "data": [
              {
                "name": "table",
                "values": [
                  {"category": "A", "amount": 28},
                  {"category": "B", "amount": 55},
                  {"category": "C", "amount": 43},
                  {"category": "D", "amount": 91},
                  {"category": "E", "amount": 81},
                  {"category": "F", "amount": 53},
                  {"category": "G", "amount": 19},
                  {"category": "H", "amount": 87}
                ]
              }
            ],
          
            "signals": [
              {
                "name": "tooltip",
                "value": {},
                "on": [
                  {"events": "rect:pointerover", "update": "datum"},
                  {"events": "rect:pointerout",  "update": "{}"}
                ]
              }
            ],
          
            "scales": [
              {
                "name": "xscale",
                "type": "band",
                "domain": {"data": "table", "field": "category"},
                "range": "width",
                "padding": 0.05,
                "round": true
              },
              {
                "name": "yscale",
                "domain": {"data": "table", "field": "amount"},
                "nice": true,
                "range": "height"
              }
            ],
          
            "axes": [
              { "orient": "bottom", "scale": "xscale" },
              { "orient": "left", "scale": "yscale" }
            ],
          
            "marks": [
              {
                "type": "rect",
                "from": {"data":"table"},
                "encode": {
                  "enter": {
                    "x": {"scale": "xscale", "field": "category"},
                    "width": {"scale": "xscale", "band": 1},
                    "y": {"scale": "yscale", "field": "amount"},
                    "y2": {"scale": "yscale", "value": 0}
                  },
                  "update": {
                    "fill": {"value": "steelblue"}
                  },
                  "hover": {
                    "fill": {"value": "red"}
                  }
                }
              },
              {
                "type": "text",
                "encode": {
                  "enter": {
                    "align": {"value": "center"},
                    "baseline": {"value": "bottom"},
                    "fill": {"value": "#333"}
                  },
                  "update": {
                    "x": {"scale": "xscale", "signal": "tooltip.category", "band": 0.5},
                    "y": {"scale": "yscale", "signal": "tooltip.amount", "offset": -2},
                    "text": {"signal": "tooltip.amount"},
                    "fillOpacity": [
                      {"test": "datum === tooltip", "value": 0},
                      {"value": 1}
                    ]
                  }
                }
              }
            ]
          };
          
        return (<Vega spec={spec}/>
        );
    }
}

export default CustomViewerContainer;
