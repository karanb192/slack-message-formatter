import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = dirname(fileURLToPath(import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(repo, path), 'utf8'));

test('Codex and Claude packages resolve to the same skill', () => {
  const codex = readJson('.codex-plugin/plugin.json');
  const claude = readJson('.claude-plugin/plugin.json');
  const marketplace = readJson('.agents/plugins/marketplace.json');
  const entry = marketplace.plugins.find(plugin => plugin.name === codex.name);
  assert.ok(entry);
  assert.equal(codex.name, claude.name);
  assert.equal(codex.version, claude.version);
  assert.equal(entry.source.source, 'local');
  const pluginRoot = resolve(repo, entry.source.path);
  assert.equal(realpathSync(pluginRoot), realpathSync(repo));
  const skillRoot = join(pluginRoot, codex.skills, codex.name);
  assert.equal(realpathSync(skillRoot), realpathSync(join(repo, 'skills', claude.name)));
  assert.ok(readFileSync(join(skillRoot, 'SKILL.md'), 'utf8').startsWith('---\n'));
  assert.ok(readFileSync(join(skillRoot, 'agents', 'openai.yaml'), 'utf8').length > 0);
});

test('a standalone installed skill works outside the formatter repository', t => {
  const temp = mkdtempSync(join(tmpdir(), 'slack-distribution-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const installed = join(temp, 'installed skills', 'slack-message-formatter');
  cpSync(join(repo, 'skills', 'slack-message-formatter'), installed, { recursive: true });
  const project = join(temp, 'unrelated project');
  mkdirSync(project);
  const previewDir = join(temp, 'previews');
  const run = mode => {
    const result = spawnSync(process.execPath, [join(installed, 'src', 'run.mjs'), mode], {
      cwd: project,
      input: '**Release** and *ready*\n',
      encoding: 'utf8',
      env: {
        ...process.env,
        SLACK_FORMATTER_NO_OPEN: '1',
        SLACK_FORMATTER_PREVIEW_DIR: previewDir,
        SLACK_WEBHOOK_URL: '',
        CCH_SLA_WEBHOOK: '',
        JIRA_BASE_URL: '',
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  assert.equal(run('mrkdwn').trim(), '*Release* and _ready_');
  assert.match(run('html'), /<b>Release<\/b> and <i>ready<\/i>/);
  const preview = run('preview');
  assert.match(preview, /copy-.*\.html/);
  assert.match(preview, /preview-.*\.html/);
});

for (const [marker, agent, destination] of [
  ['.codex', 'Codex', '.agents/skills'],
  ['.agents/skills', 'Codex', '.agents/skills'],
  ['.claude', 'Claude Code', '.claude/skills'],
  ['.agents/plugins', 'Claude Code', '.claude/skills'],
]) {
  test(`the shell installer selects ${agent} for a project with ${marker}`, t => {
    const temp = mkdtempSync(join(tmpdir(), 'slack-shell-install-'));
    t.after(() => rmSync(temp, { recursive: true, force: true }));
    const project = join(temp, 'project');
    const bin = join(temp, 'bin');
    mkdirSync(join(project, marker), { recursive: true });
    mkdirSync(bin);
    // Replace only the network clone; exercise the real install script and payload.
    writeFileSync(join(bin, 'git'), '#!/bin/sh\nfor arg do dest="$arg"; done\ncp -R "$SLACK_TEST_REPO/skills" "$dest/skills"\n', { mode: 0o755 });
    const result = spawnSync('bash', [join(repo, 'install.sh'), 'project'], {
      cwd: project,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, SLACK_TEST_REPO: repo },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`Restart ${agent}`));
    assert.ok(result.stdout.includes(`${agent === 'Codex' ? '$' : '/'}slack-message-formatter`));
    const skill = join(project, destination, 'slack-message-formatter');
    assert.equal(readFileSync(join(skill, 'SKILL.md'), 'utf8'), readFileSync(join(repo, 'skills', 'slack-message-formatter', 'SKILL.md'), 'utf8'));
    const run = spawnSync(process.execPath, [join(skill, 'src', 'run.mjs'), 'mrkdwn'], {
      cwd: temp, input: '**Installed**', encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), '*Installed*');
  });
}
