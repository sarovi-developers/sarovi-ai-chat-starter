# API notes

Base URL: `https://api.sarovi.site/v1`. The original `https://api.sarovi.ir/v1` also works; choose one origin for a logical request. Use a Sarovi project key with `responses:write` and `models:read`. Receipt lookup additionally needs `usage:read`.

The examples default to `z-ai/glm-5.3-flash`, present in the public API contract checked on 23 October 2026. Model availability, features, and pricing can change. Check `GET /v1/models` and the developer pricing page before a real run. Token limits bound output tokens, not a guaranteed monetary amount. Use a small project/key budget in the Sarovi console.

Every paid operation has an `Idempotency-Key`. There are no automatic paid retries. If a response is lost, inspect the original request receipt instead of inventing a fresh key. JSON replay is documented for 24 hours and responses below 1 MB; an empty lookup result is not proof that the original operation was uncharged. A second model/tool round is a distinct operation.

HTTP 200 alone is not proof that generation completed. Streaming examples require the terminal marker and inspect the finish reason. Provider failures and truncated output remain errors. Reported tokens are not a reconstruction of the settled credit charge; use the Sarovi usage console for billing.

Demo mode uses local synthetic fixtures. It does not call a model, count as a successful API user, or produce real usage. Offline tests and public-contract checks do not certify every live model or external IDE integration.

For real mode, prompts and selected CSV cells are sent to Sarovi and the model provider. This starter does not add analytics or upload unrelated files. API/provider retention depends on your project and provider settings.
