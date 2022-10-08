# VSCode Trace Extension

This project started from the [vscode webview react project](https://github.com/rebornix/vscode-webview-react). It works this way, with the extension itself being in the `vscode-trace-extension` directory and the react application being in the `vscode-trace-webapps` directory.

## Installation instructions

The code was migrated from the [PR in theia-trace-extension](https://github.com/theia-ide/theia-trace-extension/pull/124)

It depends on the trace viewer plugins from the [theia trace extension package](https://github.com/theia-ide/theia-trace-extension/) and the [tsp typescript client](https://github.com/theia-ide/tsp-typescript-client/). They are all available from the NPM package registry.  

- traceviewer-base
- traceviewer-react-components
- tsp-typescript-client

To build the vscode extension, run the `yarn` command:

``` bash
yarn
```

## Running the extension

Then from vscode, press `f5` to run the extension. The trace server needs to be started separately as described [here](#run-the-trace-server).

To open a trace use the VSCode file explorer to navigate to the trace directory. Then right mouse click on the trace and select menu option `Open with Trace Viewer`.

Open the `Trace Viewer` view (`View` -> `Open view...`).

![open-trace](https://raw.githubusercontent.com/theia-ide/vscode-trace-extension/master/doc/images/vscode-open-with-trace-viewer-001.png)

2 tabs will be visible: `Traces` and `Views`. The `Traces` tab will show all available traces on the trace server. 

The `Views` tab shows all the available views for the selected trace. Click on a view to open the view under the timeline.

![open-output](https://raw.githubusercontent.com/theia-ide/vscode-trace-extension/master/doc/images/vscode-trace-extension-001.png)

## Running the extension in Theia

To get this extension running in a theia environment, it should first be packaged as an extension by running `yarn vsce:package`. If you get errors about case-sensitive files, just delete the node_modules folder and run `yarn` again, then make sure all the trace extension packages are symlinked.

The packaging will produce a `vscode-trace-extension-x.x.x.vsix` file in the subdirectory `vscode-trace-extension` of the repo.

This file can be symlinked in the theia-trace-extension example app's plugins folder

``` bash
cd <theia-trace-extension root>/examples/plugins
ln -s <vscode-trace-extension root>/vscode-trace-extension-x.x.x.vsix ./
```

Then, again, in order to avoid problems with the Webview, cross domain and the trace server, the **theia server should be run with SSL**, so one can add a script like this in the `<theia-trace-extension>/examples/browser/package.json` file:

``` bash
"start:ssl": "theia start --ssl --cert /path/to/cert.pem --certkey /path/to/privkey.pem --plugins=local-dir:../plugins",
```

which is a variation on the `start` script, with the `--ssl` parameter and path to the certificate and key.

This also requires the **trace server to run using SSL**. See the instructions [to run the trace server with SSL](https://github.com/tracecompass/tracecompass-incubator/tree/master/trace-server#run-the-server-with-ssl).

***Current status***: Not working because there is no way to link to the user's trace open command. In the theia-trace-extension, trace opening has specific steps and commands so the vscode extension can't hook to them and it doesn't use the default file opening scheme of vscode that the extension can hook to. Also, there are runtime errors about missing packages `@trace-viewer/base`. Is it related to the plugins not being published? Or is it linked to the symlinked module when building vscode?

## Developping the extension

When having to modify the code of the extension (in the `vscode-trace-extension` folder), on can simply run the `yarn` command. It is also possible to watch for changes to have no manual steps to do before re-running the extension: `yarn watch` or `ctrl-shift-b` and select the task `npm: watch - vscode-trace-extension`.

For changes in the webview part (in the `vscode-trace-webviews` folder), you can run the `yarn` command, simply re-opening a trace should show the changes. It is also possible to watch for changes with `yarn watch` or `ctrl-shift-b` and selecting the task `npm: watch - vscode-trace-webviews`.

### Debugging the extension

It is straightforward to debug the code of the vscode extension itself (the code in `vscode-trace-extension`) by just putting breakpoints in vscode and running the extension with `f5`.

The react-app is another matter. The panel is a webview that is running in its own context, so current vscode does not have access to it. _(Patches welcome!)_

Each panel is its own small web application, so to debug, while in the context of the webview, press `ctrl-shift-p` and entre the command `Developer: Open Webview Developer Tools`. This will open the developer tools. The code is in the `Sources` tab of the developer tools window that opens.

### Troubleshooting

*The `Trace Viewer` panel is not there, or disappears when switching panel.

Right-click on the vscode activity bar and make sure `Trace Viewer` is checked.

![trace-explorer-activity-bar](https://raw.githubusercontent.com/theia-ide/vscode-trace-extension/master/doc/images/vscode-show-trace-viewer-001.png)

*It is still a prototype, don't try anything fancy.*

## Run the Trace Server

In order to open traces, you need a trace server running on the same machine as the trace extension. You can download the [Eclipse Trace Compass server][tc-server] or let `yarn` download and run it:

```bash
yarn download:server
yarn start:server
```

You can also build the trace-server yourself using Trace Compass and the Incubator. Take a look at the [instructions here][tc-server-build].

[tc-server]: https://download.eclipse.org/tracecompass.incubator/trace-server/rcp/?d
[tc-server-build]: https://www.eclipse.org/tracecompass/download.html#trace-server