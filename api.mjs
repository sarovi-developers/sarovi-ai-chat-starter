import {randomUUID} from 'node:crypto';

export class ApiError extends Error {
  constructor(code, status = 0, requestId = null) {
    super(code + (requestId ? ' (request ' + requestId + ')' : ''));
    this.code = code; this.status = status; this.requestId = requestId;
  }
}

export function settings(env = process.env) {
  const base = new URL(env.SAROVI_BASE_URL || 'https://api.sarovi.site/v1');
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' &&
       ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
    throw new Error('Use an HTTPS API URL, or HTTP on localhost for tests.');
  }
  return {base: base.href.replace(/\/$/, ''), key: env.SAROVI_API_KEY || '',
    model: env.SAROVI_MODEL || 'z-ai/glm-5.3-flash'};
}

export function client(config = settings(), fetcher = fetch) {
  async function send(path, body, idempotencyKey, signal) {
    if (!config.key || config.key === 'YOUR_SAROVI_API_KEY') throw new Error('Set SAROVI_API_KEY on the server.');
    if (!/^\/[a-z0-9/?=&_.%-]+$/i.test(path) || path.includes('..')) throw new Error('Invalid API resource.');
    const response = await fetcher(config.base + path, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300_000)]) : AbortSignal.timeout(300_000),
      headers: {Authorization: 'Bearer ' + config.key, ...(body === undefined ? {} :
        {'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey || randomUUID()})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error?.code || 'HTTP_' + response.status, response.status, response.headers.get('x-request-id'));
    }
    return response;
  }
  return {
    async get(path) { return (await send(path)).json(); },
    async chat(body, idempotencyKey) {
      const response = await send('/chat/completions', body, idempotencyKey);
      return {data: await response.json(), requestId: response.headers.get('x-request-id')};
    },
    async stream(body, idempotencyKey, signal) {
      const response = await send('/chat/completions', {...body, stream: true, stream_options: {include_usage: true}}, idempotencyKey, signal);
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ApiError('EXPECTED_EVENT_STREAM', 502);
      return {events: parseEvents(response.body), requestId: response.headers.get('x-request-id')};
    }
  };
}

export async function* parseEvents(body) {
  const reader = body.getReader(), decoder = new TextDecoder();
  let buffer = '', ended = false;
  try {
    for (;;) {
      const {value, done} = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const packet = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const text = packet.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!text) continue;
        if (text === '[DONE]') { ended = true; return; }
        let event;
        try { event = JSON.parse(text); } catch { throw new ApiError('INVALID_STREAM', 502); }
        if (event.error) throw new ApiError(event.error.code || 'STREAM_FAILED', 502);
        yield event;
      }
      if (done) break;
    }
    if (!ended) throw new ApiError('STREAM_ENDED_EARLY', 502);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function answer(data) {
  const choice = data.choices?.[0];
  if (!choice || typeof choice.message?.content !== 'string') throw new ApiError('NO_TEXT_RESULT', 502);
  if (choice.finish_reason === 'length') throw new ApiError('OUTPUT_LIMIT_REACHED', 200);
  if (choice.finish_reason !== 'stop') throw new ApiError('INCOMPLETE_TEXT_RESULT', 200);
  return choice.message.content;
}
