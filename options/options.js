const $ = (id) => document.getElementById(id);
const COUNTERS = ['total', 'bonusTotal'];

let settings = { ...TWAB_DEFAULTS };

function render() {
  document.querySelectorAll('[data-setting]').forEach((input) => {
    input.checked = !!settings[input.dataset.setting];
  });
  document.querySelector('.depends-on-enabled').classList.toggle('is-off', !settings.enabled);
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 4000);
}

document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.dataset.setting) {
    const key = input.dataset.setting;
    settings[key] = input.checked;
    chrome.storage.local.set({ [key]: input.checked });
    toast(t(TWAB_RELOAD_KEYS.includes(key) ? 'toastSavedReload' : 'toastSaved'));
  }
  render();
});

$('reset').addEventListener('click', () => {
  chrome.storage.local.set({ total: 0, bonusTotal: 0 });
  toast(t('toastReset'));
});

chrome.storage.local.get({ ...TWAB_DEFAULTS, total: 0, bonusTotal: 0 }).then((stored) => {
  for (const key of Object.keys(TWAB_DEFAULTS)) settings[key] = stored[key];
  COUNTERS.forEach((k) => ($(k).textContent = fmt(stored[k])));
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let changed = false;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (COUNTERS.includes(key)) $(key).textContent = fmt(newValue);
    if (key in TWAB_DEFAULTS) {
      settings[key] = newValue === undefined ? TWAB_DEFAULTS[key] : newValue;
      changed = true;
    }
  }
  if (changed) render();
});
