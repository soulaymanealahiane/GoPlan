import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {localDatabase} from './server/local-db.mjs';
import {handleApi} from './server/api.mjs';
import {websiteTrafficSnapshot,recordWebsiteInquiry} from './server/website-analytics.mjs';
import {testSession} from './tests/session-fixture.mjs';
import {hash} from './server/feedback.mjs';

const base='https://planwithgoplan.com',DB=localDatabase(':memory:'),env={DB,ADMIN_EMAILS:'owner@example.invalid',ANALYTICS_ADMIN_KEY:'synthetic-metrics-key'},now=Date.now();
const owner=await testSession(DB,'traffic-owner','owner@example.invalid'),student=await testSession(DB,'traffic-student');
const data={consent:true,visitorId:crypto.randomUUID(),visitId:crypto.randomUUID(),viewId:crypto.randomUUID(),path:'/',source:'social',device:'mobile',activeMs:0,events:{}};
const req=(path,body,headers={})=>new Request(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json','User-Agent':'Mozilla/5.0','CF-IPCountry':'MA',...headers},body:body===undefined?undefined:JSON.stringify(body)});
const post=(body=data,at=now,headers={})=>handleApi(req('/api/website-analytics',body,headers),env,{now:at});
assert.equal((await post()).status,200);
await post({...data,activeMs:30000,events:{nav_talk:1,form_start:1}},now+30000);
await post({...data,activeMs:30000,events:{nav_talk:1,form_start:1}},now+30000);
await post({...data,activeMs:1000,events:{nav_talk:0}},now+15000);
let row=await DB.prepare('SELECT * FROM website_views').first();assert.equal(row.active_ms,30000);assert.equal(row.nav_talk,1);assert.equal(row.last_seen_at,now+30000);
assert.ok(!JSON.stringify(row).includes(data.visitorId));assert.ok(!JSON.stringify(row).includes(data.visitId));
await post({...data,path:'/demo',activeMs:14400000,events:{}});assert.equal((await DB.prepare('SELECT path,active_ms FROM website_views').first()).path,'/','A reused view cannot change pages');
await post({...data,activeMs:14400000},now+40000);assert.equal((await DB.prepare('SELECT active_ms FROM website_views').first()).active_ms,40000,'Engagement bounded by server elapsed time');
await post({...data,viewId:crypto.randomUUID(),path:'/demo'});
await post({...data,viewId:crypto.randomUUID(),visitId:crypto.randomUUID()});
await post({...data,viewId:crypto.randomUUID(),visitorId:crypto.randomUUID(),visitId:crypto.randomUUID(),source:'direct'});
let snapshot=await websiteTrafficSnapshot(env,7,now+45000);assert.equal(snapshot.totals.visitors,2);assert.equal(snapshot.totals.visits,3);assert.equal(snapshot.totals.pageViews,4);assert.equal(snapshot.totals.talkClicks,1);assert.equal(snapshot.previous,null);assert.equal(snapshot.rows.length,7);assert.equal(snapshot.rows.at(-1).visitors,2);
for(const [headers,body] of [[{'DNT':'1'},data],[{'Sec-GPC':'1'},data],[{'User-Agent':'Googlebot'},data],[owner,data]])assert.equal((await (await post(body,now,headers)).json()).excluded,true);
for(const body of [{...data,consent:false},{...data,path:'/admin'},{...data,path:'/?email=private@example.com'},{...data,name:'Private'},{...data,activeMs:-1},{...data,activeMs:1.5},{...data,events:{inquiry_saved:1}},{...data,events:{nav_talk:101}},{...data,visitorId:'not-an-id'}])assert.equal((await post(body)).status,400);
assert.equal((await post(data,now,{Origin:'https://evil.example'})).status,403);
assert.equal((await post(data,now,{'Sec-Fetch-Site':'cross-site'})).status,403);
assert.equal((await handleApi(new Request('http://127.0.0.1:4415/api/website-analytics',{method:'POST',headers:{Origin:'http://127.0.0.1:4415'}}),env)).status,200);
assert.equal((await (await handleApi(req('/api/website-analytics',data),{...env,WEBSITE_ANALYTICS_ENABLED:'false'})).json()).excluded,true);
assert.equal((await post({...data,extra:'x'.repeat(3000)})).status,413);
const rateId=await hash('website-rate:unknown:'+Math.floor(now/3600000));await DB.prepare('UPDATE auth_limits SET count=1800 WHERE id=?').bind(rateId).run();assert.equal((await post()).status,429);await DB.prepare('UPDATE auth_limits SET count=0 WHERE id=?').bind(rateId).run();

const inquiry={submissionId:crypto.randomUUID(),name:'Synthetic analytics test',email:'synthetic@example.invalid',university:'Synthetic institution',message:'Offline conversion verification; no external delivery.',traffic:{visitorId:data.visitorId,visitId:data.visitId,viewId:data.viewId}};
assert.equal((await handleApi(req('/api/partnerships',inquiry),env)).status,201);
assert.equal((await handleApi(req('/api/partnerships',inquiry),env)).status,201);
assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM website_conversions').first()).n,1,'Server-confirmed replay counts once');
snapshot=await websiteTrafficSnapshot(env,7,now+45000);assert.equal(snapshot.totals.savedInquiries,1);assert.equal(snapshot.totals.trackedInquiries,1);assert.equal(snapshot.funnel.submitted,1);assert.equal(snapshot.funnel.clicked,1);assert.equal(snapshot.funnel.started,1);
await recordWebsiteInquiry(req('/api/partnerships',inquiry),env,crypto.randomUUID(),{...inquiry.traffic,visitorId:crypto.randomUUID()});assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM website_conversions').first()).n,1,'Unmatched attribution ignored');
const oldInquiry={...inquiry,submissionId:crypto.randomUUID(),traffic:undefined};assert.equal((await handleApi(req('/api/partnerships',oldInquiry),env)).status,201);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM website_conversions').first()).n,1,'Consent-free inquiry succeeds without attribution');
await DB.prepare('UPDATE partnership_inquiries SET created_at=? WHERE id=?').bind(now-2*3600000,oldInquiry.submissionId).run();assert.equal((await handleApi(req('/api/partnerships',{...oldInquiry,traffic:inquiry.traffic}),env)).status,201);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM website_conversions').first()).n,1,'An old inquiry replay cannot create a new conversion');
for(const headers of [{},student])assert.equal((await handleApi(req('/api/admin/website-analytics',undefined,headers),env)).status,401);
assert.equal((await handleApi(req('/api/admin/website-analytics',undefined,{Authorization:'Bearer synthetic-metrics-key'}),env)).status,403);
let response=await handleApi(req('/api/admin/website-analytics?days=7',undefined,owner),env);assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.ok(!(await response.text()).includes('synthetic@example.invalid'));
assert.equal((await handleApi(req('/api/admin/website-export?format=csv',undefined,owner),env)).status,200);
assert.equal((await handleApi(req('/api/admin/website-export?format=html',undefined,owner),env)).status,400);
assert.equal((await handleApi(req('/api/admin/website-analytics',undefined,{...owner,Origin:'https://evil.example'}),env)).status,403);
const broken={...env,DB:{...DB,prepare(sql){if(sql.includes('website_'))throw Error('Synthetic analytics outage');return DB.prepare(sql);}}};
assert.equal((await handleApi(req('/api/partnerships',{...inquiry,submissionId:crypto.randomUUID()}),broken)).status,201,'Measurement failure cannot prevent inquiry persistence');
const old={...data,viewId:crypto.randomUUID(),events:{}};await post(old,now-92*86400000);await post(data,now);assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM website_views WHERE started_at<?').bind(now-90*86400000).first()).n,0);
await DB.prepare("UPDATE website_analytics_meta SET started_at=? WHERE id='collection'").bind(now-40*86400000).run();snapshot=await websiteTrafficSnapshot(env,7,now+45000);assert.ok(snapshot.previous);assert.equal((await websiteTrafficSnapshot(env,90,now)).previous,null,'Unavailable retention window is not presented as a baseline');
DB.close();

// Run the actual browser tracker with synthetic storage, clocks and events.
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={};}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(){} addEventListener(name,cb){this.listeners[name]=cb;} remove(){this.removed=true;}
}
const store=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key),data};};
const localStorage=store(),sessionStorage=store(),body=new Element('body'),head=new Element('head'),handlers={},docHandlers={},form=new Element('form'),calculator=new Element('form'),requests=[];
let clock=0,wall=now,interval;
const document={body,head,visibilityState:'visible',referrer:'https://www.linkedin.com/feed/',createElement:tag=>new Element(tag),querySelector:s=>s==='#contact-form'?form:s==='#offer-calculator'?calculator:null,addEventListener:(name,cb)=>docHandlers[name]=cb};
const browser={document,localStorage,sessionStorage,crypto,Blob,URL,URLSearchParams,console,location:{hostname:'planwithgoplan.com',pathname:'/',origin:base,href:base+'/',search:'?utm_source=private-value'},navigator:{userAgent:'Mozilla mobile',sendBeacon:(url,blob)=>{requests.push({url,blob});return true;}},performance:{now:()=>clock},Date:class extends Date{static now(){return wall;}},addEventListener:(name,cb)=>handlers[name]=cb,setInterval:cb=>(interval=cb,1),clearInterval:()=>{interval=null;},fetch:async(url,options)=>{requests.push({url,data:JSON.parse(options.body)});return Response.json({accepted:true});}};
const script=(await readFile(new URL('./dist/website-analytics.js',import.meta.url),'utf8')).replaceAll('export function ','function ');
const context=vm.createContext(browser);vm.runInContext(script,context);
assert.equal(requests.length,0,'No collection before choice');
let banner=body.children.find(n=>n.className==='goplan-analytics-choice');banner.children.at(-1).children[1].listeners.click();await new Promise(setImmediate);
assert.equal(requests.length,1);assert.equal(requests[0].data.source,'campaign');assert.ok(!JSON.stringify(requests).includes('private-value'));
clock=30000;wall+=30000;interval();await new Promise(setImmediate);assert.equal(requests.at(-1).data.activeMs,30000);
document.visibilityState='hidden';docHandlers.visibilitychange();const hiddenCount=requests.length;clock+=120000;wall+=120000;interval();assert.equal(requests.length,hiddenCount,'No hidden-tab heartbeats');
document.visibilityState='visible';docHandlers.visibilitychange();clock+=10000;wall+=10000;interval();await new Promise(setImmediate);assert.ok(requests.at(-1).data.activeMs<=60000,'Background and idle time excluded');
handlers.pointerdown();const button={hasAttribute:()=>false,closest:s=>s==='.site-header'?{}:null};docHandlers.click({target:{closest:s=>s==='[data-contact]'?button:null}});
form.listeners.focusin({target:{matches:()=>true}});assert.ok(context.trafficAttribution());
const beaconData=JSON.parse(await requests.at(-1).blob.text());assert.equal(beaconData.events.nav_talk,1);assert.equal(beaconData.events.form_start,1);
const settingsButton=body.children.find(n=>n.className==='goplan-analytics-settings');settingsButton.listeners.click();banner=body.children.filter(n=>n.className==='goplan-analytics-choice').at(-1);banner.children.at(-1).children[0].listeners.click();const afterDecline=requests.length;
assert.equal(context.trafficAttribution(),null);assert.equal(localStorage.getItem('goplan-analytics-browser-v1'),null);handlers.pointerdown();docHandlers.click({target:{closest:()=>button}});assert.equal(requests.length,afterDecline,'Withdrawal immediately stops collection');
const gpcRequests=[];vm.runInContext(script,vm.createContext({...browser,document:{...document,body:new Element('body')},navigator:{...browser.navigator,globalPrivacyControl:true},localStorage:store(),sessionStorage:store(),fetch:async()=>{gpcRequests.push(1);}}));assert.equal(gpcRequests.length,0,'Global Privacy Control respected');
const storageBlocked={...browser,document:{...document,body:new Element('body')}};Object.defineProperty(storageBlocked,'localStorage',{get(){throw Error('Storage blocked by browser');}});assert.doesNotThrow(()=>vm.runInContext(script,vm.createContext(storageBlocked)),'Blocked storage cannot break the contact module that imports the tracker');
console.log('Website analytics: consent, active/hidden/idle time, withdrawal, GPC, source minimization, deduplicated beacons, visitor/visit distinction, server conversions, failed storage isolation, owner/bot/local exclusion, private exports, authorization, bounded input and 90-day retention passed. Synthetic data only.');
