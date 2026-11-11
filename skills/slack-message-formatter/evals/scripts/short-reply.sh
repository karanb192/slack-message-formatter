#!/bin/sh
set -eu
fail() { echo "$1"; exit 1; }
# skill-up snapshots fixture files in this commit before the agent runs.
base=$(git log --reverse --grep=skill-up-baseline --format=%H) || exit 1
base=$(printf '%s\n' "$base" | head -n 1)
[ -n "$base" ] || exit 1
[ -s draft.md ] || fail 'draft.md is missing or empty.'
git diff --quiet "$base" -- . ':!draft.md' || fail "A fixture file changed: $(git diff --name-only "$base" -- . ':!draft.md' | tr '\n' ' ')"
git diff --cached --quiet "$base" -- . ':!draft.md' || fail "A fixture file changed in the index: $(git diff --cached --name-only "$base" -- . ':!draft.md' | tr '\n' ' ')"
untracked=$(git ls-files --others --exclude-standard) || exit 1
case "$untracked" in
  ''|draft.md) ;;
  *) fail 'A file other than draft.md was written.' ;;
esac
thread=$(printf '\360\237\247\265')
emdash=$(printf '\342\200\224')
endash=$(printf '\342\200\223')
if grep -q -e "$emdash" -e "$endash" draft.md; then fail 'The draft uses an em or en dash.'; fi
first=$(sed -n '1p' draft.md)
lines=$(grep -c '[^[:space:]]' draft.md) || exit 1
[ "$lines" -le 2 ] || fail "The reply has $lines lines; one or two were asked for."
case "$first" in "$thread"*) fail 'A reply was given a thread topic line.' ;; esac
if grep -Eq '^[[:space:]]*([-+*][[:space:]]|#|\*\*)' draft.md; then
  fail 'A one-line reply was given a bullet, heading or bold headline.'
fi
echo 'The reply is one or two plain lines.'
