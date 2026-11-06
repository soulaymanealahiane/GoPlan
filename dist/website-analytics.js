// First-party, optional analytics. Never read form values, account data or URL queries into a payload.
const CHOICE='goplan-analytics-choice-v1',VISITOR='goplan-analytics-browser-v1',VISIT='goplan-analytics-visit-v1',DAY=86400000;
const paths={'/':'/','/index.html':'/','/site-home.html':'/','/demo':'/demo','/demo/':'/demo','/demo/aui':'/demo','/demo.html':'/demo','/signin.html':'/signin.html','/privacy.html':'/privacy.html'};
const path=paths[location.pathname],supported=!!path&&['planwithgoplan.com','goplan-aui-demo-k7m9.salahiane9.chatgpt.site','localhost','127.0.0.1'].includes(location.hostname);
const privacySignal=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
let running=false,excluded=false,visitor,visit,viewId,activeMs=0,events={},lastTick=performance.now(),lastInteraction=lastTick,wasVisible=document.visibilityState==='visible',timer,banner,lastSent='';
const read=(storage,key)=>{try{return JSON.parse(storage.getItem(key));}catch{return null;}};
const choice=()=>{try{const c=read(localStorage,CHOICE);return c&&c.expires>Date.now()?c.value:null;}catch{return null;}};
function source(){
 try{
  if(new URLSearchParams(location.search).has('utm_source'))return 'campaign';
  if(!document.referrer)return 'direct';const r=new URL(document.referrer);if(r.origin===location.origin)return 'direct';
  if(/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org)$/.test(r.hostname))return 'search';
  if(/(^|\.)(linkedin\.com|lnkd\.in|facebook\.com|instagram\.com|twitter\.com|x\.com|t\.co|tiktok\.com|youtube\.com)$/.test(r.hostname))return 'social';
  return 'referral';
 }catch{return 'direct';}
}
const device=()=>/ipad|tablet/i.test(navigator.userAgent)?'tablet':/mobile|android|iphone/i.test(navigator.userAgent)?'mobile':'desktop';
function measure(){const now=performance.now();if(wasVisible)activeMs=Math.min(14400000,activeMs+Math.max(0,Math.min(now,lastInteraction+60000)-lastTick));lastTick=now;wasVisible=document.visibilityState==='visible';}
function ensureVisit(){
 const now=Date.now();if(visit&&(now-visit.at<=1800000||!wasVisible||performance.now()-lastInteraction>60000))return;
 const previous=read(sessionStorage,VISIT);
 visit=previous&&now-previous.at<=1800000?previous:{id:crypto.randomUUID(),at:now,source:source()};
 viewId=crypto.randomUUID();activeMs=0;events={};lastTick=performance.now();lastInteraction=lastTick;
 sessionStorage.setItem(VISIT,JSON.stringify(visit));
}
function payload(){
 if(!running||excluded||privacySignal()||choice()!==true)return null;
 try{ensureVisit();return {consent:true,visitorId:visitor.id,visitId:visit.id,viewId,path,source:visit.source,device:device(),activeMs:Math.floor(activeMs),events:{...events}};}catch{return null;}
}
export function flushTraffic(beacon=false){
 if(!running)return;measure();const data=payload();if(!data)return;
 try{
  if(wasVisible&&performance.now()-lastInteraction<60000){visit.at=Date.now();sessionStorage.setItem(VISIT,JSON.stringify(visit));}
  const body=JSON.stringify(data);if(body===lastSent)return;lastSent=body;
  if(beacon&&navigator.sendBeacon?.('/api/website-analytics',new Blob([body],{type:'application/json'})))return;
  fetch('/api/website-analytics',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,keepalive:true}).then(async r=>{if(!r.ok){lastSent='';return;}if((await r.json()).excluded){excluded=true;stop();}}).catch(()=>{lastSent='';});
 }catch{}
}
export function trafficAttribution(){const data=payload();return data?{visitorId:data.visitorId,visitId:data.visitId,viewId:data.viewId}:null;}
function start(){
 if(!supported||running||excluded||privacySignal()||choice()!==true)return;
 try{
  visitor=read(localStorage,VISITOR);if(!visitor||visitor.expires<=Date.now())visitor={id:crypto.randomUUID(),expires:Date.now()+90*DAY};
  localStorage.setItem(VISITOR,JSON.stringify(visitor));running=true;ensureVisit();lastTick=performance.now();lastInteraction=lastTick;wasVisible=document.visibilityState==='visible';if(wasVisible)flushTraffic();timer=setInterval(()=>{if(document.visibilityState==='visible')flushTraffic();},30000);
 }catch{running=false;}
}
function stop(){running=false;clearInterval(timer);try{localStorage.removeItem(VISITOR);sessionStorage.removeItem(VISIT);}catch{}visit=null;}
function select(value){try{localStorage.setItem(CHOICE,JSON.stringify({value,expires:Date.now()+90*DAY}));}catch{}banner?.remove();banner=null;if(value)start();else stop();}
function settings(){
 banner?.remove();banner=document.createElement('section');banner.className='goplan-analytics-choice';banner.setAttribute('aria-label','Optional website analytics');
 const text=document.createElement('p');text.textContent=privacySignal()?'Your browser privacy setting disables optional analytics.': 'Help us improve GoPlan? Allow visit, active-time and contact-click measurements. Your plan and form answers are never included.';
 const link=document.createElement('a');link.href='/privacy.html#website-analytics';link.textContent='Privacy details';
 const actions=document.createElement('div');
 for(const [label,value] of [['Decline',false],['Allow analytics',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.disabled=value&&privacySignal();button.addEventListener('click',()=>select(value));actions.append(button);}
 banner.append(text,link,actions);document.body.append(banner);
}
function event(name){if(!running||path!=='/')return;try{ensureVisit();events[name]=Math.min(100,(events[name]||0)+1);flushTraffic(true);}catch{}}
if(supported){
 const link=document.createElement('link');link.rel='stylesheet';link.href='/website-analytics.css';document.head.append(link);
 const settingsButton=document.createElement('button');settingsButton.type='button';settingsButton.className='goplan-analytics-settings';settingsButton.textContent='Analytics choices';settingsButton.addEventListener('click',settings);
 (document.querySelector('.footer-bottom div')||document.body).append(settingsButton);
 if(choice()===null&&!privacySignal())settings();else start();
 addEventListener('storage',e=>{if(e.key===CHOICE){if(choice()===true)start();else stop();banner?.remove();banner=null;}});
 for(const name of ['pointerdown','pointermove','keydown','scroll','touchstart'])addEventListener(name,()=>{measure();lastInteraction=performance.now();},{passive:true});
 document.addEventListener('visibilitychange',()=>flushTraffic(true));addEventListener('pagehide',()=>flushTraffic(true));
 addEventListener('pageshow',e=>{if(e.persisted){lastTick=performance.now();lastInteraction=lastTick;wasVisible=document.visibilityState==='visible';flushTraffic();}});
 document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-contact]');
  if(b){const name=b.hasAttribute('data-package-contact')?'package_talk':b.closest('.site-header')?'nav_talk':b.closest('.hero')?'hero_talk':b.closest('.campus-section')?'campus_talk':b.closest('.university-section')?'university_talk':b.closest('.closing-section')?'closing_talk':'footer_contact';event(name);return;}
  const a=e.target.closest?.('a[href]');if(!a)return;
  try{const url=new URL(a.href,location.href);if(url.protocol==='mailto:')event('email_click');else if(url.origin===location.origin&&paths[url.pathname]==='/demo')event('demo_click');}catch{}
 },true);
 document.querySelector('#contact-form')?.addEventListener('focusin',e=>{if(e.target.matches('input:not([name=website]),textarea')&&!events.form_start)event('form_start');});
 document.querySelector('#offer-calculator')?.addEventListener('change',()=>event('package_change'));
}
