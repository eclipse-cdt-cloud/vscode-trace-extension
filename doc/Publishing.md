# Releasing/Publishing the Trace Viewer Extension

The Github workflows are setup to make this relatively simple. 

When it's desired to have a new release:

- open a Pull Request that steps the version of the extension in `vscode-trace-extension/package.json`
- As part of the PR, update file RELEASE \[1\] in the repo root. Update the tag to match the one in package.json.
  e.g.
  > tag: v0.2.1

- The PR should be automatically updated, and a preview of the automatically generated release noted, will be added in the form of a comment
- Upon merging the PR, the GH release will automatically be created, using the generated release notes. A git tag for the new release will also be created in the repo. If needed, a committer can edit to release. 
- The creation of the release git tag should trigger a publish workflow that will build and release a new version of the extension to openvsx.org

\[1\]: Here is the action that we use. For more details see its documentation: https://github.com/pipe-cd/actions-gh-release#actions-gh-release