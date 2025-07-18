# traceviewer-libs git subtree

This is a git subtree that was obtained by running the "git subtree split" on the `theia-trace-extension` repo, to split-out the content of the "packages" root folder into its own separate git entity. The full git history was maintained, for all commits that modified either "traceviewer-base" or "traceviewer-react-components" libraries. 

## How it was done

The `traceviewer-*` libraries were split-out from `theia-trace-extension` repo like so:

```bash
cd theia-trace-extension
git checkout master
# update local branch to latest master
git pull origin master
# clean all local files
git clean -ffdx


# split content of the "packages" folder (where the traceviewer
# libraries are). Put the resulting content on a branch called 
# "traceviewer-libs-branch"
git subtree split --prefix=packages --branch traceviewer-libs-branch

```

Note: by itself, the above does not remove the original libraries from the main branch of the `theia-trace-extension` repository. 

## TODO

### Push the `traceviewer-libs-branch` git subtree to its own repository

Below is how it was done for validation purposes. This can be repeated with an official repository, under the "eclipse-cdt-cloud" GitHub organization

1) Open a ticket on the Eclipse Foundation Gitlab and ask for an empty repo to be created, named "traceviewer-libs"
2) When done, push the latest version of the subtree branch to it (note: use the correct repo URL - below used a committer's GitHub):

```bash
git remote add traceviewer-libs git@github.com:marcdumais-work/traceviewer-libs.git
git push traceviewer-libs traceviewer-libs-branch:master

```

Depending how the repo it setup, it may be necessary to push to a PR branch and merge to master after a review.

## Use the subtree in another repo

### How to use the `traceviewer-libs` subtree in another repository

This is an example on how to add the subtree to a repo, replacing that repo consuming the
libraries from npm. 

```bash
cd vscode-trace-extension
# when available, use the official "eclipse-cdt-cloud" subtree repo instead
git remote add traceviewer-libs git@github.com:marcdumais-work/traceviewer-libs.git
git subtree add --prefix=traceviewer-libs traceviewer-libs master --squash

```

In the root package.json, add the libraries in the "workspaces" array:
"workspaces": [
    [...]
    "local-libs/traceviewer-libs/*"
    [...]
}

More changes/tweaks might be necessary.


### Push local changes made to the subtree towards the subtree repo

```bash
git subtree push -p <subtree folder> <subtree remote repo> <remote review branch>

```

### Pulling latest changes from the subtree repo into the local subtree

```bash
# make sure your local master is up-to-date:
git checkout master && git pull origin master
git branch update-subtree && git checkout update-subtree
git subtree pull --prefix=<local subtree folder> <subtree remote repo> master --squash

e.g.: 
git subtree pull --prefix=local-libs/traceviewer-react traceviewer-react master --squash

# push update branch and create a PR from it, have it reviewed and merged ASAP:
git push origin update-subtree

```

