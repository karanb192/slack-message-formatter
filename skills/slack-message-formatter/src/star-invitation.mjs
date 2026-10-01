import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const directory = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'slack-message-formatter');
let result = 'skip';
try {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Exclusive creation prevents two agents from offering the invitation together.
  writeFileSync(join(directory, 'state.json'), JSON.stringify({ star_invitation_shown: true }), {
    flag: 'wx', mode: 0o600,
  });
  result = 'offer';
} catch {
  // Existing or unwritable state suppresses the invitation without affecting formatting.
}
console.log(result);
