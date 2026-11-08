// SR-6063: fail closed on an SDK upgrade until its alarm behavior is reviewed.
// Upstream: https://github.com/cloudflare/containers — 0.3.6 and 0.3.7 retain unknown callbacks overdue.
// Keep the row/payload for recovery; retry at most once per five minutes, including unrelated early alarms.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.resolve('@cloudflare/containers'))), '..');
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (!['0.3.6', '0.3.7'].includes(version)) throw new Error(`Review SR-6063 for Containers ${version} before building`);
const path = resolve(root, 'dist/lib/container.js');
const before = `                console.error(\`Callback \${row.callback} not found or is not a function\`);
                continue;`;
const after = `                // SR-6063: preserve unsupported schedules, but move their due time beyond this alarm.
                const retryAt = Math.ceil(Date.now() / 1000) + 300;
                this.sql \`UPDATE container_schedules SET time = \${retryAt} WHERE id = \${row.id}\`;
                console.error(\`Callback \${row.callback} unavailable; deferred until \${retryAt}\`);
                continue;`;
const source = readFileSync(path, 'utf8');
if (source.includes(after)) {
  console.log(`Containers ${version}: SR-6063 patch already applied`);
} else {
  if (source.split(before).length !== 2) throw new Error('Containers alarm changed: review SR-6063 patch');
  writeFileSync(path, source.replace(before, after));
  console.log(`Containers ${version}: applied SR-6063 missing-callback deferral`);
}
