const test = require('node:test');
const assert = require('node:assert');
const { buildReport } = require('../scripts/train-report.js');

// Stub classifier: 'h*' prompts -> hit, 'a*' -> ambiguous, everything else -> miss
function classify(prompt) {
  if (prompt.startsWith('h')) return { verdict: 'hit', matched: ['stub'] };
  if (prompt.startsWith('a')) return { verdict: 'ambiguous', matched: [] };
  return { verdict: 'miss', matched: [] };
}

function rec(label, prompt) {
  return { label, prompt, verdict: 'miss', matched: [], ts: '2026-07-05T00:00:00Z' };
}

test('false negative now hitting is fixed; ambiguous is improved; miss stays open', () => {
  const report = buildReport(
    [rec('false_negative', 'h fixed'), rec('false_negative', 'a better'), rec('false_negative', 'still bad')],
    classify
  );
  assert.deepEqual(report.fixed.map((r) => r.prompt), ['h fixed']);
  assert.deepEqual(report.improved.map((r) => r.prompt), ['a better']);
  assert.deepEqual(report.open.map((r) => r.prompt), ['still bad']);
});

test('false positive now missing is fixed; ambiguous improved; hit stays open', () => {
  const report = buildReport(
    [rec('false_positive', 'now fine'), rec('false_positive', 'a maybe'), rec('false_positive', 'h still blocked')],
    classify
  );
  assert.deepEqual(report.fixed.map((r) => r.prompt), ['now fine']);
  assert.deepEqual(report.improved.map((r) => r.prompt), ['a maybe']);
  assert.deepEqual(report.open.map((r) => r.prompt), ['h still blocked']);
});

test('report entries carry the current verdict for context', () => {
  const report = buildReport([rec('false_negative', 'still bad')], classify);
  assert.equal(report.open[0].currentVerdict, 'miss');
  assert.equal(report.open[0].label, 'false_negative');
});

test('unknown labels are ignored', () => {
  const report = buildReport([rec('bogus', 'x')], classify);
  assert.equal(report.fixed.length + report.improved.length + report.open.length, 0);
});
