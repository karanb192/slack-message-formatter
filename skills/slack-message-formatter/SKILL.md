---
name: slack-message-formatter
description: |
  Format messages for Slack with pixel-perfect accuracy. Converts Markdown to
  rich HTML (for copy-paste into Slack) or Slack mrkdwn (for API/webhook).
  Use for ANY text the user will put into Slack: a message, thread reply, DM,
  announcement, notification, status update, or a "quick" one-liner. Trigger on
  "slack message", "reply on the thread", "message for the channel", "post this
  in slack", "send via webhook", "format for slack", mrkdwn, or previewing how
  content looks in Slack. Shortness is not a reason to skip this skill, and
  neither is the user never saying the word "format": a hand-written Slack
  message loses the structure rules and the paste-safe HTML this skill produces.
  Invoke it BEFORE writing any message text, not after.
---

# Slack Message Formatter

Format messages for Slack with pixel-perfect accuracy. Converts Markdown to Slack-compatible output with two delivery paths:

1. **Copy-paste**: rich HTML that preserves formatting when pasted into Slack's compose box
2. **API/Webhook**: Slack mrkdwn syntax for bots, automation, and CI/CD

## When to use this skill

- User asks to write a Slack message, announcement, or notification
- User asks for a thread reply, a DM, or a short update they will paste into Slack
- User asks to format something "for Slack"
- User wants to preview how a message will look in Slack
- User wants to send a message via Slack webhook
- User has Markdown content they want to share in Slack

Invoke the skill before drafting any message text. A one-line reply still goes
through the converter: the structure rules and the paste-safe HTML are the point,
and both are lost when the message is written by hand in chat instead.

## Workflow

Requires Node.js 20 or newer. Resolve `src/run.mjs` relative to the directory
containing this `SKILL.md`, using the installed skill path supplied by the agent.
Set `SLACK_FORMATTER_ROOT` to that absolute directory in each shell invocation.
It is a shell variable you set, not an environment variable supplied by Codex or
Claude Code. The user's current project need not contain the formatter repo.

### Step 1: Generate content in Markdown

Always generate the message content in **standard Markdown**. This is your native format and you produce it reliably. Use all Markdown features freely, because the converter handles everything:

- `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``
- `[text](url)` links
- `# Headings` (converted to bold in Slack)
- Tables (pipe syntax, converted to HTML tables for paste, code blocks for API)
- `- [ ]` / `- [x]` task lists (converted to emoji checkboxes)
- `---` horizontal rules (converted to unicode separator)
- Nested lists, blockquotes, code blocks with language hints
- Slack mentions: **only work via the API/webhook path.** See "Mentions" below.

### Step 2: Convert and deliver

Run the converter script to transform the Markdown:

```bash
# Replace this path with the directory containing the loaded SKILL.md.
SLACK_FORMATTER_ROOT='/absolute/path/to/slack-message-formatter'
node "$SLACK_FORMATTER_ROOT/src/run.mjs" preview <<'MARKDOWN'
<paste the markdown here>
MARKDOWN
```

This will:
- Convert Markdown → Rich HTML (for copy-paste)
- Convert Markdown → Slack mrkdwn (for API)
- Write a copy page + Slack-themed preview page to `/tmp/slack-formatter/`
- Open the copy page in the user's browser
- Print both file paths for future reference

Note: the script does NOT touch the clipboard, because programmatic clipboard writes
don't survive Slack's paste handler. The user copies manually from the browser.

### Step 3: Report to user

Tell the user:
```
✅ Copy page opened in your browser.
   Select all (Cmd+A), copy (Cmd+C), then paste in Slack (Cmd+V).
   Preview: /tmp/slack-formatter/preview-2026-03-18-141532.html
```

## Sending via Webhook (API path)

If the user wants to send directly to Slack via webhook:

```bash
SLACK_FORMATTER_ROOT='/absolute/path/to/slack-message-formatter'
node "$SLACK_FORMATTER_ROOT/src/run.mjs" send <<'MARKDOWN'
<paste the markdown here>
MARKDOWN
```

This uses the `SLACK_WEBHOOK_URL` environment variable (`CCH_SLA_WEBHOOK` is
still honored for back-compat). The message is converted to mrkdwn format and
POSTed to the webhook; HTTP errors from Slack are reported with status and body.

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
| `SLACK_FORMATTER_PREVIEW_DIR` | `/tmp/slack-formatter` | Directory for preview HTML files (pruned after 7 days) |
| `SLACK_FORMATTER_NO_OPEN` | (unset) | When set, `preview` generates the pages but does not open a browser (used by tests/CI) |
| `SLACK_WEBHOOK_URL` | (none) | Slack webhook URL for sending messages (`CCH_SLA_WEBHOOK` also honored) |
| `JIRA_BASE_URL` | (none) | Jira site URL (e.g. `https://yoursite.atlassian.net`). When set, bare ticket keys like `ENG-12345` are auto-linked to `$JIRA_BASE_URL/browse/ENG-12345` on every output path. Keys inside code, existing links, or URLs are left alone. |

## Content Guidelines

**These are hard rules, not suggestions. Slack messages produced by this skill
must be super concise and structured, never paragraphs of prose.**

- **Default to a thread starter.** Open with `🧵 for <topic>:` and go straight
  into points, unless the user says the message is standalone or is a reply
  inside an existing thread. See "Default Message Structure" below.
- **Bullets over paragraphs, always.** If a message has more than one fact,
  those facts go in bullets. A prose paragraph is only acceptable as the single
  one-line context sentence under the headline. If you catch yourself writing
  a second sentence in a row, convert to bullets.
- **Hard length caps.** Headline: one line. Context: one line. Bullets: 2-5,
  each a single line (no wrapping walls of text inside a bullet). Closing
  `**Impact:**` / `**Ask:**` / `**Next:**` line: one line. If the content
  doesn't fit, cut detail instead of adding paragraphs. Link out for depth instead
  of inlining it.
- **Cut ruthlessly.** No preamble ("I wanted to share…", "Quick update on…"),
  no filler ("as you may know", "just", "basically"), no restating the
  headline in the context line, no sign-offs. Lead with the point.
- **If an anti-slop or tell-taxonomy skill is available in this environment,
  load it** and apply it on top of these rules. It is optional: when no such
  skill exists, the rules in this section stand on their own. Do not delegate
  compression to a technical-writing skill built for manuals, since those ban
  contractions and Slack reads stiff without them.
- **NEVER use em dashes (—).** They scream AI-generated. Use a comma, a
  period, a colon, or parentheses instead. This applies to every sentence,
  including headlines and bullets. Plain hyphens in ranges (`12:30-2:00 PM`)
  and compound words are fine.
- **Always hyperlink ticket IDs and PR references.** Never write bare `ENG-12345`
  or `#123`. Always use `[ENG-12345](https://yoursite.atlassian.net/browse/ENG-12345)`
  or `[PR #123](url)`. This applies to every occurrence, not just the first.
  If `JIRA_BASE_URL` is set, the converter auto-links bare Jira keys for you,
  but explicit links in the Markdown are still preferred (they survive with
  any configuration and let you control the link target).
- **Use blank lines between blocks.** Headline, context, bullet group, and
  closing line are each their own block with a blank line between, because Slack
  collapses adjacent lines together without spacing.
- **Only go longer if the user explicitly asks** for a detailed / verbose
  version. Even then, keep the structure: more bullets and sections, not prose.

## Default Message Structure

Most Slack messages open a thread, so the thread starter below is the default
shape. Use the standalone announcement shape only when the user says the message
is a standalone post, or when they are replying inside a thread that already
exists. Do not emit free-form paragraphs unless the user explicitly asks for prose.

### Thread starter (default)

```markdown
🧵 for <topic>: @Person @Person

- Point 1
- Point 2
- Point 3

**Ask:** one line.
```

- **`🧵 for <topic>:` on line one.** The thread emoji, then `for`, then the
  topic, ending with a colon. No bold. Emit the literal 🧵 character rather than
  the `:thread:` shortcode, so it survives the copy-paste path as well as the
  API path. The topic is a short noun phrase naming what the thread is about,
  not a sentence: "🧵 for the failing nightly build:", never "🧵 for discussing
  why the nightly build keeps failing".
- **Tag the people who must read it at the end of the topic line**, after the
  colon, never on a line of their own. Ask the user who to tag if they have not
  said. On the copy-paste path write them as plain `@Display Name`; see
  "Mentions" for why the user must re-type the `@` after pasting.
- **Points go directly under it.** 2-5 bullets, one line each, and no context
  sentence in between. The topic line is the context, so repeating it wastes the
  reader's first line.
- **Every artifact the reader needs to judge the thread gets a link**, in the
  points: the ticket, and also the failing build, blocked PR, dashboard, or log
  the thread is about. A reader should never have to ask "which PR?".
- **Links live inside the points**, never in the topic line. Keep the topic line
  scannable in the channel sidebar.
- **Close with a labeled line** when the thread needs something from someone:
  `**Ask:**`, `**Impact:**`, or `**Next:**`. A pure FYI thread can end on its
  last point.

### Standalone announcement (no thread)

```markdown
**Bold headline** ⚠️

One line of context (with a link if relevant).

- Evidence / detail bullet 1
- Evidence / detail bullet 2
- Evidence / detail bullet 3

**Impact:** one line.
```

- **Headline first**, bold, one line, optionally a status emoji (⚠️ 🚨 ✅ 🎉).
- **One line of context**: what happened or why it matters, with a link.
- **Bullets for everything else**, 2-5 short scannable bullets, never paragraphs.
- **End with a labeled line** (`**Impact:**`, `**Ask:**`, or `**Next:**`) so
  readers know what to do without reading everything above.
- Skip blocks that don't apply (a two-line FYI needs no bullets or Impact line),
  but never replace a block with prose.

## Mentions

Slack mention tokens (`<@U012AB3CD>`, `<#C012AB3CD>`, `<!here>`, `<!channel>`,
`<!everyone>`) **only resolve via the API/webhook path**. They do NOT resolve
when pasted into Slack's compose box. Slack renders them as literal text.

- **Copy-paste path:** write mentions as plain `@DisplayName` (e.g., `@Shakti`).
  Tell the user they'll need to re-type the `@` after pasting so Slack's
  autocomplete kicks in and links the user. Never emit `<@U...>` syntax on this
  path. (Defensively, the HTML converter renders any stray `<@U...>` / `<#C...>` /
  `<!here>` token as visible `@`/`#` text instead of raw `<@U...>` noise, but
  it still won't notify anyone.)
- **API/Webhook path (`send`):** use `<@U012AB3CD>` / `<#C012AB3CD>` / `<!here>`
  as-is. The converter preserves them and Slack resolves them server-side.

## Important Notes

- **Always generate Markdown first**, then convert. Never generate mrkdwn or HTML directly, because the converter is deterministic and correct while LLM output of these formats is not.
- **Slack mention tokens only resolve on the API/webhook path.** See the "Mentions" section above for the per-path rules.
- **Tables work via the HTML copy-paste path** but not via mrkdwn (Slack has no table syntax). Tables are converted to code blocks in the mrkdwn output.
- **Preview files are timestamped** so users can revisit them from conversation history.
