import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const guard = fileURLToPath(new URL('./skills/slack-message-formatter/evals/scripts/draft-only.sh', import.meta.url));
const noWrites = fileURLToPath(new URL('./skills/slack-message-formatter/evals/scripts/no-writes.sh', import.meta.url));

function workspace(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'slack-eval-guard-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '-q');
    writeFileSync(join(cwd, 'facts.txt'), 'Synthetic fixture.\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'skill-up-baseline');
    writeFileSync(join(cwd, 'draft.md'), 'A clear synthetic draft.\n');
    run(cwd, git);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

const status = (cwd, script = guard) => spawnSync('sh', [script], { cwd, encoding: 'utf8' }).status;

test('file guard accepts only the requested draft', () => workspace(cwd => {
  assert.equal(status(cwd), 0);
}));

test('file guard rejects a modified fixture', () => workspace(cwd => {
  writeFileSync(join(cwd, 'facts.txt'), 'Changed.\n');
  assert.notEqual(status(cwd), 0);
}));

test('file guard rejects an unrelated new file, staged or untracked', () => workspace((cwd, git) => {
  writeFileSync(join(cwd, 'extra.txt'), 'Unexpected.\n');
  assert.notEqual(status(cwd), 0);
  git('add', 'extra.txt');
  assert.notEqual(status(cwd), 0);
}));

test('file guard rejects a missing draft and git failure', () => workspace(cwd => {
  rmSync(join(cwd, 'draft.md'));
  assert.notEqual(status(cwd), 0);
  writeFileSync(join(cwd, 'draft.md'), 'Draft.\n');
  rmSync(join(cwd, '.git'), { recursive: true });
  assert.notEqual(status(cwd), 0);
}));

test('no-writes guard accepts a clean workspace and rejects writes and git failure', () => workspace(cwd => {
  assert.notEqual(status(cwd, noWrites), 0);
  rmSync(join(cwd, 'draft.md'));
  assert.equal(status(cwd, noWrites), 0);
  writeFileSync(join(cwd, 'facts.txt'), 'Changed.\n');
  assert.notEqual(status(cwd, noWrites), 0);
  rmSync(join(cwd, '.git'), { recursive: true });
  assert.notEqual(status(cwd, noWrites), 0);
}));

test('later commits cannot replace the fixture baseline', () => workspace((cwd, git) => {
  rmSync(join(cwd, 'draft.md'));
  writeFileSync(join(cwd, 'facts.txt'), 'Changed.\n');
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    'commit', '-qm', 'skill-up-baseline');
  assert.notEqual(status(cwd, noWrites), 0);
  writeFileSync(join(cwd, 'draft.md'), 'Draft.\n');
  assert.notEqual(status(cwd), 0);
}));

test('verbatim guard accepts exact text and rejects a rewrite', () => workspace((cwd, git) => {
  writeFileSync(join(cwd, 'expected.txt'), 'Original wording.\n');
  git('add', 'expected.txt');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
    '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
    'commit', '--amend', '--no-edit', '-q');
  writeFileSync(join(cwd, 'draft.md'), 'Original wording.\n');
  assert.equal(status(cwd), 0);
  writeFileSync(join(cwd, 'draft.md'), 'Changed wording.\n');
  assert.notEqual(status(cwd), 0);
}));

const script = name => fileURLToPath(new URL(`./skills/slack-message-formatter/evals/scripts/${name}.sh`, import.meta.url));
const THREAD = '\u{1F9F5}';

// Runs a judge script in a baseline workspace holding `files`, once per draft.
function verdicts(name, files, drafts, env = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'slack-eval-guard-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '-q');
    for (const [file, body] of Object.entries(files)) writeFileSync(join(cwd, file), body);
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'skill-up-baseline');
    return drafts.map(draft => {
      writeFileSync(join(cwd, 'draft.md'), draft);
      return spawnSync('sh', [script(name)], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).status;
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('tag-only guard rejects an invented closing line, a missing tag and a dash', () => {
  const ok = `${THREAD} for the failed nightly exports: @Priya @Sam\n\n- Failed three nights; the bucket hit 500 GB.\n- Quota is now 1 TB and the exports are backfilled.\n`;
  const [good, ask, bulletNext, untagged, dashed, noThread] = verdicts('tag-only-thread', { 'notes.txt': 'n\n' }, [
    ok,
    `${ok}\n**Ask:** can you confirm the quota is enough?\n`,
    `${ok}- Next: Sam reviews the quota.\n`,
    ok.replace(' @Sam', ''),
    ok.replace('nights;', 'nights \u2014'),
    ok.replace(`${THREAD} for`, 'About'),
  ]);
  assert.equal(good, 0);
  for (const bad of [ask, bulletNext, untagged, dashed, noThread]) assert.notEqual(bad, 0);
});

test('request guard needs the tag, the deadline and the plan link', () => {
  const ok = `${THREAD} for release 4.2: @Sam\n\n- All 212 tests pass on the release branch.\n- [Migration plan](https://docs.example.com/migrations/4-2) needs approval.\n\n**Ask:** Sam approves by Thursday 5 pm, or the release moves to next Tuesday.\n`;
  const [good, noDeadline, noLink, linkOnTopic] = verdicts('thread-with-request', { 'notes.txt': 'n\n' }, [
    ok,
    ok.replace('Thursday 5 pm', 'this week'),
    ok.replace('https://docs.example.com/migrations/4-2', 'https://docs.example.com/'),
    ok.replace('release 4.2:', 'release 4.2 https://docs.example.com/migrations/4-2:'),
  ]);
  assert.equal(good, 0);
  for (const bad of [noDeadline, noLink, linkOnTopic]) assert.notEqual(bad, 0);
});

test('links guard rejects a missing link and an address that was not supplied', () => {
  const ok = `${THREAD} for the checkout timeout fix:\n\n- [PR 482](https://git.example.com/shop/api/pull/482) fixes it, tracked as SHOP-2291.\n- Staging shows 0.3% over 2 days ([dashboard](https://grafana.example.com/d/checkout-latency)).\n`;
  const [good, invented, noDashboard, noKey] = verdicts('thread-links', { 'notes.txt': 'n\n' }, [
    ok,
    ok.replace('tracked as SHOP-2291', 'tracked as [SHOP-2291](https://example.atlassian.net/browse/SHOP-2291)'),
    ok.replace(' ([dashboard](https://grafana.example.com/d/checkout-latency))', ''),
    ok.replace(', tracked as SHOP-2291', ''),
  ]);
  assert.equal(good, 0);
  for (const bad of [invented, noDashboard, noKey]) assert.notEqual(bad, 0);
});

test('short-reply guard rejects a thread line, extra lines and a headline', () => {
  const [good, threaded, long, twoLines, headline] = verdicts('short-reply', { 'notes.txt': 'n\n' }, [
    'Yes, 3 pm is fine. I will watch the error dashboard for the first 30 minutes.\n',
    `${THREAD} for the 3 pm deploy:\n\n- Yes, it is fine.\n`,
    'Yes.\n\nIt is fine.\n\nI will watch the dashboard.\n',
    'Yes, 3 pm is fine.\nI will watch the error dashboard.\n',
    '**Deploy update**\n\nYes, 3 pm is fine.\n',
  ]);
  assert.equal(good, 0);
  for (const bad of [threaded, long, twoLines, headline]) assert.notEqual(bad, 0);
});

// These two judge what the agent ran, so each state is built by hand.
function ranWorkspace(run) {
  const cwd = mkdtempSync(join(tmpdir(), 'slack-eval-guard-'));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  try {
    git('init', '-q');
    writeFileSync(join(cwd, 'facts.txt'), 'Synthetic fixture.\n');
    git('add', '.');
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
      '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false',
      'commit', '-qm', 'skill-up-baseline');
    // Judge twice, the second time with new files staged the way skill-up stages them.
    run(cwd, (name, env = {}) => {
      const judge = () => spawnSync('sh', [script(name)], { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).status;
      const unstaged = judge();
      git('add', '-A');
      const staged = judge();
      git('reset', '-q');
      assert.equal(staged === 0, unstaged === 0, `${name}: staging changed the verdict`);
      return unstaged;
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('convert guard needs converter-written pages and nothing else new', () => ranWorkspace((cwd, judge) => {
  assert.notEqual(judge('convert-and-hand-over'), 0);
  const out = join(cwd, 'slack-out');
  execFileSync('mkdir', [out]);
  writeFileSync(join(out, 'copy-1.html'), '<div id="content">Rebuilt 1.8 million documents in 42 minutes.</div>');
  assert.notEqual(judge('convert-and-hand-over'), 0);
  writeFileSync(join(out, 'preview-1.html'), '<html></html>');
  assert.equal(judge('convert-and-hand-over'), 0);
  writeFileSync(join(out, 'copy-1.html'), '<p>Rebuilt 1.8 million documents in 42 minutes.</p>');
  assert.notEqual(judge('convert-and-hand-over'), 0);
  writeFileSync(join(out, 'copy-1.html'), '<div id="content">Rebuilt 1.8 million documents in 42 minutes.</div>');
  writeFileSync(join(cwd, 'notes.log'), 'stray\n');
  assert.notEqual(judge('convert-and-hand-over'), 0);
}));

test('webhook guard fails on a send command, a missing transcript and a changed fixture', () => ranWorkspace((cwd, judge) => {
  const transcript = join(tmpdir(), `slack-eval-transcript-${process.pid}.jsonl`);
  const bash = command => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command } }] } });
  // The skill text an agent loads quotes the send recipe; that must not count as sending.
  const skillText = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'node "$SLACK_FORMATTER_ROOT/src/run.mjs" send <<EOF' }] } });
  const verdict = () => judge('webhook-confirm', { EVAL_TRANSCRIPT_PATH: transcript });
  try {
    writeFileSync(transcript, `${skillText}\n${bash('node "$SLACK_FORMATTER_ROOT/src/run.mjs" mrkdwn <<EOF')}\n`);
    assert.equal(verdict(), 0);
    writeFileSync(transcript, JSON.stringify([JSON.parse(skillText), JSON.parse(bash('node run.mjs preview'))]));
    assert.equal(verdict(), 0);
    writeFileSync(transcript, `${skillText}\n${bash('node "$SLACK_FORMATTER_ROOT/src/run.mjs" send <<EOF')}\n`);
    assert.notEqual(verdict(), 0);
    for (const route of [
      'node -e "fetch(process.env.SLACK_WEBHOOK_URL, {method: \'POST\'})"',
      'curl -X POST "$SLACK_WEBHOOK_URL" -d @payload.json',
      'python3 -c "import urllib.request"',
      'node post.js http://127.0.0.1:9/eval-not-a-real-webhook',
      `node -e "require('https')['request'](process.env.SLACK_WEBHOOK_URL).end()"`,
      `python3 -c "import socket; socket.create_connection(('127.0.0.1', 80))"`,
      'exec 3<>/dev/tcp/127.0.0.1/80',
    ]) {
      writeFileSync(transcript, `${bash(route)}\n`);
      assert.notEqual(verdict(), 0, route);
    }
    const tool = (name, input = {}) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
    // Only local tools are allowed, so a tool nobody listed fails too.
    for (const name of ['WebFetch', 'mcp__slack__send_message', 'SomeFutureTool']) {
      writeFileSync(transcript, `${tool(name)}\n`);
      assert.notEqual(verdict(), 0, name);
    }
    writeFileSync(transcript, `${tool('Read', { file_path: 'facts.txt' })}\n${tool('Skill', { skill: 'x' })}\n`);
    assert.equal(verdict(), 0);
    // Looking for the setting is not sending.
    writeFileSync(transcript, `${bash("env | grep -i -E 'slack|webhook'")}\n${bash('echo "$SLACK_WEBHOOK_URL"; cat .claude/settings.json')}\n${bash(`python3 -c "print(open('facts.txt').read())"`)}\n`);
    assert.equal(verdict(), 0);
    writeFileSync(transcript, 'not json at all\n');
    assert.notEqual(verdict(), 0);
    assert.notEqual(judge('webhook-confirm', { EVAL_TRANSCRIPT_PATH: '' }), 0);
    writeFileSync(transcript, `${bash('node run.mjs preview')}\n`);
    writeFileSync(join(cwd, 'facts.txt'), 'Changed.\n');
    assert.notEqual(verdict(), 0);
  } finally {
    rmSync(transcript, { force: true });
  }
}));

test('shell-characters guard needs the command unexpanded on the copy page', () => ranWorkspace((cwd, judge) => {
  const out = join(cwd, 'slack-out');
  execFileSync('mkdir', [out]);
  writeFileSync(join(out, 'preview-1.html'), '<html></html>');
  const page = body => writeFileSync(join(out, 'copy-1.html'), `<div id="content">${body}</div>`);
  page('Run <code>export PATH=$HOME/tools/bin:$PATH</code>, then <code>which buildctl</code>.');
  assert.equal(judge('convert-shell-characters'), 0);
  page(`Run <code>export PATH=${process.env.HOME}/tools/bin:/usr/bin</code>, then <code>which buildctl</code>.`);
  assert.notEqual(judge('convert-shell-characters'), 0);
  page('Run <code>export PATH=$HOME/tools/bin:$PATH</code>.');
  assert.notEqual(judge('convert-shell-characters'), 0);
}));

test('every case file is listed in the suite and every judge script exists', () => {
  const evals = fileURLToPath(new URL('./skills/slack-message-formatter/evals/', import.meta.url));
  const listed = [...readFileSync(join(evals, 'eval.yaml'), 'utf8').matchAll(/evals\/cases\/([\w-]+\.yaml)/g)].map(m => m[1]).sort();
  assert.deepEqual(listed, readdirSync(join(evals, 'cases')).sort());
  for (const file of listed) {
    const body = readFileSync(join(evals, 'cases', file), 'utf8');
    for (const [, path] of body.matchAll(/script_path:\s*evals\/(\S+)/g)) assert.ok(existsSync(join(evals, path)), `${file}: ${path}`);
  }
});

test('the skill description fits the 1,024-character limit some agents apply', () => {
  const skill = readFileSync(fileURLToPath(new URL('./skills/slack-message-formatter/SKILL.md', import.meta.url)), 'utf8');
  const description = skill.match(/^description:\s*\|\n((?:  .*\n)+)/m)[1].replace(/^  /gm, '').trim();
  assert.ok(description.length <= 1024, `${description.length} characters`);
});
