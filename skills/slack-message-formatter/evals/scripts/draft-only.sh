#!/bin/sh
set -eu
# skill-up snapshots fixture files in this commit before the agent runs.
base=$(git log --reverse --grep=skill-up-baseline --format=%H) || exit 1
base=$(printf '%s\n' "$base" | head -n 1)
[ -n "$base" ] || exit 1
[ -s draft.md ] || exit 1
if [ -f expected.txt ]; then cmp -s expected.txt draft.md || exit 1; fi
git diff --quiet "$base" -- . ':!draft.md' || exit 1
git diff --cached --quiet "$base" -- . ':!draft.md' || exit 1
untracked=$(git ls-files --others --exclude-standard) || exit 1
case "$untracked" in
  ''|draft.md) ;;
  *) exit 1 ;;
esac
echo 'Only the requested draft was written.'
