import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createApp} from '../server.mjs';

async function app(options, run) {
  const server = createApp(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  try { await run(origin); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
const headers = origin => ({Origin: origin, 'Content-Type': 'application/json'});
const body = JSON.stringify({messages: [{role: 'user', content: 'سلام'}]});
test('demo makes no provider requests and never returns a server key', async () => {
  await app({demo: true, env: {SAROVI_API_KEY: 'PRIVATE_FIXTURE_KEY'}, fetcher() { throw new Error('Network must not run'); }}, async origin => {
    const config = await (await fetch(origin + '/api/config')).text(); assert.ok(!config.includes('PRIVATE_FIXTURE_KEY'));
    const res = await fetch(origin + '/api/chat', {method: 'POST', headers: headers(origin), body});
    const text = await res.text(); assert.match(text, /"type":"done"/); assert.match(text, /"demo":true/);
    assert.ok(!text.includes('PRIVATE_FIXTURE_KEY'));
    for (const path of ['/.env', '/../server.mjs', '/server.mjs']) assert.equal((await fetch(origin + path)).status, 404);
  });
});
test('cross-origin requests and unexpected hosts cannot spend credits', async () => {
  let sends = 0;
  await app({env: {SAROVI_API_KEY: 'fixture'}, fetcher() { sends++; }}, async origin => {
    assert.equal((await fetch(origin + '/api/chat', {method: 'POST', headers: {...headers(origin), Origin: 'https://elsewhere.example'}, body})).status, 403);
    const status = await new Promise((resolve, reject) => {
      const req = request(origin + '/api/config', {headers: {Host: 'elsewhere.example'}}, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
    assert.equal(sends, 0);
  });
});
test('configured app password is required before any upstream call', async () => {
  await app({demo: true, env: {APP_PASSWORD: 'fixture-password-only'}}, async origin => {
    assert.equal((await fetch(origin + '/api/chat', {method: 'POST', headers: headers(origin), body})).status, 401);
    const res = await fetch(origin + '/api/chat', {method: 'POST', headers: {...headers(origin), 'X-App-Password': 'fixture-password-only'}, body});
    assert.match(await res.text(), /"type":"done"/);
  });
});
test('partial upstream output is reported as an error without a success marker', async () => {
  let sends = 0;
  await app({env: {SAROVI_API_KEY: 'fixture'}, fetcher: async () => {
    sends++; return new Response('data: {"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}\n\n',
      {headers: {'content-type': 'text/event-stream'}});
  }}, async origin => {
    const res = await fetch(origin + '/api/chat', {method: 'POST', headers: headers(origin), body});
    const text = await res.text(); assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"done"/); assert.equal(sends, 1);
  });
});
test('invalid or excessive input is rejected before provider access', async () => {
  await app({env: {SAROVI_API_KEY: 'fixture'}, fetcher() { throw new Error('Do not send'); }}, async origin => {
    for (const messages of [[], [{role: 'system', content: 'x'}], [{role: 'user', content: 'x'.repeat(4001)}]]) {
      assert.equal((await fetch(origin + '/api/chat', {method: 'POST', headers: headers(origin), body: JSON.stringify({messages})})).status, 400);
    }
    assert.equal((await fetch(origin + '/api/chat', {method: 'POST', headers: {...headers(origin), 'Content-Type': 'text/plain'}, body})).status, 415);
  });
});
