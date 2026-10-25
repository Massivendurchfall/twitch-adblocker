// Refreshes the bundled Twitch ad blocker (vaft) from TwitchAdSolutions.
// MV3 extensions can't load remote code, so the script is vendored and this
// pulls a new copy when Twitch changes and vaft gets an update.
// Run: npm run update-vaft
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://raw.githubusercontent.com/pixeltris/TwitchAdSolutions/master/vaft/vaft-ublock-origin.js';
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/vaft/vaft.js');

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
let body = await res.text();
// uBlock Origin resource files start with a "name mime-type" line that isn't JS.
body = body.replace(/^twitch-videoad\.js [^\n]*\n/, '');
const version = /ourTwitchAdSolutionsVersion = (\d+)/.exec(body)?.[1] ?? '?';

const header = `// vaft (Twitch ad blocker) by TwitchAdSolutions, version ${version}
// Source: ${SOURCE}
// License: MIT, see LICENSE in this folder. Do not edit by hand; run \`npm run update-vaft\`.
`;
fs.writeFileSync(target, header + body);
console.log(`Updated src/vaft/vaft.js to vaft version ${version}`);
