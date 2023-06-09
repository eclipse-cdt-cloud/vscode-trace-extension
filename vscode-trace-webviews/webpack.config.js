const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: {
    trace_panel: "./src/trace-viewer/index.tsx",
    openedTracesPanel: "./src/trace-explorer/opened-traces/index.tsx",
    analysisPanel: "./src/trace-explorer/available-views/index.tsx",
    propertiesPanel: "./src/trace-explorer/properties/index.tsx",
    shortcutsPanel: "./src/trace-explorer/shortcuts/index.tsx",
    timeRangePanel: "./src/trace-explorer/time-range/index.tsx"
  },
  output: {
    path: path.resolve(__dirname, "../vscode-trace-extension/pack"),
    filename: "[name].js"
  },
  devtool: "inline-source-map",
  resolve: {
    extensions: [".js", ".ts", ".tsx", ".json"]
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                module: "es6" // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
              }
            }
          }
        ]
      },
      {
        test: /\.js$/,
        enforce: "pre",
        use: ["source-map-loader"]
      },
      {
        test: /\.css$/,
        use: [
          {
            loader: "style-loader"
          },
          {
            loader: "css-loader"
          }
        ]
      },
      {
        test: /\.svg$/,
        use: [
          {
            loader: "svg-url-loader",
            options: {
              limit: 10000
            }
          }
        ]
      }
    ]
  },
  performance: {
    hints: false
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env": {
        NODE_ENV: JSON.stringify(process.env.NODE_ENV || "development")
      }
    }),
    new webpack.HotModuleReplacementPlugin()
  ]
};
