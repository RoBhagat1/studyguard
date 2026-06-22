const test = require('node:test');
const assert = require('node:assert');
const R = require('../src/reveals.js');

test('consumeReveal decrements while > 0', () => {
  const r = R.consumeReveal({ revealsRemaining: 2 });
  assert.equal(r.allowed, true);
  assert.equal(r.state.revealsRemaining, 1);
});

test('consumeReveal blocks at 0', () => {
  const r = R.consumeReveal({ revealsRemaining: 0 });
  assert.equal(r.allowed, false);
  assert.equal(r.state.revealsRemaining, 0);
});

test('attemptUnlock with correct code refills to refillAmount', () => {
  const r = R.attemptUnlock({ revealsRemaining: 0, unlockCode: 'ABC', refillAmount: 5 }, 'ABC');
  assert.equal(r.ok, true);
  assert.equal(r.state.revealsRemaining, 5);
});

test('attemptUnlock with wrong code does nothing', () => {
  const r = R.attemptUnlock({ revealsRemaining: 0, unlockCode: 'ABC', refillAmount: 5 }, 'xyz');
  assert.equal(r.ok, false);
  assert.equal(r.state.revealsRemaining, 0);
});

test('empty stored unlock code never unlocks', () => {
  const r = R.attemptUnlock({ revealsRemaining: 0, unlockCode: '', refillAmount: 5 }, '');
  assert.equal(r.ok, false);
});

test('normalizeState fills defaults', () => {
  const s = R.normalizeState({});
  assert.equal(s.revealsRemaining, 5);
  assert.equal(s.unlockCode, 'STUDYGUARD');
  assert.equal(s.refillAmount, 5);
});
