// Exercise the installed SDK's actual alarm and SQL adapter in workerd with real DO storage.
// Container lifecycle calls are stand-ins: this test never starts Docker or a production container.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const bundle = await build({
  stdin: { contents: `
    import { DurableObject } from 'cloudflare:workers';
    import { Container } from '@cloudflare/containers';
    export class Probe extends DurableObject {
      async alarm() { await this.ctx.storage.deleteAlarm(); }
      async fetch(request) {
        return this.ctx.blockConcurrencyWhile(async () => {
          const mode = new URL(request.url).pathname.slice(1);
          const storage = this.ctx.storage;
          storage.sql.exec("CREATE TABLE container_schedules(id TEXT PRIMARY KEY,callback TEXT,payload TEXT,type TEXT,time INTEGER)");
          const past = Math.floor(Date.now() / 1000) - 60;
          const future = Math.ceil(Date.now() / 1000) + 600;
          const known = mode === 'valid' || mode === 'future';
          storage.sql.exec("INSERT INTO container_schedules VALUES('legacy',?,?,'scheduled',?)", known ? 'validCallback' : 'removedCallback', '{"keep":"payload"}', mode === 'future' ? future : past);
          const subject = Object.create(Container.prototype);
          Object.assign(subject, {
            ctx: this.ctx, container: { running: mode === 'idle' },
            state: { getState: async () => ({ status: 'stopped' }) },
            inflightRequests: 0, sleepAfterMs: Date.now() - 1,
            validCallback: async (payload) => { subject.delivered = payload; },
            onActivityExpired: async () => { subject.expired = true; subject.container.running = false; await storage.deleteAlarm(); },
            renewActivityTimeout: () => { subject.renewed = true; },
          });
          const snapshots = [];
          try {
            for (let n = 0; n < 2; n++) {
              await Container.prototype.alarm.call(subject);
              snapshots.push({ at: await storage.getAlarm(), now: Date.now(), rows: [...storage.sql.exec('SELECT * FROM container_schedules')] });
              await storage.deleteAlarm();
            }
            if (mode === 'restored') {
              subject.removedCallback = subject.validCallback;
              storage.sql.exec('UPDATE container_schedules SET time=?', past);
              await Container.prototype.alarm.call(subject);
            }
            return Response.json({ snapshots, future, delivered: subject.delivered, expired: subject.expired, renewed: subject.renewed,
              remaining: [...storage.sql.exec('SELECT * FROM container_schedules')], finalAlarm: await storage.getAlarm() });
          } finally { await storage.deleteAlarm(); }
        });
      }
    }
    export default { fetch(request, env) { return env.PROBE.get(env.PROBE.idFromName(new URL(request.url).pathname)).fetch(request); } };
  `, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'browser', external: ['cloudflare:workers'],
});
const mf = new Miniflare(convertV4MiniflareOptions({
  workers: [{ name: 'probe', modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-06-01',
    durableObjects: { PROBE: { className: 'Probe', useSQLite: true } } }], log: new Log(LogLevel.ERROR),
}));
async function probe(mode) {
  const response = await mf.dispatchFetch(`http://test/${mode}`);
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body);
}
try {
  await test('unknown callback is retained but deferred across two complete alarms', async () => {
    const result = await probe('missing');
    for (const s of result.snapshots) {
      assert(s.at > s.now + 240_000, 'unknown callback must not re-arm into the past');
      assert.equal(s.rows.length, 1);
      assert(s.rows[0].time * 1000 > s.now, 'consumer must advance the stored due time');
      assert.equal(s.rows[0].payload, '{"keep":"payload"}');
    }
    assert.equal(result.snapshots[0].at, result.snapshots[1].at, 'an unrelated early alarm must not retry or extend the deferral');
  });
  await test('valid callbacks consume their schedule and stopped containers clear the alarm', async () => {
    const result = await probe('valid');
    assert.deepEqual(result.delivered, { keep: 'payload' });
    for (const s of result.snapshots) { assert.equal(s.at, null); assert.equal(s.rows.length, 0); }
  });
  await test('future valid schedules retain their due time', async () => {
    const result = await probe('future');
    for (const s of result.snapshots) assert.equal(s.at, result.future * 1000);
    assert.equal(result.delivered, undefined);
  });
  await test('restoring a callback allows the retained work to complete', async () => {
    const result = await probe('restored');
    assert.deepEqual(result.delivered, { keep: 'payload' });
    assert.deepEqual(result.remaining, []);
    assert.equal(result.finalAlarm, null);
  });
  await test('unknown callbacks do not prevent idle-container shutdown', async () => {
    const result = await probe('idle');
    assert.equal(result.expired, true);
    assert.equal(result.renewed, true);
    assert(result.snapshots[1].at > result.snapshots[1].now);
  });
} finally { await mf.dispose(); }
