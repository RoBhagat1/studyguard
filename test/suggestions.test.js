const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/suggestions.js');

test('falls back to static when no llm suggestions', () => {
  assert.deepEqual(S.pickSuggestions(null), S.STATIC_SUGGESTIONS);
  assert.deepEqual(S.pickSuggestions([]), S.STATIC_SUGGESTIONS);
  assert.deepEqual(S.pickSuggestions(['', '  ']), S.STATIC_SUGGESTIONS);
});

test('uses llm suggestions when valid', () => {
  const r = S.pickSuggestions(['Ask for the steps', 'Ask for a hint']);
  assert.deepEqual(r, ['Ask for the steps', 'Ask for a hint']);
});

test('has four static templates', () => {
  assert.equal(S.STATIC_SUGGESTIONS.length, 4);
});
