---
name: slack-message-formatter
description: |
  Format messages for Slack with pixel-perfect accuracy. Converts Markdown to
  rich HTML (for copy-paste into Slack) or Slack mrkdwn (for API/webhook).
  Use when the user asks to write a Slack message, announcement, or notification,
  format something "for Slack", preview how content looks in Slack, or send a
  message via Slack webhook. Also trigger when user mentions Slack formatting,
  mrkdwn, or wants to share Markdown content in Slack channels.
---

# Slack Message Formatter

Format messages for Slack with pixel-perfect accuracy. Converts Markdown to Slack-compatible output with two delivery paths:

1. **Copy-paste** — Rich HTML that preserves formatting when pasted into Slack's compose box
2. **API/Webhook** — Slack mrkdwn syntax for bots, automation, and CI/CD

## When to use this skill

- User asks to write a Slack message, announcement, or notification
- User asks to format something "for Slack"
- User wants to preview how a message will look in Slack
- User wants to send a message via Slack webhook
- User has Markdown content they want to share in Slack

## Workflow

### Step 1: Generate content in Markdown

Always generate the message content in **standard Markdown**. This is your native format and you produce it reliably. Use all Markdown features freely — the converter handles everything:

- `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
- `[text](url)` links
- `# Headings` (converted to bold in Slack)
- Tables (pipe syntax — converted to HTML tables for paste, code blocks for API)
- `- [ ]` / `- [x]` task lists (converted to emoji checkboxes)
- `---` horizontal rules (converted to unicode separator)
- Nested lists, blockquotes, code blocks with language hints
- Slack mentions like `<@U012AB3CD>`, `<#C012AB3CD>`, `<!here>` — pass through as-is

### Step 2: Convert and deliver

Run the converter script to transform the Markdown:

```bash
# Generate preview page + copy to clipboard
node skills/slack-message-formatter/src/run.mjs preview <<'MARKDOWN'
<paste the markdown here>
MARKDOWN
```

This will:
- Convert Markdown → Rich HTML (for copy-paste)
- Convert Markdown → Slack mrkdwn (for API)
- Write a Slack-themed preview page to `/tmp/slack-formatter/`
- Open the preview in the user's browser
- Copy the rich HTML to the system clipboard (if enabled)
- Print the file path for future reference

### Step 3: Report to user

Tell the user:
```
✅ Copied to clipboard + preview opened.
   Preview: /tmp/slack-formatter/preview-2026-03-18-141532.html
   Paste in Slack with Cmd+V.
```

If clipboard was disabled or failed:
```
✅ Preview opened.
   Preview: /tmp/slack-formatter/preview-2026-03-18-141532.html
   Copy from the browser page, then paste in Slack.
```

## Sending via Webhook (API path)

If the user wants to send directly to Slack via webhook:

```bash
node skills/slack-message-formatter/src/run.mjs send <<'MARKDOWN'
<paste the markdown here>
MARKDOWN
```

This uses the `CCH_SLA_WEBHOOK` environment variable (or any webhook URL the user provides). The message is converted to mrkdwn format and sent via `curl`.

## Slack mrkdwn Reference

Slack uses **mrkdwn** (not Markdown). Key differences:

| Markdown | Slack mrkdwn |
|----------|-------------|
| `**bold**` | `*bold*` |
| `*italic*` | `_italic_` |
| `~~strike~~` | `~strike~` |
| `[text](url)` | `<url\|text>` |
| `# heading` | `*heading*` (bold) |
| Tables | Not supported (use code block) |
| `- [ ] task` | `:black_square_button: task` |
| `- [x] done` | `:white_check_mark: done` |
| `---` | `━━━━━━━━━━` (unicode) |
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` (not blockquote) | `&gt;` |

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `SLACK_FORMATTER_CLIPBOARD` | `true` | Set to `false` to disable auto-clipboard copy |
| `SLACK_FORMATTER_PREVIEW_DIR` | `/tmp/slack-formatter` | Directory for preview HTML files |
| `CCH_SLA_WEBHOOK` | (none) | Slack webhook URL for sending messages |

## Content Guidelines

- **Always hyperlink ticket IDs and PR references.** Never write bare `ENG-12345`
  or `#123` — always use `[ENG-12345](https://armorcodeinc.atlassian.net/browse/ENG-12345)`
  or `[PR #123](url)`. This applies to every occurrence, not just the first.
- **Use blank lines between paragraphs.** Each distinct thought should be its own
  paragraph with a blank line before it. Never write multiple paragraphs as a wall
  of text — Slack collapses them together without spacing.
- **Keep messages concise.** Slack messages should be scannable. Lead with the key
  point, use bullet points for details, cut filler words.

## Important Notes

- **Always generate Markdown first**, then convert. Never generate mrkdwn or HTML directly — the converter is deterministic and correct, LLM output of these formats is not.
- **Slack mentions** (`<@U...>`, `<#C...>`, `<!here>`, `<!channel>`, `<!everyone>`) should be included in the Markdown as-is. The converter preserves them.
- **Tables work via the HTML copy-paste path** but not via mrkdwn (Slack has no table syntax). Tables are converted to code blocks in the mrkdwn output.
- **Preview files are timestamped** so users can revisit them from conversation history.
