const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { sessionProxy } = require('../libs/server/session-proxy.ts');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
process.env.API_URL = 'http://api.example.test';
const input = { memberEmail: 'guest@example.test', requestId: 'a0000000-0000-4000-8000-000000000000' };
const reset = { token: 'a'.repeat(43), newPassword: 'valid password', confirmPassword: 'valid password' };
async function proxy(action, body, override = {}) {
 const req = { method: 'POST', query: { action }, body, cookies: {}, headers: { host: 'example.test', origin: 'http://example.test', 'content-type': 'application/json', 'x-medconnect-session': '1' }, ...override };
 const res = { headers: {}, statusCode: 200, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; }, end() {} };
 await sessionProxy(req,res); return res;
}
for (const action of ['password-request','password-reset']) test(`${action} fixed route and response allowlists`, async () => {
 global.fetch = async (url, opts) => {
  assert.equal(url, `http://api.example.test/member/password-recovery/${action === 'password-reset' ? 'reset' : 'request'}`);
  assert.equal(opts.headers.Cookie, undefined); assert.equal(opts.headers.Authorization,undefined);
  assert.equal(opts.cache,'no-store'); assert.equal(opts.redirect,'error');
  return Response.json({ accepted:true,passwordChanged:true,accessToken:'private' },{status:action==='password-reset'?200:202});
 };
 const res=await proxy(action,action==='password-reset'?reset:input);
 assert.deepEqual(res.body,action==='password-reset'?{passwordChanged:true}:{accepted:true});
 assert.equal(res.headers['Referrer-Policy'],'no-referrer');
 if(action==='password-request') assert.equal(res.headers['Set-Cookie'],undefined);
 else assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
});
test('rejects origin, method, injected fields and oversized passwords before upstream',async()=>{
 global.fetch=()=>{ throw Error('upstream must not run'); };
 assert.equal((await proxy('password-reset',reset,{method:'GET'})).statusCode,405);
 assert.equal((await proxy('password-reset',reset,{headers:{origin:'https://evil.example'}})).statusCode,403);
 for(const body of [{...reset,redirect:'https://evil.example'},{...reset,newPassword:'x'.repeat(101)},{...reset,token:'invalid'}]) assert.equal((await proxy('password-reset',body)).statusCode,400);
});
test('preserves only invalid-link reason and bounded throttle metadata',async()=>{
 global.fetch=async()=>Response.json({reason:'PASSWORD_RECOVERY_INVALID',token:'private'},{status:400});
 assert.deepEqual((await proxy('password-reset',reset)).body,{reason:'PASSWORD_RECOVERY_INVALID'});
 global.fetch=async()=>Response.json({retryAfterSeconds:60,provider:'private'},{status:429});
 const result=await proxy('password-request',input); assert.equal(result.headers['Retry-After'],'60');
 assert.deepEqual(result.body,{reason:'PASSWORD_RECOVERY_THROTTLED',retryAfterSeconds:60});
});
test('unknown reset result remains ambiguous and never issues a login cookie',async()=>{
 global.fetch=async()=>Response.json({private:'data'},{status:503});
 const result=await proxy('password-reset',reset); assert.equal(result.statusCode,503);
 assert.equal(result.headers['Set-Cookie'],undefined); assert.deepEqual(result.body,{reason:'PASSWORD_RECOVERY_UNAVAILABLE'});
});
const { captureRecoveryToken, recoveryFailure, RecoveryProblem } = require('../libs/password-recovery.ts');
test('fragment capture cleans the URL before validating and reload requires reopening the email',()=>{
 const location={hash:'#token='+'x'.repeat(43)};
 const history={replaceState(data,title,url){assert.equal(url,'/reset-password');location.hash='';}};
 assert.equal(captureRecoveryToken(location,history),'x'.repeat(43));
 assert.equal(captureRecoveryToken(location,history),'');
 location.hash='#token=invalid';assert.equal(captureRecoveryToken(location,history),'');assert.equal(location.hash,'');
});
test('network/parser errors cannot reflect raw payloads and reset timeouts remain ambiguous',()=>{
 assert.equal(recoveryFailure(new Error('private provider response'),true,false),'Recovery is temporarily unavailable. Please try again.');
 assert.match(recoveryFailure(new Error(),true,true),/could not confirm/);
 assert.equal(recoveryFailure(new RecoveryProblem('Request a new link.'),true,false),'Request a new link.');
});
