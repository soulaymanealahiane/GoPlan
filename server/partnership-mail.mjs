import {offerSummary} from '../dist/university-offer.js';
export const PARTNERSHIP_MAIL_TO='partnerships@planwithgoplan.com';
const from='GoPlan inquiries <notifications@planwithgoplan.com>';
export async function notifyPartnership(id,env,options={}){
 const db=env.DB,now=options.now??Date.now();
 const row=await db.prepare('SELECT * FROM partnership_inquiries WHERE id=?').bind(id).first();
 if(!row)return {state:'missing'};
 if(['accepted','not_requested','review_needed'].includes(row.email_state))return {state:row.email_state};
 if(row.email_state==='failed'&&now-(row.email_updated_at||0)<60000)return {state:'failed'};
 if(!env.RESEND_API_KEY){await db.prepare("UPDATE partnership_inquiries SET email_state='unconfigured',email_error='mail_not_configured',email_updated_at=? WHERE id=? AND email_state<>'accepted'").bind(now,id).run();return {state:'unconfigured'};}
 // Resend deduplicates keys for 24h. Never blindly replay an older ambiguous send.
 if(row.email_attempts>=5||row.email_attempted_at&&now-row.email_attempted_at>23*3600000){await db.prepare("UPDATE partnership_inquiries SET email_state='review_needed',email_error='check_provider_before_retry',email_updated_at=? WHERE id=? AND email_state<>'accepted'").bind(now,id).run();return {state:'review_needed'};}
 const claim=await db.prepare("UPDATE partnership_inquiries SET email_state='sending',email_attempts=email_attempts+1,email_attempted_at=COALESCE(email_attempted_at,?),email_updated_at=? WHERE id=? AND email_state IN ('pending','failed','unconfigured','sending') AND (email_state<>'sending' OR email_updated_at<?)").bind(now,now,id,now-30000).run();
 if(!claim.meta?.changes)return {state:'sending'};
 const text=['New GoPlan university inquiry','Reference: '+id.slice(0,8),'Received: '+new Date(row.created_at).toISOString(),'Name: '+row.name,'Email: '+row.email,'University: '+row.university,'',row.message,...(row.offer_json?['','Selected package (estimate):',offerSummary(JSON.parse(row.offer_json))]:[]),'','Review in GoPlan: https://planwithgoplan.com/admin'].join('\n');
 const body=JSON.stringify({from,to:[PARTNERSHIP_MAIL_TO],reply_to:row.email,subject:'GoPlan university inquiry · '+id.slice(0,8),text});
 const mailFetcher=options.mailFetcher||globalThis.fetch.bind(globalThis);
 let code='mail_unconfirmed';
 for(let attempt=0;attempt<2;attempt++){
  try{
   const response=await mailFetcher('https://api.resend.com/emails',{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'partnership-inquiry/'+id},body,signal:AbortSignal.timeout(5000)});
   let result;try{result=await response.json();}catch{result=null;}
   if(response.ok&&typeof result?.id==='string'&&/^[a-zA-Z0-9_-]{8,100}$/.test(result.id)){
    await db.prepare("UPDATE partnership_inquiries SET email_state='accepted',email_id=?,email_error=NULL,email_updated_at=? WHERE id=?").bind(result.id,now,id).run();
    return {state:'accepted'};
   }
   code='mail_http_'+response.status;
   if(response.status!==429&&response.status<500)break;
  }catch(error){code=/illegal invocation/i.test(error?.message||'')?'mail_transport_binding':['TimeoutError','AbortError'].includes(error?.name)?'mail_transport_timeout':error?.name==='TypeError'?'mail_transport_type':'mail_unconfirmed';}
 }
 await db.prepare("UPDATE partnership_inquiries SET email_state='failed',email_error=?,email_updated_at=? WHERE id=? AND email_state<>'accepted'").bind(code,now,id).run();
 return {state:'failed'};
}
