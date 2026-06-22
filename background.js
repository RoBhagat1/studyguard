// StudyGuard background service worker — thin client to the Vercel classify proxy.

const DEFAULT_PROXY_BASE = ''; // set to your Vercel URL, e.g. 'https://studyguard-proxy.vercel.app'
const DEFAULTS = {
  sg_enabled: true,
  sg_strictness: 'llm',     // 'heuristics' = no proxy calls; 'llm' = use proxy for ambiguous
  sg_proxyBase: DEFAULT_PROXY_BASE,
  sg_extToken: ''
};

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DEFAULTS, (cfg) => resolve(cfg));
  });
}

async function classify(prompt) {
  const cfg = await getConfig();
  if (cfg.sg_strictness !== 'llm' || !cfg.sg_proxyBase) {
    return { ok: false };
  }
  try {
    const res = await fetch(`${cfg.sg_proxyBase.replace(/\/$/, '')}/api/classify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-studyguard-token': cfg.sg_extToken || '' },
      body: JSON.stringify({ prompt })
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return {
      ok: true,
      isHomework: data.isHomework === true,
      subject: typeof data.subject === 'string' ? data.subject : null,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : []
    };
  } catch (e) {
    return { ok: false };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;
  if (message.type === 'STUDYGUARD_GET_CONFIG') {
    getConfig().then((cfg) => sendResponse({
      enabled: cfg.sg_enabled,
      strictness: cfg.sg_strictness,
      proxyBase: cfg.sg_proxyBase,
      extToken: cfg.sg_extToken
    }));
    return true;
  }
  if (message.type === 'STUDYGUARD_CLASSIFY') {
    classify(typeof message.prompt === 'string' ? message.prompt : '').then(sendResponse);
    return true;
  }
  return false;
});
