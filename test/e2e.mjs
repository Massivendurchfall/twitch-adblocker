// End-to-end check: loads the unpacked extension in Chromium and serves fake
// twitch.tv pages (via request interception) with ads in stream and page.
// Run: node test/e2e.mjs   (needs the `playwright` package)
// TEST_LANG=de runs it with a German browser UI.
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twab-'));
const lang = process.env.TEST_LANG || 'en';
const messages = (l) => JSON.parse(fs.readFileSync(path.join(root, '_locales', l, 'messages.json'), 'utf8'));
const text = messages(lang);

// A fake live stream whose playlist carries a stitched ad, and an ad-free
// backup stream that vaft should swap in.
const VARIANT = 'https://video-edge.example.net/v1/playlist/main-720p.m3u8';
const BACKUP_VARIANT = 'https://video-edge.example.net/v1/playlist/backup-720p.m3u8';
const master = (variant) => `#EXTM3U
#EXT-X-TWITCH-INFO:NODE="video-edge",SERVER-TIME="1700000000.00"
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720,CODECS="avc1.4D401F,mp4a.40.2",FRAME-RATE=30.000
${variant}
`;
const adPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-DATERANGE:ID="stitched-ad-1",CLASS="twitch-stitched-ad",START-DATE="2026-10-07T00:00:00Z"
#EXTINF:2.000,Amazon
https://video-edge.example.net/ad-segment-1.ts
`;
const backupPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXTINF:2.000,live
https://video-edge.example.net/stream-segment-1.ts
`;
// Stands in for Twitch's video worker: loads the stream like the real player.
const workerJs = `(async () => {
  await fetch('https://usher.ttvnw.net/api/channel/hls/somechannel.m3u8?allow_source=true');
  await new Promise((r) => setTimeout(r, 1700));
  const playlist = await (await fetch('${VARIANT}')).text();
  postMessage({ key: 'test-playlist', playlist });
})();`;
const channel_html = `<!doctype html><html><body><div id="root"></div>
<div class="stream-display-ad__wrapper" id="sda">ad</div>
<div data-test-selector="sda-wrapper" id="sda2">ad</div>
<div style="height: 200px"><div class="video-player--stream-display-ad_lower-third" id="lowerThird" style="height: 70%"></div></div>
<div class="channel-info" id="keep">channel</div>
<div class="community-points-summary"><button id="bonus" onclick="window.claimed = (window.claimed || 0) + 1; this.remove()"><div class="claimable-bonus__icon"></div></button></div>
</body></html>`;
let tokenRequests = 0;

const ctx = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, `--lang=${lang}`],
});

const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent('serviceworker'));
// Give onInstalled time to register the content scripts.
for (let i = 0; i < 50; i++) {
  const n = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length);
  if (n === 3) break;
  await new Promise((r) => setTimeout(r, 100));
}
const scriptIds = () => sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((s) => s.id).sort().join(','));

let adRequestsSeen = 0;
await ctx.route('**/*', (route) => {
  const url = route.request().url();
  if (url.startsWith('chrome-extension://')) return route.continue();
  if (/amazon-adsystem|edge\.ads\.twitch\.tv/.test(url)) { adRequestsSeen++; return route.fulfill({ body: 'ad' }); }
  if (url.startsWith('https://gql.twitch.tv/gql')) {
    tokenRequests++;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { streamPlaybackAccessToken: { signature: 'sig', value: 'tok' } } }) });
  }
  if (url.startsWith('https://usher.ttvnw.net/')) {
    // The backup request carries the token vaft fetched; the player's own does not.
    const backup = new URL(url).searchParams.get('token') === 'tok';
    return route.fulfill({ body: master(backup ? BACKUP_VARIANT : VARIANT) });
  }
  if (url === VARIANT) return route.fulfill({ body: adPlaylist });
  if (url === BACKUP_VARIANT) return route.fulfill({ body: backupPlaylist });
  if (url.endsWith('.ts')) return route.fulfill({ body: '' });
  if (url === 'https://www.twitch.tv/test-worker.js') return route.fulfill({ contentType: 'text/javascript', body: workerJs });
  if (url.startsWith('https://www.twitch.tv/')) return route.fulfill({ contentType: 'text/html', body: channel_html });
  if (url.startsWith('https://www.example.com/')) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><p>other site</p>' });
  return route.abort();
});

const results = { registeredScripts: await scriptIds() };

// vaft must be active and replace the ad playlist with the backup one.
const twitch = await ctx.newPage();
await twitch.goto('https://www.twitch.tv/somechannel');
Object.assign(results, await twitch.evaluate(async () => {
  const out = { vaftVersion: window.twitchAdSolutionsVersion };
  const worker = new Worker('https://www.twitch.tv/test-worker.js');
  const playlist = await new Promise((resolve) => {
    worker.addEventListener('message', (e) => { if (e.data.key === 'test-playlist') resolve(e.data.playlist); });
    setTimeout(() => resolve('timeout'), 10000);
  });
  out.playlistHasAd = playlist.includes('stitched') || playlist.includes('ad-segment');
  out.playlistIsBackup = playlist.includes('stream-segment-1.ts');

  const hidden = (id) => getComputedStyle(document.getElementById(id)).display === 'none';
  out.displayAdHidden = hidden('sda');
  out.displayAdWrapperHidden = hidden('sda2');
  out.normalVisible = !hidden('keep');
  out.lowerThirdFullHeight = getComputedStyle(document.getElementById('lowerThird')).height === '200px';

  for (const u of ['https://c.amazon-adsystem.com/aax2/apstag.js', 'https://edge.ads.twitch.tv/ads']) {
    try { await fetch(u, { mode: 'no-cors' }); out[u] = 'loaded'; } catch { out[u] = 'blocked'; }
  }
  return out;
}));
results.tokenRequests = tokenRequests;
results.adRequestsReachedNetwork = adRequestsSeen;
results.bonusClaimed = await twitch.waitForFunction(() => window.claimed, null, { timeout: 6000 }).then(() => twitch.evaluate(() => window.claimed)).catch(() => 0);

// vaft's "Blocking ads" overlay appears for an ad break: counted once.
await twitch.evaluate(() => {
  document.body.insertAdjacentHTML('beforeend', '<div class="video-player"><div class="adblock-overlay" style="display: block"><p>Blocking ads</p></div></div>');
});
await twitch.waitForTimeout(2500);
await twitch.evaluate(() => (document.querySelector('.adblock-overlay').style.display = 'none'));
await twitch.waitForTimeout(1500);
Object.assign(results, await sw.evaluate(() => chrome.storage.local.get(['total', 'bonusTotal'])));

// Other sites stay untouched.
const other = await ctx.newPage();
await other.goto('https://www.example.com/');
results.vaftElsewhere = await other.evaluate(() => 'twitchAdSolutionsVersion' in window);
await other.close();

// Options page: renders, reflects storage and writes changes back.
const extId = new URL(sw.url()).host;
const pageErrors = [];
const options = await ctx.newPage();
options.on('pageerror', (e) => pageErrors.push(String(e)));
await options.goto(`chrome-extension://${extId}/options/options.html`);
await options.waitForTimeout(300);
results.optionsSwitches = await options.locator('[data-setting]').count();
results.optionsHeading = await options.locator('h2').first().textContent();
results.optionsVaftLink = await options.locator('a[href*="TwitchAdSolutions"]').count();
results.optionsBonusChecked = await options.locator('[data-setting="claimBonus"]').isChecked();
await options.locator('[data-setting="claimBonus"]').click({ force: true });
await options.waitForTimeout(200);
results.optionsWroteBonus = (await sw.evaluate(() => chrome.storage.local.get(['claimBonus']))).claimBonus === false;
results.optionsTotal = await options.locator('#total').textContent();
await options.close();

const popup = await ctx.newPage();
popup.on('pageerror', (e) => pageErrors.push(String(e)));
await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
await popup.waitForTimeout(300);
results.popupState = await popup.locator('#state').textContent();
await popup.close();
results.extensionPageErrors = pageErrors.length;

// Each ad switch removes only its own parts.
await sw.evaluate(() => chrome.storage.local.set({ streamAds: false }));
await twitch.waitForTimeout(500);
results.streamAdsOffScripts = await scriptIds();
await sw.evaluate(() => chrome.storage.local.set({ streamAds: true, displayAds: false }));
await twitch.waitForTimeout(500);
results.displayAdsOffScripts = await scriptIds();
results.displayAdsOffRulesets = (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).length;
await sw.evaluate(() => chrome.storage.local.set({ displayAds: true }));
await twitch.waitForTimeout(500);
results.backOnRulesets = (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).join(',');

// Main switch off: nothing registered, no rules, vaft gone after a reload.
await sw.evaluate(() => chrome.storage.local.set({ enabled: false }));
await twitch.waitForTimeout(500);
results.offScripts = await scriptIds();
results.offRulesets = (await sw.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).length;
await twitch.reload();
results.offVaft = await twitch.evaluate(() => 'twitchAdSolutionsVersion' in window);

console.log(JSON.stringify(results, null, 2));

const expect = {
  registeredScripts: 'twab-cosmetic,twab-extras,twab-vaft',
  vaftVersion: 24, playlistHasAd: false, playlistIsBackup: true,
  displayAdHidden: true, displayAdWrapperHidden: true, normalVisible: true, lowerThirdFullHeight: true,
  'https://c.amazon-adsystem.com/aax2/apstag.js': 'blocked',
  'https://edge.ads.twitch.tv/ads': 'blocked',
  adRequestsReachedNetwork: 0,
  bonusClaimed: 1, bonusTotal: 1, total: 1,
  vaftElsewhere: false,
  optionsSwitches: 4, optionsBonusChecked: true, optionsWroteBonus: true, optionsTotal: '1',
  optionsHeading: text.enabled.message, optionsVaftLink: 1,
  popupState: text.stateOn.message, extensionPageErrors: 0,
  streamAdsOffScripts: 'twab-cosmetic,twab-extras',
  displayAdsOffScripts: 'twab-extras,twab-vaft',
  displayAdsOffRulesets: 0, backOnRulesets: 'twitch_ads',
  offScripts: '', offRulesets: 0, offVaft: false,
};
let failed = 0;
for (const [k, v] of Object.entries(expect)) {
  if (results[k] !== v) { failed++; console.error(`FAIL ${k}: expected ${v}, got ${results[k]}`); }
}
if (!(results.tokenRequests > 0)) { failed++; console.error('FAIL backup token not requested'); }
const [en, de] = [messages('en'), messages('de')];
const missing = [...Object.keys(en).filter((k) => !(k in de)), ...Object.keys(de).filter((k) => !(k in en))];
if (missing.length) { failed++; console.error('FAIL locales differ:', missing.join(', ')); }
await ctx.close();
fs.rmSync(userDataDir, { recursive: true, force: true });
console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
process.exit(failed ? 1 : 0);
