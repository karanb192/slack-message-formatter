#!/bin/sh
set -eu
fail() { echo "$1"; exit 1; }
# skill-up snapshots fixture files in this commit before the agent runs.
base=$(git log --reverse --grep=skill-up-baseline --format=%H) || exit 1
base=$(printf '%s\n' "$base" | head -n 1)
[ -n "$base" ] || exit 1
# skill-up stages new files before judging, so generated pages and a saved
# draft show up in a diff against the baseline; only fixtures must be unchanged.
set -- . ':(exclude)slack-out' ':(exclude)*.md' ':(exclude).skill-up'
git diff --quiet "$base" -- "$@" || fail "A fixture file changed: $(git diff --name-only "$base" -- "$@" | tr '\n' ' ')"
git diff --cached --quiet "$base" -- "$@" || fail "A fixture file changed in the index: $(git diff --cached --name-only "$base" -- "$@" | tr '\n' ' ')"
untracked=$(git ls-files --others --exclude-standard -- "$@") || exit 1
[ -z "$untracked" ] || fail "An unexpected file was written: $(printf '%s' "$untracked" | tr '\n' ' ')"
copy=$(ls slack-out/copy-*.html 2>/dev/null | tail -n 1)
[ -n "$copy" ] || fail 'No copy page was generated in slack-out.'
ls slack-out/preview-*.html >/dev/null 2>&1 || fail 'No preview page was generated in slack-out.'
grep -q '<div id="content">' "$copy" || fail 'The copy page was not written by the converter.'
grep -Fq 'export PATH=$HOME/tools/bin:$PATH' "$copy" || fail 'The command did not reach the copy page unchanged.'
grep -Fq 'which buildctl' "$copy" || fail 'The check command is missing from the copy page.'
if grep -q "$HOME/tools/bin" "$copy"; then fail 'A shell variable was expanded on the way to the converter.'; fi
echo 'The command reached the copy page with its variables unexpanded.'
