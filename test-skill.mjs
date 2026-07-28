#!/usr/bin/env node

/**
 * Test suite for slack-message-formatter skill.
 * Tests both HTML and mrkdwn output against expected values.
 *
 * Run: node test-skill.mjs
 */

import { execSync, spawn } from "child_process";
import { createServer } from "http";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

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

function check(name, cond, detail = "", cmd = "send") {
  if (cond) {
    pass++;
    console.log(`${GREEN}  PASS${RESET} [${cmd}] ${name}`);
  } else {
    fail++;
    console.log(`${RED}  FAIL${RESET} [${cmd}] ${name}`);
    if (detail) console.log(`${RED}       ${detail.slice(0, 300)}${RESET}`);
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

testContains("HR --- \u2192 unicode divider", "html", "---", ["\u2501\u2501\u2501\u2501\u2501"], ["<hr>"]);
testContains("HR *** \u2192 unicode divider", "html", "***", ["\u2501\u2501\u2501\u2501\u2501"], ["<hr>"]);
testContains("HR ___ \u2192 unicode divider", "html", "___", ["\u2501\u2501\u2501\u2501\u2501"], ["<hr>"]);

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

section("HTML: Line-leading comments keep trailing text (issue #29)");

test("Line-leading comment keeps trailing text", "html",
  "<!-- c --> After",
  "After");

testContains("Comment prefix in paragraph keeps sentence", "html",
  "First para.\n\n<!-- reviewed --> Release is live now.\n\nLast para.",
  ["First para.", "Release is live now.", "Last para."], ["reviewed"]);

testContains("Multiline comment keeps text after close", "html",
  "<!-- open\nstill comment --> Trailing text",
  ["Trailing text"], ["still comment"]);

test("Comment on its own line still fully stripped", "html",
  "<!-- c -->\nAfter",
  "After");

testContains("Two comments on one line both stripped", "html",
  "<!-- a --> mid <!-- b --> end",
  ["mid", "end"], ["<!--"]);

testContains("Comment-like text inside fence untouched", "html",
  "```\n<!-- not a comment -->\n```",
  ["&lt;!-- not a comment --&gt;"]);

test("Unterminated comment strips to end", "html",
  "<!-- never closed\nmore text",
  "");

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

section("mrkdwn: Placeholder Restore (issues #16, #17)");

// Inline code is extracted before tables, so a cell's placeholder ends up
// inside the table's code block — code blocks must restore first or the
// placeholder leaks as literal \x00IC bytes.
testContains("Inline code inside table cell restored", "mrkdwn",
  "| cmd | desc |\n|---|---|\n| `npm ci` | install |",
  ["| `npm ci` | install |"],
  ["IC0", "\x00"]);

testContains("Inline code in table cell plus code span outside", "mrkdwn",
  "Run `make` first.\n\n| cmd | desc |\n|---|---|\n| `npm ci` | install |",
  ["Run `make` first.", "| `npm ci` | install |"],
  ["IC0", "IC1", "\x00"]);

// String.replace treats $&, $', $1… in the replacement as patterns — the
// restore loops must use a function callback so code content stays literal.
test("Dollar-ampersand in code span survives restore", "mrkdwn",
  "a `$&` b", "a `$&` b");

test("Dollar patterns $' and $1 in code spans survive", "mrkdwn",
  "`$'` and `$1`", "`$'` and `$1`");

testContains("Dollar patterns in fenced block survive restore", "mrkdwn",
  "```\necho $& $1 $'\n```",
  ["echo $& $1 $'"]);

testContains("Dollar pattern in labeled autolink survives restore", "mrkdwn",
  "See <https://x.com|price is $&>",
  ["<https://x.com|price is $&>"]);

// Nesting also happens in the other direction: a stray-backtick span can
// capture a fence's placeholder once the multi-line fence collapses to one
// line. The restore must iterate until no placeholder remains.
test("Code span capturing a collapsed fence reconstructs verbatim", "mrkdwn",
  "a `foo ```\nbar\n``` baz` end",
  "a `foo ```\nbar\n``` baz` end");

testContains("Fence collapsed into a table row restores clean", "mrkdwn",
  "| a ```\nx\n``` | b |\n|---|---|\n| 1 | 2 |",
  ["x"],
  ["\x00"]);

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

section("HTML: Inline Code Trim Parity (issue #14)");

// Single- and double-backtick spans must trim inner padding identically —
// stray spaces inside the pill leak into the pasted Slack code span.
test("Single-backtick inner whitespace trimmed", "html",
  "a ` x ` b", "a <code>x</code> b");

test("Double-backtick inner whitespace trimmed", "html",
  "a ``  x  `` b", "a <code>x</code> b");

testContains("Trim parity between backtick syntaxes", "html",
  "single ` pad ` double ``   pad   `` end",
  ["single <code>pad</code> double <code>pad</code> end"]);

test("Code without padding unchanged", "html",
  "`resolveModelId()`", "<code>resolveModelId()</code>");

test("Whitespace-only code span keeps its space", "html",
  "a ` ` b", "a <code> </code> b");

test("Inline code padding trimmed (mrkdwn parity)", "mrkdwn",
  "run ` npm ci ` now", "run `npm ci` now");

test("Whitespace-only code span kept (mrkdwn)", "mrkdwn",
  "a ` ` b", "a ` ` b");

section("HTML: Code Span Content Isolated From Formatting Regexes");

// Code spans are placeholder-extracted before the bold/italic/emoji/token
// regexes run — a * or _ at a span edge must never pair with a delimiter
// outside the span, and markdown inside a span must stay literal.
test("Asterisk in code span doesn't pair with outside italics", "html",
  "a ` * ` b *it* c", "a <code>*</code> b <i>it</i> c");

test("Glob patterns in padded spans keep their stars", "html",
  "glob ` foo* ` and ` *bar ` done",
  "glob <code>foo*</code> and <code>*bar</code> done");

test("Underscore-only code spans stay literal", "html",
  "use ` _ ` here and ` _ ` there",
  "use <code>_</code> here and <code>_</code> there");

test("Markdown formatting inside code span left literal", "html",
  "`**not bold** and *not italic*`",
  "<code>**not bold** and *not italic*</code>");

// A single-backtick pair around an already-extracted ``span`` must expand the
// nested placeholder (matching main's nested-<code> output) — a leaked
// placeholder would put raw \x00 bytes and "IC0" text into the Slack paste.
test("Single-backtick span wrapping a double-backtick span", "html",
  "`a ``b`` c`", "<code>a <code>b</code> c</code>");

testContains("Stray backticks flanking a double span leak no placeholders", "html",
  "the ` key and ``git status`` then ` end",
  ["<code>git status</code>"], ["IC0", "IC1", "undefined"]);

// Sentinel control bytes (\x00-\x02) can't ride through the shell heredoc
// harness — drive stdin directly. Crafted \x00IC<n>\x00 bytes in the input
// must not spoof a placeholder (duplicating a real span) — main strips them.
{
  const nulOut = await new Promise((resolve) => {
    const child = spawn("node", [RUN, "html"]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out.trim()));
    child.stdin.write("a \x00IC0\x00 b `real`");
    child.stdin.end();
  });
  check("placeholder-sentinel bytes in input can't spoof a code span",
    nulOut === "a IC0 b <code>real</code>",
    JSON.stringify(nulOut), "html");
}

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

testContains("HR with extra dashes (html)", "html", "------", ["\u2501\u2501\u2501\u2501\u2501"], ["<hr>"]);
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

section("CRLF normalization (issue #21)");

testContains("CRLF heading (html)", "html",
  "# Deploy Update\r\n\r\nAll services green.\r\n",
  ["<b>Deploy Update</b>", "All services green."],
  ["# Deploy Update"]);

testContains("CRLF heading (mrkdwn)", "mrkdwn",
  "# Deploy Update\r\n\r\nAll services green.\r\n",
  ["*Deploy Update*"],
  ["# Deploy Update"]);

testContains("CRLF table has no phantom trailing column (html)", "html",
  "| Col A | Col B |\r\n|---|---|\r\n| 1 | 2 |\r\n",
  ["Col A | Col B\n------|------\n1     | 2"],
  ["Col B | "]);

testContains("CRLF list (html)", "html",
  "- item one\r\n- item two\r\n",
  ["<li>item one</li>", "<li>item two</li>"]);

testContains("Lone CR line endings (html)", "html",
  "# Title\rBody text\r",
  ["<b>Title</b>", "Body text"],
  ["# Title"]);

testContains("CRLF bold heading matches LF output (html)", "html",
  "## **Status:** done\r\n\r\nAll good.\r\n",
  ["<b><b>Status:</b> done</b>", "All good."],
  ["##"]);

section("HTML: list interrupted by unindented line (issue #19)");

test("Fence between ordered items stays in place, no duplicates", "html",
  "1. First step\n2. Second step:\n```\nkubectl apply -f config.yaml\n```\n3. Third step",
  `<ol>
<li>First step</li>
<li>Second step:</li>
</ol><br>
<pre><code>kubectl apply -f config.yaml</code></pre><br>
<ol start="3">
<li>Third step</li>
</ol>`);

test("Plain line between bullets splits list, items appear once", "html",
  "- a\nx\n- b",
  `<ul>
<li>a</li>
</ul><br>
x
<ul>
<li>b</li>
</ul>`);

test("Mixed markers stay in source order", "html",
  "1. Deploy\n- note\n2. Verify",
  `<ol>
<li>Deploy</li>
</ol><br>
<ul>
<li>note</li>
</ul><br>
<ol start="2">
<li>Verify</li>
</ol>`);

test("HTML comment between bullets stripped without duplication", "html",
  "- a\n<!-- c -->\n- b",
  `<ul>
<li>a</li>
</ul><br>
<ul>
<li>b</li>
</ul>`);

testContains("Indented continuation still joins into its item", "html",
  "- parent\n  - child one\n- next parent\n  continuation line",
  ["<li>next parent continuation line</li>", "<li>child one</li>"]);

section("HTML: one-space list continuation lines (issue #28)");

test("One-space continuation joins its bullet item", "html",
  "- first item\n continued with one leading space\n- second item",
  `<ul>
<li>first item continued with one leading space</li>
<li>second item</li>
</ul>`);

test("One-space continuation joins its ordered item", "html",
  "1. first step\n wraps onto a second line\n2. second step",
  `<ol>
<li>first step wraps onto a second line</li>
<li>second step</li>
</ol>`);

testContains("One-space continuation on a middle item, later items intact", "html",
  "- alpha\n- beta\n one space wrap\n- gamma",
  ["<li>alpha</li>", "<li>beta one space wrap</li>", "<li>gamma</li>"]);

testContains("One-space and two-space continuations behave the same", "html",
  "- one\n a\n- two\n  b",
  ["<li>one a</li>", "<li>two b</li>"]);

test("One-space-indented sibling marker stays a separate item", "html",
  "- alpha\n - beta\n- gamma",
  `<ul>
<li>alpha</li>
<li>beta</li>
<li>gamma</li>
</ul>`);

section("HTML: nested 2-space list dedent (issue #26)");

test("Sub-item continuation line preserved", "html",
  "- parent item\n  - sub item\n    continuation of the sub item",
  `<ul>
<li>parent item
<ul>
<li>sub item continuation of the sub item</li>
</ul>
</li>
</ul>`);

test("Three-level 2-space list nests", "html",
  "- level one\n  - level two\n    - level three",
  `<ul>
<li>level one
<ul>
<li>level two
<ul>
<li>level three</li>
</ul>
</li>
</ul>
</li>
</ul>`);

test("Three-level 4-space list still nests", "html",
  "- level one\n    - level two\n        - level three",
  `<ul>
<li>level one
<ul>
<li>level two
<ul>
<li>level three</li>
</ul>
</li>
</ul>
</li>
</ul>`);

test("Sub-item continuation does not swallow next sub-item", "html",
  "- parent\n  - first sub\n    wraps here\n  - second sub",
  `<ul>
<li>parent
<ul>
<li>first sub wraps here</li>
<li>second sub</li>
</ul>
</li>
</ul>`);

test("Ordered sub-list continuation preserved", "html",
  "1. parent\n   1. sub step\n      wrapped detail",
  `<ol>
<li>parent
<ol>
<li>sub step wrapped detail</li>
</ol>
</li>
</ol>`);

section("HTML: mixed-type nested lists (issue #27)");

test("ol > ul > ol keeps every level", "html",
  "1. ordered one\n   - bullet two\n     1. ordered three",
  `<ol>
<li>ordered one
<ul>
<li>bullet two
<ol>
<li>ordered three</li>
</ol>
</li>
</ul>
</li>
</ol>`);

test("ul > ul > ol keeps the middle bullet", "html",
  "- alpha\n  - beta\n    1. gamma",
  `<ul>
<li>alpha
<ul>
<li>beta
<ol>
<li>gamma</li>
</ol>
</li>
</ul>
</li>
</ul>`);

test("ul > ol > ul keeps every level", "html",
  "- alpha\n  1. beta\n     - gamma",
  `<ul>
<li>alpha
<ol>
<li>beta
<ul>
<li>gamma</li>
</ul>
</li>
</ol>
</li>
</ul>`);

test("Mixed-type siblings inside a nested level both survive", "html",
  "1. a\n   1. x\n   - y",
  `<ol>
<li>a
<ol>
<li>x</li>
</ol>
<ul>
<li>y</li>
</ul>
</li>
</ol>`);

test("Top-level ul then ol are not duplicated", "html",
  "- a\n1. b",
  `<ul>
<li>a</li>
</ul><br>
<ol>
<li>b</li>
</ol>`);

section("HTML: ordered list start attribute (issue #41)");

test("List starting at 3 emits <ol start=\"3\">", "html",
  "3. step three\n4. step four",
  `<ol start="3">
<li>step three</li>
<li>step four</li>
</ol>`);

testContains("List starting at 1 stays a plain <ol>", "html",
  "1. first\n2. second",
  ["<ol>", "<li>first</li>", "<li>second</li>"],
  ["start="]);

test("List starting at 0 emits <ol start=\"0\">", "html",
  "0. zero\n1. one",
  `<ol start="0">
<li>zero</li>
<li>one</li>
</ol>`);

test("Leading zeros normalize in the start attribute", "html",
  "07. seven\n08. eight",
  `<ol start="7">
<li>seven</li>
<li>eight</li>
</ol>`);

test("Nested ordered sublist keeps its own start", "html",
  "1. parent\n   3. sub three\n   4. sub four",
  `<ol>
<li>parent
<ol start="3">
<li>sub three</li>
<li>sub four</li>
</ol>
</li>
</ol>`);

test("Sibling flip to ordered inside a nested level keeps start", "html",
  "- parent\n  - u1\n  3. o3\n  4. o4",
  `<ul>
<li>parent
<ul>
<li>u1</li>
</ul>
<ol start="3">
<li>o3</li>
<li>o4</li>
</ol>
</li>
</ul>`);

test("mrkdwn path keeps the literal numbers", "mrkdwn",
  "3. step three\n4. step four",
  "3. step three\n4. step four");

section("HTML: only '1.' interrupts a paragraph (issue #22)");

test("Wrapped line starting with a year stays in the paragraph", "html",
  "The company was founded in\n2024. It was a great year.",
  "The company was founded in<br>\n2024. It was a great year.");

test("CommonMark windows example stays one paragraph", "html",
  "The number of windows in my house is\n14. The number of doors is 6.",
  "The number of windows in my house is<br>\n14. The number of doors is 6.");

test("Paren marker with number != 1 does not interrupt either", "html",
  "The total came to\n2) which surprised us.",
  "The total came to<br>\n2) which surprised us.");

test("'1.' still interrupts a paragraph", "html",
  "Steps:\n1. First\n2. Second",
  `Steps:
<ol>
<li>First</li>
<li>Second</li>
</ol>`);

test("'1)' still interrupts a paragraph", "html",
  "Steps:\n1) First\n2) Second",
  `Steps:
<ol>
<li>First</li>
<li>Second</li>
</ol>`);

test("After a blank line any number still starts a list", "html",
  "Intro paragraph.\n\n2024. first\n2025. second",
  `Intro paragraph.
<ol start="2024">
<li>first</li>
<li>second</li>
</ol>`);

test("mrkdwn path keeps wrapped prose verbatim", "mrkdwn",
  "The company was founded in\n2024. It was a great year.",
  "The company was founded in\n2024. It was a great year.");

section("HTML: only a full HR line interrupts a paragraph (issue #39)");

test("Continuation line starting with ***emphasis*** stays in the paragraph", "html",
  "Heads up team:\n***Please read this*** before deploying today.",
  "Heads up team:<br>\n<b><i>Please read this</i></b> before deploying today.");

test("Continuation line starting with --- stays in the paragraph", "html",
  "Heads up team:\n--- wait, actually hold off until 3pm.",
  "Heads up team:<br>\n--- wait, actually hold off until 3pm.");

testContains("Continuation line starting with ___emphasis___ stays in the paragraph", "html",
  "Heads up team:\n___Please read this___ soon.",
  ["Heads up team:<br>"], ["<br><br>"]);

test("A bare --- line still interrupts a paragraph as an HR", "html",
  "para one\n---\npara two",
  `para one<br><br>\n${"━".repeat(30)}<br><br>\npara two`);

test("A bare *** line still interrupts a paragraph as an HR", "html",
  "para one\n***\npara two",
  `para one<br><br>\n${"━".repeat(30)}<br><br>\npara two`);

testContains("An HR line with trailing spaces still interrupts", "html",
  "para one\n___   \npara two",
  ["━".repeat(30)], []);

section("Divider followed by list/tasks/code keeps its gap (issue #40)");

test("HR then unordered list gets one blank line (html)", "html",
  "---\n\n- action item",
  `${"━".repeat(30)}<br><br>\n<ul>\n<li>action item</li>\n</ul>`);

test("HR then ordered list gets one blank line (html)", "html",
  "---\n\n1. first step",
  `${"━".repeat(30)}<br><br>\n<ol>\n<li>first step</li>\n</ol>`);

test("HR then task list gets one blank line (html)", "html",
  "---\n\n- [ ] todo",
  `${"━".repeat(30)}<br><br>\n&#x1F532; todo`);

test("HR then fenced code block gets one blank line (html)", "html",
  "---\n\n```\ncode\n```",
  `${"━".repeat(30)}<br><br>\n<pre><code>code</code></pre>`);

testContains("List then HR spacing unchanged (html)", "html",
  "- item\n\n---",
  [`</ul><br>\n${"━".repeat(30)}`], []);

testContains("HR then unordered list keeps its blank line (mrkdwn)", "mrkdwn",
  "---\n\n- action item",
  [`${"━".repeat(30)}\n\n• action item`], []);

testContains("HR then task list keeps its blank line (mrkdwn)", "mrkdwn",
  "---\n\n- [ ] todo",
  [`${"━".repeat(30)}\n\n:black_square_button: todo`], []);

testContains("HR then ordered list keeps its blank line (mrkdwn)", "mrkdwn",
  "---\n\n1. first step",
  [`${"━".repeat(30)}\n\n1. first step`], []);

testContains("HR then paragraph keeps its blank line (mrkdwn)", "mrkdwn",
  "---\n\nparagraph after",
  [`${"━".repeat(30)}\n\nparagraph after`], []);

testContains("HR with trailing spaces still converts and keeps gap (mrkdwn)", "mrkdwn",
  "---   \n\n- item",
  [`${"━".repeat(30)}\n\n• item`], []);

testContains("Intro text before a list still attaches tightly (mrkdwn)", "mrkdwn",
  "Intro:\n\n- item",
  ["Intro:\n• item"], []);

section("Table separator must be a full-line GFM delimiter (issue #20)");

testContains("Data row with dash-only first cell is not eaten as separator (html)", "html",
  "| Mon | Tue |\n| - | Meeting with team |",
  ["Meeting with team"], ["<pre><code>"]);

testContains("Trailing text after a real separator is not deleted (html)", "html",
  "| A | B |\n|---|---| IMPORTANT NOTE\n| 1 | 2 |",
  ["IMPORTANT NOTE"], ["<pre><code>"]);

testContains("Row with empty first cell does not vanish as separator (html)", "html",
  "| Task | Owner |\n| | unassigned cleanup |\n| Deploy | Karan |",
  ["unassigned cleanup"], ["<pre><code>"]);

testContains("Valid plain separator still forms a table (html)", "html",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  ["<pre><code>", "A", "1"], []);

testContains("Valid alignment separator still forms a table (html)", "html",
  "| A | B |\n| :--- | ---: |\n| 1 | 2 |",
  ["<pre><code>", "A", "1"], []);

testContains("Valid single-dash separator still forms a table (html)", "html",
  "| A | B |\n| - | - |\n| 1 | 2 |",
  ["<pre><code>", "A", "1"], []);

testContains("Data row with dash-only first cell is not a separator (mrkdwn)", "mrkdwn",
  "| Mon | Tue |\n| - | Meeting with team |",
  ["Meeting with team"], ["```"]);

testContains("Row with empty first cell does not form a table (mrkdwn)", "mrkdwn",
  "| Task | Owner |\n| | unassigned cleanup |\n| Deploy | Karan |",
  ["unassigned cleanup"], ["```"]);

testContains("Valid table still becomes a code block (mrkdwn)", "mrkdwn",
  "| A | B |\n|---|---|\n| 1 | 2 |",
  ["```\n| A | B |\n|---|---|\n| 1 | 2 |\n```"], []);

section("Escaped pipe \\| inside table cells (issue #36)");

testContains("Escaped pipe stays inside its cell as a literal | (html)", "html",
  "| Type | Default |\n| --- | --- |\n| string \\| number | none |",
  ["string | number", "none"], ["\\"]);

{
  // Column pairing: "none" must land under the "Default" header, not in a
  // phantom third column past it.
  const out = run("html",
    "| Type | Default |\n| --- | --- |\n| string \\| number | none |");
  const lines = out.replace("<pre><code>", "").split("\n");
  check("Escaped pipe keeps column pairing (none under Default)",
    lines[0].indexOf("Default") === lines[2].indexOf("none"),
    out, "html");
}

testContains("Trailing \\| is not eaten as the row-closing delimiter (html)", "html",
  "| A | B |\n| --- | --- |\n| a\\| | c\\|d |",
  ["a|", "c|d"], ["\\"]);

testContains("Escaped pipe in a header cell (html)", "html",
  "| A \\| B | C |\n| --- | --- |\n| 1 | 2 |",
  ["A | B"], ["\\"]);

testContains("Escaped pipe inside an inline-code cell (html)", "html",
  "| Type | Default |\n| --- | --- |\n| `string \\| number` | none |",
  ["`string | number`"], ["\\"]);

testContains("mrkdwn table fence keeps the row verbatim", "mrkdwn",
  "| Type | Default |\n| --- | --- |\n| string \\| number | none |",
  ["```", "| string \\| number | none |"], []);

section("Table separator alignment with narrow columns (issue #37)");

{
  const pipeCols = (line) => {
    const idx = [];
    for (let k = 0; k < line.length; k++) if (line[k] === "|") idx.push(k);
    return idx.join(",");
  };

  // Minimal repro: 1-char columns drifted the separator pipe right by 2.
  const out = run("html", "| A | B |\n| --- | --- |\n| 1 | 2 |");
  const lines = out.replace("<pre><code>", "").replace("</code></pre>", "").split("\n");
  check("1-char columns: separator pipe under header pipe",
    pipeCols(lines[1]) === pipeCols(lines[0]),
    out, "html");
  check("1-char columns: separator pipe under data pipe",
    pipeCols(lines[1]) === pipeCols(lines[2]),
    out, "html");
  check("Narrow column separator keeps the 3-dash floor",
    /^-{3,}\|/.test(lines[1]),
    out, "html");
}

{
  // Realistic variant: a "#" rank column next to wide columns — drift
  // compounded left to right across every following pipe.
  const out = run("html",
    "| # | Name | Age |\n| --- | --- | --- |\n| 1 | Alice | 30 |\n| 2 | Bob | 25 |");
  const lines = out.replace("<pre><code>", "").replace("</code></pre>", "").split("\n");
  const cols = (line) => {
    const idx = [];
    for (let k = 0; k < line.length; k++) if (line[k] === "|") idx.push(k);
    return idx.join(",");
  };
  const headerCols = cols(lines[0]);
  check("Rank column table: all rows share pipe positions",
    lines.slice(1).every(l => cols(l) === headerCols) && headerCols.length > 0,
    out, "html");
}

{
  // Columns already >= 3 chars wide were aligned before — must stay aligned.
  const out = run("html", "| Name | Age |\n|------|-----|\n| Alice | 30 |");
  const lines = out.replace("<pre><code>", "").replace("</code></pre>", "").split("\n");
  check("Wide columns keep exact pipe alignment",
    lines[0].indexOf("|") === lines[1].indexOf("|") &&
    lines[1].indexOf("|") === lines[2].indexOf("|"),
    out, "html");
}

section("Table padding uses display width, not UTF-16 .length (issue #38)");

{
  // Pipe positions measured in monospace display columns — the same width
  // model the fix uses (grapheme-wise; emoji-presentation/VS16/wide-CJK = 2).
  const dwidth = (s) => {
    let w = 0;
    for (const { segment: g } of new Intl.Segmenter().segment(s)) {
      const cp = g.codePointAt(0);
      const wide = /\p{Emoji_Presentation}/u.test(g) || g.includes("\uFE0F") ||
        (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
        (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
        (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff) ||
        (cp >= 0x20000 && cp <= 0x3fffd);
      w += wide ? 2 : 1;
    }
    return w;
  };
  const pipeDisplayCols = (line) =>
    line.split("|").slice(0, -1)
      .map((_, k, parts) => dwidth(parts.slice(0, k + 1).join("|")))
      .join(",");
  const tableLines = (out) =>
    out.replace("<pre><code>", "").replace("</code></pre>", "").split("\n");
  const allAligned = (lines) => {
    const head = pipeDisplayCols(lines[0]);
    return head.length > 0 && lines.every(l => pipeDisplayCols(l) === head);
  };

  // Repro: BMP emoji ✅ is .length 1 but 2 display columns.
  let lines = tableLines(run("html",
    "| Status | Svc |\n| --- | --- |\n| ✅ ok | api |\n| pending | web |"));
  check("Status-emoji cell keeps pipes at the same display column",
    allAligned(lines), lines.join("\n"), "html");

  // Repro: CJK — every ideograph is 2 columns, so 田中太郎 drifted 4.
  lines = tableLines(run("html",
    "| 名前 | Role |\n| --- | --- |\n| 田中太郎 | admin |\n| bob | user |"));
  check("CJK cells keep pipes at the same display column",
    allAligned(lines), lines.join("\n"), "html");
  check("CJK separator row reaches the header pipe exactly",
    lines[1].indexOf("|") === 9 && lines[0].indexOf("|") === 7 /* 名前=4cols+5sp */ &&
    dwidth(lines[0].split("|")[0]) === dwidth(lines[1].split("|")[0]),
    lines.join("\n"), "html");

  // VS16 sequence: ⚠️ is 2 UTF-16 units but ONE grapheme, 2 columns.
  lines = tableLines(run("html",
    "| Level | N |\n| --- | --- |\n| ⚠️ warn | 4 |\n| info | 12 |"));
  check("VS16 emoji (⚠️) counts as one wide grapheme",
    allAligned(lines), lines.join("\n"), "html");

  // ZWJ sequence: 👩‍💻 is 5 UTF-16 units but ONE grapheme, 2 columns.
  lines = tableLines(run("html",
    "| Who | Team |\n| --- | --- |\n| 👩‍💻 dev | eng |\n| alice | ops |"));
  check("ZWJ emoji sequence counts as one wide grapheme",
    allAligned(lines), lines.join("\n"), "html");

  // ASCII-only tables must be byte-for-byte what they were before the fix.
  const asciiOut = run("html",
    "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 7 |");
  check("ASCII table output unchanged by display-width padding",
    asciiOut.includes("Name  | Age\n------|----\nAlice | 30 \nBob   | 7"),
    asciiOut, "html");
}

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
  "\u2501\u2501\u2501\u2501\u2501",
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
// PREVIEW COMMAND — generated pages (headless via SLACK_FORMATTER_NO_OPEN)
// =============================================================

section("preview: inline code pill spacing (issue #14)");

{
  const previewDir = mkdtempSync(join(tmpdir(), "smf-test-"));
  const out = run("preview", "Use `resolveModelId()`, not ` haiku `.", {
    SLACK_FORMATTER_PREVIEW_DIR: previewDir,
    SLACK_FORMATTER_NO_OPEN: "1",
  });
  const files = readdirSync(previewDir);
  const copyFile = files.find((f) => f.startsWith("copy-"));
  const previewFile = files.find((f) => f.startsWith("preview-"));

  check("generates copy and preview pages without opening browser",
    Boolean(copyFile && previewFile) && out.includes("suppressed"),
    JSON.stringify({ files, out }), "preview");

  const copyHtml = copyFile ? readFileSync(join(previewDir, copyFile), "utf-8") : "";
  const previewHtml = previewFile ? readFileSync(join(previewDir, previewFile), "utf-8") : "";

  check("copy page code pill has horizontal margin",
    copyHtml.includes("code{background:#f0f0f0;padding:2px 5px;margin:0 2px;"),
    copyHtml.match(/^code\{.*$/m)?.[0] ?? "code{} rule not found", "preview");

  check("copy page pre code resets margin",
    copyHtml.includes("pre code{background:none;padding:0;margin:0;color:inherit}"),
    copyHtml.match(/^pre code\{.*$/m)?.[0] ?? "pre code{} rule not found", "preview");

  check("preview page code pill has horizontal margin",
    previewHtml.includes(".mc code{") && /\.mc code\{[^}]*margin:0 2px/.test(previewHtml),
    previewHtml.match(/\.mc code\{[^}]*\}/)?.[0] ?? ".mc code{} rule not found", "preview");

  check("preview page pre code resets margin",
    /\.mc pre code\{[^}]*margin:0[;}]/.test(previewHtml),
    previewHtml.match(/\.mc pre code\{[^}]*\}/)?.[0] ?? ".mc pre code{} rule not found", "preview");

  check("copy page trims single-backtick span content",
    copyHtml.includes("<code>haiku</code>"),
    copyHtml.match(/<code>[^<]*<\/code>/g)?.join(" ") ?? "no code spans", "preview");

  rmSync(previewDir, { recursive: true, force: true });
}

// =============================================================
// SEND COMMAND — real HTTP round-trip against a local server
// =============================================================

section("send: webhook delivery & error reporting");

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
