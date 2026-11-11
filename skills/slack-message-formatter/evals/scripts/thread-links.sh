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
pr='https://git.example.com/shop/api/pull/482'
dash='https://grafana.example.com/d/checkout-latency'
grep -Fq "$pr" draft.md || fail 'The pull request link is missing.'
grep -Fq "$dash" draft.md || fail 'The dashboard link is missing.'
grep -q 'SHOP-2291' draft.md || fail 'The ticket key is missing.'
urls=$(grep -Eo 'https?://[^])[:space:]>|]+' draft.md | sed 's/[.,;:]*$//' | sort -u)
for u in $urls; do
  case "$u" in
    "$pr"|"$dash") ;;
    *) fail "The draft links to an address that was not supplied: $u" ;;
  esac
done
echo 'Both supplied links are used and no other address appears.'
