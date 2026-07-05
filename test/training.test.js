const test = require('node:test');
const assert = require('node:assert');
const { buildFeedbackRecord, addFeedback, serializeFeedback, FEEDBACK_CAP } = require('../src/training.js');

test('buildFeedbackRecord captures label, prompt, and classifier state', () => {
  const rec = buildFeedbackRecord({
    label: 'false_negative',
    prompt: '  do question 3  ',
    verdict: 'miss',
    matched: ['x'],
    llmUsed: true,
    site: 'claude'
  });
  assert.equal(rec.label, 'false_negative');
  assert.equal(rec.prompt, 'do question 3');
  assert.equal(rec.verdict, 'miss');
  assert.deepEqual(rec.matched, ['x']);
  assert.equal(rec.llmUsed, true);
  assert.equal(rec.site, 'claude');
  assert.ok(!Number.isNaN(Date.parse(rec.ts)));
});

test('buildFeedbackRecord rejects invalid labels and empty prompts', () => {
  assert.equal(buildFeedbackRecord({ label: 'nonsense', prompt: 'x' }), null);
  assert.equal(buildFeedbackRecord({ label: 'false_positive', prompt: '   ' }), null);
});

test('buildFeedbackRecord truncates very long prompts', () => {
  const rec = buildFeedbackRecord({ label: 'false_positive', prompt: 'a'.repeat(9000) });
  assert.equal(rec.prompt.length, 4000);
});

test('addFeedback appends without mutating and dedupes on label+prompt', () => {
  const a = buildFeedbackRecord({ label: 'false_negative', prompt: 'do question 3' });
  const list = addFeedback([], a);
  assert.equal(list.length, 1);
  const dup = buildFeedbackRecord({ label: 'false_negative', prompt: 'do question 3' });
  const list2 = addFeedback(list, dup);
  assert.equal(list2.length, 1);
  const other = buildFeedbackRecord({ label: 'false_positive', prompt: 'do question 3' });
  assert.equal(addFeedback(list2, other).length, 2);
  assert.equal(list.length, 1); // input not mutated
});

test('addFeedback caps the list, dropping the oldest entries', () => {
  let list = [];
  for (let i = 0; i < FEEDBACK_CAP + 10; i++) {
    list = addFeedback(list, buildFeedbackRecord({ label: 'false_negative', prompt: `prompt ${i}` }));
  }
  assert.equal(list.length, FEEDBACK_CAP);
  assert.equal(list[0].prompt, 'prompt 10');
});

test('serializeFeedback emits one JSON object per line', () => {
  const list = [
    buildFeedbackRecord({ label: 'false_negative', prompt: 'p1' }),
    buildFeedbackRecord({ label: 'false_positive', prompt: 'p2' })
  ];
  const lines = serializeFeedback(list).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).prompt, 'p1');
  assert.equal(JSON.parse(lines[1]).label, 'false_positive');
});
