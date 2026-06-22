(function (global) {
  const STATIC_SUGGESTIONS = [
    'Explain the concept so I can solve it myself.',
    'Give me a hint, not the full answer.',
    'Check my reasoning on this and point out mistakes.',
    'Quiz me on this topic.'
  ];

  function pickSuggestions(llmSuggestions) {
    if (Array.isArray(llmSuggestions)) {
      const cleaned = llmSuggestions
        .filter((s) => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.trim());
      if (cleaned.length > 0) return cleaned;
    }
    return STATIC_SUGGESTIONS.slice();
  }

  const api = { STATIC_SUGGESTIONS, pickSuggestions };
  global.StudyGuardSuggestions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
