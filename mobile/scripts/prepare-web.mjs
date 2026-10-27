import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const repoRoot = resolve(mobileRoot, '..');
const target = join(mobileRoot, 'www');
const assets = ['index.html','plans.html','team.html','styles.css','app.js','plans-ui.js','team-ui.js','scopeguard-logo.png','manifest.webmanifest'];
await mkdir(target, {recursive:true});
for (const name of assets) await copyFile(join(repoRoot,name),join(target,name));
const configPath = join(target,'native-config.js');
if (process.env.SCOPEGUARD_NATIVE_API_URL || process.env.SCOPEGUARD_NATIVE_BILLING_ENABLED) throw new Error('Unreviewed native API or billing configuration is forbidden');
await writeFile(configPath, `window.SCOPEGUARD_NATIVE = Object.freeze({ enabled:true, apiBaseUrl:null, billingEnabled:false });
`);
for (const name of ['index.html','plans.html','team.html']) {
  const path = join(target,name);
  let html = await readFile(path,'utf8');
  if (!html.includes('</head>')) throw new Error(name + ' missing head tag');
  html = html.replace('</head>', ['  <script src="native-config.js"></script>','  <script src="native-runtime.js"></script>','</head>'].join(String.fromCharCode(10)));
  await writeFile(path,html);
}
await copyFile(join(mobileRoot,'native-runtime.js'),join(target,'native-runtime.js'));
const appPath = join(target,'app.js');
let app = await readFile(appPath,'utf8');
if (!app.includes("if('serviceWorker' in navigator){")) throw new Error('Service worker guard not found');
app = app.replace("if('serviceWorker' in navigator){", "if(!window.SCOPEGUARD_NATIVE?.enabled && 'serviceWorker' in navigator){");
await writeFile(appPath,app);
console.log('ScopeGuard mobile web assets staged in mobile/www.');
console.warn('NOT STORE-READY: Native API origin, auth redirect, and platform billing integration remain blocked.');
