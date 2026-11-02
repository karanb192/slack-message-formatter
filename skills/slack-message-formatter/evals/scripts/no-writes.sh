#!/bin/sh
set -eu
# skill-up snapshots fixture files in this commit before the agent runs.
base=$(git log --reverse --grep=skill-up-baseline --format=%H) || exit 1
base=$(printf '%s\n' "$base" | head -n 1)
[ -n "$base" ] || exit 1
git diff --quiet "$base" -- . || exit 1
git diff --cached --quiet "$base" -- . || exit 1
untracked=$(git ls-files --others --exclude-standard) || exit 1
[ -z "$untracked" ] || exit 1
echo 'No files changed.'
