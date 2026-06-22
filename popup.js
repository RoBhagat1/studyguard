const DEFAULTS = {
  sg_enabled: true,
  sg_strictness: 'llm',
  sg_proxyBase: 'https://proxy-red-one-41.vercel.app',
  sg_extToken: 'c7800af89c3fe3f16daec547d7488eed56562cfae8ff7170',
  sg_unlockCode: 'STUDYGUARD',
  sg_refillAmount: 5,
  sg_revealsRemaining: 5
};

function $(id) { return document.getElementById(id); }

function load() {
  chrome.storage.local.get(DEFAULTS, (s) => {
    $('enabled').checked = s.sg_enabled;
    $('strictness').value = s.sg_strictness;
    $('proxyBase').value = s.sg_proxyBase;
    $('extToken').value = s.sg_extToken;
    $('unlockCode').value = s.sg_unlockCode;
    $('refillAmount').value = s.sg_refillAmount;
    $('reveals').textContent = s.sg_revealsRemaining;
  });
}

function save() {
  const values = {
    sg_enabled: $('enabled').checked,
    sg_strictness: $('strictness').value,
    sg_proxyBase: $('proxyBase').value.trim(),
    sg_extToken: $('extToken').value.trim(),
    sg_unlockCode: $('unlockCode').value,
    sg_refillAmount: Math.max(0, parseInt($('refillAmount').value, 10) || 0)
  };
  chrome.storage.local.set(values, () => {
    $('savedMsg').textContent = 'Saved.';
    setTimeout(() => { $('savedMsg').textContent = ''; }, 1500);
  });
}

$('save').addEventListener('click', save);
$('resetReveals').addEventListener('click', () => {
  chrome.storage.local.set({ sg_revealsRemaining: 5 }, () => { $('reveals').textContent = '5'; });
});

document.addEventListener('DOMContentLoaded', load);
