// StudyGuard content script.
// Detects "do my homework" requests on ChatGPT and Claude, then blurs the assistant's
// answer and offers learning-oriented prompt suggestions.

const EVAL_DELAY_MS = 200;   // throttle window — blur fires within this of the first streamed token
const COMPLETION_POLL_MS = 1000;
const TURN_NODE_SELECTOR = "[data-message-author-role]";

const state = {
  observer: null,
  analyzeTimer: null,
  completionPollTimer: null
};

// --- Site adapters: locate prompts/responses on each supported chat site ---

// Filenames of uploaded attachments are scraped from the user turn and appended to the
// prompt as "[uploaded file: name.pdf]" markers, so the heuristics and the LLM
// classifier can reason about uploads (including uploads with no message text).
const SG_FILENAME_RE = /^[\w .()\[\]&+-]{1,80}\.(pdf|docx?|txt|rtf|odt|md|csv|tsv|xlsx?|pptx?|png|jpe?g|gif|webp|heic|py|ipynb|java|cpp|cc|c|h|js|ts|jsx|tsx|html|css|json|zip)$/i;

function sgExtractFilenames(scope) {
  if (!(scope instanceof Element)) {
    return [];
  }

  const names = new Set();
  for (const el of scope.querySelectorAll("*")) {
    if (el.closest(".studyguard-panel")) {
      continue;
    }

    for (const attr of ["aria-label", "title", "alt"]) {
      const value = el.getAttribute(attr);
      if (value && SG_FILENAME_RE.test(value.trim())) {
        names.add(value.trim());
      }
    }

    if (el.childElementCount === 0) {
      const text = (el.textContent || "").trim();
      if (text && SG_FILENAME_RE.test(text)) {
        names.add(text);
      }
    }
  }

  return Array.from(names).slice(0, 5);
}

function createChatGptAdapter() {
  return {
    id: "chatgpt",
    matches() {
      return window.location.hostname === "chatgpt.com" || window.location.hostname === "chat.openai.com";
    },
    getConversationContainer() {
      return document.querySelector("main");
    },
    getResponseMountNode(responseNode) {
      return responseNode;
    },
    getTurnNodes(role) {
      return Array.from(document.querySelectorAll(`${TURN_NODE_SELECTOR}[data-message-author-role="${role}"]`));
    },
    getTranscriptEntries() {
      return Array.from(document.querySelectorAll(TURN_NODE_SELECTOR))
        .map((node) => ({
          role: node.getAttribute("data-message-author-role"),
          node
        }))
        .filter((entry) => entry.role === "user" || entry.role === "assistant");
    },
    getTurnText(node) {
      return getGenericNodeText(node);
    },
    getAttachments(userNode) {
      if (!userNode) {
        return [];
      }
      // Attachment chips render inside the same turn container as the message text.
      return sgExtractFilenames(userNode.closest("article") || userNode.parentElement || userNode);
    },
    isGenerationInProgress() {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.some((button) => {
        const label = (button.getAttribute("aria-label") || button.innerText || "").trim().toLowerCase();
        return label.includes("stop generating") || label === "stop";
      });
    }
  };
}

function createClaudeAdapter() {
  return {
    id: "claude",
    matches() {
      return window.location.hostname === "claude.ai";
    },
    getConversationContainer() {
      // claude.ai is an SPA that rebuilds the chat area on navigation, so any node
      // picked near the input box can go stale and the observer stops seeing streamed
      // turns (observed in the wild: zero observer fires during a 26s stream). Observe
      // body — the mutation filter plus the 200ms throttle keep the cost negligible.
      return document.body;
    },
    getResponseMountNode(responseNode) {
      return responseNode ? responseNode.querySelector(".font-claude-response") || responseNode : responseNode;
    },
    getTurnNodes(role) {
      if (role === "user") {
        return Array.from(document.querySelectorAll('[data-testid="user-message"]'));
      }
      if (role === "assistant") {
        return Array.from(document.querySelectorAll("div[data-is-streaming]"));
      }
      return [];
    },
    getTranscriptEntries() {
      return Array.from(document.querySelectorAll('[data-testid="user-message"], div[data-is-streaming]'))
        .map((node) => ({
          role: node.matches('[data-testid="user-message"]') ? "user" : "assistant",
          node
        }))
        .filter((entry) => entry.role === "user" || entry.role === "assistant");
    },
    getTurnText(node, role) {
      if (role === "assistant") {
        return getClaudeAssistantText(node);
      }

      return getGenericNodeText(node);
    },
    getAttachments(userNode) {
      if (!userNode) {
        return [];
      }
      // On claude.ai file thumbnails render as siblings of the user-message div,
      // inside the same message group.
      return sgExtractFilenames(
        userNode.closest("[data-test-render-count]") || userNode.parentElement || userNode
      );
    },
    isIgnoredMutationNode(node) {
      if (!(node instanceof Element)) {
        return false;
      }

      return Boolean(
        node.closest('[data-chat-input-container="true"]') ||
          node.closest('[role="group"][aria-label="Message actions"]')
      );
    },
    isGenerationInProgress() {
      return Boolean(document.querySelector('div[data-is-streaming="true"]'));
    },
    shouldUseCompletionPoller() {
      return true;
    }
  };
}

const SITE_ADAPTERS = [createClaudeAdapter(), createChatGptAdapter()];
let activeAdapter = null;

function getActiveAdapter() {
  if (activeAdapter && activeAdapter.matches()) {
    return activeAdapter;
  }

  activeAdapter = SITE_ADAPTERS.find((adapter) => adapter.matches()) || null;
  return activeAdapter;
}

function isSupportedSite() {
  return Boolean(getActiveAdapter());
}

// --- Transcript text extraction ---

function getConversationContainer() {
  const adapter = getActiveAdapter();
  return adapter ? adapter.getConversationContainer() : null;
}

function getTurnNodes(role) {
  const adapter = getActiveAdapter();
  return adapter ? adapter.getTurnNodes(role) : [];
}

function getLastTurnNode(role) {
  const nodes = getTurnNodes(role);
  return nodes.at(-1) || null;
}

function getGenericNodeText(node) {
  if (!node) {
    return "";
  }

  const clone = node.cloneNode(true);
  for (const injectedNode of Array.from(clone.querySelectorAll(".studyguard-panel"))) {
    injectedNode.remove();
  }

  // Preserve line breaks: the code-paste and problem-dump detectors are line-based,
  // so collapsing newlines would blind them to pasted code and numbered questions.
  return clone.innerText.replace(/[^\S\n]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

function getClaudeAssistantText(node) {
  if (!node) {
    return "";
  }

  const clone = node.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return getGenericNodeText(node);
  }

  for (const thoughtNode of Array.from(clone.querySelectorAll(".assistant-thought, .group\\/status, [role=\"status\"]"))) {
    thoughtNode.remove();
  }

  const blocks = Array.from(clone.querySelectorAll(".font-claude-response-body"));
  if (blocks.length > 0) {
    return blocks
      .map((block) => (block instanceof HTMLElement ? block.innerText.replace(/\s+/g, " ").trim() : ""))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  return getGenericNodeText(node);
}

function getNodeText(node, role = null) {
  const adapter = getActiveAdapter();
  if (adapter && typeof adapter.getTurnText === "function") {
    return adapter.getTurnText(node, role);
  }

  return getGenericNodeText(node);
}

function getTranscriptEntries() {
  const adapter = getActiveAdapter();
  return adapter && typeof adapter.getTranscriptEntries === "function" ? adapter.getTranscriptEntries() : [];
}

function getAttachmentMarkers(userNode) {
  const adapter = getActiveAdapter();
  if (!adapter || typeof adapter.getAttachments !== "function" || !userNode) {
    return "";
  }

  let names = [];
  try {
    names = adapter.getAttachments(userNode) || [];
  } catch (e) {
    names = [];
  }

  return names.map((name) => `[uploaded file: ${name}]`).join("\n");
}

function getLatestPromptResponsePair() {
  const transcriptEntries = getTranscriptEntries();
  if (transcriptEntries.length < 2) {
    return null;
  }

  const responseEntry = transcriptEntries.at(-1) || null;
  const promptEntry = transcriptEntries.at(-2) || null;
  if (!responseEntry || !promptEntry) {
    return null;
  }

  if (promptEntry.role !== "user" || responseEntry.role !== "assistant") {
    return null;
  }

  const promptText = getNodeText(promptEntry.node || null, "user");
  const markers = getAttachmentMarkers(promptEntry.node || null);

  return {
    promptNode: promptEntry.node || null,
    prompt: markers ? `${promptText}\n${markers}`.trim() : promptText,
    responseNode: responseEntry.node || null,
    response: getNodeText(responseEntry.node || null, "assistant")
  };
}

function isGenerationInProgress() {
  const adapter = getActiveAdapter();
  return adapter ? adapter.isGenerationInProgress() : false;
}

// --- Detection + intervention orchestration ---

// Track which response DOM nodes we've already evaluated, so repeated observer
// fires (and identical re-asked questions, which are new nodes) are each handled
// exactly once. Keyed by node identity, not content — so asking the same thing
// twice is two separate turns and both get checked.
const sgSeenResponseNodes = new WeakSet();

function sgGetRevealState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { sg_revealsRemaining: 5, sg_unlockCode: "STUDYGUARD", sg_refillAmount: 5 },
      (s) =>
        resolve({
          revealsRemaining: s.sg_revealsRemaining,
          unlockCode: s.sg_unlockCode,
          refillAmount: s.sg_refillAmount
        })
    );
  });
}

function sgSetRevealsRemaining(n) {
  return new Promise((resolve) => chrome.storage.local.set({ sg_revealsRemaining: n }, resolve));
}

function sgGetTrainMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ sg_trainMode: false }, (s) => resolve(Boolean(s.sg_trainMode)));
  });
}

function sgSaveTrainFeedback(record) {
  return new Promise((resolve) => {
    chrome.storage.local.get({ sg_trainFeedback: [] }, (s) => {
      const next = self.StudyGuardTraining.addFeedback(s.sg_trainFeedback, record);
      chrome.storage.local.set({ sg_trainFeedback: next }, resolve);
    });
  });
}

function sgSendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(resp);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

const SG_DEBUG = true;
function sgLog(...args) {
  if (SG_DEBUG) console.warn("[StudyGuard]", ...args);
}

async function evaluateLatestTurn() {
  if (!isSupportedSite()) { sgLog("skip: unsupported site"); return; }

  // We act as soon as an answer starts streaming (the prompt is already complete,
  // and detection is prompt-based) so the answer never becomes readable. No waiting
  // for generation to finish.
  const pair = getLatestPromptResponsePair();
  if (!pair || !pair.prompt || !pair.response || !pair.responseNode) { sgLog("skip: no prompt/response pair yet"); return; }

  // Claim this response node synchronously (before any await) so each turn is
  // evaluated exactly once despite the burst of streaming mutations.
  if (sgSeenResponseNodes.has(pair.responseNode)) { sgLog("skip: already evaluated this response node"); return; }
  sgSeenResponseNodes.add(pair.responseNode);
  sgLog("evaluating turn. prompt:", pair.prompt.slice(0, 120));

  const cfg = await sgSendMessage({ type: "STUDYGUARD_GET_CONFIG" });
  if (cfg && cfg.enabled === false) { sgLog("skip: disabled in config"); return; }

  const heur = self.StudyGuardHeuristics.classifyPromptHeuristically(pair.prompt);
  sgLog("heuristic verdict:", heur.verdict);
  let isHomework = heur.verdict === "hit";
  let llmSuggestions = null;
  const llmEnabled = !cfg || cfg.strictness === "llm";

  if (heur.verdict === "ambiguous" && llmEnabled) {
    // Verdict genuinely unknown — the LLM round trip is unavoidable here.
    const res = await sgSendMessage({ type: "STUDYGUARD_CLASSIFY", prompt: pair.prompt });
    if (res && res.ok) {
      isHomework = res.isHomework === true;
      llmSuggestions = res.suggestions;
    }
  }
  // On a heuristic hit the verdict is already decided: blur immediately with the
  // static suggestions and upgrade the panel when the LLM's tailored ones arrive.

  const adapter = getActiveAdapter();
  const responseNode = pair.responseNode || getLastTurnNode("assistant");
  const mount =
    adapter && typeof adapter.getResponseMountNode === "function" && responseNode
      ? adapter.getResponseMountNode(responseNode)
      : responseNode;

  const trainMode = await sgGetTrainMode();
  const recordFeedback = (label) => {
    const rec = self.StudyGuardTraining.buildFeedbackRecord({
      label,
      prompt: pair.prompt,
      verdict: heur.verdict,
      matched: heur.matched,
      llmUsed: llmEnabled,
      site: adapter ? adapter.id : null
    });
    if (rec) void sgSaveTrainFeedback(rec);
    sgLog("train feedback recorded:", label);
  };

  if (!isHomework) {
    if (trainMode && mount) {
      self.StudyGuardOverlay.addTrainBadge(mount, () => recordFeedback("false_negative"));
    }
    sgLog("not homework — leaving answer visible");
    return;
  }

  if (!mount) { sgLog("skip: no response node to blur"); return; }
  sgLog("BLOCKING answer, mount:", mount.tagName, mount.className);

  const suggestions = self.StudyGuardSuggestions.pickSuggestions(llmSuggestions);
  const rev = await sgGetRevealState();

  if (heur.verdict === "hit" && llmEnabled) {
    void sgSendMessage({ type: "STUDYGUARD_CLASSIFY", prompt: pair.prompt }).then((res) => {
      if (res && res.ok && Array.isArray(res.suggestions) && res.suggestions.length) {
        self.StudyGuardOverlay.updateSuggestions(mount, self.StudyGuardSuggestions.pickSuggestions(res.suggestions));
      }
    });
  }

  self.StudyGuardOverlay.applyBlock(mount, {
    suggestions,
    initialRevealsRemaining: rev.revealsRemaining,
    onFalsePositive: trainMode ? () => recordFeedback("false_positive") : undefined,
    onReveal: async () => {
      const cur = await sgGetRevealState();
      if (cur.revealsRemaining > 0) {
        await sgSetRevealsRemaining(cur.revealsRemaining - 1);
        return { allowed: true, revealsRemaining: cur.revealsRemaining - 1, locked: false };
      }
      return { allowed: false, revealsRemaining: 0, locked: true };
    },
    onUnlock: async (code) => {
      const cur = await sgGetRevealState();
      const r = self.StudyGuardReveals.attemptUnlock(cur, code);
      if (r.ok) {
        await sgSetRevealsRemaining(r.state.revealsRemaining);
        return { ok: true, revealsRemaining: r.state.revealsRemaining };
      }
      return { ok: false, revealsRemaining: cur.revealsRemaining };
    }
  });
}

// --- Observe the conversation and re-evaluate as answers stream in ---

// Throttle (not trailing-debounce): a burst of streaming mutations triggers a run
// at most once per EVAL_DELAY_MS, with a leading run shortly after the first token —
// so the blur lands while the answer is still streaming rather than after it ends.
function scheduleEvaluation() {
  if (state.analyzeTimer) {
    return;
  }

  state.analyzeTimer = window.setTimeout(() => {
    state.analyzeTimer = null;
    void evaluateLatestTurn();
  }, EVAL_DELAY_MS);
}

function shouldUseCompletionPoller() {
  const adapter = getActiveAdapter();
  return Boolean(adapter && typeof adapter.shouldUseCompletionPoller === "function" && adapter.shouldUseCompletionPoller());
}

function isOwnMutationNode(node) {
  if (!node) {
    return false;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.parentElement && isOwnMutationNode(node.parentElement));
  }

  if (!(node instanceof Element)) {
    return false;
  }

  return Boolean(node.closest(".studyguard-panel"));
}

function isIgnoredMutationNode(node) {
  if (!node) {
    return false;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return Boolean(node.parentElement && isIgnoredMutationNode(node.parentElement));
  }

  if (!(node instanceof Element)) {
    return false;
  }

  if (isOwnMutationNode(node)) {
    return true;
  }

  const adapter = getActiveAdapter();
  if (adapter && typeof adapter.isIgnoredMutationNode === "function") {
    return adapter.isIgnoredMutationNode(node);
  }

  return false;
}

function installMutationObserver() {
  const container = getConversationContainer();
  if (!container) {
    window.setTimeout(installMutationObserver, 1000);
    return;
  }

  if (state.observer) {
    return;
  }

  state.observer = new MutationObserver((mutations) => {
    const hasRelevantMutation = mutations.some((mutation) => {
      if (mutation.type === "characterData") {
        return !isIgnoredMutationNode(mutation.target);
      }

      const addedNodes = Array.from(mutation.addedNodes || []);
      const removedNodes = Array.from(mutation.removedNodes || []);
      const externalAdded = addedNodes.some((node) => !isIgnoredMutationNode(node));
      const externalRemoved = removedNodes.some((node) => !isIgnoredMutationNode(node));
      return externalAdded || externalRemoved;
    });

    if (hasRelevantMutation) {
      scheduleEvaluation();
    }
  });

  state.observer.observe(container, {
    subtree: true,
    childList: true,
    characterData: true
  });

  scheduleEvaluation();
}

function installCompletionPoller() {
  if (state.completionPollTimer || !shouldUseCompletionPoller()) {
    return;
  }

  state.completionPollTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      return;
    }

    // Evaluate during streaming too — detection is prompt-based and each response
    // node is only evaluated once, so polling mid-generation is safe and means the
    // blur lands within ~1s even if the mutation observer misses the turn.
    void evaluateLatestTurn();
  }, COMPLETION_POLL_MS);
}

function init() {
  if (!isSupportedSite()) {
    sgLog("init: not a supported site:", location.hostname);
    return;
  }
  sgLog("init: active on", location.hostname, "adapter:", getActiveAdapter() && getActiveAdapter().id);

  installMutationObserver();
  installCompletionPoller();

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scheduleEvaluation();
      void evaluateLatestTurn();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
