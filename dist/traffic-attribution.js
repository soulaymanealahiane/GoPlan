// Shared by browser and server: retain attribution, never arbitrary URL secrets.
export const ATTRIBUTION_FIELDS=['referrerUrl','landingUrl','utmSource','utmMedium','utmCampaign','utmTerm','utmContent','utmId'];
const UTM={utm_source:'utmSource',utm_medium:'utmMedium',utm_campaign:'utmCampaign',utm_term:'utmTerm',utm_content:'utmContent',utm_id:'utmId'};
export function safeTag(value){
 if(typeof value!=='string')return '';
 for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(value);if(decoded===value)break;value=decoded;}catch{break;}}
 return value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[redacted]').replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'[redacted]').replace(/[A-Za-z0-9_-]{32,}/g,'[redacted]').replace(/\+?\d[\d ().-]{7,}\d/g,'[redacted]').trim().slice(0,120);
}
export function safeTrafficUrl(value){
 if(typeof value!=='string'||!value||value.length>8192)return '';
 try{
  const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return '';
  let decoded;try{decoded=decodeURIComponent(url.pathname);}catch{return url.origin+'/';}
  const pathname=decoded.split('/').map(p=>encodeURIComponent(safeTag(p))).join('/');
  const clean=new URL(url.origin+pathname);
  for(const [key,value] of url.searchParams)if(Object.hasOwn(UTM,key)&&!clean.searchParams.has(key)){const tag=safeTag(value);if(tag)clean.searchParams.set(key,tag);}
  clean.searchParams.sort();
  return clean.href.length<=2048?clean.href:clean.origin+'/';
 }catch{return '';}
}
export function captureTrafficAttribution(referrer,landing){
 const entry=safeTrafficUrl(landing),out={referrerUrl:safeTrafficUrl(referrer),landingUrl:entry};
 let params;try{params=new URL(entry).searchParams;}catch{params=new URLSearchParams();}
 for(const [key,name] of Object.entries(UTM))out[name]=safeTag(params.get(key)||'');
 return out;
}
export function sanitizeTrafficAttribution(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!ATTRIBUTION_FIELDS.includes(k)))throw Error('Invalid attribution.');
 for(const [key,v] of Object.entries(value))if(typeof v!=='string'||v.length>(key.endsWith('Url')?8192:240))throw Error('Invalid attribution.');
 const out={referrerUrl:safeTrafficUrl(value.referrerUrl||''),landingUrl:safeTrafficUrl(value.landingUrl||'')};
 for(const name of Object.values(UTM))out[name]=safeTag(value[name]||'');
 return out;
}
