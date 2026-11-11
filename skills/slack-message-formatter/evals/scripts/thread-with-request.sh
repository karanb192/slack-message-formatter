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
case "$first" in
  "$thread for "*) ;;
  *) fail 'Line one is not a thread topic line.' ;;
esac
case "$first" in *http*) fail 'The topic line carries a link.' ;; esac
case "$first" in *@Sam*) ;; *) fail 'Sam is not tagged on the topic line.' ;; esac
grep -q 'Thursday' draft.md || fail 'The Thursday deadline is missing.'
grep -Fq 'https://docs.example.com/migrations/4-2' draft.md || fail 'The migration plan link is missing.'
echo 'Thread line tags Sam; the deadline and the plan link are present.'
