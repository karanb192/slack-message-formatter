import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const repo = dirname(fileURLToPath(import.meta.url));

function setup(t) {
  const temp = mkdtempSync(join(tmpdir(), 'formatter-invitation-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const installed = join(temp, 'installed skill');
  cpSync(join(repo, 'skills/slack-message-formatter'), installed, { recursive: true });
  const cache = join(temp, 'cache');
  const state = join(cache, 'slack-message-formatter/state.json');
  const run = async () => {
    const result = await exec(process.execPath, [join(installed, 'src/star-invitation.mjs')], {
      cwd: temp, env: { XDG_CACHE_HOME: cache },
    });
    assert.equal(result.stderr, '');
    return result.stdout.trim();
  };
  return { cache, state, run };
}

test('an installed skill records the invitation across processes', async t => {
  const { state, run } = setup(t);
  assert.equal(await run(), 'offer');
  assert.equal(await run(), 'skip');
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { star_invitation_shown: true });
});

test('concurrent agents offer only once', async t => {
  const { run } = setup(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => run()));
  assert.equal(results.filter(r => r === 'offer').length, 1);
  assert.equal(results.filter(r => r === 'skip').length, 7);
});

test('existing corrupt state still suppresses an invitation', async t => {
  const { state, run } = setup(t);
  mkdirSync(dirname(state), { recursive: true });
  writeFileSync(state, 'incomplete');
  assert.equal(await run(), 'skip');
  assert.equal(readFileSync(state, 'utf8'), 'incomplete');
});

test('an unwritable state location skips without affecting the task', async t => {
  const { cache, state, run } = setup(t);
  writeFileSync(cache, 'not a directory');
  assert.equal(await run(), 'skip');
  assert.equal(existsSync(state), false);
});
