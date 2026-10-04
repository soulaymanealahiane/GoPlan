import {hash} from './feedback.mjs';
const DAY=86400000,SESSION_MS=30*DAY;
const cookies=request=>Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(s=>s.trim().split('=')));
const secure=request=>new URL(request.url).protocol==='https:';
const cookieName=request=>secure(request)?'__Host-goplan-session':'goplan-local-session';
const headers={'Cache-Control':'private, no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff'};
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const cache=new WeakMap();
const setupName=request=>secure(request)?'__Secure-goplan-password':'goplan-local-password';
const setupCookie=(request,value,seconds)=>`${setupName(request)}=${value}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure(request)?'; Secure':''}`;
export function authConfigured(env){return !!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY);}
export async function accountIdentity(request,env){
 if(cache.has(request))return cache.get(request);
 const promise=(async()=>{if(!env.DB)return null;const raw=cookies(request)[cookieName(request)];if(!/^[a-f0-9]{64}$/.test(raw||''))return null;
 return await env.DB.prepare('SELECT user_id AS id,email FROM auth_sessions WHERE token_hash=? AND expires_at>?').bind(await hash(raw),Date.now()).first();})();cache.set(request,promise);return promise;
}
function sessionCookie(request,value,seconds=SESSION_MS/1000){return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure(request)?'; Secure':''}`;}
async function readBody(request){if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('Use JSON.',415);const reader=request.body?.getReader();if(!reader)fail('Missing request.');let n=0,parts=[];while(true){const {value,done}=await reader.read();if(done)break;n+=value.length;if(n>2048){await reader.cancel();fail('Request too large.',413);}parts.push(value);}const all=new Uint8Array(n);let i=0;for(const p of parts){all.set(p,i);i+=p.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{fail('Invalid request.');}}
async function limit(db,key,max,windowMs){const bucket=Math.floor(Date.now()/windowMs),id=await hash(key+':'+bucket);const row=await db.prepare('INSERT INTO auth_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,(bucket+1)*windowMs).first();if(row.count>max)fail('Too many sign-in attempts. Please wait a few minutes and try again.',429);}
async function provider(env,path,data,fetcher,token=''){const base=new URL(env.SUPABASE_URL);if(base.protocol!=='https:'||!base.hostname.endsWith('.supabase.co'))fail('Sign-in configuration needs attention.',503);let r;try{r=await fetcher(base.origin+'/auth/v1/'+path,{method:token?'PUT':'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_PUBLISHABLE_KEY,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});}catch{fail('Sign-in is temporarily unavailable. Please try again.',503);}let result;try{result=await r.json();}catch{fail('Sign-in is temporarily unavailable.',503);}if(!r.ok)fail(r.status===429?'Please wait a minute before requesting another code.':path==='verify'?'That code is invalid or expired. Request another code.':path.startsWith('token')?'Email or password is incorrect.':path==='user'?'Could not save this password. Try a different password or request a new code.':'We could not send a code. Please try again shortly.',r.status===429?429:400);return result;}
export async function authEndpoint(request,env,options={}){
 const url=new URL(request.url);
 if(url.pathname==='/api/auth/status'&&request.method==='GET')return json({configured:authConfigured(env)});
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open sign-in from GoPlan.'},403);
 try{
  if(!env.DB)fail('Sign-in is temporarily unavailable.',503);
  if(url.pathname==='/api/auth/signout'){const raw=cookies(request)[cookieName(request)];if(raw)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(raw)).run();const setup=cookies(request)[setupName(request)];if(setup)await env.DB.prepare('DELETE FROM auth_password_tickets WHERE token_hash=?').bind(await hash(setup)).run();const response=json({signedOut:true},200,{'Set-Cookie':sessionCookie(request,'',0)});response.headers.append('Set-Cookie',setupCookie(request,'',0));return response;}
  if(!['/api/auth/send','/api/auth/verify','/api/auth/login','/api/auth/password'].includes(url.pathname))return json({error:'Not found.'},404);
  if(!authConfigured(env))fail('Email sign-in is being connected. Please try again later.',503);
  const data=await readBody(request),email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email address.');
  const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||options.clientAddress||'unknown';
  await env.DB.batch([env.DB.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<?').bind(now),env.DB.prepare('DELETE FROM auth_password_tickets WHERE expires_at<?').bind(now)]);
  await limit(env.DB,'ip:'+ip,40,10*60000);
  const fetcher=options.authFetcher||fetch;
  if(url.pathname.endsWith('/send')){await limit(env.DB,'send:'+email,1,60000);await limit(env.DB,'send-hour:'+email,12,3600000);await provider(env,'otp',{email,create_user:true},fetcher);return json({sent:true});}
  let result;
  if(url.pathname.endsWith('/login')){
   if(typeof data.password!=='string'||!data.password||data.password.length>128)fail('Enter your password.');
   await limit(env.DB,'login:'+email,10,10*60000);
   result=await provider(env,'token?grant_type=password',{email,password:data.password},fetcher);
  }else if(url.pathname.endsWith('/verify')){
   if(typeof data.code!=='string'||!/^\d{6,8}$/.test(data.code))fail('Enter the code from your email.');
   await limit(env.DB,'verify:'+email,10,10*60000);
   result=await provider(env,'verify',{email,token:data.code,type:'email'},fetcher);
   if(!result.user?.email_confirmed_at||result.user.email?.toLowerCase()!==email||!result.access_token)fail('Your email could not be verified.',401);
   const previous=cookies(request)[setupName(request)];if(previous)await env.DB.prepare('DELETE FROM auth_password_tickets WHERE token_hash=?').bind(await hash(previous)).run();
   await env.DB.prepare('INSERT OR REPLACE INTO auth_password_tickets(token_hash,user_id,email,expires_at) VALUES(?,?,?,?)').bind(await hash(result.access_token),result.user.id,email,now+300000).run();
   return json({verified:true},200,{'Set-Cookie':setupCookie(request,result.access_token,300)});
  }else{
   if(typeof data.password!=='string'||data.password.length<12||data.password.length>128)fail('Use a password between 12 and 128 characters.');
   await limit(env.DB,'password:'+email,10,10*60000);
   const token=cookies(request)[setupName(request)];if(!token)fail('Verify your email first.',401);
   const ticket=await env.DB.prepare('DELETE FROM auth_password_tickets WHERE token_hash=? AND email=? AND expires_at>? RETURNING user_id').bind(await hash(token),email,now).first();
   if(!ticket)fail('Your verification expired. Request another code.',401);
   const user=await provider(env,'user',{password:data.password},fetcher,token);
   if(user.id!==ticket.user_id||user.email?.toLowerCase()!==email||!user.email_confirmed_at)fail('Your account could not be verified.',401);
   result={user};
  }
  const u=result.user;
  if(!u?.id||u.email?.toLowerCase()!==email||!u.email_confirmed_at)fail('Your email could not be verified.',401);
  const subject=await hash('supabase:'+u.id);let mapping=await env.DB.prepare('SELECT user_id FROM auth_identities WHERE subject=?').bind(subject).first();
  if(!mapping){
   // Email ownership is proved above. Reuse exactly one legacy profile; never trust a browser-supplied profile ID.
   const legacy=(await env.DB.prepare('SELECT id FROM student_profiles WHERE lower(email)=? LIMIT 2').bind(email).all()).results;
   if(legacy.length>1)fail('Please contact GoPlan to reconnect your existing plans.',409);
   const uid=legacy[0]?.id||subject;await env.DB.prepare('INSERT OR IGNORE INTO auth_identities(subject,user_id) VALUES(?,?)').bind(subject,uid).run();mapping=await env.DB.prepare('SELECT user_id FROM auth_identities WHERE subject=?').bind(subject).first();
  }
  if(url.pathname.endsWith('/password'))await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(mapping.user_id).run();
  const previous=cookies(request)[cookieName(request)];if(previous)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await hash(previous)).run();
  const raw=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('INSERT INTO auth_sessions(token_hash,user_id,email,expires_at) VALUES(?,?,?,?)').bind(await hash(raw),mapping.user_id,email,now+SESSION_MS).run();
  const response=json({signedIn:true},200,{'Set-Cookie':sessionCookie(request,raw)});response.headers.append('Set-Cookie',setupCookie(request,'',0));return response;
 }catch(e){return json({error:e.status?e.message:'Sign-in is temporarily unavailable. Please try again.'},e.status||503);}
}
