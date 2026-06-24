// StudyGuard content script.
// Detects "do my homework" requests on ChatGPT and Claude, then blurs the assistant's
// answer and offers learning-oriented prompt suggestions.

const QUIET_PERIOD_MS = 1500;
const COMPLETION_POLL_MS = 1000;
const TURN_NODE_SELECTOR = "[data-message-author-role]";

const state = {
  observer: null,
  analyzeTimer: null,
  completionPollTimer: null,
  lastMutationAt: 0
};

// --- Site adapters: locate prompts/responses on each supported chat site ---

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
      const inputContainer = document.querySelector('[data-chat-input-container="true"]');
      if (inputContainer && inputContainer.previousElementSibling instanceof Element) {
        return inputContainer.previousElementSibling;
      }

      return (inputContainer && inputContainer.parentElement) || document.querySelector("main");
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

  return clone.innerText.replace(/\s+/g, " ").trim();
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

  return {
    promptNode: promptEntry.node || null,
    prompt: getNodeText(promptEntry.node || null, "user"),
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
  if (isGenerationInProgress()) { sgLog("skip: still generating"); return; }

  const cfg = await sgSendMessage({ type: "STUDYGUARD_GET_CONFIG" });
  if (cfg && cfg.enabled === false) { sgLog("skip: disabled in config"); return; }

  const pair = getLatestPromptResponsePair();
  if (!pair || !pair.prompt || !pair.response) { sgLog("skip: no prompt/response pair", pair); return; }
  sgLog("pair found. prompt:", pair.prompt.slice(0, 120));

  if (pair.responseNode) {
    if (sgSeenResponseNodes.has(pair.responseNode)) { sgLog("skip: already evaluated this response node"); return; }
    sgSeenResponseNodes.add(pair.responseNode);
  }

  const heur = self.StudyGuardHeuristics.classifyPromptHeuristically(pair.prompt);
  sgLog("heuristic verdict:", heur.verdict);
  let isHomework = heur.verdict === "hit";
  let llmSuggestions = null;
  const llmEnabled = !cfg || cfg.strictness === "llm";

  if (heur.verdict === "ambiguous" && llmEnabled) {
    const res = await sgSendMessage({ type: "STUDYGUARD_CLASSIFY", prompt: pair.prompt });
    if (res && res.ok) {
      isHomework = res.isHomework === true;
      llmSuggestions = res.suggestions;
    }
  } else if (heur.verdict === "hit" && llmEnabled) {
    const res = await sgSendMessage({ type: "STUDYGUARD_CLASSIFY", prompt: pair.prompt });
    if (res && res.ok && Array.isArray(res.suggestions) && res.suggestions.length) {
      llmSuggestions = res.suggestions;
    }
  }

  if (!isHomework) { sgLog("not homework — leaving answer visible"); return; }

  const adapter = getActiveAdapter();
  const responseNode = pair.responseNode || getLastTurnNode("assistant");
  const mount =
    adapter && typeof adapter.getResponseMountNode === "function" && responseNode
      ? adapter.getResponseMountNode(responseNode)
      : responseNode;
  if (!mount) { sgLog("skip: no response node to blur"); return; }
  sgLog("BLOCKING answer, mount:", mount.tagName, mount.className);

  const suggestions = self.StudyGuardSuggestions.pickSuggestions(llmSuggestions);
  const rev = await sgGetRevealState();

  self.StudyGuardOverlay.applyBlock(mount, {
    suggestions,
    initialRevealsRemaining: rev.revealsRemaining,
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

// --- Observe the conversation and re-evaluate when a turn settles ---

function scheduleEvaluation() {
  state.lastMutationAt = Date.now();

  if (state.analyzeTimer) {
    window.clearTimeout(state.analyzeTimer);
  }

  state.analyzeTimer = window.setTimeout(() => {
    const elapsed = Date.now() - state.lastMutationAt;
    if (elapsed < QUIET_PERIOD_MS) {
      scheduleEvaluation();
      return;
    }

    void evaluateLatestTurn();
  }, QUIET_PERIOD_MS);
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

    if (isGenerationInProgress()) {
      return;
    }

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
