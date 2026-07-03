# Expanded Prompt Recognition — Design

**Date:** 2026-07-03
**Goal:** Catch three classes of cheating prompts that currently slip through StudyGuard's
detection: (1) bare pasted code with no framing, (2) "do question #x" directives that
accompany a file upload, (3) file uploads with no message text at all.

## Background

Detection today is purely text-based: `content.js` extracts the user turn's `innerText`
and feeds it to `classifyPromptHeuristically()`. All "do X" regexes require a determiner
("do **my** homework"), so "do question 3" misses. Empty prompts bail immediately, so a
bare file upload is invisible. `ambiguous` verdicts block only when the LLM proxy is
enabled and classifies the prompt as homework.

## Changes

### 1. New cheating regexes (`src/heuristics.js`)

- Numbered-question directives → `hit`:
  `do/answer/solve/complete/finish` + optional filler + `question(s)/problem(s)/q/number/#/exercise/part` + a number or letter.
  Examples: "do question 3", "solve q4 and q5", "answer number 2 pls", "do #7", "answer part b".
- Determiner-free imperative asks → `hit`:
  - "write N words on/about X"
  - "answer the attached/above/following question(s)"

### 2. Bare-paste detector (`src/heuristics.js`)

New function alongside `detectProblemDump`. Fires when the prompt has no learning
phrasing and no conversational framing and looks like dumped work:

- **Code-like:** ≥3 lines matching code signals (braces/semicolons at line end, keywords
  `def`, `function`, `return`, `for (`, `if (`, `class`, `import`, `#include`), or
- **Single exam-style question:** short prompt that is dominated by one question
  (ends in `?` or contains "(N marks)" / "(N points)") with little or no framing text.

Verdict: `ambiguous` → LLM decides. Learning phrasing anywhere downgrades exactly as
today (e.g. "here's my code, explain what's wrong" stays unblocked).

### 3. Attachment awareness (`content.js`)

- Each site adapter gets `getAttachments(userNode)` returning filenames of uploaded-file
  chips rendered inside the user turn (ChatGPT + Claude).
- Filenames are appended to the extracted prompt as marker lines:
  `[uploaded file: hw3.pdf]`. The marker flows through the existing pipeline (heuristics
  and LLM both see it). The proxy system prompt gains one sentence explaining the marker.
- New heuristic rules over the marker (`src/heuristics.js`):
  - Attachment + homework-y filename (`hw`, `homework`, `worksheet`, `assignment`,
    `quiz`, `exam`, `chapter`, `problem`, `pset`, `lab`) → `hit`.
  - Attachment + directive text → `hit` via rule 1.
  - Attachment + empty/other text → `ambiguous` → LLM decides.
- Empty-prompt bail-out in `evaluateLatestTurn()` no longer triggers for bare uploads,
  because the marker makes the prompt non-empty. (The bail-out itself stays.)

### 4. Guardrails

- Learning patterns still beat cheating/bare-paste signals (→ `ambiguous`, as today).
- Non-homework filenames (e.g. `IMG_1234.jpg`) → `ambiguous`, never `hit`.
- Attachment scraping failure degrades to today's text-only behavior.

### 5. Tests

- `test/heuristics.test.js`: each real-world miss becomes a named case, plus
  counter-cases (code paste + "explain this" → not hit; recipe-photo filename →
  ambiguous, not hit; "how do I solve question 3" → not hit).
- Attachment rules are unit-tested at the heuristics level (marker strings), keeping
  tests DOM-free. `getAttachments` DOM scraping is verified manually in the browser.

## Known limitation (out of scope)

The LLM never sees file contents, only filenames. A bare upload named `scan.pdf` with no
text is genuinely hard to classify; this is inherent to the DOM-scraping architecture.

## Verification

- `npm test` (extension logic) and `cd proxy && npm test` (proxy parser) pass.
- REPL spot-checks: `node -e "console.log(require('./src/heuristics.js').classifyPromptHeuristically('do question 3'))"` → `hit`.
- Browser walkthrough on chatgpt.com/claude.ai with DevTools filtered to `[StudyGuard]`:
  pasted code → LLM path; "do question 3" + file → blocked; bare homework-named upload → blocked.
