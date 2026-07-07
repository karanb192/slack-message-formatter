#!/usr/bin/env node

/**
 * Test suite for slack-message-formatter skill.
 * Tests both HTML and mrkdwn output against expected values.
 *
 * Run: node test-skill.mjs
 */

import { execSync, spawn } from "child_process";
import { createServer } from "http";

const RUN = "skills/slack-message-formatter/src/run.mjs";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

let pass = 0;
let fail = 0;

function run(cmd, input, env = {}) {
  try {
    // Use heredoc to avoid shell interpretation of backticks, <, >, etc.
    const envPrefix = Object.entries(env)
      .map(([k, v]) => `${k}='${v}'`)
      .join(" ");
    const shellCmd = `${envPrefix} node ${RUN} ${cmd} <<'TESTEOF'\n${input}\nTESTEOF`;
    return execSync(shellCmd, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      shell: "/bin/bash",
    }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : `ERROR: ${e.message}`;
  }
}

function test(name, cmd, input, expected, env = {}) {
  const actual = run(cmd, input, env);
  // Normalize whitespace for comparison
  const normActual = actual.replace(/\s+/g, " ").trim();
  const normExpected = expected.replace(/\s+/g, " ").trim();

  if (normActual === normExpected) {
    pass++;
    console.log(`${GREEN}  PASS${RESET} [${cmd}] ${name}`);
  } else {
    fail++;
    console.log(`${RED}  FAIL${RESET} [${cmd}] ${name}`);
    console.log(`${DIM}       Expected: ${JSON.stringify(expected)}${RESET}`);
    console.log(`${RED}       Actual:   ${JSON.stringify(actual)}${RESET}`);
  }
}

function testContains(name, cmd, input, mustContain, mustNotContain = [], env = {}) {
  const actual = run(cmd, input, env);
  const missing = mustContain.filter((s) => !actual.includes(s));
  const unwanted = mustNotContain.filter((s) => actual.includes(s));

  if (missing.length === 0 && unwanted.length === 0) {
    pass++;
    console.log(`${GREEN}  PASS${RESET} [${cmd}] ${name}`);
  } else {
    fail++;
    console.log(`${RED}  FAIL${RESET} [${cmd}] ${name}`);
    if (missing.length)
      console.log(`${RED}       Missing: ${JSON.stringify(missing)}${RESET}`);
    if (unwanted.length)
      console.log(
        `${RED}       Unwanted: ${JSON.stringify(unwanted)}${RESET}`
      );
    console.log(`${DIM}       Output: ${JSON.stringify(actual.slice(0, 200))}${RESET}`);
  }
}

function section(title) {
  console.log(`\n${BOLD}${"=".repeat(50)}${RESET}`);
  console.log(`${BOLD}  ${title}${RESET}`);
  console.log(`${BOLD}${"=".repeat(50)}${RESET}\n`);
}

// =============================================================
// HTML TESTS
// =============================================================

section("HTML: Basic Formatting");

test("Bold **", "html", "**hello**", "<b>hello</b>");
test("Bold __", "html", "__hello__", "<b>hello</b>");
test("Italic *", "html", "*hello*", "<i>hello</i>");
test("Italic _", "html", "_hello_", "<i>hello</i>");
test("Strikethrough", "html", "~~hello~~", "<s>hello</s>");
test("Inline code", "html", "`code`", "<code>code</code>");
test("Bold + Italic", "html", "***hello***", "<b><i>hello</i></b>");

testContains("Multiple formatting", "html",
  "**bold** and *italic* and ~~strike~~",
  ["<b>bold</b>", "<i>italic</i>", "<s>strike</s>"]);

section("HTML: Links");

testContains("Basic link", "html",
  "[Click](https://example.com)",
  ['<a href="https://example.com">Click</a>']);

testContains("Image as link", "html",
  "![Alt](https://example.com/img.png)",
  ['<a href="https://example.com/img.png">Alt</a>']);

section("HTML: Headings");

testContains("H1", "html", "# Title", ["<b>Title</b>"]);
testContains("H2", "html", "## Subtitle", ["<b>Subtitle</b>"]);
testContains("H3", "html", "### Section", ["<b>Section</b>"]);

section("HTML: Code Blocks");

testContains("Fenced code block", "html",
  "```\nconst x = 1;\n```",
  ["<pre><code>const x = 1;"], ["```"]);

testContains("Fenced with lang", "html",
  "```javascript\nconst x = 1;\n```",
  ["<pre><code>const x = 1;"], ["javascript"]);

testContains("Code block escapes HTML", "html",
  "```\n<div>test</div>\n```",
  ["&lt;div&gt;test&lt;/div&gt;"]);

section("HTML: Lists");

testContains("Unordered list", "html",
  "- Item one\n- Item two",
  ["<ul>", "<li>Item one</li>", "<li>Item two</li>", "</ul>"]);

testContains("Ordered list", "html",
  "1. First\n2. Second",
  ["<ol>", "<li>First</li>", "<li>Second</li>", "</ol>"]);

testContains("Task list checked", "html",
  "- [x] Done task",
  ["&#x2705;", "Done task"]);

testContains("Task list unchecked", "html",
  "- [ ] Pending task",
  ["&#x1F532;", "Pending task"]);

section("HTML: Tables (as code blocks)");

testContains("Simple table", "html",
  "| Name | Age |\n|------|-----|\n| Alice | 30 |",
  ["<pre><code>", "Name", "Age", "Alice", "30"]);

testContains("Table has separator", "html",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  ["---"]);

section("HTML: Blockquotes");

testContains("Simple blockquote", "html",
  "> This is a quote",
  ["<blockquote>", "This is a quote", "</blockquote>"]);

testContains("Blockquote with formatting", "html",
  "> **Bold** in quote",
  ["<blockquote>", "<b>Bold</b>"]);

section("HTML: Horizontal Rules");

testContains("HR ---", "html", "---", ["<hr>"]);
testContains("HR ***", "html", "***", ["<hr>"]);
testContains("HR ___", "html", "___", ["<hr>"]);

section("HTML: Slack Tokens (rendered as visible text — they never resolve on paste)");

testContains("User mention rendered as @ID", "html",
  "Hey <@U012AB3CD>",
  ["@U012AB3CD"], ["&lt;@U012AB3CD&gt;"]);

testContains("User mention with label rendered as @label", "html",
  "Hey <@U012AB3CD|alice>",
  ["@alice"], ["&lt;@", "U012AB3CD"]);

testContains("Channel link rendered as #ID", "html",
  "See <#C012AB3CD>",
  ["#C012AB3CD"], ["&lt;#C012AB3CD&gt;"]);

testContains("Channel link with label rendered as #name", "html",
  "See <#C012AB3CD|general>",
  ["#general"], ["&lt;#", "C012AB3CD"]);

testContains("@here rendered as text", "html",
  "Hey <!here>",
  ["@here"], ["&lt;!here&gt;"]);

testContains("@channel rendered as text", "html",
  "Hey <!channel>",
  ["@channel"], ["&lt;!channel&gt;"]);

testContains("Unknown <!...> token left escaped", "html",
  "See <!date^123^{date}>",
  ["&lt;!date^123^{date}&gt;"]);

testContains("Mention inside inline code left literal", "html",
  "Use `<@U012AB3CD>` for API messages",
  ["<code>&lt;@U012AB3CD&gt;</code>"]);

section("HTML: HTML Comments");

testContains("HTML comment stripped", "html",
  "Before <!-- comment --> After",
  ["Before"], ["comment"]);

// =============================================================
// MRKDWN TESTS
// =============================================================

section("mrkdwn: Basic Formatting");

test("Bold **", "mrkdwn", "**hello**", "*hello*");
test("Bold __", "mrkdwn", "__hello__", "*hello*");
test("Italic *", "mrkdwn", "*hello*", "_hello_");
test("Italic _", "mrkdwn", "_hello_", "_hello_");
test("Strikethrough", "mrkdwn", "~~hello~~", "~hello~");
test("Inline code", "mrkdwn", "`code`", "`code`");
test("Bold + Italic", "mrkdwn", "***hello***", "_*hello*_");

test("Bold then italic", "mrkdwn",
  "**bold** and *italic*",
  "*bold* and _italic_");

section("mrkdwn: Links");

test("Basic link", "mrkdwn",
  "[Click](https://example.com)",
  "<https://example.com|Click>");

test("Image as link", "mrkdwn",
  "![Alt](https://example.com/img.png)",
  "<https://example.com/img.png|Alt>");

section("mrkdwn: Headings");

test("H1 → bold", "mrkdwn", "# Title", "*Title*");
test("H2 → bold", "mrkdwn", "## Subtitle", "*Subtitle*");
test("H3 → bold", "mrkdwn", "### Section", "*Section*");

section("mrkdwn: Code Blocks");

test("Fenced code block", "mrkdwn",
  "```\nconst x = 1;\n```",
  "```\nconst x = 1;\n```");

test("Fenced with lang stripped", "mrkdwn",
  "```javascript\nconst x = 1;\n```",
  "```\nconst x = 1;\n```");

testContains("Code content not formatted", "mrkdwn",
  "```\n**not bold** and *not italic*\n```",
  ["**not bold** and *not italic*"],
  ["_not italic_"]);

section("mrkdwn: Lists");

testContains("Unordered list", "mrkdwn",
  "- Item one\n- Item two",
  ["• Item one", "• Item two"]);

testContains("Ordered list", "mrkdwn",
  "1. First\n2. Second",
  ["1. First", "2. Second"]);

testContains("Task list checked", "mrkdwn",
  "- [x] Done task",
  [":white_check_mark: Done task"]);

testContains("Task list unchecked", "mrkdwn",
  "- [ ] Pending task",
  [":black_square_button: Pending task"]);

section("mrkdwn: Tables");

testContains("Table as code block", "mrkdwn",
  "| Name | Age |\n|------|-----|\n| Alice | 30 |",
  ["```\n", "Name", "Age", "Alice", "30", "\n```"]);

testContains("Table has separator row", "mrkdwn",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  ["---"]);

testContains("Table followed by blockquote", "mrkdwn",
  "| A | B |\n|---|---|\n| 1 | 2 |\n\n> A quote",
  ["```\n", "\n```", "> A quote"]);

// This was a bug — blockquote was glued to closing ```
testContains("Table-blockquote separation", "mrkdwn",
  "| X |\n|---|\n| 1 |\n\n> Quote",
  ["```\n"],
  ["```>"]);

section("mrkdwn: Blockquotes");

test("Simple blockquote", "mrkdwn", "> This is a quote", "> This is a quote");

testContains("Blockquote with formatting", "mrkdwn",
  "> **Bold** in quote",
  ["> *Bold* in quote"]);

section("mrkdwn: Horizontal Rules");

testContains("HR → unicode", "mrkdwn", "---", ["━━━━━"]);
testContains("HR *** → unicode", "mrkdwn", "***", ["━━━━━"]);

section("mrkdwn: Escaping");

testContains("Ampersand escaped", "mrkdwn",
  "Tom & Jerry",
  ["Tom &amp; Jerry"]);

testContains("Ampersand in code not escaped", "mrkdwn",
  "`a & b`",
  ["`a & b`"],
  ["`a &amp; b`"]);

section("mrkdwn: Angle Bracket Escaping (API parses <...> as control tokens)");

testContains("Literal HTML tag escaped", "mrkdwn",
  "use the <div>hello</div> tag",
  ["use the &lt;div&gt;hello&lt;/div&gt; tag"]);

testContains("Comparison operators escaped", "mrkdwn",
  "5 > 3 and 2 < 4",
  ["5 &gt; 3 and 2 &lt; 4"]);

testContains("Blockquote marker NOT escaped", "mrkdwn",
  "> quote with <tag> inside",
  ["> quote with &lt;tag&gt; inside"]);

testContains("Angle brackets in inline code untouched", "mrkdwn",
  "`a < b`",
  ["`a < b`"], ["&lt;"]);

testContains("Angle brackets in code block untouched", "mrkdwn",
  "```\nif (a < b) {}\n```",
  ["a < b"], ["&lt;"]);

test("Raw autolink preserved", "mrkdwn",
  "<https://example.com>",
  "<https://example.com>");

testContains("Autolink with label preserved", "mrkdwn",
  "See <https://example.com|the docs>",
  ["<https://example.com|the docs>"]);

testContains("Subteam token preserved", "mrkdwn",
  "cc <!subteam^S0123ABCD>",
  ["<!subteam^S0123ABCD>"]);

testContains("Mention with label preserved", "mrkdwn",
  "Hey <@U012AB3CD|alice>",
  ["<@U012AB3CD|alice>"]);

section("mrkdwn: List Spacing (list attaches to its intro line)");

test("Blank line before list collapsed", "mrkdwn",
  "Intro line:\n\n- a\n- b",
  "Intro line:\n• a\n• b");

test("Blank line before task list collapsed", "mrkdwn",
  "Status:\n\n- [x] done\n- [ ] pending",
  "Status:\n:white_check_mark: done\n:black_square_button: pending");

testContains("Blank line between two list groups kept", "mrkdwn",
  "- a\n\n- [x] done",
  ["• a\n\n:white_check_mark: done"]);

testContains("Blank line after list kept", "mrkdwn",
  "- a\n\n**Impact:** high",
  ["• a\n\n*Impact:* high"]);

testContains("Blank line after blockquote kept", "mrkdwn",
  "> tip\n\n- a",
  ["> tip\n\n• a"]);

section("mrkdwn: Slack Tokens");

testContains("User mention preserved", "mrkdwn",
  "Hey <@U012AB3CD>",
  ["<@U012AB3CD>"]);

testContains("Channel link preserved", "mrkdwn",
  "See <#C012AB3CD>",
  ["<#C012AB3CD>"]);

testContains("@here preserved", "mrkdwn",
  "Hey <!here>",
  ["<!here>"]);

// =============================================================
// INLINE CODE ESCAPING (double-escape regression)
// =============================================================

section("HTML: Inline Code Escaping");

testContains("Angle brackets in inline code escaped once", "html",
  "Fix the `<div>` tag",
  ["<code>&lt;div&gt;</code>"],
  ["&amp;lt;"]);

testContains("Ampersand in inline code escaped once", "html",
  "Run `a && b`",
  ["<code>a &amp;&amp; b</code>"],
  ["&amp;amp;"]);

testContains("Double-backtick code escaped once", "html",
  "Use `` <b>bold</b> `` here",
  ["<code>&lt;b&gt;bold&lt;/b&gt;</code>"],
  ["&amp;lt;"]);

testContains("Pre-escaped &quot; not double-escaped", "html",
  "say &quot;hi&quot; loudly",
  ["&quot;hi&quot;"],
  ["&amp;quot;"]);

section("HTML: List Item Continuation Lines");

// Continuation lines join with a space (Markdown soft-wrap) — a <br> inside
// <li> makes Slack's paste handler flatten the entire list to paragraphs.
testContains("Continuation line preserved in list item", "html",
  "- First item\n  wraps to a second line\n- Second item",
  ["<li>First item wraps to a second line</li>", "<li>Second item</li>"]);

testContains("Multi-line continuation preserved", "html",
  "- Item\n  line two\n  line three",
  ["<li>Item line two line three</li>"]);

section("HTML: List Item Space Protection (Slack paste trims spaces around inline tags)");

testContains("Spaces around bold in list item become &#160;", "html",
  "- **Impact:** high blast radius",
  ["<li><b>Impact:</b>&#160;high blast radius</li>"]);

testContains("Spaces around italic/code/link in list item protected", "html",
  "- with *ital* and `code` and [docs](https://example.com) end",
  ["with&#160;<i>ital</i>&#160;and&#160;<code>code</code>&#160;and&#160;<a href=\"https://example.com\">docs</a>&#160;end"]);

testContains("Paragraph spaces NOT converted to &#160;", "html",
  "with **bold** and *ital* end",
  ["with <b>bold</b> and <i>ital</i> end"],
  ["&#160;"]);

section("HTML: Block Spacing (lists/code attach to intro; blank line elsewhere)");

test("Single paragraph has no trailing breaks", "html",
  "hello world", "hello world");

testContains("Paragraphs separated by one blank line", "html",
  "First para.\n\nSecond para.",
  ["First para.<br><br>\nSecond para."]);

testContains("Paragraph attaches to following list", "html",
  "Intro line:\n\n- a\n- b",
  ["Intro line:\n<ul>"],
  ["Intro line:<br>"]);

testContains("Heading attaches to following list", "html",
  "## Changes\n\n- a",
  ["<b>Changes</b>\n<ul>"],
  ["<b>Changes</b><br>"]);

testContains("Paragraph attaches to following code block", "html",
  "Run this:\n\n```\nls\n```",
  ["Run this:\n<pre><code>ls</code></pre>"]);

testContains("Paragraph attaches to following task list", "html",
  "Status:\n\n- [x] done",
  ["Status:\n&#x2705; done"]);

testContains("List followed by paragraph gets a blank line", "html",
  "- a\n- b\n\n**Impact:** high",
  ["</ul><br>\n<b>Impact:</b> high"]);

testContains("Blockquote followed by paragraph gets a blank line", "html",
  "> quoted tip\n\n**Impact:** high",
  ["</blockquote><br>\n<b>Impact:</b> high"]);

testContains("Bullet list and task list separated by a blank line", "html",
  "- bullet\n\n- [x] done",
  ["</ul><br>\n&#x2705; done"]);

// =============================================================
// JIRA AUTO-LINKING (JIRA_BASE_URL)
// =============================================================

section("Jira Auto-linking (JIRA_BASE_URL)");

const JIRA_ENV = { JIRA_BASE_URL: "https://example.atlassian.net" };
const JIRA_URL = "https://example.atlassian.net/browse";

testContains("Bare key linked (html)", "html",
  "Fix DEVOPS-14389 today",
  [`<a href="${JIRA_URL}/DEVOPS-14389">DEVOPS-14389</a>`],
  [], JIRA_ENV);

test("Bare key linked (mrkdwn)", "mrkdwn",
  "Fix DEVOPS-14389 today",
  `Fix <${JIRA_URL}/DEVOPS-14389|DEVOPS-14389> today`,
  JIRA_ENV);

testContains("Multiple keys all linked", "mrkdwn",
  "ENG-129313 blocks AT-813158",
  [`<${JIRA_URL}/ENG-129313|ENG-129313>`, `<${JIRA_URL}/AT-813158|AT-813158>`],
  [], JIRA_ENV);

testContains("Key with punctuation after", "mrkdwn",
  "Done: DEVOPS-14389.",
  [`<${JIRA_URL}/DEVOPS-14389|DEVOPS-14389>.`],
  [], JIRA_ENV);

testContains("Key with underscore in project", "mrkdwn",
  "See MY_PROJ-42",
  [`<${JIRA_URL}/MY_PROJ-42|MY_PROJ-42>`],
  [], JIRA_ENV);

test("Already-linked key not double-linked", "mrkdwn",
  "[DEVOPS-14389](https://other.example.com/DEVOPS-14389)",
  "<https://other.example.com/DEVOPS-14389|DEVOPS-14389>",
  JIRA_ENV);

test("Key inside inline code not linked", "mrkdwn",
  "Run `git checkout DEVOPS-14389`",
  "Run `git checkout DEVOPS-14389`",
  JIRA_ENV);

testContains("Key inside code block not linked", "mrkdwn",
  "```\nbranch: DEVOPS-14389\n```",
  ["branch: DEVOPS-14389"],
  [JIRA_URL], JIRA_ENV);

testContains("Key inside bare URL not linked", "mrkdwn",
  "See https://ci.example.com/job/DEVOPS-14389/logs",
  ["https://ci.example.com/job/DEVOPS-14389/logs"],
  [JIRA_URL], JIRA_ENV);

test("Lowercase key not linked", "mrkdwn",
  "see devops-14389", "see devops-14389", JIRA_ENV);

test("Single-letter prefix not linked", "mrkdwn",
  "item X-123 here", "item X-123 here", JIRA_ENV);

test("Common acronyms not linked (UTF-8, SHA-256)", "mrkdwn",
  "encode as UTF-8 with SHA-256",
  "encode as UTF-8 with SHA-256",
  JIRA_ENV);

test("Version-like suffix not linked", "mrkdwn",
  "see CVE-2024-12345", "see CVE-2024-12345", JIRA_ENV);

test("No JIRA_BASE_URL → keys untouched", "mrkdwn",
  "Fix DEVOPS-14389 today",
  "Fix DEVOPS-14389 today");

test("Trailing slash on base URL handled", "mrkdwn",
  "Fix DEVOPS-14389",
  `Fix <${JIRA_URL}/DEVOPS-14389|DEVOPS-14389>`,
  { JIRA_BASE_URL: "https://example.atlassian.net/" });

testContains("Key in heading linked (html)", "html",
  "## DEVOPS-14389 rollout",
  [`<a href="${JIRA_URL}/DEVOPS-14389">DEVOPS-14389</a>`],
  [], JIRA_ENV);

testContains("Key in list item linked (mrkdwn)", "mrkdwn",
  "- Fixed ENG-129313\n- Testing AT-813158",
  [`• Fixed <${JIRA_URL}/ENG-129313|ENG-129313>`, `• Testing <${JIRA_URL}/AT-813158|AT-813158>`],
  [], JIRA_ENV);

// =============================================================
// COMPLEX / REAL-WORLD TESTS
// =============================================================

section("Real-world: Deployment Announcement");

const deployMd = `## Deployment Complete

**Service:** payment-api
**Version:** v2.4.1

### Changes
- Fixed timeout bug
- Added retry logic

### Action Items
- [x] Migration done
- [ ] Monitor errors

| Metric | Value |
|--------|-------|
| Latency | 42ms |

> Rollback: \`./rollback.sh\``;

testContains("Deploy HTML has all parts", "html", deployMd, [
  "<b>Deployment Complete</b>",
  "<b>Service:</b>",
  "<b>Changes</b>",
  "<li>Fixed timeout bug</li>",
  "&#x2705;",
  "&#x1F532;",
  "<pre><code>",
  "Latency",
  "42ms",
  "<blockquote>",
  "<code>./rollback.sh</code>",
]);

testContains("Deploy mrkdwn has all parts", "mrkdwn", deployMd, [
  "*Deployment Complete*",
  "*Service:*",
  "*Changes*",
  "• Fixed timeout bug",
  ":white_check_mark: Migration done",
  ":black_square_button: Monitor errors",
  "```\n",
  "Latency",
  "42ms",
  "> Rollback:",
  "`./rollback.sh`",
]);

section("Real-world: Incident Report");

const incidentMd = `## Incident: API Outage

**Severity:** P1
**Duration:** 14:32 - 15:47 UTC

| Time | Event |
|------|-------|
| 14:32 | Alerts fired |
| 14:42 | Root cause found |
| 15:47 | All clear |

> Review before EOD`;

testContains("Incident HTML", "html", incidentMd, [
  "<b>Incident: API Outage</b>",
  "<b>Severity:</b>",
  "<pre><code>",
  "14:32",
  "Alerts fired",
  "<blockquote>",
  "Review before EOD",
]);

testContains("Incident mrkdwn", "mrkdwn", incidentMd, [
  "*Incident: API Outage*",
  "*Severity:*",
  "```\n",
  "14:32",
  "Alerts fired",
  "> Review before EOD",
]);

// Ensure table and blockquote are separate
testContains("Incident mrkdwn separation", "mrkdwn", incidentMd,
  [],
  ["```>"]);

section("HTML: Emoji Shortcodes");

testContains("Common emoji converted", "html",
  "Hello :tada: :rocket: :fire:",
  ["🎉", "🚀", "🔥"],
  [":tada:", ":rocket:", ":fire:"]);

testContains("Emoji with formatting", "html",
  ":star: **Name** — *description*",
  ["⭐", "<b>Name</b>", "<i>description</i>"]);

testContains("Unknown emoji preserved as-is", "html",
  "Hello :nonexistent_emoji_xyz:",
  [":nonexistent_emoji_xyz:"]);

testContains("Emoji in list items", "html",
  "- :white_check_mark: Done\n- :warning: Careful",
  ["✅", "⚠️"]);

testContains("Emoji not converted inside code", "html",
  "`Use :tada: in Slack`",
  [":tada:"],
  ["🎉"]);

testContains("Multiple emoji same line", "html",
  ":heart: :muscle: :100: :sparkles:",
  ["❤️", "💪", "💯", "✨"]);

testContains("Emoji with plus in name", "html",
  ":+1: :heavy_plus_sign:",
  ["👍", "➕"]);

testContains("Emoji adjacent to bold", "html",
  ":rocket: **Launch!**",
  ["🚀", "<b>Launch!</b>"]);

testContains("Emoji in heading", "html",
  "## Release :tada:",
  ["<b>", "🎉"]);

testContains("Emoji in blockquote", "html",
  "> :warning: Be careful",
  ["<blockquote>", "⚠️"]);

testContains("Back-to-back emoji no space", "html",
  ":fire::rocket::sparkles:",
  ["🔥", "🚀", "✨"]);

testContains("Emoji at start and end of line", "html",
  ":star: Hello world :heart:",
  ["⭐", "❤️"]);

testContains("Emoji in code block NOT converted", "html",
  "```\n:tada: :rocket:\n```",
  [":tada:", ":rocket:"],
  ["🎉", "🚀"]);

// Bulk verify ALL emoji mappings work
section("HTML: Emoji Bulk Verification");

const ALL_EMOJI = {
  ":thumbsup:":"👍",":thumbsdown:":"👎",":heart:":"❤️",":broken_heart:":"💔",
  ":fire:":"🔥",":star:":"⭐",":star2:":"🌟",":tada:":"🎉",":rocket:":"🚀",
  ":eyes:":"👀",":wave:":"👋",":raised_hands:":"🙌",":clap:":"👏",":muscle:":"💪",
  ":pray:":"🙏",":handshake:":"🤝",":ok_hand:":"👌",":smile:":"😄",
  ":grinning:":"😀",":laughing:":"😆",":sweat_smile:":"😅",":joy:":"😂",
  ":wink:":"😉",":blush:":"😊",":thinking_face:":"🤔",":thinking:":"🤔",
  ":grimacing:":"😬",":sob:":"😭",":cry:":"😢",":angry:":"😠",
  ":100:":"💯",":boom:":"💥",":sparkles:":"✨",":zap:":"⚡",":rainbow:":"🌈",
  ":sunny:":"☀️",":trophy:":"🏆",":crown:":"👑",":gem:":"💎",":moneybag:":"💰",
  ":gift:":"🎁",":balloon:":"🎈",":confetti_ball:":"🎊",
  ":white_check_mark:":"✅",":heavy_check_mark:":"✔️",
  ":x:":"❌",":warning:":"⚠️",":exclamation:":"❗",":question:":"❓",
  ":red_circle:":"🔴",":green_circle:":"🟢",":blue_circle:":"🔵",
  ":arrow_right:":"➡️",":arrow_left:":"⬅️",":link:":"🔗",":lock:":"🔒",
  ":bulb:":"💡",":gear:":"⚙️",":wrench:":"🔧",":hammer:":"🔨",":shield:":"🛡️",
  ":bug:":"🐛",":art:":"🎨",":memo:":"📝",":clipboard:":"📋",":calendar:":"📅",
  ":bell:":"🔔",":loudspeaker:":"📢",":email:":"📧",":package:":"📦",
  ":coffee:":"☕",":pizza:":"🍕",":beer:":"🍺",":champagne:":"🍾",
  ":dog:":"🐕",":cat:":"🐈",":penguin:":"🐧",":unicorn:":"🦄",
  ":earth_americas:":"🌎",":construction:":"🚧",":rotating_light:":"🚨",
  ":dart:":"🎯",":computer:":"💻",":iphone:":"📱",
  ":mag:":"🔍",":book:":"📖",":books:":"📚",
  ":heavy_plus_sign:":"➕",":heavy_minus_sign:":"➖",":infinity:":"♾️",":recycle:":"♻️",
  ":+1:":"👍",":-1:":"👎",":no_entry:":"⛔",":no_entry_sign:":"🚫",
};

// Test all emoji in batches of 10
const emojiEntries = Object.entries(ALL_EMOJI);
const batchSize = 10;
for (let b = 0; b < emojiEntries.length; b += batchSize) {
  const batch = emojiEntries.slice(b, b + batchSize);
  const input = batch.map(([code]) => code).join(" ");
  const mustContain = batch.map(([, emoji]) => emoji);
  const mustNotContain = batch.map(([code]) => code);
  testContains(
    `Emoji batch ${Math.floor(b/batchSize)+1} (${batch[0][0]}..${batch[batch.length-1][0]})`,
    "html", input, mustContain, mustNotContain
  );
}

section("mrkdwn: Emoji Shortcodes (preserved for Slack)");

// mrkdwn keeps shortcodes as-is — Slack renders them natively
testContains("Shortcodes preserved in mrkdwn", "mrkdwn",
  "Hello :tada: :rocket:",
  [":tada:", ":rocket:"]);

// =============================================================
// NEW TESTS — added below existing emoji tests, before Edge Cases
// =============================================================

section("HTML/mrkdwn: Nested Inline Formatting");

testContains("Italic inside bold (html)", "html",
  "**bold _italic_ bold**",
  ["<b>bold <i>italic</i> bold</b>"]);

test("Italic inside bold (mrkdwn)", "mrkdwn",
  "**bold _italic_ bold**",
  "*bold _italic_ bold*");

testContains("Bold inside strikethrough (html)", "html",
  "~~**bold strike**~~",
  ["<s><b>bold strike</b></s>"]);

test("Bold inside strikethrough (mrkdwn)", "mrkdwn",
  "~~**bold strike**~~",
  "~*bold strike*~");

testContains("Code inside bold (html)", "html",
  "**bold with `code` inside**",
  ["<b>bold with <code>code</code> inside</b>"]);

test("Code inside bold (mrkdwn)", "mrkdwn",
  "**bold with `code` inside**",
  "*bold with `code` inside*");

testContains("Bold text in link (html)", "html",
  "[**bold link**](https://example.com)",
  ['<a href="https://example.com"><b>bold link</b></a>']);

test("Bold text in link (mrkdwn)", "mrkdwn",
  "[**bold link**](https://example.com)",
  "<https://example.com|*bold link*>");

testContains("All inline types in one line (html)", "html",
  "**bold** *italic* ~~strike~~ `code` [link](https://example.com)",
  ["<b>bold</b>", "<i>italic</i>", "<s>strike</s>", "<code>code</code>", '<a href="https://example.com">link</a>']);

testContains("All inline types in one line (mrkdwn)", "mrkdwn",
  "**bold** *italic* ~~strike~~ `code` [link](https://example.com)",
  ["*bold*", "_italic_", "~strike~", "`code`", "<https://example.com|link>"]);

section("Headings H4-H6");

testContains("H4 (html)", "html", "#### H4 title", ["<b>H4 title</b>"]);
test("H4 (mrkdwn)", "mrkdwn", "#### H4 title", "*H4 title*");

testContains("H5 (html)", "html", "##### H5 title", ["<b>H5 title</b>"]);
test("H5 (mrkdwn)", "mrkdwn", "##### H5 title", "*H5 title*");

testContains("H6 (html)", "html", "###### H6 title", ["<b>H6 title</b>"]);
test("H6 (mrkdwn)", "mrkdwn", "###### H6 title", "*H6 title*");

testContains("Heading with trailing hashes (html)", "html",
  "# Title ##",
  ["<b>Title</b>"]);

test("Heading with trailing hashes (mrkdwn)", "mrkdwn",
  "# Title ##",
  "*Title*");

section("Code Block Edge Cases");

testContains("Empty code block (html)", "html",
  "```\n```",
  ["<pre><code>"]);

testContains("Empty code block (mrkdwn)", "mrkdwn",
  "```\n```",
  ["```"]);

testContains("Multiple sequential code blocks (html)", "html",
  "```\nfirst block\n```\n\n```\nsecond block\n```",
  ["first block", "second block"]);

testContains("Multiple sequential code blocks (mrkdwn)", "mrkdwn",
  "```\nfirst block\n```\n\n```\nsecond block\n```",
  ["first block", "second block"]);

testContains("Markdown inside code block NOT converted (html)", "html",
  "```\n**bold** and *italic*\n```",
  ["**bold** and *italic*"],
  ["<b>", "<i>"]);

testContains("Markdown inside code block NOT converted (mrkdwn)", "mrkdwn",
  "```\n**bold** and *italic*\n```",
  ["**bold** and *italic*"],
  ["_italic_"]);

testContains("Ampersand inside code block NOT escaped (mrkdwn)", "mrkdwn",
  "```\na & b\n```",
  ["a & b"],
  ["a &amp; b"]);

section("List Variants");

testContains("List with + marker (html)", "html",
  "+ Item one\n+ Item two",
  ["<ul>", "<li>Item one</li>", "<li>Item two</li>", "</ul>"]);

testContains("List with + marker (mrkdwn)", "mrkdwn",
  "+ Item one\n+ Item two",
  ["• Item one", "• Item two"]);

testContains("List with * marker (html)", "html",
  "* Item one\n* Item two",
  ["<ul>", "<li>Item one</li>", "<li>Item two</li>", "</ul>"]);

testContains("List with * marker (mrkdwn)", "mrkdwn",
  "* Item one\n* Item two",
  ["• Item one", "• Item two"]);

testContains("Nested unordered list (html)", "html",
  "- Parent\n  - Child one\n  - Child two",
  ["<ul>", "<li>Parent", "Child one", "Child two"]);

testContains("Nested unordered list (mrkdwn)", "mrkdwn",
  "- Parent\n  - Child one\n  - Child two",
  ["• Parent", "Child one", "Child two"]);

testContains("List with formatted items (html)", "html",
  "- **Bold item**\n- *Italic item*",
  ["<b>Bold item</b>", "<i>Italic item</i>"]);

testContains("List with formatted items (mrkdwn)", "mrkdwn",
  "- **Bold item**\n- *Italic item*",
  ["*Bold item*", "_Italic item_"]);

testContains("List followed by paragraph (html)", "html",
  "- Item one\n- Item two\n\nNext paragraph.",
  ["<li>Item one</li>", "<li>Item two</li>", "Next paragraph."]);

testContains("List followed by paragraph (mrkdwn)", "mrkdwn",
  "- Item one\n- Item two\n\nNext paragraph.",
  ["• Item one", "• Item two", "Next paragraph."]);

testContains("Heading followed by list (html)", "html",
  "## My List\n\n- Item one\n- Item two",
  ["<b>My List</b>", "<li>Item one</li>", "<li>Item two</li>"]);

testContains("Heading followed by list (mrkdwn)", "mrkdwn",
  "## My List\n\n- Item one\n- Item two",
  ["*My List*", "• Item one", "• Item two"]);

section("Blockquote Edge Cases");

testContains("Multi-line blockquote (html)", "html",
  "> Line one\n> Line two\n> Line three",
  ["<blockquote>", "Line one", "Line two", "Line three", "</blockquote>"],
  ["&lt;br&gt;"]);

testContains("Multi-line blockquote (mrkdwn)", "mrkdwn",
  "> Line one\n> Line two\n> Line three",
  ["> Line one", "> Line two", "> Line three"]);

testContains("Blockquote with all formatting (mrkdwn)", "mrkdwn",
  "> **Bold** and *italic* and ~~strike~~",
  ["> *Bold* and _italic_ and ~strike~"]);

section("HR Variants");

testContains("HR with extra dashes (html)", "html", "------", ["<hr>"]);
testContains("HR with extra dashes (mrkdwn)", "mrkdwn", "------", ["━━━━━"]);

testContains("HR ___ (mrkdwn)", "mrkdwn", "___", ["━━━━━"]);

section("HTML Comments");

testContains("HTML comment stripped (mrkdwn)", "mrkdwn",
  "Before <!-- comment --> After",
  ["Before"],
  ["comment"]);

section("Paragraphs");

testContains("Multiple paragraphs (html)", "html",
  "First paragraph.\n\nSecond paragraph.",
  ["First paragraph.", "Second paragraph."]);

testContains("Multiple paragraphs (mrkdwn)", "mrkdwn",
  "First paragraph.\n\nSecond paragraph.",
  ["First paragraph.", "Second paragraph."]);

testContains("Paragraph continuation lines (html)", "html",
  "This is a long\ncontinuation line.",
  ["This is a long", "continuation line."]);

section("Special Character Escaping");

testContains("Angle brackets escaped (html)", "html",
  "<div>hello</div>",
  ["&lt;div&gt;hello&lt;/div&gt;"]);

testContains("Double-escape prevention (html)", "html",
  "&amp; already escaped",
  ["&amp;"],
  ["&amp;amp;"]);

testContains("Double-escape prevention (mrkdwn)", "mrkdwn",
  "&amp; already escaped",
  ["&amp;"],
  ["&amp;amp;"]);

testContains("URL with ampersand (html)", "html",
  "[Link](https://example.com?a=1&b=2)",
  ["https://example.com?a=1", "Link"]);

testContains("URL with ampersand (mrkdwn)", "mrkdwn",
  "[Link](https://example.com?a=1&b=2)",
  ["https://example.com?a=1", "Link"]);

section("Unclosed Formatting");

testContains("Unclosed bold (html)", "html",
  "**unclosed bold",
  ["**unclosed bold"],
  ["<b>"]);

testContains("Unclosed bold (mrkdwn)", "mrkdwn",
  "**unclosed bold",
  ["**unclosed bold"]);

testContains("Unclosed italic (html)", "html",
  "*unclosed italic",
  ["*unclosed italic"],
  ["<i>"]);

testContains("Unclosed italic (mrkdwn)", "mrkdwn",
  "*unclosed italic",
  ["*unclosed italic"]);

testContains("Unclosed strikethrough (html)", "html",
  "~~unclosed strike",
  ["~~unclosed strike"],
  ["<s>"]);

testContains("Unclosed strikethrough (mrkdwn)", "mrkdwn",
  "~~unclosed strike",
  ["~~unclosed strike"]);

testContains("Empty strikethrough markers (html)", "html",
  "~~~~",
  ["~~~~"],
  ["<s>"]);

test("Empty strikethrough markers (mrkdwn)", "mrkdwn",
  "~~~~",
  "~~~~");

section("Windows Line Endings");

testContains("Windows CRLF (html)", "html",
  "line one\r\nline two",
  ["line one", "line two"]);

testContains("Windows CRLF (mrkdwn)", "mrkdwn",
  "line one\r\nline two",
  ["line one", "line two"]);

section("Real-world: Meeting Notes");

const meetingMd = `## Meeting Notes

**Date:** 2024-01-15
**Attendees:** Alice, Bob

### Action Items
- [x] Review PR #123
- [ ] Update docs

> Next meeting: Friday`;

testContains("Meeting notes (html)", "html", meetingMd, [
  "<b>Meeting Notes</b>",
  "<b>Date:</b>",
  "<b>Attendees:</b>",
  "<b>Action Items</b>",
  "&#x2705;",
  "&#x1F532;",
  "<blockquote>",
  "Next meeting: Friday",
]);

testContains("Meeting notes (mrkdwn)", "mrkdwn", meetingMd, [
  "*Meeting Notes*",
  "*Date:*",
  "*Attendees:*",
  "*Action Items*",
  ":white_check_mark: Review PR #123",
  ":black_square_button: Update docs",
  "> Next meeting: Friday",
]);

section("Real-world: Code Review Message");

const codeReviewMd = `### Code Review

**PR:** #456
**Status:** Ready

Changes in \`auth.js\`:
\`\`\`javascript
if (token.expired) {
  refresh();
}
\`\`\`

- [x] Tests pass
- [ ] Needs security review`;

testContains("Code review message (html)", "html", codeReviewMd, [
  "<b>Code Review</b>",
  "<b>PR:</b>",
  "<b>Status:</b>",
  "<code>auth.js</code>",
  "<pre><code>",
  "token.expired",
  "refresh();",
  "&#x2705;",
  "&#x1F532;",
]);

testContains("Code review message (mrkdwn)", "mrkdwn", codeReviewMd, [
  "*Code Review*",
  "*PR:*",
  "*Status:*",
  "`auth.js`",
  "```\n",
  "token.expired",
  "refresh();",
  ":white_check_mark: Tests pass",
  ":black_square_button: Needs security review",
]);

section("Real-world: Sprint Summary");

const sprintMd = `## Sprint Summary

**Completed:** 8 stories
**Velocity:** 21 points

### Highlights
- Shipped user auth
- Fixed **critical** payment bug

---

> Great work team! :tada:`;

testContains("Sprint summary (html)", "html", sprintMd, [
  "<b>Sprint Summary</b>",
  "<b>Completed:</b>",
  "<b>Velocity:</b>",
  "<b>Highlights</b>",
  "Shipped user auth",
  "<b>critical</b>",
  "<hr>",
  "<blockquote>",
  "Great work team!",
  "🎉",
]);

testContains("Sprint summary (mrkdwn)", "mrkdwn", sprintMd, [
  "*Sprint Summary*",
  "*Completed:*",
  "*Velocity:*",
  "*Highlights*",
  "• Shipped user auth",
  "*critical*",
  "━━━━━",
  "> Great work team!",
  ":tada:",
]);

section("Edge Cases");

testContains("Empty bold markers", "mrkdwn", "****", [], ["**"]);

test("Bold with colon", "mrkdwn", "**Service:** api", "*Service:* api");

testContains("Multiple bold same line", "mrkdwn",
  "**a** and **b** and **c**",
  ["*a*", "*b*", "*c*"]);

testContains("Code block content not transformed in mrkdwn", "mrkdwn",
  "```\n**bold** *italic* ~~strike~~\n```",
  ["**bold** *italic* ~~strike~~"]);

// The content inside backticks should remain untouched
test("Inline code content not transformed", "mrkdwn",
  "`**not bold**`",
  "`**not bold**`");

// =============================================================
section("UNDERSCORE ITALIC EDGE CASES");
// =============================================================

test("snake_case not italic", "html",
  "some_variable_name",
  "some_variable_name");

test("snake_case not italic (mrkdwn passthrough)", "mrkdwn",
  "some_variable_name",
  "some_variable_name");

test("Intentional _italic_ still works", "html",
  "_this is italic_",
  "<i>this is italic</i>");

test("Mixed: italic + snake_case", "html",
  "use _caution_ with snake_case_names",
  "use <i>caution</i> with snake_case_names");

test("Multiple underscores: a_b_c_d", "html",
  "a_b_c_d",
  "a_b_c_d");

test("file_path/to_something", "html",
  "Edit file_path/to_something",
  "Edit file_path/to_something");

// =============================================================
// SEND COMMAND — real HTTP round-trip against a local server
// =============================================================

section("send: webhook delivery & error reporting");

function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`${GREEN}  PASS${RESET} [send] ${name}`);
  } else {
    fail++;
    console.log(`${RED}  FAIL${RESET} [send] ${name}`);
    if (detail) console.log(`${RED}       ${detail.slice(0, 300)}${RESET}`);
  }
}

const received = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ url: req.url, body });
    if (req.url === "/ok") { res.writeHead(200); res.end("ok"); }
    else { res.writeHead(404); res.end("no_service"); }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;

function runSend(input, env) {
  return new Promise((resolve) => {
    // Blank out ambient webhook vars so tests are hermetic
    const child = spawn("node", [RUN, "send"], {
      env: { ...process.env, SLACK_WEBHOOK_URL: "", CCH_SLA_WEBHOOK: "", ...env },
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

let r = await runSend("**hello** <div>", { SLACK_WEBHOOK_URL: `http://127.0.0.1:${PORT}/ok` });
check("succeeds on HTTP 200", r.code === 0 && r.out.includes("sent"), JSON.stringify(r));
check("posts converted mrkdwn payload",
  received.some((x) => x.url === "/ok" && x.body === JSON.stringify({ text: "*hello* &lt;div&gt;" })),
  JSON.stringify(received));

r = await runSend("**hello**", { SLACK_WEBHOOK_URL: `http://127.0.0.1:${PORT}/bad` });
check("fails on HTTP 404 with status and body in error",
  r.code === 1 && r.err.includes("404") && r.err.includes("no_service"), JSON.stringify(r));

r = await runSend("**hello**", { CCH_SLA_WEBHOOK: `http://127.0.0.1:${PORT}/ok` });
check("legacy CCH_SLA_WEBHOOK still honored", r.code === 0 && r.out.includes("sent"), JSON.stringify(r));

r = await runSend("**hello**", { SLACK_WEBHOOK_URL: `http://127.0.0.1:9/nope` });
check("fails on connection error", r.code === 1 && r.err.includes("Failed to send"), JSON.stringify(r));

r = await runSend("**hello**", {});
check("fails with clear error when no webhook configured",
  r.code === 1 && r.err.includes("SLACK_WEBHOOK_URL"), JSON.stringify(r));

server.close();

// =============================================================
// SUMMARY
// =============================================================

console.log(`\n${BOLD}${"=".repeat(50)}${RESET}`);
console.log(`${BOLD}  RESULTS${RESET}`);
console.log(`${BOLD}${"=".repeat(50)}${RESET}\n`);
console.log(`${GREEN}  PASSED: ${pass}${RESET}`);
console.log(`${RED}  FAILED: ${fail}${RESET}`);
console.log();

process.exit(fail > 0 ? 1 : 0);
