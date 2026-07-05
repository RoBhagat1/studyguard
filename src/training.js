(function (global) {
  const FEEDBACK_CAP = 500;
  const PROMPT_MAX_LEN = 4000;
  const LABELS = ['false_negative', 'false_positive'];

  function buildFeedbackRecord(input) {
    const opts = input || {};
    if (!LABELS.includes(opts.label)) return null;
    const prompt = typeof opts.prompt === 'string' ? opts.prompt.trim().slice(0, PROMPT_MAX_LEN) : '';
    if (!prompt) return null;
    return {
      label: opts.label,
      prompt,
      verdict: typeof opts.verdict === 'string' ? opts.verdict : null,
      matched: Array.isArray(opts.matched) ? opts.matched.slice() : [],
      llmUsed: opts.llmUsed === true,
      site: typeof opts.site === 'string' ? opts.site : null,
      ts: new Date().toISOString()
    };
  }

  function addFeedback(list, record, cap) {
    const max = typeof cap === 'number' ? cap : FEEDBACK_CAP;
    const current = Array.isArray(list) ? list : [];
    if (!record) return current.slice();
    const isDupe = current.some((r) => r && r.label === record.label && r.prompt === record.prompt);
    if (isDupe) return current.slice();
    const next = current.concat([record]);
    return next.length > max ? next.slice(next.length - max) : next;
  }

  function serializeFeedback(list) {
    return (Array.isArray(list) ? list : []).map((r) => JSON.stringify(r)).join('\n') + '\n';
  }

  const api = { buildFeedbackRecord, addFeedback, serializeFeedback, FEEDBACK_CAP };
  global.StudyGuardTraining = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
