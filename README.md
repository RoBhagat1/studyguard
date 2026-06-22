# StudyGuard

StudyGuard is a Chrome extension that helps students learn instead of outsourcing their
thinking. When you ask ChatGPT or Claude to *do* your homework, StudyGuard recognizes the
request, blurs the answer, and suggests better, learning-oriented ways to ask.

## How it works

- **Detection (hybrid):** fast built-in heuristics catch obvious "do my homework" prompts
  instantly and for free. For ambiguous cases, an optional LLM classifier runs through a
  small backend proxy you host (so no API key ships inside the extension).
- **Intervention:** when a request is flagged, the assistant's answer is blurred and a
  panel offers Socratic rephrasings ("Explain the concept so I can solve it myself",
  "Give me a hint, not the answer", etc.) with copy buttons.
- **Reveal budget:** students get a limited number of "show answer anyway" reveals
  (default 5, shared across all chats). After that, a lock screen requires a teacher-set
  unlock code to grant more.

Supported sites: `chatgpt.com`, `chat.openai.com`, `claude.ai`.

## Repo layout

```
manifest.json        Chrome extension manifest (Manifest V3)
content.js           Detects each user/assistant turn and applies the block
src/heuristics.js    Local "do my homework" classifier
src/reveals.js       Reveal-budget + unlock-code logic
src/suggestions.js   Socratic suggestion templates (+ LLM upgrade)
src/overlay.js       Blur overlay, suggestion panel, and lock screen
content.css          Overlay styles
background.js        Service worker — calls the classify proxy
popup.html/.js       Settings UI (mode, proxy URL, token, teacher unlock code)
test/                Unit tests for the pure-logic modules (node --test)
proxy/               Vercel serverless classify endpoint (holds your LLM key)
```

## Install (development)

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Choose **Load unpacked** and select this directory
4. Open the popup to configure. Start in **Heuristics only** mode to try it without a backend.

## Optional LLM proxy

The smarter detection and tailored suggestions use an LLM. To keep your API key off every
student's machine, the extension calls a tiny serverless endpoint you deploy. See
[`proxy/README.md`](proxy/README.md) for setup, then paste the deployment URL and token
into the extension popup and switch the mode to **Heuristics + LLM**.

## Tests

```bash
npm test                       # extension logic
cd proxy && npm test           # proxy response parser
```
