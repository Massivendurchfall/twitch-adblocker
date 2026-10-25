importScripts('settings.js');

const TWITCH = ['*://*.twitch.tv/*'];

// Content scripts, each with the setting that has to be on for it to run
// (besides the main switch). Registered dynamically so switches can remove them.
// allFrames also covers the player.twitch.tv embeds other sites show.
const SCRIPTS = [
  {
    // vaft from TwitchAdSolutions, the same script uBlock Origin injects via
    // twitch.tv##+js(twitch-videoad). It swaps ad-laden stream playlists for
    // ad-free backup ones inside Twitch's video worker.
    when: 'streamAds',
    id: 'twab-vaft',
    js: ['src/vaft/vaft.js'],
    matches: TWITCH,
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true,
  },
  {
    when: 'displayAds',
    id: 'twab-cosmetic',
    css: ['src/cosmetic.css'],
    matches: TWITCH,
    runAt: 'document_start',
    allFrames: true,
  },
  {
    id: 'twab-extras',
    js: ['src/settings.js', 'src/extras.js'],
    matches: TWITCH,
    runAt: 'document_idle',
    allFrames: true,
  },
];

function getSettings() {
  return chrome.storage.local.get(TWAB_DEFAULTS);
}

// Brings content scripts and network rules in line with the switches.
// Calls are chained so overlapping storage changes can't interleave.
let syncQueue = Promise.resolve();
function sync({ reregister = false } = {}) {
  const run = () => doSync(reregister);
  syncQueue = syncQueue.then(run, run);
  return syncQueue;
}

// Only scripts whose switch changed are (un)registered, so a page loading at
// that moment never finds the other scripts missing. After an install or
// update everything is re-registered once to pick up changed definitions.
async function doSync(reregister) {
  const s = await getSettings();
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const have = registered.map((r) => r.id).filter((id) => id.startsWith('twab-'));
  const wanted = s.enabled
    ? SCRIPTS.filter((x) => !x.when || s[x.when]).map(({ when, ...script }) => script)
    : [];
  const wantedIds = new Set(wanted.map((x) => x.id));

  const remove = reregister ? have : have.filter((id) => !wantedIds.has(id));
  if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove });
  const add = reregister ? wanted : wanted.filter((x) => !have.includes(x.id));
  if (add.length) await chrome.scripting.registerContentScripts(add);

  const rulesOn = s.enabled && s.displayAds;
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    rulesOn ? { enableRulesetIds: ['twitch_ads'] } : { disableRulesetIds: ['twitch_ads'] }
  );
  await chrome.action.setBadgeBackgroundColor({ color: '#9146ff' });
  await chrome.action.setBadgeText({ text: s.enabled ? '' : chrome.i18n.getMessage('badgeOff') });
}

chrome.runtime.onInstalled.addListener(() => sync({ reregister: true }));
chrome.runtime.onStartup.addListener(() => sync());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && TWAB_RELOAD_KEYS.some((k) => k in changes)) sync();
});

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------
const tabCounts = new Map();

// Serialize writes so concurrent messages don't lose counts.
let counterQueue = Promise.resolve();
function addToCounter(key, n) {
  counterQueue = counterQueue
    .then(async () => {
      const stored = await chrome.storage.local.get({ [key]: 0 });
      await chrome.storage.local.set({ [key]: stored[key] + n });
    })
    .catch(() => {}); // one failed write must not stall later ones
}

chrome.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));

chrome.runtime.onMessage.addListener((msg, sender) => {
  // Only our own content scripts and pages talk to us.
  if (sender.id !== chrome.runtime.id) return;

  switch (msg?.type) {
    case 'blocked': {
      if (!sender.tab || !Number.isFinite(msg.count) || msg.count <= 0) return;
      const tabId = sender.tab.id;
      const n = (tabCounts.get(tabId) || 0) + msg.count;
      tabCounts.set(tabId, n);
      chrome.action.setBadgeText({ tabId, text: n > 999 ? '999+' : String(n) });
      addToCounter('total', msg.count);
      return;
    }
    case 'bonus-claimed':
      addToCounter('bonusTotal', 1);
      return;
  }
});
