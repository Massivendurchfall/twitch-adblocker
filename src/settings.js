// Default for every setting. Shared by the service worker (importScripts),
// the popup, the options page and the isolated-world content script.
// Settings live as flat keys in chrome.storage.local.
var TWAB_DEFAULTS = {
  enabled: true,
  streamAds: true,
  displayAds: true,
  claimBonus: true,
};

// Settings that change which scripts/rules are registered; the page has to be
// reloaded for these to take effect.
var TWAB_RELOAD_KEYS = ['enabled', 'streamAds', 'displayAds'];
