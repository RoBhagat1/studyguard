const DEFAULTS = {
  sg_enabled: true,
  sg_strictness: 'llm',
  sg_proxyBase: 'https://proxy-red-one-41.vercel.app',
  sg_extToken: 'c7800af89c3fe3f16daec547d7488eed56562cfae8ff7170',
  sg_unlockCode: 'STUDYGUARD',
  sg_refillAmount: 5,
  sg_revealsRemaining: 5,
  sg_trainMode: false,
  sg_trainFeedback: []
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
    $('trainMode').checked = Boolean(s.sg_trainMode);
    $('exportTrain').textContent = `Export training data (${s.sg_trainFeedback.length})`;
  });
}

function save() {
  const values = {
    sg_enabled: $('enabled').checked,
    sg_strictness: $('strictness').value,
    sg_proxyBase: $('proxyBase').value.trim(),
    sg_extToken: $('extToken').value.trim(),
    sg_unlockCode: $('unlockCode').value,
    sg_refillAmount: Math.max(0, parseInt($('refillAmount').value, 10) || 0),
    sg_trainMode: $('trainMode').checked
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

$('exportTrain').addEventListener('click', () => {
  chrome.storage.local.get({ sg_trainFeedback: [] }, (s) => {
    if (s.sg_trainFeedback.length === 0) return;
    const jsonl = StudyGuardTraining.serializeFeedback(s.sg_trainFeedback);
    const url = URL.createObjectURL(new Blob([jsonl], { type: 'application/x-ndjson' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `studyguard-train-${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

$('clearTrain').addEventListener('click', () => {
  chrome.storage.local.set({ sg_trainFeedback: [] }, () => {
    $('exportTrain').textContent = 'Export training data (0)';
  });
});

document.addEventListener('DOMContentLoaded', load);
