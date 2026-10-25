const $ = (id) => document.getElementById(id);
const COUNTERS = ['total', 'bonusTotal'];

function renderState(enabled) {
  $('enabled').checked = enabled;
  $('state').textContent = t(enabled ? 'stateOn' : 'stateOff');
}

chrome.storage.local.get({ enabled: TWAB_DEFAULTS.enabled, total: 0, bonusTotal: 0 }).then((s) => {
  renderState(s.enabled);
  COUNTERS.forEach((k) => ($(k).textContent = fmt(s[k])));
});

$('enabled').addEventListener('change', (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
  renderState(e.target.checked);
  $('hint').hidden = false;
});

$('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  COUNTERS.forEach((k) => {
    if (changes[k]) $(k).textContent = fmt(changes[k].newValue);
  });
  if (changes.enabled) renderState(changes.enabled.newValue ?? TWAB_DEFAULTS.enabled);
});
