# Example docker image for vscode-trace-extension

This folder contains an example showing how to create a docker image
for vscode-trace-extension front-end.

Notes:

- the image will contain exclusively the trace-extension front-end.
  If you want to run a complete application, you will need a service
  running the trace-server (not included here);

- the image will be built using a specific [vsix package] of the
  trace-extension, and not the latest code in this repo;

- the *example-package.json* file is not named *package.json* because
  at the time this change was proposed building the trace-extension
  application from the source of this repo looked recursively to all
  package.json in the project, and we wanted to avoid pollution of the
  main project lockfile when building;

## How to build and run

Build the image and name it *tte*.

```bash
docker build -t tte .
```

Once the image has been built, start a container named *tte-1* from
the *tte* image:

```bash
docker run --name tte-1 --network host tte
```

Connect to `localhost:4000` your browser.
You should be able to see the trace-extension UI.
If it is not visible, click on `View -> Open View... -> Trace Viewer`

[vsix package]: https://open-vsx.org/extension/eclipse-cdt/vscode-trace-extension
