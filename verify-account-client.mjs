import {testSession} from './tests/session-fixture.mjs';
import assert from 'node:assert/strict';
import {createAccountWorkspace} from './dist/accounts.js';
import {emptyWorkspace} from './dist/guidance.js';
import {handleApi} from './server/api.mjs';
import {localDatabase} from './server/local-db.mjs';
const DB=localDatabase(':memory:'),env={DB},base='https://planwithgoplan.com';let user='first',offline=false;
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i],get length(){return storage.size;}};
const nodes=new Map(['save-status','account-button','account-sync-notice'].map(k=>[k,{}]));
let events={};globalThis.document={getElementById:k=>nodes.get(k),addEventListener:(k,fn)=>events[k]=fn};globalThis.window={addEventListener(){}};globalThis.location={assign(){}};globalThis.confirm=()=>true;
const sessions={};for(const id of ['first','second'])sessions[id]=await testSession(DB,id);
const request=(path,opts={})=>new Request(base+path,{...opts,headers:{...opts.headers,Origin:base,...sessions[user]}});
globalThis.fetch=async(path,opts)=>{if(offline)throw Error('Offline');return handleApi(request(path,opts),env);};
await fetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Amina',lastName:'Tester',consentCloud:true})});
let state=emptyWorkspace(),key='',begin=false;
const setup=()=>createAccountWorkspace({read:()=>state,render(){},notify(){},modal(){},head(){return '';},close(){},busy:()=>false,open:(s,k,b=false)=>{state=s;key=k;begin=b;}});
let account=setup();await account.boot();assert.equal(account.phase,'choose');assert.equal(account.profile.firstName,'Amina');await account.prepareNew();assert.equal(begin,true);state.journey.questionnaire.ambitions='Build renewable energy systems';account.schedule(state);assert.equal(await account.flush(),true);const firstKey=key;
state=emptyWorkspace();account=setup();await account.boot();assert.equal(account.phase,'ready');assert.equal(state.journey.questionnaire.ambitions,'Build renewable energy systems');assert.equal(key,firstKey);
// Offline edits survive the next browser session and are retried.
offline=true;state.journey.questionnaire.activities='Design and experiment';account.schedule(state);assert.equal(await account.flush(),false);assert.equal(JSON.parse(storage.get(key)).pending,true);offline=false;account=setup();await account.boot();assert.equal(state.journey.questionnaire.activities,'Design and experiment');assert.equal(JSON.parse(storage.get(key)).pending,false);
// Another device wins a revision; this device keeps its unsynced edits.
const saved=JSON.parse(storage.get(key));await fetch('/api/account/workspaces/'+saved.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:saved.revision,state:saved.state})});state.journey.questionnaire.activities='My newer local edit';account.schedule(state);assert.equal(await account.flush(),false);assert.equal(account.phase,'conflict');assert.equal(JSON.parse(storage.get(key)).pending,true);
// Failed cloud loading must not discard the pending copy or conflict state.
offline=true;await events.click({target:{closest:()=>({dataset:{account:'load-cloud'}})},preventDefault(){}});assert.equal(account.phase,'conflict');assert.equal(JSON.parse(storage.get(key)).state.journey.questionnaire.activities,'My newer local edit');offline=false;
await events.click({target:{closest:()=>({dataset:{account:'load-cloud'}})},preventDefault(){}});assert.equal(account.phase,'ready');assert.equal(state.journey.questionnaire.activities,'Design and experiment');
// A different login in another tab cannot receive this student's next save.
user='second';await fetch('/api/account/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({firstName:'Omar',lastName:'Tester',consentCloud:true})});state.journey.questionnaire.ambitions='Private first-user change';account.schedule(state);assert.equal(await account.flush(),false);assert.equal((await (await fetch('/api/account/workspaces')).json()).workspaces.length,0);
DB.close();console.log('Browser account controller: initial plan, cloud restore, offline recovery, revision conflict, failed reload preservation and account-switch isolation passed.');
