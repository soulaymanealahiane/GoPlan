import assert from 'node:assert/strict';
import fs from 'node:fs';
import {checkSupabase} from './scripts/supabase-watchdog.mjs';
const projectRef='a'.repeat(20),accessToken='synthetic-management-token',publishableKey='synthetic-publishable-key';
const config={projectRef,accessToken,publishableKey,maxWaitMs:50,pollMs:10};
function fixture(states,{health=[200],restore=200,get=200,malformed=false,identity=projectRef,transport='',restoreTransport=false}={}){
 let time=0,reads=0,probes=0;const calls=[];
 return {calls,options:{...config,now:()=>time,wait:async ms=>{time+=ms;},fetcher:async(url,init)=>{
  calls.push({url,method:init.method||'GET'});assert.equal(init.redirect,'error');assert.ok(init.signal);
  if(url.startsWith('https://api.supabase.com/')){
   assert.equal(init.headers.Authorization,'Bearer '+accessToken);assert.equal(init.headers.apikey,undefined);
   assert.ok(url==='https://api.supabase.com/v1/projects/'+projectRef||url==='https://api.supabase.com/v1/projects/'+projectRef+'/restore');
   if(transport)throw Error(transport);
   if(init.method==='POST'){assert.equal(init.body,'{}');if(restoreTransport)throw Error(accessToken);return Response.json({message:accessToken},{status:restore});}
   const status=states[Math.min(reads++,states.length-1)];
   return malformed?new Response('invalid',{status:get}):Response.json({id:identity,status,message:accessToken},{status:get});
  }
  assert.equal(url,'https://'+projectRef+'.supabase.co/auth/v1/health');assert.equal(init.headers.apikey,publishableKey);assert.equal(init.headers.Authorization,undefined);
  const status=health[Math.min(probes++,health.length-1)];if(status==='network')throw Error(accessToken);
  return Response.json({name:'GoTrue',version:'synthetic'},{status});
 }}};
}
let f=fixture(['ACTIVE_HEALTHY']),result=await checkSupabase(f.options);assert.equal(result.healthy,true);assert.equal(result.recovered,false);assert.ok(!f.calls.some(c=>c.method==='POST'));
for(const states of [['INACTIVE','RESTORING','ACTIVE_HEALTHY'],['PAUSING','INACTIVE','INACTIVE','ACTIVE_HEALTHY'],['INACTIVE','INACTIVE','INACTIVE','ACTIVE_HEALTHY']]){
 f=fixture(states);result=await checkSupabase(f.options);assert.equal(result.healthy,true);assert.equal(result.resumeRequested,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
}
f=fixture(['RESTORING','ACTIVE_HEALTHY']);result=await checkSupabase(f.options);assert.equal(result.recovered,true);assert.equal(result.resumeRequested,false);
for(const state of ['ACTIVE_UNHEALTHY','COMING_UP','RESTARTING']){f=fixture([state,'ACTIVE_HEALTHY']);result=await checkSupabase(f.options);assert.equal(result.recovered,true);assert.ok(!f.calls.some(c=>c.method==='POST'));}
for(const state of ['RESTORE_FAILED','REMOVED','UNKNOWN','UPGRADING']){f=fixture([state]);await assert.rejects(()=>checkSupabase(f.options),/owner review/);assert.ok(!f.calls.some(c=>c.method==='POST'));}
f=fixture(['INACTIVE']);result=await checkSupabase({...f.options,autoResume:false});assert.equal(result.maintenance,true);assert.ok(!f.calls.some(c=>c.method==='POST'));
f=fixture(['INACTIVE']);result=await checkSupabase({...f.options,dryRun:true});assert.equal(result.needsResume,true);assert.ok(!f.calls.some(c=>c.method==='POST'));
for(const state of ['INACTIVE','RESTORING','ACTIVE_UNHEALTHY']){f=fixture([state]);await assert.rejects(()=>checkSupabase(f.options),/deadline/);assert.equal(f.calls.filter(c=>c.method==='POST').length,state==='INACTIVE'?1:0);}
for(const health of [[521,503,200],['network',200]]){f=fixture(['ACTIVE_HEALTHY'],{health});result=await checkSupabase(f.options);assert.equal(result.healthy,true);assert.ok(!f.calls.some(c=>c.method==='POST'));}
for(const health of [401,403]){f=fixture(['ACTIVE_HEALTHY'],{health:[health]});await assert.rejects(()=>checkSupabase(f.options),/publishable key/);assert.ok(!f.calls.some(c=>c.method==='POST'));}
for(const get of [401,403,429,500]){f=fixture(['INACTIVE'],{get});await assert.rejects(()=>checkSupabase(f.options),e=>e.message.includes('HTTP '+get)&&!e.message.includes(accessToken));assert.ok(!f.calls.some(c=>c.method==='POST'));}
for(const options of [{identity:'b'.repeat(20)},{malformed:true},{transport:accessToken}]){f=fixture(['INACTIVE'],options);await assert.rejects(()=>checkSupabase(f.options),e=>!e.message.includes(accessToken));assert.ok(!f.calls.some(c=>c.method==='POST'));}
for(const options of [{restore:500},{restoreTransport:true}]){f=fixture(['INACTIVE'],options);await assert.rejects(()=>checkSupabase(f.options),e=>!e.message.includes(accessToken));assert.equal(f.calls.filter(c=>c.method==='POST').length,1);}
for(const bad of [{projectRef:'../another-project'},{accessToken:''},{publishableKey:''}]){f=fixture(['INACTIVE']);await assert.rejects(()=>checkSupabase({...f.options,...bad}));assert.equal(f.calls.length,0);}
const workflow=fs.readFileSync('.github/workflows/supabase-recovery.yml','utf8');assert.ok(workflow.includes('schedule:'));assert.ok(workflow.includes('workflow_dispatch:'));assert.ok(workflow.includes('cancel-in-progress: false'));assert.ok(workflow.includes('contents: read'));assert.ok(workflow.includes('secrets.SUPABASE_ACCESS_TOKEN'));assert.ok(!workflow.includes('pull_request'));assert.ok(!workflow.includes(accessToken));
console.log('Passed independent Supabase recovery: healthy no-op, one restore for confirmed pause, transition/health polling, maintenance/dry run, deadline, wrong identity/key, restricted states, rejected/expired token, uncertain writes, no secret leakage and serialized cloud scheduling. No live project was paused or restored.');
