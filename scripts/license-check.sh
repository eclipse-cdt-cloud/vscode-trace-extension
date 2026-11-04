#!/usr/bin/env bash
#
# 3PP license check driver used by the "3PP License Check" GitHub workflow
# (and runnable locally).
#
# Two modes:
#
#   full      Scan the entire yarn.lock via the dash-licenses nodejs-wrapper
#             (yarn license:check). This is the default and is used for any
#             change that may alter the dependency graph in a non-trivial way.
#
#   changed   Scan ONLY the ClearlyDefined coordinates that were ADDED to
#             yarn.lock between $BASE_REF and the current checkout. Used for
#             Dependabot "Bump <pkg> from X to Y" pull requests, which only
#             add a handful of new resolved versions (plus any transitive
#             bumps). This avoids re-scanning thousands of unchanged
#             coordinates on every dependency bump.
#
# Usage:
#   scripts/license-check.sh full
#   scripts/license-check.sh changed <base-ref>
#
# Environment:
#   DASH_TOKEN   (optional) Eclipse Foundation GitLab PAT for review mode.
#
# Both modes share:
#   * a workaround that pre-fetches dash-licenses.jar from the current Nexus 3
#     URL (the wrapper's bundled 0.0.1 downloader points at a decommissioned
#     Nexus 2 host), and
#   * a retry loop for the transient ClearlyDefined HTTP 524 (origin timeout)
#     backend error, which makes dash-licenses exit 127 ("inconclusive").

set -euo pipefail

MODE="${1:-full}"

JAR_DIR="node_modules/@eclipse-dash/nodejs-wrapper/download"
JAR="$JAR_DIR/dash-licenses.jar"
PROJECT="ecd.cdt-cloud"
EXCLUSIONS="configs/license-check-exclusions.json"
BATCH=25
TIMEOUT=60

# Pre-fetch the dash-licenses jar from the current Nexus 3 URL into the path
# the wrapper checks, so it skips its broken (Nexus 2) download.
prefetch_jar() {
    mkdir -p "$JAR_DIR"
    if [ ! -s "$JAR" ]; then
        curl -fSL -o "$JAR" \
            "https://repo.eclipse.org/service/rest/v1/search/assets/download?sort=version&repository=dash-maven2-releases&maven.groupId=org.eclipse.dash&maven.artifactId=org.eclipse.dash.licenses&maven.extension=jar"
    fi
}

# Run a command with retries, ONLY retrying the transient ClearlyDefined 524
# backend error (dash-licenses exit code 127 == inconclusive). Any other
# non-zero exit means real restricted dependencies were found, which retrying
# cannot fix, so we fail fast. $@ is the command to run.
run_with_retry() {
    local attempts=6 delay=30 rc=0 i
    for i in $(seq 1 "$attempts"); do
        echo "::group::license:check attempt $i of $attempts"
        set +e
        "$@"
        rc=$?
        set -e
        echo "::endgroup::"
        if [ "$rc" -eq 0 ]; then
            return 0
        fi
        if [ "$rc" -ne 127 ]; then
            echo "license:check found genuine license issues (exit $rc) - not a transient backend error; failing."
            return "$rc"
        fi
        echo "license:check was inconclusive due to a ClearlyDefined backend error (exit 127)."
        if [ "$i" -lt "$attempts" ]; then
            echo "Retrying in ${delay}s..."
            sleep "$delay"
        fi
    done
    echo "license:check remained inconclusive after $attempts attempts (ClearlyDefined backend unavailable)."
    return 1
}

# Full scan of the whole yarn.lock via the nodejs-wrapper.
run_full() {
    run_with_retry yarn license:check
}

# Scan only the coordinates added to yarn.lock since $BASE_REF.
run_changed() {
    local base_ref="${1:-}"
    if [ -z "$base_ref" ]; then
        echo "changed mode requires a base ref" >&2
        exit 2
    fi

    local tmp
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' RETURN

    # The old yarn.lock from the merge base; the new one is the working tree.
    git show "${base_ref}:yarn.lock" > "$tmp/old.lock"
    cp yarn.lock "$tmp/new.lock"

    node scripts/changed-license-coordinates.js "$tmp/old.lock" "$tmp/new.lock" > "$tmp/coords.txt"

    if [ ! -s "$tmp/coords.txt" ]; then
        echo "No new npm registry coordinates were added to yarn.lock vs ${base_ref}; nothing to license-check."
        return 0
    fi

    echo "Scanning $(wc -l < "$tmp/coords.txt") newly added coordinate(s):"
    cat "$tmp/coords.txt"

    # Scan just those coordinates by piping them into dash-licenses on stdin.
    # The wrapper only drives the jar with a lock file, so call the jar
    # directly and reproduce the wrapper's summary + exclusions handling.
    scan_coordinates() {
        local summary="$tmp/summary.txt"
        local -a args=(-jar "$JAR" - -batch "$BATCH" -timeout "$TIMEOUT" -summary "$summary" -project "$PROJECT")
        java "${args[@]}" < "$tmp/coords.txt"
        node scripts/evaluate-license-summary.js "$summary" "$EXCLUSIONS"
    }

    run_with_retry scan_coordinates
}

prefetch_jar
case "$MODE" in
    full)    run_full ;;
    changed) run_changed "${2:-}" ;;
    *)
        echo "unknown mode: $MODE (expected 'full' or 'changed')" >&2
        exit 2
        ;;
esac
