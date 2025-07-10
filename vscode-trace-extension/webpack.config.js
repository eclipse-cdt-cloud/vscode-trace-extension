'use strict';

const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");

/**
 * Path to Codicons css and ttf files.
 */
const codiconsCssPath = path.resolve(__dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
const codiconsFontPath = path.resolve(__dirname, '..', 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context

    entry: './src/extension.ts', // the entry point of this extension
    output: { // the bundle is stored in the 'lib' folder (check package.json)
        path: path.resolve(__dirname, 'lib'),
        filename: 'extension.js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'source-map',
    externals: {
        vscode: "commonjs vscode" // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed here.
    },
    resolve: {
        extensions: [".js", ".ts", ".tsx", ".json"]
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        compilerOptions: {
                            "module": "es6" // override `tsconfig.json` so that TypeScript emits native JS modules.
                        }
                    }
                },

                ]
            },
            {
                test: /\.js$/,
                enforce: 'pre',
                use: ['source-map-loader'],
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
                        loader: 'svg-url-loader',
                        options: {
                            limit: 10000,
                        },
                    },
                ],
            }
        ]
    },
    plugins: [
        new CopyPlugin({
          patterns: [
            { from: codiconsCssPath, to: "./codicons" }, // Copy codicons css and font files to lib/codicons so that they are packaged with the extension
            { from: codiconsFontPath, to: "./codicons" }
          ],
        }),
    ],
    watchOptions: {
        aggregateTimeout: 2000,
        ignored: /node_modules/,
    },
}

module.exports = config;
