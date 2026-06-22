# StudyGuard Proxy

Vercel serverless endpoint that classifies homework prompts so the extension never
ships the LLM key.

## Deploy
1. `cd proxy`
2. `npx vercel` (first run links/creates the project)
3. Set env vars in the Vercel dashboard (or `npx vercel env add`):
   - `ANTHROPIC_API_KEY` — your Anthropic key
   - `EXTENSION_TOKEN` — a long random string; paste the same value into the extension popup
4. `npx vercel --prod`
5. Copy the deployment URL (e.g. `https://studyguard-proxy.vercel.app`). The endpoint is
   `<URL>/api/classify`. Put `<URL>` in the extension popup's "Proxy base URL" field (and/or
   `DEFAULT_PROXY_BASE` in `background.js`).

## Model

Uses `claude-haiku-4-5` (cheapest current Haiku) for low per-request cost. To change the
model, edit `MODEL` in `api/classify.js`.

## Abuse protection
The handler requires the `x-studyguard-token` header to match `EXTENSION_TOKEN`. Add
Vercel's rate limiting / WAF on the project for per-IP limits.

## Local test
`node --test test/*.test.js` runs the response-parser unit tests (no key required).
