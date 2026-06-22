function parseClassifyResponse(rawText) {
  const fallback = { isHomework: false, subject: null, suggestions: [] };
  if (typeof rawText !== 'string') return fallback;
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch (e) {
    return fallback;
  }
  return {
    isHomework: obj.isHomework === true,
    subject: typeof obj.subject === 'string' && obj.subject.trim() ? obj.subject.trim() : null,
    suggestions: Array.isArray(obj.suggestions)
      ? obj.suggestions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : []
  };
}
module.exports = { parseClassifyResponse };
