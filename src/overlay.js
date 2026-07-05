(function (global) {
  const BLUR_CLASS = 'studyguard-blurred';
  const PANEL_CLASS = 'studyguard-panel';
  const FLAG_ATTR = 'data-studyguard-blocked';

  function isBlocked(node) {
    return node instanceof HTMLElement && node.getAttribute(FLAG_ATTR) === 'true';
  }

  function clearBlock(node) {
    if (!(node instanceof HTMLElement)) return;
    node.classList.remove(BLUR_CLASS);
    node.removeAttribute(FLAG_ATTR);
    const panel = node.parentElement && node.parentElement.querySelector(`.${PANEL_CLASS}`);
    if (panel) panel.remove();
  }

  function buildSuggestionList(suggestions, onCopy) {
    const ul = document.createElement('ul');
    ul.className = 'studyguard-suggestions';
    suggestions.forEach((text) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'studyguard-copy';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
        if (typeof onCopy === 'function') onCopy(text);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      });
      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    return ul;
  }

  function showLockScreen(panel, opts) {
    const body = panel.querySelector('.studyguard-body');
    while (body.firstChild) body.removeChild(body.firstChild);
    const msg = document.createElement('p');
    msg.className = 'studyguard-lock-msg';
    msg.textContent = "You've used all your reveals. Ask your teacher for an unlock code, or request more via the form.";
    const link = document.createElement('a');
    link.className = 'studyguard-form-link';
    link.href = 'mailto:rohanb@berkeley.edu?subject=StudyGuard%20more%20reveals';
    link.textContent = 'Request more reveals';
    link.target = '_blank';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'studyguard-unlock-input';
    input.placeholder = 'Unlock code';
    const unlockBtn = document.createElement('button');
    unlockBtn.type = 'button';
    unlockBtn.className = 'studyguard-unlock-btn';
    unlockBtn.textContent = 'Unlock';
    const err = document.createElement('div');
    err.className = 'studyguard-unlock-err';
    unlockBtn.addEventListener('click', async () => {
      const result = await opts.onUnlock(input.value);
      if (result && result.ok) {
        location.reload(); // simplest: re-evaluate with refreshed budget
      } else {
        err.textContent = 'Incorrect code.';
      }
    });
    body.appendChild(msg);
    body.appendChild(input);
    body.appendChild(unlockBtn);
    body.appendChild(err);
    body.appendChild(link);
  }

  function applyBlock(node, opts) {
    if (!(node instanceof HTMLElement) || isBlocked(node)) return;
    node.classList.add(BLUR_CLASS);
    node.setAttribute(FLAG_ATTR, 'true');

    const panel = document.createElement('div');
    panel.className = PANEL_CLASS;
    const heading = document.createElement('div');
    heading.className = 'studyguard-heading';
    heading.textContent = "Let's make this a learning moment";
    const body = document.createElement('div');
    body.className = 'studyguard-body';
    body.appendChild(buildSuggestionList(opts.suggestions, opts.onCopy));

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = 'studyguard-reveal';
    revealBtn.addEventListener('click', async () => {
      const r = await opts.onReveal();
      if (r && r.allowed) {
        clearBlock(node);
      } else if (r && r.locked) {
        showLockScreen(panel, { onUnlock: opts.onUnlock });
      }
    });

    panel.appendChild(heading);
    panel.appendChild(body);
    panel.appendChild(revealBtn);

    // mount after the response node within its parent
    if (node.parentElement) node.parentElement.insertBefore(panel, node.nextSibling);

    // initial reveal label / lock state
    if (typeof opts.initialRevealsRemaining === 'number') {
      revealBtn.textContent = opts.initialRevealsRemaining > 0
        ? `Show answer anyway (${opts.initialRevealsRemaining} left)`
        : 'Locked — enter unlock code';
      if (opts.initialRevealsRemaining <= 0) {
        showLockScreen(panel, { onUnlock: opts.onUnlock });
      }
    } else {
      revealBtn.textContent = 'Show answer anyway';
    }
  }

  // Swap the suggestion list on an already-mounted panel (e.g. when tailored LLM
  // suggestions arrive after the blur was applied). No-op if the block was cleared
  // or the panel is showing the lock screen.
  function updateSuggestions(node, suggestions, onCopy) {
    if (!(node instanceof HTMLElement) || !node.parentElement) return false;
    const panel = node.parentElement.querySelector(`.${PANEL_CLASS}`);
    if (!panel) return false;
    const list = panel.querySelector('.studyguard-suggestions');
    if (!list) return false;
    list.replaceWith(buildSuggestionList(suggestions, onCopy));
    return true;
  }

  global.StudyGuardOverlay = { applyBlock, clearBlock, isBlocked, showLockScreen, updateSuggestions };
})(typeof self !== 'undefined' ? self : globalThis);
