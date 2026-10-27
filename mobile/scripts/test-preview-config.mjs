import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const script = resolve(root, 'scripts/prepare-web.mjs');
const config = resolve(root, 'www/native-config.js');
const baseEnv = {...process.env};
delete baseEnv.SCOPEGUARD_NATIVE_PREVIEW_API_URL;
delete baseEnv.SCOPEGUARD_NATIVE_API_URL;
delete baseEnv.SCOPEGUARD_NATIVE_BILLING_ENABLED;
function stage(extra = {}) {
  return execFileSync(process.execPath,[script],{env:{...baseEnv,...extra},encoding:'utf8'});
}
try {
  stage({SCOPEGUARD_NATIVE_PREVIEW_API_URL:'https://scopeguard-preview.vercel.app'});
  const source = await readFile(config,'utf8');
  assert(source.includes('"apiBaseUrl":"https://scopeguard-preview.vercel.app"'));
  assert(source.includes('"billingEnabled":false'));
  for (const url of ['https://scope-guard-80.vercel.app','http://scopeguard-preview.vercel.app','https://example.com']) {
    assert.throws(()=>stage({SCOPEGUARD_NATIVE_PREVIEW_API_URL:url}),/Only the explicitly allowlisted/);
  }
  assert.throws(()=>stage({SCOPEGUARD_NATIVE_BILLING_ENABLED:'true'}),/Unreviewed native API/);
  console.log('Native Preview API allowlist tests passed.');
} finally {
  stage();
}
const defaultSource = await readFile(config,'utf8');
assert(defaultSource.includes('"apiBaseUrl":null'),'Default build must remain disconnected');
