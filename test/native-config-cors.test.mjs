import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('../api/config.js');

function request(origin, environment, method='GET') {
  const previous = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = environment;
  const headers = {};
  const res = {
    setHeader(k,v){headers[k]=v;},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;},
    end(){this.ended=true;return this;}
  };
  try { handler({method,headers:{origin}},res); }
  finally { if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous; }
  return {headers,res};
}
for(const origin of ['capacitor://localhost','http://localhost']){
  const {headers,res}=request(origin,'preview');
  assert.equal(headers['Access-Control-Allow-Origin'],origin);
  assert.equal(res.code,200);
  assert(res.body.supabasePublishableKey);
  assert.equal(request(origin,'preview','OPTIONS').res.code,204);
  assert.equal(request(origin,'production').headers['Access-Control-Allow-Origin'],undefined);
}
assert.equal(request('https://evil.example','preview').headers['Access-Control-Allow-Origin'],undefined);
assert.equal(request('capacitor://evil.example','preview').headers['Access-Control-Allow-Origin'],undefined);
assert.equal(request('http://localhost','preview','POST').res.code,405);
console.log('Preview-only native config CORS tests passed.');

const teamHandler = require('../api/team.js');
async function teamPreflight(origin, environment) {
  const previous=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV=environment;
  const headers={};
  const res={
    setHeader(k,v){headers[k]=v;},
    status(code){this.code=code;return this;},
    end(){this.ended=true;return this;}
  };
  try { await teamHandler({method:'OPTIONS',headers:{origin}},res); }
  finally { if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous; }
  return {headers,res};
}
for(const origin of ['capacitor://localhost','http://localhost']){
  const result=await teamPreflight(origin,'preview');
  assert.equal(result.res.code,204);
  assert.equal(result.headers['Access-Control-Allow-Origin'],origin);
  assert(result.headers['Access-Control-Allow-Headers'].includes('Authorization'));
  assert.equal((await teamPreflight(origin,'production')).headers['Access-Control-Allow-Origin'],undefined);
}
assert.equal((await teamPreflight('https://evil.example','preview')).headers['Access-Control-Allow-Origin'],undefined);
console.log('Preview-only native team CORS tests passed.');

const aiHandler=require('../api/ai-invoice-draft.js');
async function aiPreflight(origin,environment){
 const previous=process.env.VERCEL_ENV;
 process.env.VERCEL_ENV=environment;
 const headers={};
 const res={setHeader(k,v){headers[k]=v;},status(code){this.code=code;return this;},end(){this.ended=true;return this;}};
 try{await aiHandler({method:'OPTIONS',headers:{origin}},res);}
 finally{if(previous===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=previous;}
 return {headers,res};
}
for(const origin of ['capacitor://localhost','http://localhost']){
 const result=await aiPreflight(origin,'preview');
 assert.equal(result.res.code,204);
 assert.equal(result.headers['Access-Control-Allow-Origin'],origin);
 assert(result.headers['Access-Control-Allow-Headers'].includes('Authorization'));
 assert.equal((await aiPreflight(origin,'production')).headers['Access-Control-Allow-Origin'],undefined);
}
assert.equal((await aiPreflight('https://evil.example','preview')).headers['Access-Control-Allow-Origin'],undefined);
console.log('Preview-only native AI Invoice CORS tests passed.');
