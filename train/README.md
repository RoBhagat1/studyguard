# TRAIN mode feedback

This folder holds classifier feedback exported from the extension, used to improve
`src/heuristics.js`.

## Collecting feedback

1. Extension popup → **Training** → enable *Train mode*.
2. On chatgpt.com / claude.ai:
   - Blocked wrongly? Click **"Train: shouldn't be blocked"** on the blur panel
     (records a false positive and unblurs without spending a reveal).
   - Should have been blocked? Click the **"SG train: should have been flagged?"**
     badge under the response (records a false negative).
3. Popup → **Export training data (N)** → save the `.jsonl` file into this folder.

Each JSONL line records the prompt (including `[uploaded file: …]` markers), the
heuristic verdict and matched signals at the time, whether LLM mode was on, the site,
and a timestamp.

## Improving the heuristics (the Claude Code loop)

Ask Claude Code to:

```
run npm run train:report and fix the heuristics for everything still wrong
```

The report replays every record against the **current** heuristics and buckets them:

- **STILL WRONG** — false negatives still `miss`, false positives still `hit`. Fix these.
- **IMPROVED** — now `ambiguous` (the LLM decides). Often good enough; judgment call.
- **FIXED** — the heuristics now agree with the feedback.

The expected workflow is TDD: turn each STILL WRONG item into a failing test in
`test/heuristics.test.js`, adjust the patterns in `src/heuristics.js`, and rerun
`npm test` + `npm run train:report` until clean. The script exits non-zero while
anything is STILL WRONG, so it can gate CI too.

Note: the report exercises heuristics only — it cannot replay what the LLM classifier
decided for `ambiguous` prompts.
