const test = require('node:test');
const assert = require('node:assert');
const { parseClassifyResponse } = require('../lib/parse.js');

test('parses clean JSON', () => {
  const r = parseClassifyResponse('{"isHomework":true,"subject":"math","suggestions":["a","b"]}');
  assert.equal(r.isHomework, true);
  assert.equal(r.subject, 'math');
  assert.deepEqual(r.suggestions, ['a', 'b']);
});

test('parses JSON wrapped in prose/code fences', () => {
  const r = parseClassifyResponse('Sure!\n```json\n{"isHomework":false,"subject":null,"suggestions":[]}\n```');
  assert.equal(r.isHomework, false);
  assert.equal(r.subject, null);
});

test('falls back safely on garbage', () => {
  const r = parseClassifyResponse('not json at all');
  assert.deepEqual(r, { isHomework: false, subject: null, suggestions: [] });
});
