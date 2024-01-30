# Releasing/Publishing the Trace Viewer Extension

The Github workflows are setup to make this relatively simple. 

When it's desired to have a new release:

- open a Pull Request that steps the version of the extension in `vscode-trace-extension/package.json`
- As part of the PR, update file RELEASE \[1\] in the repo root. Add or modify it to reflect the new version-to-be-released.
  e.g.
  > tag: v0.1.0                        # The tag number will be created. Required.

- The PR should be automatically updated, and automatically generated release noted added to it
- Upon merging the PR, the GH release will automatically be created, and the release notes added to document it. A release tag, for the new relase will also be created in the repo.
- The release tag should trigger a publish workflow that will build and release a new version of the extension to openvsx.org

\[1\]: Here is the action that we use. For more details see its documentation: https://github.com/pipe-cd/actions-gh-release#actions-gh-release