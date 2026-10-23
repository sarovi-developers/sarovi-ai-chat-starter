# Sarovi AI chat starter

A small working chat app with streaming replies, Persian/English UI, a server-side API key, and an offline preview. Plain Node.js, HTML, CSS, and JavaScript. No frontend build step or runtime package dependencies.

[فارسی](README.fa.md) · [Create an API key](https://api.sarovi.site/developers/start?utm_source=github&utm_medium=organic&utm_campaign=developer_tools_202610&utm_content=sarovi-ai-chat-starter_key) · [Pricing](https://api.sarovi.site/developers/pricing?utm_source=github&utm_medium=organic&utm_campaign=developer_tools_202610&utm_content=sarovi-ai-chat-starter_pricing)

![Offline chat starter preview](docs/preview.png)

## Try the offline preview

Node.js 24+ is required.

```sh
git clone https://github.com/sarovi-developers/sarovi-ai-chat-starter.git
cd sarovi-ai-chat-starter
npm run demo
```

Open [http://127.0.0.1:3317](http://127.0.0.1:3317). Switch to فارسی, try a prompt, or stop a streaming reply. Demo responses are clearly labeled and make no model calls.

## Connect your account

```sh
cp .env.example .env
# Edit .env and set SAROVI_API_KEY.
npm start
```

The key needs `responses:write`. Check the current model ID and pricing, and set a small API key/project budget in the Sarovi console. Each reply allows up to 512 output tokens; this is not a monetary cap.

The API key stays on the Node server. Conversation context stays in browser memory and is cleared by New chat or a page reload. Real prompts are sent to Sarovi and its model provider; API retention follows your account/provider settings.

## What is included

- Responsive UI with Persian RTL and English.
- Stream stop, errors, request references, and token usage when supplied.
- No automatic paid retries or generation on page load.
- Bound conversation size, two concurrent requests, and ten requests per minute per connection IP.
- Same-origin and Host checks; no key in public assets or config responses.
- Rendering as text, so model-generated HTML is not executed.

## Hosting

For internet hosting, keep HTTPS in front of the app and configure server-side environment variables:

```text
HOST=0.0.0.0
PORT=8080
PUBLIC_ORIGIN=https://YOUR_APP_DOMAIN
APP_PASSWORD=YOUR_OWN_LONG_RANDOM_PASSWORD
```

Hosted mode requires an app password of at least 16 characters. Enter it in the app; it is held in the page, not local storage. Keep it private. The built-in counters are per process and reset on restart; add shared user authentication and durable rate/budget controls before scaling a public service. No hosting service is provisioned automatically. [Sarovi Cloud](https://cloud.sarovi.ir) is available for your own deployment workflow.

## Checks

```sh
npm test
```

Offline HTTP tests check key exposure, cross-origin/Host denial, app-password gating, bounded input, and premature upstream termination. They do not certify every live model.

[First API request guide](https://api.sarovi.site/developers/start?utm_source=github&utm_medium=organic&utm_campaign=developer_tools_202610&utm_content=sarovi-ai-chat-starter_first_request) · [More recipes](https://github.com/sarovi-developers/sarovi-api-cookbook) · [API behavior and billing](docs/API-NOTES.md)

MIT-licensed code; API usage is billed separately. The Sarovi logo remains brand artwork.
