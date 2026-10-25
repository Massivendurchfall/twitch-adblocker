# Twitch Adblocker

Chrome extension (Manifest V3) that blocks **ads on Twitch** and leaves every other site alone. Works in Chrome, Edge, Brave, Opera and other Chromium browsers. The interface follows the browser language (English or German).

## Install

1. Download `twitch-adblocker-<version>.zip` from the [latest release](../../releases/latest) and extract it.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the extracted folder (the one with `manifest.json` in it).
5. Reload any open Twitch tabs.

Keep the folder where it is afterwards, the browser loads the extension from there on every start.

The toolbar icon pauses the blocker and shows how many ad breaks it has blocked so far. **Settings** (or right click on the icon, then *Options*) opens the settings page.

## Settings

| Switch | Default | What it does |
|---|---|---|
| Ad blocker active | on | Main switch for everything |
| Block ad breaks in the stream | on | vaft, see below |
| Hide display ads | on | Banners next to and below the player, ad servers, prompt to allow ads |
| Claim channel points bonus automatically | on | Clicks the bonus box below the chat |

The main switch and the ad switches apply after reloading the page, the bonus switch right away.

## How it works

| Layer | What happens | File |
|---|---|---|
| Stream | Twitch stitches ads into the video stream on the server. Every Twitch page loads [vaft](https://github.com/pixeltris/TwitchAdSolutions), the same script uBlock Origin injects with `twitch.tv##+js(twitch-videoad)`. When an ad shows up in the stream, vaft fetches an ad-free backup version of the stream in the background and plays that instead. The player shows "Blocking ads" in the top left meanwhile. | `src/vaft/vaft.js` |
| Network | Twitch's ad server (`edge.ads.twitch.tv`) and the ad networks Twitch loads for display ads (amazon-adsystem, doubleclick, googlesyndication, flashtalking) are blocked with `declarativeNetRequest`. | `rules/ads.json` |
| Page | Ad banners next to and below the player and the "allow ads or buy Turbo" overlay are hidden, and the player keeps its full height. Selectors from EasyList and the uBlock filters. | `src/cosmetic.css` |
| Counter and bonus | Counts every ad break during which vaft shows its overlay, and claims the channel points bonus. | `src/extras.js` |

It also runs in embedded Twitch players on other sites.

## Updating vaft

Manifest V3 extensions can't load code from the internet, so a copy lives in `src/vaft/vaft.js` (MIT, see `src/vaft/LICENSE`). When Twitch changes something and ads get through again, there is usually a vaft update already:

```bash
npm run update-vaft
npm run zip
```

Then reload the extension in `chrome://extensions`.

## Testing

```bash
npm install
npm test
TEST_LANG=de npm test
```

The test starts a headless Chromium with the extension, serves fake Twitch pages with ads in the stream and on the page, and checks that all of them are blocked. It also covers the counter, the bonus, every switch, the settings page, the popup and both languages.

## Building the zip

```bash
npm run zip
```

Writes `twitch-adblocker-<version>.zip` with `manifest.json` at the top, without tests and scripts.

## Licenses

vaft: MIT, TwitchAdSolutions (`src/vaft/LICENSE`). Icon: "ad-off" from [Tabler Icons](https://tabler.io/icons), MIT (`icons/LICENSE`).
