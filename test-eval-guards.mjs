import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
