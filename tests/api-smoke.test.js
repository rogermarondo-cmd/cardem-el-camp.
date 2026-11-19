import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 19000 + Math.floor(Math.random() * 1000);
const base = 'http://127.0.0.1:' + port;
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', DUFFEL_LIVE_TOKEN: '', BOOKING_API_TOKEN: '', BOOKING_AFFILIATE_ID: '', AMADEUS_CLIENT_ID: '', AMADEUS_CLIENT_SECRET: '' },
  stdio: 'pipe'
});

async function ready() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw Error('Server exited before becoming ready');
    try { const r = await fetch(base + '/api/health'); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('Server did not become ready');
}
test('API smoke checks without provider credentials', async t => {
  t.after(() => server.kill());
  await ready();
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.ok, true);
  assert.equal(health.aiConfigured, false);
  assert.equal(health.amadeusConfigured, false);
  assert.equal(health.stayPricingConfigured, false);
  const post = async (route, body) => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal((await post('/api/plan', { departure: 'Barcelona', destination: 'Roma', travelers: 2, days: 3 })).status, 503);
  assert.equal((await post('/api/flights', {})).status, 503);
  assert.equal((await post('/api/stays', {})).status, 503);
  assert.equal((await post('/api/amadeus/flights', {})).status, 503);
  assert.equal((await post('/api/plan', { departure: '', travelers: 0 })).status, 400);
});
