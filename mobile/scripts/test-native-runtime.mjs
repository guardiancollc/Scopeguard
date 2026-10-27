import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const path = resolve(fileURLToPath(new URL('../native-runtime.js', import.meta.url)));
const source = await readFile(path,'utf8');

function bridge(config) {
  const calls = [];
  const window = {
    SCOPEGUARD_NATIVE: config,
    fetch: (...args) => { calls.push(args); return Promise.resolve({ok:true}); }
  };
  const document = { readyState:'loading', addEventListener:()=>{}, querySelectorAll:()=>[], getElementById:()=>null };
  vm.runInNewContext(source,{window,document,Set,Promise,Error},{filename:'native-runtime.js'});
  return {window,calls};
}
async function rejects(promise, phrase) {
  await assert.rejects(promise, e => e.message.includes(phrase));
}

const disabled = bridge({enabled:false});
await disabled.window.fetch('/api/subscription-status');
assert.equal(disabled.calls[0][0],'/api/subscription-status');

const unconfigured = bridge({enabled:true,apiBaseUrl:null,billingEnabled:false});
await rejects(unconfigured.window.fetch('/api/subscription-status'),'not configured');
await rejects(unconfigured.window.fetch('/api/billing-checkout',{method:'POST'}),'not available');
await rejects(unconfigured.window.fetch('/api/billing-portal'),'not available');
assert.equal(unconfigured.calls.length,0,'No network call when native backend is not configured');

const configured = bridge({enabled:true,apiBaseUrl:'https://api.example.test/',billingEnabled:false});
await configured.window.fetch('/api/subscription-status?companyId=123',{headers:{Authorization:'Bearer test'}});
assert.equal(configured.calls[0][0],'https://api.example.test/api/subscription-status?companyId=123');
assert.equal(configured.calls[0][1].headers.Authorization,'Bearer test');
await configured.window.fetch('https://public.example.test/file');
assert.equal(configured.calls[1][0],'https://public.example.test/file');
await rejects(configured.window.fetch('/api/billing-checkout'),'not available');

const incorrectlyEnabled = bridge({enabled:true,apiBaseUrl:'https://api.example.test',billingEnabled:true});
await rejects(incorrectlyEnabled.window.fetch('/api/billing-checkout',{method:'POST'}),'not available');
await rejects(incorrectlyEnabled.window.fetch('/api/billing-portal'),'not available');
assert.equal(incorrectlyEnabled.calls.length,0,'Billing flag cannot bypass native purchase restrictions');

const insecure = bridge({enabled:true,apiBaseUrl:'http://api.example.test',billingEnabled:false});
await rejects(insecure.window.fetch('/api/team'),'not configured');
assert.equal(insecure.calls.length,0);

for (const apiBaseUrl of ['https://api.example.test/path','https://user:password@api.example.test','https://api.example.test?x=1','https://api.example.test#fragment']) {
  const invalid = bridge({enabled:true,apiBaseUrl,billingEnabled:false});
  await rejects(invalid.window.fetch('/api/team'),'not configured');
  assert.equal(invalid.calls.length,0,'Unsafe API base URL must not be used: '+apiBaseUrl);
}

console.log('ScopeGuard native network bridge tests passed.');
