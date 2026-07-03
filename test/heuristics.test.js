const test = require('node:test');
const assert = require('node:assert');
const { classifyPromptHeuristically } = require('../src/heuristics.js');

test('clear cheating request -> hit', () => {
  assert.equal(classifyPromptHeuristically('Can you do my homework for me?').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('write my essay about the Cold War').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('just give me the answers to these questions').verdict, 'hit');
});

test('cheating request with modifiers between determiner and noun -> hit', () => {
  assert.equal(classifyPromptHeuristically('write my 5-paragraph essay on the causes of World War 1').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('do my AP world history homework').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('finish my chemistry lab report').verdict, 'hit');
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

test('numbered-question directive (no determiner) -> hit', () => {
  assert.equal(classifyPromptHeuristically('do question 3').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('solve q4 and q5').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('answer number 2 pls').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('do #7').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('answer part b').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('complete exercise 12').verdict, 'hit');
});

test('learning question about a numbered problem -> not hit', () => {
  assert.notEqual(classifyPromptHeuristically('how do I solve question 3').verdict, 'hit');
  assert.notEqual(classifyPromptHeuristically('explain question 3 so I can solve it myself').verdict, 'hit');
});

test('write-N-words imperative -> hit', () => {
  assert.equal(classifyPromptHeuristically('write 500 words on the causes of WW2').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('write me 300 words about photosynthesis').verdict, 'hit');
});

test('bare code paste with no framing -> ambiguous', () => {
  const code = 'def fib(n):\n    if n < 2: return n\n    return fib(n-1) + fib(n-2)\nprint(fib(10))';
  assert.equal(classifyPromptHeuristically(code).verdict, 'ambiguous');
  const jsCode = 'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));';
  assert.equal(classifyPromptHeuristically(jsCode).verdict, 'ambiguous');
});

test('code paste with learning framing -> miss', () => {
  const prompt = 'can you explain what this code does?\ndef fib(n):\n    if n < 2: return n\n    return fib(n-1) + fib(n-2)\nprint(fib(10))';
  assert.equal(classifyPromptHeuristically(prompt).verdict, 'miss');
});

test('single exam-style question with marks -> ambiguous', () => {
  const q = 'What were the three main causes of the French Revolution? (10 marks)';
  assert.equal(classifyPromptHeuristically(q).verdict, 'ambiguous');
});

test('short casual question stays miss', () => {
  assert.equal(classifyPromptHeuristically('is it going to rain tomorrow?').verdict, 'miss');
});

test('attachment with homework-y filename -> hit', () => {
  assert.equal(classifyPromptHeuristically('[uploaded file: hw3.pdf]').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('[uploaded file: chemistry_worksheet.docx]').verdict, 'hit');
  assert.equal(classifyPromptHeuristically('here you go\n[uploaded file: assignment2.pdf]').verdict, 'hit');
});

test('attachment with non-homework filename -> ambiguous', () => {
  assert.equal(classifyPromptHeuristically('[uploaded file: IMG_1234.jpg]').verdict, 'ambiguous');
  assert.equal(classifyPromptHeuristically('[uploaded file: scan.pdf]').verdict, 'ambiguous');
});

test('attachment plus directive -> hit', () => {
  assert.equal(classifyPromptHeuristically('do question 3\n[uploaded file: scan.pdf]').verdict, 'hit');
});

test('attachment with learning framing -> not hit', () => {
  const prompt = 'can you explain the concepts in this?\n[uploaded file: hw3.pdf]';
  assert.notEqual(classifyPromptHeuristically(prompt).verdict, 'hit');
});
