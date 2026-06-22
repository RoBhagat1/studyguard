(function (global) {
  const DEFAULTS = { revealsRemaining: 5, unlockCode: 'STUDYGUARD', refillAmount: 5 };

  function normalizeState(partial) {
    const p = partial && typeof partial === 'object' ? partial : {};
    const remaining = Number.isFinite(Number(p.revealsRemaining)) ? Number(p.revealsRemaining) : DEFAULTS.revealsRemaining;
    const refill = Number.isFinite(Number(p.refillAmount)) ? Number(p.refillAmount) : DEFAULTS.refillAmount;
    const code = typeof p.unlockCode === 'string' ? p.unlockCode : DEFAULTS.unlockCode;
    return { revealsRemaining: Math.max(0, remaining), unlockCode: code, refillAmount: Math.max(0, refill) };
  }

  function consumeReveal(state) {
    const s = normalizeState(state);
    if (s.revealsRemaining > 0) {
      return { state: { ...s, revealsRemaining: s.revealsRemaining - 1 }, allowed: true };
    }
    return { state: s, allowed: false };
  }

  function attemptUnlock(state, code) {
    const s = normalizeState(state);
    const provided = typeof code === 'string' ? code.trim() : '';
    const expected = typeof s.unlockCode === 'string' ? s.unlockCode.trim() : '';
    if (expected.length > 0 && provided === expected) {
      return { state: { ...s, revealsRemaining: s.refillAmount }, ok: true };
    }
    return { state: s, ok: false };
  }

  const api = { DEFAULTS, normalizeState, consumeReveal, attemptUnlock };
  global.StudyGuardReveals = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
