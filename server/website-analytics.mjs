import {hash} from './feedback.mjs';
import {ownerIdentity} from './admin-auth.mjs';
import {sanitizeTrafficAttribution,ATTRIBUTION_FIELDS} from '../dist/traffic-attribution.js';

const DAY=86400000,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TRAFFIC_EVENTS=['nav_talk','hero_talk','campus_talk','university_talk','package_talk','closing_talk','footer_contact','form_start','demo_click','email_click','package_change'];
const TALK=TRAFFIC_EVENTS.slice(0,7),PAGES=new Set(['/','/demo','/signin.html','/privacy.html']);
const SOURCES=new Set(['direct','search','social','referral','campaign']),DEVICES=new Set(['desktop','mobile','tablet']);
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const enabled=env=>env.WEBSITE_ANALYTICS_ENABLED!=='false'&&!!env.DB;
export function validateTraffic(data){
 if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(k=>!['consent','visitorId','visitId','viewId','path','source','attribution','device','activeMs','events'].includes(k)))fail('Invalid measurement.');
 // Accept the old true flag for already-open pages, without requiring or inventing consent.
 if(data.consent!==undefined&&data.consent!==true)fail('Invalid measurement.');
 if(!['visitorId','visitId','viewId'].every(k=>UUID.test(data[k]||''))||!PAGES.has(data.path)||!SOURCES.has(data.source)||!DEVICES.has(data.device))fail('Invalid measurement.');
 if(!Number.isInteger(data.activeMs)||data.activeMs<0||data.activeMs>4*3600000)fail('Invalid active time.');
 if(!data.events||Array.isArray(data.events)||typeof data.events!=='object'||Object.keys(data.events).some(k=>!TRAFFIC_EVENTS.includes(k)||!Number.isInteger(data.events[k])||data.events[k]<0||data.events[k]>100))fail('Invalid events.');
 if(data.path!=='/'&&Object.keys(data.events).some(k=>data.events[k]>0))fail('Contact events require the homepage.');
 if(data.attribution!==undefined)try{data.attribution=sanitizeTrafficAttribution(data.attribution);}catch{fail('Invalid attribution.');}
 return data;
}
async function keys(data){return {view:await hash('website-view:'+data.viewId),visit:await hash('website-visit:'+data.visitId),visitor:await hash('website-visitor:'+data.visitorId)};}
async function cleanup(db,now){
 const cutoff=now-90*DAY;
 await db.batch([
  db.prepare('DELETE FROM website_conversions WHERE id IN (SELECT id FROM website_conversions WHERE created_at<? LIMIT 500)').bind(cutoff),
  db.prepare('DELETE FROM website_views WHERE id IN (SELECT id FROM website_views WHERE started_at<? LIMIT 500)').bind(cutoff)
 ]);
}
export async function websiteTrafficEndpoint(request,env,options={}){
 const url=new URL(request.url);
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Use GoPlan on this website.'},403);
 if(!enabled(env)||!['https://planwithgoplan.com','https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site'].includes(url.origin))return json({excluded:true});
 if(request.headers.get('Sec-GPC')==='1'||request.headers.get('DNT')==='1'||/bot|crawler|spider|headless|preview|facebookexternalhit/i.test(request.headers.get('User-Agent')||''))return json({excluded:true});
 try{
  if(await ownerIdentity(request,env))return json({excluded:true});
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},415);
  const reader=request.body?.getReader();if(!reader)fail('Missing measurement.');let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();fail('Measurement too large.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Invalid measurement.');}validateTraffic(data);
  const now=options.now??Date.now(),bucket=Math.floor(now/3600000),ip=request.headers.get('CF-Connecting-IP')||options.clientAddress||'unknown';
  const rateId=await hash('website-rate:'+ip+':'+bucket);
  const rate=await env.DB.prepare('INSERT INTO auth_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(rateId,(bucket+1)*3600000).first();
  if(rate.count>1800)return json({error:'Measurement limit reached.'},429);
  await env.DB.prepare('DELETE FROM auth_limits WHERE id IN (SELECT id FROM auth_limits WHERE expires_at<? LIMIT 100)').bind(now).run();
  const ids=await keys(data),country=/^[A-Z]{2}$/.test(request.headers.get('CF-IPCountry')||'')?request.headers.get('CF-IPCountry'):'Unknown';
  const a=data.attribution;if(a?.landingUrl){try{const landing=new URL(a.landingUrl);if(landing.origin!==url.origin||!['/','/index.html','/site-home.html','/demo','/demo/','/demo/aui','/demo.html','/signin.html','/privacy.html'].includes(landing.pathname))a.landingUrl='';}catch{a.landingUrl='';}}
  const attributionValues=a?[1,...ATTRIBUTION_FIELDS.map(k=>a[k])]:Array(9).fill(null);
  const columns=TRAFFIC_EVENTS.join(','),values=TRAFFIC_EVENTS.map(k=>data.events[k]||0);
  // Cumulative maxima make beacons, retries and out-of-order requests idempotent.
  // Elapsed server time bounds claimed engagement and immutable dimensions cannot be overwritten.
  const updates=['last_seen_at=MAX(last_seen_at,excluded.last_seen_at)','active_ms=MAX(active_ms,MIN(?,MAX(0,excluded.last_seen_at-started_at)))',...TRAFFIC_EVENTS.map(k=>`${k}=MAX(${k},excluded.${k})`)];
  await cleanup(env.DB,now);
  await env.DB.batch([
   env.DB.prepare("INSERT INTO website_analytics_meta(id,started_at) VALUES('collection',?) ON CONFLICT(id) DO NOTHING").bind(now),
   env.DB.prepare(`INSERT INTO website_views(id,visit_id,visitor_id,path,source,device,country,started_at,last_seen_at,active_ms,${columns},attribution_version,referrer_url,landing_url,utm_source,utm_medium,utm_campaign,utm_term,utm_content,utm_id) VALUES(${Array(19+TRAFFIC_EVENTS.length).fill('?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${updates.join(',')} WHERE website_views.visit_id=excluded.visit_id AND website_views.visitor_id=excluded.visitor_id AND website_views.path=excluded.path AND excluded.last_seen_at-website_views.started_at<=14400000`).bind(ids.view,ids.visit,ids.visitor,data.path,data.source,data.device,country,now,now,0,...values,...attributionValues,data.activeMs)
  ]);
  return json({accepted:true});
 }catch(e){return json({error:e.status?e.message:'Measurement unavailable.'},e.status||503);}
}
// Called only after a real inquiry has been durably saved; never from a client success event.
export async function recordWebsiteInquiry(request,env,reference,tracking,now=Date.now()){
 try{
  if(!enabled(env)||!tracking||request.headers.get('DNT')==='1'||request.headers.get('Sec-GPC')==='1'||await ownerIdentity(request,env))return;
  if(typeof tracking!=='object'||Array.isArray(tracking)||Object.keys(tracking).some(k=>!['visitorId','visitId','viewId'].includes(k))||!['visitorId','visitId','viewId'].every(k=>UUID.test(tracking[k]||'')))return;
  const ids=await keys(tracking);
  await env.DB.prepare(`INSERT INTO website_conversions(id,view_id,visit_id,created_at) SELECT ?,v.id,v.visit_id,p.created_at FROM website_views v JOIN partnership_inquiries p ON p.id=? WHERE v.id=? AND v.visit_id=? AND v.visitor_id=? AND v.path='/' AND v.last_seen_at>=? AND v.started_at<=p.created_at AND p.created_at>=? AND p.created_at<=? ON CONFLICT(id) DO NOTHING`).bind(await hash('website-inquiry:'+reference),reference,ids.view,ids.visit,ids.visitor,now-30*60000,now-30*60000,now).run();
 }catch{console.warn('Website inquiry measurement unavailable.');}
}
const talkSql=TALK.join('+');
async function attributionSnapshot(db,start,end){
 // One entry stamp per measured visit, so navigation and repeated beacons cannot inflate these tables.
 const cte=`WITH ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY visit_id ORDER BY started_at,id) AS position FROM website_views WHERE started_at>=? AND started_at<?),entries AS (SELECT * FROM ranked WHERE position=1),converted AS (SELECT DISTINCT visit_id FROM website_conversions WHERE created_at>=? AND created_at<?)`;
 const query=sql=>db.prepare(cte+sql).bind(start,end,start,end);
 const coverage=await query(' SELECT COUNT(*) AS visits,COALESCE(SUM(attribution_version=1),0) AS capturedVisits,COALESCE(SUM(attribution_version=1 AND referrer_url=\'\'),0) AS missingReferrerVisits FROM entries').first();
 const metrics='COUNT(DISTINCT visitor_id) AS visitors,COUNT(*) AS visits,SUM(visit_id IN (SELECT visit_id FROM converted)) AS convertingVisits';
 const referrers=(await query(` SELECT referrer_url AS label,${metrics} FROM entries WHERE attribution_version=1 GROUP BY referrer_url ORDER BY visits DESC,label LIMIT 50`).all()).results;
 const landingPages=(await query(` SELECT landing_url AS label,${metrics} FROM entries WHERE attribution_version=1 GROUP BY landing_url ORDER BY visits DESC,label LIMIT 50`).all()).results;
 const campaigns=(await query(` SELECT utm_source AS utmSource,utm_medium AS utmMedium,utm_campaign AS utmCampaign,utm_term AS utmTerm,utm_content AS utmContent,utm_id AS utmId,${metrics} FROM entries WHERE attribution_version=1 AND (utm_source<>'' OR utm_medium<>'' OR utm_campaign<>'' OR utm_term<>'' OR utm_content<>'' OR utm_id<>'') GROUP BY utm_source,utm_medium,utm_campaign,utm_term,utm_content,utm_id ORDER BY visits DESC,utm_source,utm_campaign LIMIT 50`).all()).results;
 return {...coverage,referrers,landingPages,campaigns};
}
async function summary(db,start,end){
 const r=await db.prepare(`SELECT COUNT(*) AS pageViews,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT visit_id) AS visits,COALESCE(SUM(active_ms),0) AS activeMs,COALESCE(SUM(${talkSql}),0) AS talkClicks FROM website_views WHERE started_at>=? AND started_at<?`).bind(start,end).first();
 const saved=await db.prepare('SELECT COUNT(*) AS n FROM partnership_inquiries WHERE created_at>=? AND created_at<?').bind(start,end).first();
 const converted=await db.prepare('SELECT COUNT(DISTINCT c.visit_id) AS visits,COUNT(*) AS inquiries FROM website_conversions c JOIN website_views v ON v.id=c.view_id WHERE v.started_at>=? AND v.started_at<? AND c.created_at<?').bind(start,end,end).first();
 return {...r,savedInquiries:saved.n,trackedInquiries:converted.inquiries,convertingVisits:converted.visits,avgActiveMs:r.visits?r.activeMs/r.visits:0,conversionRate:r.visits?converted.visits/r.visits*100:0};
}
export async function websiteTrafficSnapshot(env,days=30,now=Date.now()){
 if(!env.DB)throw Error('Website measurements unavailable.');
 days=Math.max(1,Math.min(90,Math.floor(Number(days)||30)));
 await cleanup(env.DB,now);
 const today=new Date(now).toISOString().slice(0,10),end=now+1,start=Date.parse(today+'T00:00:00Z')-(days-1)*DAY,previousStart=start-days*DAY;
 const meta=await env.DB.prepare("SELECT started_at FROM website_analytics_meta WHERE id='collection'").first();
 const totals=await summary(env.DB,start,end);
 const previous=meta&&meta.started_at<=previousStart&&previousStart>=now-90*DAY?await summary(env.DB,previousStart,start):null;
 const daily=(await env.DB.prepare(`SELECT strftime('%Y-%m-%d',started_at/1000,'unixepoch') AS day,COUNT(*) AS pageViews,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT visit_id) AS visits,COALESCE(SUM(active_ms),0) AS activeMs,COALESCE(SUM(${talkSql}),0) AS talkClicks FROM website_views WHERE started_at>=? AND started_at<? GROUP BY day ORDER BY day`).bind(start,end).all()).results;
 const savedDaily=(await env.DB.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') AS day,COUNT(*) AS inquiries FROM partnership_inquiries WHERE created_at>=? AND created_at<? GROUP BY day").bind(start,end).all()).results;
 const dailyMap=new Map(daily.map(r=>[r.day,r])),savedMap=new Map(savedDaily.map(r=>[r.day,r.inquiries]));
 const rows=Array.from({length:days},(_,i)=>{const day=new Date(start+i*DAY).toISOString().slice(0,10);return {day,pageViews:0,visitors:0,visits:0,activeMs:0,talkClicks:0,...dailyMap.get(day),inquiries:savedMap.get(day)||0};});
 const grouped=async column=>(await env.DB.prepare(`SELECT ${column} AS label,COUNT(DISTINCT visitor_id) AS visitors,COUNT(DISTINCT visit_id) AS visits,COUNT(*) AS pageViews,COALESCE(SUM(active_ms),0) AS activeMs FROM website_views WHERE started_at>=? AND started_at<? GROUP BY ${column} ORDER BY pageViews DESC LIMIT 20`).bind(start,end).all()).results;
 const clicks=await env.DB.prepare(`SELECT ${TRAFFIC_EVENTS.map(k=>`COALESCE(SUM(${k}),0) AS ${k}`).join(',')} FROM website_views WHERE started_at>=? AND started_at<?`).bind(start,end).first();
 const funnel=await env.DB.prepare(`WITH visits AS (SELECT visit_id,MAX((${talkSql})>0) AS clicked,MAX(form_start>0) AS started FROM website_views WHERE started_at>=? AND started_at<? GROUP BY visit_id),converted AS (SELECT DISTINCT visit_id FROM website_conversions WHERE created_at>=? AND created_at<?) SELECT COUNT(*) AS visits,COALESCE(SUM(clicked),0) AS clicked,COALESCE(SUM(clicked AND started),0) AS started,COALESCE(SUM(clicked AND started AND visit_id IN (SELECT visit_id FROM converted)),0) AS submitted FROM visits`).bind(start,end,start,end).first();
 return {enabled:enabled(env),days,since:new Date(start).toISOString().slice(0,10),generatedAt:new Date(now).toISOString(),collectionStartedAt:meta?new Date(meta.started_at).toISOString():null,totals,previous,rows,funnel,clicks,attribution:await attributionSnapshot(env.DB,start,end),pages:await grouped('path'),sources:await grouped('source'),countries:await grouped('country'),devices:await grouped('device'),limits:[
  'Website measurements start automatically. Browser privacy signals (DNT/GPC), blockers, known bots, local previews and signed-in owners are excluded. Browser-reported measurements can be incomplete or manipulated.',
  'Automatic collection began on 6 November 2026. Earlier measurements, if present, came from the previous opt-in tracker and may have lower coverage.',
  'Visitors are approximate distinct browsers, not people. The random browser ID expires after 90 days; another device or cleared storage counts again. Visits use a per-tab ID that resets after 30 minutes without activity.',
  'Active time counts visible pages with activity in the last 60 seconds, with a maximum of four hours per page view. Background tabs and idle time are excluded. Beacons are best-effort.',
  'The funnel counts distinct visits through contact click → form start → a saved inquiry. Inquiry conversions are confirmed by the server. All saved inquiries also includes submissions without analytics; email clicks are not confirmed inquiries.',
  'Period visitors are deduplicated across days; daily visitor counts must not be added together. Source, device and country breakdowns count visitors within each group and can overlap.',
  'Detailed attribution begins with this release; older visits remain not captured. Each visit keeps its entry referrer, landing link and UTM tags. Internal navigation does not replace the entry stamp. Tables show the top 50 groups and converting visits, not individual identities.',
  'Referring URLs are limited to what the browser supplies, often only an origin or no referrer. Credentials, fragments, non-UTM query parameters and recognizable sensitive patterns are removed. Approved UTM values are bounded. No attempt is made to bypass browser referrer policies.',
  'Dates use UTC and today is incomplete. Comparisons appear only when the complete prior period is available. No historical visits can be recovered. Measurement records are retained for 90 days and removed on later collection or owner review.'
 ]};
}
export function websiteTrafficExport(snapshot,format='csv',report='daily'){
 if(!['csv','json'].includes(format))fail('Choose CSV or JSON.');
 if(!['daily','attribution'].includes(report))fail('Choose a valid report.');
 const columns=report==='daily'?['day','visitors','visits','pageViews','activeMs','talkClicks','inquiries']:['report','referrerUrl','landingUrl','utmSource','utmMedium','utmCampaign','utmTerm','utmContent','utmId','visitors','visits','convertingVisits'];
 const a=snapshot.attribution||{},records=report==='daily'?snapshot.rows:[...(a.referrers||[]).map(r=>({...r,report:'referrers',referrerUrl:r.label})),...(a.landingPages||[]).map(r=>({...r,report:'entry_links',landingUrl:r.label})),...(a.campaigns||[]).map(r=>({...r,report:'campaigns'}))];
 const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
 const body=format==='json'?JSON.stringify(snapshot,null,2):[columns,...records.map(r=>columns.map(k=>r[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n');
 return new Response(body,{headers:{'Content-Type':format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="GoPlan-website-${snapshot.since}${report==='attribution'?'-attribution':''}.${format}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
