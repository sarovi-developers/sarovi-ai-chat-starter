import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomUUID, timingSafeEqual} from 'node:crypto';
import {client, settings} from './api.mjs';

const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']], ['/mark.svg', ['mark.svg', 'image/svg+xml']]]);
const root = fileURLToPath(new URL('./public/', import.meta.url));
const equal = (a, b) => {
  const x = Buffer.from(a || ''), y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
};

export function createApp({demo = false, env = process.env, fetcher = fetch, trustedHost} = {}) {
  const config = settings(env), api = client(config, fetcher);
  const password = env.APP_PASSWORD || '';
  const rate = new Map();
  let active = 0;
  const server = createServer(async (req, res) => {
    const headers = {'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      'Cache-Control': 'no-store'};
    const json = (status, data) => { res.writeHead(status, {...headers, 'Content-Type': 'application/json'}); res.end(JSON.stringify(data)); };
    const path = (req.url || '').split('?')[0];
    const allowedHost = trustedHost || '127.0.0.1:' + server.address()?.port;
    if (req.headers.host !== allowedHost) return json(403, {error: 'Unrecognized host.'});
    if (req.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path);
      try { const bytes = await readFile(root + file); res.writeHead(200, {...headers, 'Content-Type': type}); return res.end(bytes); }
      catch { return json(500, {error: 'Static asset unavailable.'}); }
    }
    if (req.method === 'GET' && path === '/api/config') return json(200, {demo, model: config.model, requiresPassword: Boolean(password), maxOutputTokens: 512});
    if (req.method !== 'POST' || path !== '/api/chat') return json(404, {error: 'Not found.'});
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(415, {error: 'Send JSON.'});
    const origin = req.headers.origin;
    const expectedOrigin = env.PUBLIC_ORIGIN || 'http://' + allowedHost;
    if (origin !== expectedOrigin) return json(403, {error: 'Use this app from its own page.'});
    if (password && !equal(req.headers['x-app-password'], password)) return json(401, {error: 'Enter the app password.'});
    const now = Date.now(), who = req.socket.remoteAddress || 'local';
    if (rate.size > 1000) for (const [key, value] of rate) if (now - value.start > 60_000) rate.delete(key);
    let bucket = rate.get(who);
    if (!bucket || now - bucket.start > 60_000) { bucket = {start: now, used: 0}; rate.set(who, bucket); }
    if (bucket.used >= 10 || active >= 2) return json(429, {error: 'Please wait before sending another request.'});
    bucket.used++;
    const chunks = []; let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 24_000) return json(413, {error: 'Message history is too large.'});
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 12 ||
          body.messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 4000) ||
          body.messages.reduce((n, m) => n + m.content.length, 0) > 12000 ||
          body.messages.at(-1).role !== 'user') return json(400, {error: 'Send a message of up to 4,000 characters. Start a new chat if history is full.'});
      if (!demo && !config.key) return json(503, {error: 'Set SAROVI_API_KEY on the server, or run the offline demo.'});
      if (res.destroyed) return;
      active++;
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      const send = data => { if (!res.destroyed) res.write('data: ' + JSON.stringify(data) + '\n\n'); };
      res.writeHead(200, {...headers, 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no'});
      const key = randomUUID();
      send({type: 'start', idempotency_key: key, demo});
      try {
        if (demo) {
          const persian = /[\u0600-\u06ff]/.test(body.messages.at(-1).content);
          const text = persian ? 'سلام! این پیش‌نمایش آفلاین است؛ هیچ درخواستی به مدل ارسال نشده و اعتباری مصرف نمی‌شود. برای پاسخ واقعی، کلید ساروی را در فایل تنظیمات سرور بگذارید.' :
            'Hello! This is the offline preview. No model request was sent and no credits were used. Add a Sarovi key on the server for real responses.';
          for (const word of text.split(' ')) {
            if (abort.signal.aborted) break;
            send({type: 'delta', text: word + ' '});
            await new Promise(resolve => setTimeout(resolve, 22));
          }
          if (!abort.signal.aborted) send({type: 'done', usage: {total_tokens: 0}, demo: true});
        } else {
          const stream = await api.stream({model: config.model, max_tokens: 512, messages: [
            {role: 'system', content: 'Be helpful and concise. Reply in the language the user uses.'}, ...body.messages]}, key, abort.signal);
          let finish, usage;
          send({type: 'receipt', request_id: stream.requestId});
          for await (const event of stream.events) {
            const choice = event.choices?.[0];
            if (choice?.delta?.content) send({type: 'delta', text: choice.delta.content});
            if (choice?.finish_reason) finish = choice.finish_reason;
            if (event.usage) usage = event.usage;
          }
          if (finish !== 'stop') throw new Error(finish === 'length' ? 'Output limit reached. This answer is incomplete.' : 'The stream did not finish a text answer.');
          send({type: 'done', request_id: stream.requestId, usage, demo: false});
        }
      } catch (error) {
        if (!abort.signal.aborted) send({type: 'error', message: error.status ? 'API error: ' + error.code : 'The response was interrupted or incomplete. Check your request in the Sarovi console before trying again.',
          request_id: error.requestId || null, idempotency_key: key});
      } finally { active--; res.end(); }
    } catch { if (!res.headersSent) json(400, {error: 'Invalid request.'}); else res.end(); }
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL('file://' + process.argv[1]))) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3317);
  if (host !== '127.0.0.1' && (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 16 || !/^https:\/\//.test(process.env.PUBLIC_ORIGIN || ''))) {
    throw new Error('Hosted mode requires APP_PASSWORD of at least 16 characters and an HTTPS PUBLIC_ORIGIN.');
  }
  const publicHost = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : undefined;
  const server = createApp({demo: process.argv.includes('--demo'), trustedHost: publicHost});
  server.listen(port, host, () => console.log('Sarovi chat: ' + (process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port)));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
