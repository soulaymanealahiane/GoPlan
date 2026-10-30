import {offerSummary} from '/university-offer.js';
const $=id=>document.getElementById(id);
const emailState=state=>({accepted:'Email submitted to partnerships@planwithgoplan.com.',not_requested:'Earlier inquiry · email notification was not requested.',pending:'Email notification is pending.',sending:'Email notification is being submitted.',unconfigured:'Email needs attention: sending is not configured.',failed:'Email needs attention. Retry after one minute.',review_needed:'Check this inquiry in the email provider before retrying.'}[state]||'Email notification status unavailable.');
function message(node,text,error=false){node.textContent=text;node.classList.toggle('error',error);node.setAttribute('role',error?'alert':'status');}
async function read(response){let data;try{data=await response.json();}catch{throw Error('Unexpected server response. Refresh and try again.');}if(!response.ok)throw Error(data.error||'The request could not be completed.');return data;}
async function loadPilots(){
 const status=$('pilot-status');message(status,'Loading access…');$('roster-fields').disabled=true;$('roster-form').hidden=true;
 try{
  const data=await read(await fetch('/api/admin/roster',{credentials:'same-origin',signal:AbortSignal.timeout(25000)}));
  message(status,data.mode==='roster'?(data.universityId||'University')+' · '+data.count+' approved students':'Open demo · Anyone with an account can plan.');
  $('pilot-setup').hidden=!!data.universityId;$('roster-fields').disabled=!data.universityId;$('roster-form').hidden=!data.universityId;
  $('pilot-detail').textContent='Access: '+(data.mode==='roster'?'approved email list':'open demo')+' · University: '+(data.universityId||'not configured')+' · '+data.count+' emails on the list'+(data.updatedAt?' · Updated '+new Date(data.updatedAt).toLocaleString():'');
 }catch(e){message(status,e.message,true);}
}
async function loadPartnerships(){
 const status=$('partnership-status'),list=$('partnership-list');message(status,'Loading inquiries…');
 try{
  const data=await read(await fetch('/api/admin/partnerships',{credentials:'same-origin',signal:AbortSignal.timeout(25000)}));
  list.replaceChildren();
  for(const inquiry of data.inquiries){
   const article=document.createElement('article');article.className='panel';
   for(const [tag,value] of [['h3',inquiry.university],['p',inquiry.name+' · '+inquiry.email],['p',inquiry.message],['small',new Date(inquiry.created_at).toLocaleString()]]){const node=document.createElement(tag);node.textContent=value;article.append(node);}
   if(inquiry.offer_json){try{const summary=document.createElement('p');summary.style.whiteSpace='pre-line';summary.textContent=offerSummary(JSON.parse(inquiry.offer_json));article.append(summary);}catch{}}
   if(inquiry.email_state){const delivery=document.createElement('small');delivery.className='notification-status';delivery.textContent=emailState(inquiry.email_state);article.append(delivery);
    if(['pending','failed','unconfigured','sending'].includes(inquiry.email_state)){
     const retry=document.createElement('button');retry.type='button';retry.className='secondary notification-retry';retry.textContent='Retry email notification';
     retry.addEventListener('click',async()=>{retry.disabled=true;try{const result=await read(await fetch('/api/admin/partnerships/retry-email',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:inquiry.id}),signal:AbortSignal.timeout(20000)}));delivery.textContent=emailState(result.state);if(result.state==='accepted'||result.state==='review_needed')retry.hidden=true;}catch(e){delivery.textContent=e.message;}finally{retry.disabled=false;}});article.append(retry);
    }
   }
   const link=document.createElement('a');link.href='mailto:'+encodeURIComponent(inquiry.email)+'?subject='+encodeURIComponent('GoPlan university pilot');link.textContent='Reply by email ↗';article.append(link);list.append(article);
  }
  message(status,data.inquiries.length?data.inquiries.length+(data.inquiries.length===1?' inquiry':' inquiries'):'No university inquiries.');
 }catch(e){message(status,e.message,true);}
}
export async function refreshPilots(){await Promise.all([loadPilots(),loadPartnerships()]);}
function rosterMode(){
 const replacing=$('roster-mode').value==='replace';
 $('roster-replace-confirm').hidden=!replacing;$('roster-confirm').required=replacing;$('roster-confirm').checked=false;
 $('roster-submit').textContent=replacing?'Replace approved list':'Add students';
 $('roster-help').textContent=replacing?'Omitted students lose access.':'Earlier students keep access and their remaining allowance.';
}
$('roster-mode').addEventListener('change',rosterMode);
$('roster-form').addEventListener('submit',async e=>{
 e.preventDefault();const file=$('roster-file').files[0],status=$('roster-status'),button=$('roster-submit');
 if($('roster-fields').disabled)return;
 if(!file||file.size>500000){message(status,'Choose an email list smaller than 500 KB.',true);return;}
 const mode=$('roster-mode').value;
 if(mode==='replace'&&!$('roster-confirm').checked){message(status,'Confirm that omitted students will lose access.',true);return;}
 button.disabled=true;message(status,mode==='append'?'Adding students…':'Replacing the list…');
 try{
  const data=await read(await fetch('/api/admin/roster?mode='+mode,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/plain'},body:await file.text(),signal:AbortSignal.timeout(25000)}));
  message(status,mode==='append'?data.added+' added · '+data.count+' approved. Existing allowances stay unchanged.':data.count+' approved students. Omitted students lose access on their next request.');
  e.target.reset();rosterMode();await loadPilots();
 }catch(err){message(status,err.message,true);}finally{button.disabled=false;}
});
