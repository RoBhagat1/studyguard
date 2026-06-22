const test = require('node:test');
const assert = require('node:assert');
const { classifyPromptHeuristically } = require('../src/heuristics.js');

test('clear cheating request -> hit', () => {
  assert.equal(classifyPromptHeuristically('Can you do my homework for me?').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('write my essay about the Cold War').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('just give me the answers to these questions').verdict, 'hit');
});

test('clear learning request -> miss', () => {
  assert.equal(classifyPromptHeuristically('Explain how photosynthesis works so I understand it').verdict, 'miss');
  assert.equal(classifyPromptHeuristically('give me a hint, not the answer').verdict, 'miss');
});

test('problem dump -> ambiguous', () => {
  const dump = '1. What is 2+2?\n2. Define gravity.\n3. Who wrote Hamlet?';
  assert.equal(classifyPromptHeuristically(dump).verdict, 'ambiguous');
});

test('empty / non-academic -> miss', () => {
  assert.equal(classifyPromptHeuristically('').verdict, 'miss');
  assert.equal(classifyPromptHeuristically('what is a good recipe for pasta').verdict, 'miss');
});
