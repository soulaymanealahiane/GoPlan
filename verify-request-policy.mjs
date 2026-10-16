import assert from 'node:assert/strict';
import {boundedRequest,REQUEST_TIMEOUT_MS,REQUEST_BUDGET_USD} from './server/request-policy.mjs';
import {acquireAdviserLease} from './server/adviser-lease.mjs';
import {localDatabase} from './server/local-db.mjs';
const url='https://api.openai.com/v1/responses';
const request={method:'POST',body:JSON.stringify({model:'gpt-6.1-sol',input:'Synthetic',max_output_tokens:6000,service_tier:'default'})};
assert.equal(REQUEST_TIMEOUT_MS,180000);
assert.equal(REQUEST_BUDGET_USD,0.25);
let calls=0;
const policy=boundedRequest({GOPLAN_TOKEN_COUNTER:async()=>60000},async()=>{calls++;return Response.json({status:'incomplete'});});
try{await policy.fetcher(url,request);await assert.rejects(()=>policy.fetcher(url,request),e=>e.code==='REQUEST_BUDGET');assert.equal(calls,1,'An incomplete response must retain its spending reserve.');}finally{policy.dispose();}
let allowanceCalls=0;
const allowance=boundedRequest({GOPLAN_TOKEN_COUNTER:async()=>30000},async()=>{allowanceCalls++;return Response.json({status:'incomplete'});});
try{
 // Each call reserves $0.12. Two fit the new cap ($0.24), a third does not.
 await allowance.fetcher(url,request);await allowance.fetcher(url,request);
 await assert.rejects(()=>allowance.fetcher(url,request),e=>e.code==='REQUEST_BUDGET');
 assert.equal(allowanceCalls,2,'Allow $0.24 of reserved work, but stop before exceeding $0.25.');
}finally{allowance.dispose();}
let counted=false,generated=false;
const preflight=boundedRequest({},async(u,init)=>{const body=JSON.parse(init.body);if(u.endsWith('/input_tokens')){counted=true;assert.equal(body.max_output_tokens,undefined);return Response.json({input_tokens:70000});}generated=true;return Response.json({});});
try{await assert.rejects(()=>preflight.fetcher(url,request),e=>e.code==='REQUEST_TOO_LARGE'&&e.retryable===false);assert.ok(counted);assert.equal(generated,false);}finally{preflight.dispose();}
const timed=boundedRequest({GOPLAN_TOKEN_COUNTER:async()=>100},async(_,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})),{timeoutMs:10});
try{await assert.rejects(()=>timed.fetcher(url,request),e=>e.name==='TimeoutError');}finally{timed.dispose();}
const DB=localDatabase(':memory:');
const first=await acquireAdviserLease(DB,'opaque-hash');assert.ok(first);assert.equal(await acquireAdviserLease(DB,'opaque-hash'),null);
const lease=await DB.prepare('SELECT expires_at FROM adviser_leases WHERE id=?').bind('opaque-hash').first();
assert.ok(lease.expires_at-Date.now()>REQUEST_TIMEOUT_MS,'The request lock must outlive the full server deadline.');
await first.release();const second=await acquireAdviserLease(DB,'opaque-hash');assert.ok(second);await first.release();assert.equal(await acquireAdviserLease(DB,'opaque-hash'),null,'An old release cannot remove another request lock.');
await second.release();DB.close();
console.log('Passed exact token preflight, total spending reservations, timeout cancellation, cross-instance request exclusion and safe lease ownership. No live calls.');
