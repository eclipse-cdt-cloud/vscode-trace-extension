/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { Experiment } from 'tsp-typescript-client/lib/models/experiment';
import { JSONBigUtils } from 'tsp-typescript-client/lib/utils/jsonbig-utils';
import { TspClientProvider } from 'vscode-trace-common/lib/client/tsp-client-provider-impl';
import { Vega, ViewListener } from 'react-vega';

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
import { Entry, QueryHelper, ResponseStatus, XYSeries } from 'tsp-typescript-client';
import { View } from 'vega';
interface VscodeAppState {
  experiment: Experiment | undefined;
  tspClientProvider: TspClientProvider | undefined;
  theme: string;
  serverStatus: boolean;
  outputStatus: string;
  xyTree: Entry[];
  xySeries: XYSeries[];
}

class CustomViewerContainer extends React.Component<{}, VscodeAppState> {
  private _signalHandler: VsCodeMessageManager;

  // private dpId = "org.eclipse.tracecompass.internal.analysis.timing.core.segmentstore.scatter.dataprovider:lttng.analysis.irq";
  private dpId = "org.eclipse.tracecompass.analysis.os.linux.core.cpuusage.CpuUsageDataProvider";

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

  private _onNewView: ViewListener = (view: View) => {
     const svgString = view.toSVG();
     console.log(svgString);
  }

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
      serverStatus: true,
      xyTree: [],
      xySeries: [],
      outputStatus: ResponseStatus.RUNNING
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

  protected async waitAnalysisCompletion(): Promise<void> {
    let outputStatus = this.state.outputStatus;
    let factor = 1.0;
    const maxFactor = 10;
    do {
      outputStatus = await this.fetchTree();
      const timeout = 500 * factor;
      await new Promise(resolve => setTimeout(resolve, timeout));
      factor = factor > maxFactor ? factor : factor + 1;
    } while (this.state && outputStatus === ResponseStatus.RUNNING);
  }

  private onResize = (): void => {
    this.resizeHandlers.forEach(h => h());
  };

  async fetchTree(): Promise<ResponseStatus> {
    if (!this.state.experiment) {
      return ResponseStatus.FAILED;
    }
    const experiment: Experiment = this.state.experiment;
    // this.viewSpinner(true);
    const parameters = QueryHelper.timeRangeQuery(experiment.start, experiment.end);

    const tspClientResponse = await this.state.tspClientProvider?.getTspClient().fetchXYTree(
      experiment.UUID,
      this.dpId,
      parameters
    );
    const treeResponse = tspClientResponse?.getModel();
    if (tspClientResponse?.isOk() && treeResponse) {
      if (treeResponse.model) {
        const headers = treeResponse.model.headers;
        const columns = [];
        if (headers && headers.length > 0) {
          headers.forEach(header => {
            columns.push({ title: header.name, sortable: true, resizable: true, tooltip: header.tooltip });
          });
        } else {
          columns.push({ title: 'Name', sortable: true });
        }
        // const checkedSeries = this.getAllCheckedIds(treeResponse.model.entries);
        this.setState(
          {
            outputStatus: treeResponse.status,
            xyTree: treeResponse.model.entries,
            // defaultOrderedIds: treeResponse.model.entries.map(entry => entry.id),
            // checkedSeries,
            // columns
          },
          () => {
            console.log("Time fetch series");
            this.updateXY();
          }
        );
      } else {
        this.setState({
          outputStatus: treeResponse.status
        });
      }
      // this.viewSpinner(false);
      return treeResponse ? treeResponse.status : ResponseStatus.FAILED
    }
    this.setState({
      outputStatus: ResponseStatus.FAILED
    });
    // this.viewSpinner(false);
    return ResponseStatus.FAILED;
  };

  private async updateXY(): Promise<void> {
    const experiment = this.state.experiment;
    if (!experiment) {
      return;
    }
    const start = BigInt(experiment.start);
    const end = BigInt(experiment.end);
    // const viewRange = this.getDisplayedRange();
    // if (viewRange) {
    // start = viewRange.getStart();
    // end = viewRange.getEnd();
    // }

    const checkedSeries: number[] = [];
    for (const entry of this.state.xyTree) {
      checkedSeries.push(entry.id);
    }

    const xyDataParameters = QueryHelper.selectionTimeRangeQuery(
      start,
      end,
      1000,
      checkedSeries
    );

    // Query back-end
    const tspClientResponse = await this.state.tspClientProvider?.getTspClient().fetchXY(
      experiment.UUID,
      this.dpId,
      xyDataParameters
    );
    const xyDataResponse = tspClientResponse?.getModel();
    if (tspClientResponse?.isOk() && xyDataResponse?.model?.series) {
      const series = xyDataResponse.model.series;
      this.setState({
        xySeries: series
      })
    }
  }

  protected async doHandleExperimentSetSignal(
    experiment: Experiment | undefined
  ): Promise<void> {
    if (experiment) {
      this.setState({
        experiment: experiment,
      },
        async () => {
          await this.waitAnalysisCompletion();
        });
    }
  }

  protected doHandleExperimentSelectedSignal(experiment: Experiment | undefined): void {
    if (experiment?.UUID === this.state.experiment?.UUID) {
      if (experiment) {
        this.setState({
          experiment: experiment,
        });
      }
    }
  }

  public render(): React.ReactNode {
    // let spec = this.getDefaultSpec();

    if (this.state.xySeries && this.state.xySeries.length > 0) {
      console.log("New render");

      const points = [];
      
      for (const element of this.state.xySeries) {
        const series = element;
        for (let i = 0; i < series.xValues.length; i++) {
          points.push({ "time": Number(series.xValues[i]), "CPU Usage": series.yValues[i] })
        }
        break;
      }

      const spec = {
        "$schema": "https://vega.github.io/schema/vega/v5.json",
        "description": "An interactive histogram for visualizing a univariate distribution.",
        "width": 800,
        "height": 300,
        "padding": 5,
      
        "signals": [
          { "name": "binOffset", "value": 0, "bind": {"input": "range", "min": 0, "max": 800} },
          { "name": "binStep", "value": 10, "bind": {"input": "range", "min": 1, "max": 20, "step": 1} }
        ],
      
        "data": [
          {
            "name": "points",
            "values": points
          },
          {
            "name": "binned",
            "source": "points",
            "transform": [
              {
                "type": "bin", "field": "CPU Usage",
                "extent": [0,800],
                "anchor": {"signal": "binOffset"},
                "step": {"signal": "binStep"},
                "nice": false
              },
              {
                "type": "aggregate",
                "key": "bin0", "groupby": ["bin0", "bin1"],
                "fields": ["bin0"], "ops": ["count"], "as": ["count"]
              }
            ]
          }
        ],
      
        "scales": [
          {
            "name": "xscale",
            "type": "linear",
            "range": "width",
            "domain": [0, 800]
          },
          {
            "name": "yscale",
            "type": "linear",
            "range": "height", "round": true,
            "domain": {"data": "binned", "field": "count"},
            "zero": true, "nice": true
          }
        ],
      
        "axes": [
          {"orient": "bottom", "scale": "xscale", "zindex": 1},
          {"orient": "left", "scale": "yscale", "tickCount": 5, "zindex": 1}
        ],
      
        "marks": [
          {
            "type": "rect",
            "from": {"data": "binned"},
            "encode": {
              "update": {
                "x": {"scale": "xscale", "field": "bin0"},
                "x2": {"scale": "xscale", "field": "bin1", "offset": {"signal": "binStep > 5 ? -0.5 : 0"}},
                "y": {"scale": "yscale", "field": "count"},
                "y2": {"scale": "yscale", "value": 0},
                "fill": {"value": "steelblue"}
              },
              "hover": { "fill": {"value": "firebrick"} }
            }
          },
          {
            "type": "rect",
            "from": {"data": "points"},
            "encode": {
              "enter": {
                "x": {"scale": "xscale", "field": "CPU Usage"},
                "width": {"value": 1},
                "y": {"value": 25, "offset": {"signal": "height"}},
                "height": {"value": 5},
                "fill": {"value": "steelblue"},
                "fillOpacity": {"value": 0.4}
              }
            }
          }
        ]
      }

      const name = this.state.experiment ? this.state.experiment.name : "";
      return (
      <div>
        <h1>{ "Trace: " + name } </h1>
        <h2>CPU Usage distribution</h2>
        <Vega spec={spec} onNewView={ this._onNewView } />
      </div>
      );
    }
    return <div>No data</div>
  }

  // private getDefaultSpec() {
    // return {
    //   "$schema": "https://vega.github.io/schema/vega/v5.json",
    //   "description": "A basic bar chart example, with value labels shown upon pointer hover.",
    //   "width": 400,
    //   "height": 200,
    //   "padding": 5,

    //   "data": [
    //     {
    //       "name": "table",
    //       "values": [
    //         { "category": "A", "amount": 28 },
    //         { "category": "B", "amount": 55 },
    //         { "category": "C", "amount": 43 },
    //         { "category": "D", "amount": 91 },
    //         { "category": "E", "amount": 81 },
    //         { "category": "F", "amount": 53 },
    //         { "category": "G", "amount": 19 },
    //         { "category": "H", "amount": 87 }
    //       ]
    //     }
    //   ],

    //   "signals": [
    //     {
    //       "name": "tooltip",
    //       "value": {},
    //       "on": [
    //         { "events": "rect:pointerover", "update": "datum" },
    //         { "events": "rect:pointerout", "update": "{}" }
    //       ]
    //     }
    //   ],

    //   "scales": [
    //     {
    //       "name": "xscale",
    //       "type": "band",
    //       "domain": { "data": "table", "field": "category" },
    //       "range": "width",
    //       "padding": 0.05,
    //       "round": true
    //     },
    //     {
    //       "name": "yscale",
    //       "domain": { "data": "table", "field": "amount" },
    //       "nice": true,
    //       "range": "height"
    //     }
    //   ],

    //   "axes": [
    //     { "orient": "bottom", "scale": "xscale" },
    //     { "orient": "left", "scale": "yscale" }
    //   ],

    //   "marks": [
    //     {
    //       "type": "rect",
    //       "from": { "data": "table" },
    //       "encode": {
    //         "enter": {
    //           "x": { "scale": "xscale", "field": "category" },
    //           "width": { "scale": "xscale", "band": 1 },
    //           "y": { "scale": "yscale", "field": "amount" },
    //           "y2": { "scale": "yscale", "value": 0 }
    //         },
    //         "update": {
    //           "fill": { "value": "steelblue" }
    //         },
    //         "hover": {
    //           "fill": { "value": "red" }
    //         }
    //       }
    //     },
    //     {
    //       "type": "text",
    //       "encode": {
    //         "enter": {
    //           "align": { "value": "center" },
    //           "baseline": { "value": "bottom" },
    //           "fill": { "value": "#333" }
    //         },
    //         "update": {
    //           "x": { "scale": "xscale", "signal": "tooltip.category", "band": 0.5 },
    //           "y": { "scale": "yscale", "signal": "tooltip.amount", "offset": -2 },
    //           "text": { "signal": "tooltip.amount" },
    //           "fillOpacity": [
    //             { "test": "datum === tooltip", "value": 0 },
    //             { "value": 1 }
    //           ]
    //         }
    //       }
    //     }
    //   ]
    // };
  // }

        // Vega-lite
      // const spec = {
      //   "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
      //   "data": {
      //     "values": points
      //   },
      //   "layer": [{
      //     "mark": "bar",
      //     "encoding": {
      //       "x": {"field": "CPU Usage", "bin": true},
      //       "y": {"aggregate": "count"}
      //     }
      //   },{
      //     "mark": "rule",
      //     "encoding": {
      //       "x": {"aggregate": "mean", "field": "CPU Usage"},
      //       "color": {"value": "red"},
      //       "size": {"value": 20}
      //     }
      //   }]
      // }
}

export default CustomViewerContainer;
