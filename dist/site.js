import {OFFER_FIELDS,OFFER_DEFAULTS,calculateOffer,offerPrice,offerSummary} from './university-offer.js';
const $=s=>document.querySelector(s);
const calculator=$('#offer-calculator');
function currentOffer(){return calculateOffer(Object.fromEntries(OFFER_FIELDS.map(([key])=>[key,calculator.elements[key].valueAsNumber])));}
function renderOffer(){
 try{const result=currentOffer();$('#offer-price').textContent=offerPrice(result.price);$('#offer-error').textContent='';$('#offer-discuss').disabled=false;return result;}
 catch(error){$('#offer-price').textContent='—';$('#offer-error').textContent=error.message;$('#offer-discuss').disabled=true;return null;}
}
calculator?.addEventListener('input',renderOffer);
calculator?.addEventListener('submit',e=>e.preventDefault());
$('#offer-reset')?.addEventListener('click',()=>{for(const [key,value] of Object.entries(OFFER_DEFAULTS))calculator.elements[key].value=value;renderOffer();});
if(calculator)renderOffer();
const menu=$('#menu-toggle');menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));$('#site-links').classList.toggle('open',open);});
document.querySelectorAll('#site-links a').forEach(a=>a.addEventListener('click',()=>{$('#site-links').classList.remove('open');menu.setAttribute('aria-expanded','false');}));
let selectedOffer=null,lastSubmission=null;
const dialog=$('#contact-dialog');document.querySelectorAll('[data-contact]').forEach(b=>b.addEventListener('click',()=>{
 selectedOffer=b.hasAttribute('data-package-contact')?renderOffer()?.inputs:null;
 if(b.hasAttribute('data-package-contact')&&!selectedOffer)return;
 const summary=$('#contact-package-summary');summary.hidden=!selectedOffer;summary.textContent=selectedOffer?offerSummary(selectedOffer):'';
 $('#contact-status').textContent='';dialog.showModal();
}));$('#contact-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
$('#contact-form').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]'),status=$('#contact-status');button.disabled=true;status.textContent='Saving your inquiry…';
 try{
  const data={...Object.fromEntries(new FormData(form)),...(selectedOffer?{offer:selectedOffer}:{})};
  const fingerprint=JSON.stringify(data);if(lastSubmission?.fingerprint!==fingerprint)lastSubmission={fingerprint,id:crypto.randomUUID()};
  const response=await fetch('/api/partnerships',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,submissionId:lastSubmission.id}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Your inquiry could not be saved. Please retry.');
  form.reset();lastSubmission=null;status.textContent='Your inquiry is saved for the GoPlan team. Reference: '+result.reference+'.';
 }catch(error){status.textContent=error.name==='TimeoutError'?'This is taking longer than expected. Please retry. Your inquiry will not be duplicated.':error.message;}finally{button.disabled=false;}
});
