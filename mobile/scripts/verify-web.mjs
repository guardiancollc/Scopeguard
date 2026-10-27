import { readFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const www = join(root, 'www');
for (const asset of ['index.html','plans.html','team.html','app.js','plans-ui.js','team-ui.js','native-config.js','native-runtime.js','styles.css','scopeguard-logo.png']) {
  assert((await stat(join(www,asset))).size > 0, asset + ' must be staged and nonempty');
}
const nativeConfig = await readFile(join(www,'native-config.js'),'utf8');
assert(nativeConfig.includes('apiBaseUrl:null'),'Native API must remain unconfigured until approved');
assert(nativeConfig.includes('billingEnabled:false'),'Native billing must remain disabled');
const index = await readFile(join(www,'index.html'),'utf8');
assert(index.includes('src="native-runtime.js"'),'Native runtime must load on home screen');
assert(index.indexOf('native-runtime.js') < index.indexOf('src="app.js"'),'Native runtime must load before app.js');
for (const page of ['plans.html','team.html']) {
  const html = await readFile(join(www,page),'utf8');
  assert(html.includes('src="native-runtime.js"'), page + ' must load native runtime');
  assert(html.indexOf('native-config.js') < html.indexOf('native-runtime.js'), page + ' must configure before loading runtime');
}
const app = await readFile(join(www,'app.js'),'utf8');
assert(app.includes("!window.SCOPEGUARD_NATIVE?.enabled && 'serviceWorker' in navigator"),'Native app must not register web service worker');
const plans = await readFile(join(www,'plans-ui.js'),'utf8');
assert(plans.includes('nativeBillingBlocked'),'Native plans UI must detect mobile billing restriction');
assert(plans.includes('if(!nativeBillingBlocked&&members[0].role'),'Native plans UI must not expose billing portal');
assert(plans.includes('checkoutButtons.forEach(b=>{b.disabled=true;b.hidden=true;})'),'Native checkout buttons must remain hidden');
const runtime = await readFile(join(www,'native-runtime.js'),'utf8');
assert(runtime.includes("'/api/billing-checkout'"),'Native checkout must be guarded');
assert(runtime.includes("'/api/billing-portal'"),'Native billing portal must be guarded');
console.log('Native mobile asset staging verification passed.');
