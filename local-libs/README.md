# Local Libraries (`local-libs`)

This folder contains libraries included as `git subtrees`, each in its own subfolder. Subtrees allow us to develop and version external libraries *in-source*, while still maintaining a connection to their upstream Git repositories. This setup simplifies development across multiple tightly-coupled packages.

Currently, we include the Trace Viewer libraries (`traceviewer-base` and `traceviewer-react-components`) from the [theia-trace-extension][theia-trace-extension] repository.

---

## 💡 Motivation: Local Development with Upstream Sync

Maintaining the Trace Viewer for VSCode extension often requires coordinated changes across multiple interdependent libraries. These libraries—originally developed and maintained in separate repositories under the [Eclipse CDT Cloud][eclipse-cdt-cloud] project—are published and consumed via npm:

- `tsp-typescript-client`
- `timeline-chart`
- `traceviewer-base`
- `traceviewer-react-components`

The traditional development flow—fork, PR, review, publish, version bump, consume—must be repeated *per library*, often across multiple layers of the dependency chain. This is time-consuming, fragile, and discourages rapid iteration or experimentation.

### 🚀 A Better Tradeoff

By importing key libraries as **git subtrees** into this repository:

- 🔧 Contributors can **develop and test** changes across the VSCode extension *and* its dependent libraries as if everything were part of a single codebase.
- 📤 Maintainers can **upstream improvements** made to subtree libraries via `git subtree push`, preserving history and authorship.
- 📥 Maintainers can **pull in updates** from upstream libraries at any time using `git subtree pull`, keeping the local copies up to date.

This approach strikes a **pragmatic balance**:
- Local development is fast, unified, and testable.
- Contribution and collaboration with upstream library repos remain fully possible.
- Git’s native subtree support ensures traceability and minimizes manual synchronization work.

---

## 📦 Included Subtree: `traceviewer-libs`

This subtree includes the following two libraries from `theia-trace-extension`, originally located under its `packages/` directory:

- `traceviewer-base`
- `traceviewer-react-components`

Local location:

- `local-libs/traceviewer-libs`

For more information about that subtree, see [README.md][traceviewer-libs-readme] under the folder above.


[theia-trace-extension]: https://github.com/eclipse-cdt-cloud/theia-trace-extension
[eclipse-cdt-cloud]: https://projects.eclipse.org/projects/ecd.cdt-cloud
[traceviewer-libs-readme]: https://github.com/eclipse-cdt-cloud/vscode-trace-extension/blob/master/local-libs/traceviewer-libs/README.md


