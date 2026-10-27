import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const www = join(root, 'www');
for (const asset of ['index.html','plans.html','team.html','app.js','plans-ui.js','team-ui.js','native-config.js','native-runtime.js','styles.css','scopeguard-logo.png']) {
  assert((await stat(join(www,asset))).size > 0, asset + ' must be staged and nonempty');
}
const index = await readFile(join(www,'index.html'),'utf8');
assert(index.includes('src="native-runtime.js"'),'Native runtime must load on home screen');
assert(index.indexOf('native-runtime.js') < index.indexOf('src="app.js"'),'Native runtime must load before app.js');
for (const page of ['plans.html','team.html']) {
  const html = await readFile(join(www,page),'utf8');
  assert(html.includes('src="native-runtime.js"'), page + ' must load native runtime');
}
const app = await readFile(join(www,'app.js'),'utf8');
assert(app.includes("!window.SCOPEGUARD_NATIVE?.enabled && 'serviceWorker' in navigator"),'Native app must not register web service worker');
const runtime = await readFile(join(www,'native-runtime.js'),'utf8');
assert(runtime.includes("'/api/billing-checkout'"),'Native checkout must be guarded');
assert(runtime.includes("'/api/billing-portal'"),'Native billing portal must be guarded');
console.log('Native mobile asset staging verification passed.');
