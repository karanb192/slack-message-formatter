#!/bin/sh
set -eu
# skill-up snapshots fixture files in this commit before the agent runs.
base=$(git log --grep=skill-up-baseline -1 --format=%H)
[ -n "$base" ] || exit 1
git diff --quiet "$base" -- . || exit 1
git diff --cached --quiet "$base" -- . || exit 1
untracked=$(git ls-files --others --exclude-standard) || exit 1
[ -z "$untracked" ] || exit 1
echo 'No files changed.'
