(function (global) {
  // `(?:[\w-]+\s+){0,3}?` allows up to 3 modifier words between the determiner and the
  // noun, so "my 5-paragraph essay" / "my AP world history homework" still match.
  const CHEATING_PATTERNS = [
    /\b(do|finish|complete|write|answer)\s+(my|our|this|the)\s+(?:[\w-]+\s+){0,3}?(homework|assignment|essay|paper|report|project|worksheet|problem\s*sets?|discussion\s*post|questions?|quiz|test|exam|lab\s*report)\b/i,
    /\bwrite\s+(me\s+)?(an?|the|my)\s+(?:[\w-]+\s+){0,3}?(essay|paper|report|paragraph|story|discussion\s*post)\b/i,
    /\bsolve\s+(this|these|the|my)\b[\s\S]*\b(problem\s*set|problems|equations?|questions?)\b/i,
    /\b(answer|answers)\s+(these|the|to|all)\b[\s\S]*\b(questions?|worksheet|quiz|test|exam|problems)\b/i,
    /\bjust\s+give\s+me\s+the\s+(answer|answers|solution|solutions|code)\b/i,
    /\bwrite\s+the\s+code\s+for\s+(my|this|the)\b/i,
    /\bdo\s+it\s+for\s+me\b/i
  ];
  const LEARNING_PATTERNS = [
    /\bexplain\b/i,
    /\bhelp me understand\b/i,
    /\bhow (do|does|can) (i|you|it)\b/i,
    /\bwhy (does|do|is|are)\b/i,
    /\b(give me a )?hint\b/i,
    /\bcheck my (work|reasoning|answer)\b/i,
    /\breview my\b/i,
    /\bam i (right|correct)\b/i,
    /\bquiz me\b/i,
    /\bpractice\b/i,
    /\bso (i|that i) (can )?(understand|learn|solve)\b/i
  ];

  function detectProblemDump(text) {
    const numbered = (text.match(/^\s*\d+[.)]/gm) || []).length;
    const lettered = (text.match(/^\s*[A-Da-d][.)]\s/gm) || []).length;
    const questions = (text.match(/\?/g) || []).length;
    return numbered >= 3 || lettered >= 3 || questions >= 3;
  }

  function classifyPromptHeuristically(prompt) {
    const text = typeof prompt === 'string' ? prompt : '';
    if (!text.trim()) return { verdict: 'miss', score: 0, matched: [] };

    const matched = [];
    let cheatingHits = 0;
    for (const re of CHEATING_PATTERNS) {
      if (re.test(text)) { cheatingHits += 1; matched.push(String(re)); }
    }
    let learningHits = 0;
    for (const re of LEARNING_PATTERNS) {
      if (re.test(text)) learningHits += 1;
    }

    if (cheatingHits > 0 && learningHits === 0) {
      return { verdict: 'hit', score: Math.min(1, 0.6 + 0.2 * cheatingHits), matched };
    }
    if (cheatingHits > 0 && learningHits > 0) {
      return { verdict: 'ambiguous', score: 0.5, matched };
    }
    if (detectProblemDump(text)) {
      matched.push('problem-dump');
      return { verdict: 'ambiguous', score: 0.5, matched };
    }
    return { verdict: 'miss', score: learningHits > 0 ? 0 : 0.1, matched };
  }

  const api = { classifyPromptHeuristically };
  global.StudyGuardHeuristics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
