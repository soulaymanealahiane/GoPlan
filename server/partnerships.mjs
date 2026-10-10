import {hash} from './feedback.mjs';
const error=(message,status)=>{throw Object.assign(Error(message),{status});};
export async function partnershipEndpoint(request,env,options={}){
 const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Open this form from GoPlan.'},403);
 try{
  if(!env.DB)error('The contact form is temporarily unavailable. Please retry.',503);
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))error('Use JSON.',415);
  const reader=request.body?.getReader();if(!reader)error('Missing inquiry.',400);let size=0,chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000){await reader.cancel();error('Keep your inquiry under 2,000 characters.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{error('Invalid inquiry.',400);}
  if(!data||typeof data!=='object'||Array.isArray(data))error('Invalid inquiry.',400);
  if(data.website)return json({reference:'received'});
  for(const [key,max] of [['name',120],['email',254],['university',180],['message',2000]])if(typeof data[key]!=='string'||!data[key].trim()||data[key].length>max)error('Please complete each field within its length limit.',400);
  const email=data.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))error('Enter a valid work email.',400);
  const now=Date.now(),bucket=Math.floor(now/3600000),ip=request.headers.get('CF-Connecting-IP')||options.clientAddress||'unknown',id=await hash('partnership:'+ip+':'+bucket);
  const count=await env.DB.prepare('INSERT INTO auth_limits(id,count,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count').bind(id,(bucket+1)*3600000).first();if(count.count>5)error('Please wait before sending another inquiry.',429);
  await env.DB.prepare('DELETE FROM partnership_inquiries WHERE created_at<?').bind(now-180*86400000).run();
  const reference=crypto.randomUUID();await env.DB.prepare('INSERT INTO partnership_inquiries(id,name,email,university,message,created_at) VALUES(?,?,?,?,?,?)').bind(reference,data.name.trim(),email,data.university.trim(),data.message.trim(),now).run();
  return json({reference:reference.slice(0,8)},201);
 }catch(e){return json({error:e.status?e.message:'Your inquiry could not be saved. Please retry.'},e.status||503);}
}
