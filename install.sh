#!/bin/bash
# Install slack-message-formatter skill for Claude Code
# Usage: curl -sSL https://raw.githubusercontent.com/karanb192/slack-message-formatter/main/install.sh | bash

set -e

REPO="https://github.com/karanb192/slack-message-formatter.git"
TMP=$(mktemp -d)
SCOPE="${1:-global}"

echo "Installing slack-message-formatter..."

git clone --depth 1 --quiet "$REPO" "$TMP"

if [ "$SCOPE" = "project" ]; then
  DEST=".claude/skills/slack-message-formatter"
  mkdir -p .claude/skills
else
  DEST="$HOME/.claude/skills/slack-message-formatter"
  mkdir -p "$HOME/.claude/skills"
fi

# Remove existing install
rm -rf "$DEST"

# Copy skill files
cp -r "$TMP/skills/slack-message-formatter" "$DEST"

# Clean up
rm -rf "$TMP"

echo "Installed to $DEST"
echo "Restart Claude Code to load the skill."
echo ""
echo "Usage: ask Claude to 'format a Slack message' or run /slack-message-formatter"
