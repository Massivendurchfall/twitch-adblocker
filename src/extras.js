// Isolated world, Twitch: counts the ad breaks vaft blocks and claims the
// channel points bonus ("+50") as soon as the button appears.
(() => {
  'use strict';
  let claimBonus = TWAB_DEFAULTS.claimBonus;
  chrome.storage.local.get({ claimBonus }).then((s) => {
    claimBonus = s.claimBonus;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'claimBonus' in changes) {
      claimBonus = changes.claimBonus.newValue ?? TWAB_DEFAULTS.claimBonus;
    }
  });

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  let adShowing = false;

  const timer = setInterval(() => {
    // After the extension is reloaded or disabled this old copy is orphaned.
    if (!chrome.runtime?.id) return clearInterval(timer);

    // vaft shows its "Blocking ads" overlay in the player for the whole ad
    // break, so each time it appears is one blocked break.
    const overlay = document.querySelector('.adblock-overlay');
    const showing = !!overlay && overlay.style.display !== 'none';
    if (showing && !adShowing) send({ type: 'blocked', count: 1 });
    adShowing = showing;

    if (!claimBonus) return;
    const button = document.querySelector('.claimable-bonus__icon')?.closest('button');
    if (!button || button.disabled) return;
    button.click();
    send({ type: 'bonus-claimed' });
  }, 1000);
})();
