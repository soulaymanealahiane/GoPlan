import {OFFER_FIELDS,OFFER_DEFAULTS,calculateOffer,offerPrice,offerSummary} from './university-offer.js';
import {trafficAttribution,flushTraffic} from './website-analytics.js';
const $=s=>document.querySelector(s);
// University package estimate
const calculator = $('#offer-calculator');
const $$ = selector => [...document.querySelectorAll(selector)];
const PRESETS = {
 initial: {direction:0,courses:0,companies:0,exchanges:0,semesters:0,global:0},
 starter: {direction:1,courses:1,companies:1,exchanges:1,semesters:1,global:1},
 demo: {direction:2,courses:2,companies:2,exchanges:2,semesters:2,global:5}
};
const detail = value => 'US$' + value.toFixed(4);
const money = value => 'US$' + value.toLocaleString('en-US', {minimumFractionDigits:2,maximumFractionDigits:2});
function setText(id, text) {
 const element = document.getElementById(id);
 if (element) element.textContent = text;
}
function currentOffer() {
 const values = Object.fromEntries(OFFER_FIELDS.map(([key]) => [key, calculator.elements[key].valueAsNumber]));
 return calculateOffer(values);
}
function renderBreakdown(result) {
 const costs = result.providerCosts;
 setText('offer-requests', String(result.backendRequestsPerRoadmap));
 setText('cost-jev', detail(costs.jev));
 setText('cost-sol', detail(costs.sol));
 setText('cost-luna', detail(costs.luna));
 setText('cost-buffer', detail(result.apiCost * result.buffer));
 setText('cost-markup', detail(result.bufferedApiCost * result.markup));
 setText('cost-total', detail(result.bufferedApiCost * (1 + result.markup)));
}
function renderCohort(result) {
 const input = $('#offer-cohort');
 if (!input) return;
 const students = input.valueAsNumber;
 const valid = Number.isSafeInteger(students) && students >= 1 && students <= 100000;
 setText('offer-cohort-total', valid ? money(Math.round(result.price * students * 100) / 100) : '—');
}
function syncPresets(inputs) {
 for (const button of $$('[data-preset]')) {
  const preset = PRESETS[button.dataset.preset];
  const selected = !!inputs && Object.entries(preset).every(([key,value]) => inputs[key] === value);
  button.setAttribute('aria-pressed', String(selected));
 }
}
function renderOffer() {
 try {
  const result = currentOffer();
  setText('offer-price', offerPrice(result.price));
  setText('offer-price-mini', offerPrice(result.price));
  $('#offer-error').textContent = '';
  $('#offer-discuss').disabled = false;
  renderBreakdown(result);
  renderCohort(result);
  syncPresets(result.inputs);
  return result;
 } catch (error) {
  for (const id of ['offer-price','offer-price-mini','offer-requests','cost-jev','cost-sol','cost-luna','cost-buffer','cost-markup','cost-total','offer-cohort-total']) {
   setText(id, '—');
  }
  $('#offer-error').textContent = error.message;
  $('#offer-discuss').disabled = true;
  syncPresets(null);
  return null;
 }
}
function setValues(values) {
 for (const [key,value] of Object.entries(values)) calculator.elements[key].value = value;
 // One change event per adjustment preserves the existing analytics counter.
 calculator.dispatchEvent(new Event('change'));
 renderOffer();
}
calculator?.addEventListener('input', renderOffer);
calculator?.addEventListener('submit', event => event.preventDefault());
calculator?.addEventListener('click', event => {
 const button = event.target.closest('[data-step]');
 if (!button) return;
 const input = button.parentNode.querySelector('input');
 const current = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
 const next = Math.min(1000, Math.max(0, Math.round(current) + Number(button.dataset.step)));
 if (next !== current) setValues({[input.name]:next});
});
for (const button of $$('[data-preset]')) {
 button.addEventListener('click', () => setValues(PRESETS[button.dataset.preset]));
}
$('#offer-cohort')?.addEventListener('input', () => {
 try { renderCohort(currentOffer()); }
 catch { setText('offer-cohort-total', '—'); }
});
$('#offer-reset')?.addEventListener('click', () => setValues(OFFER_DEFAULTS));
if (calculator) renderOffer();

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
 e.preventDefault();const form=e.target,button=form.querySelector('[type=submit]'),status=$('#contact-status');button.disabled=true;status.setAttribute('role','status');status.removeAttribute('data-notification-source');status.textContent='Saving your inquiry…';
 try{
  const data={...Object.fromEntries(new FormData(form)),...(selectedOffer?{offer:selectedOffer}:{})};
  const fingerprint=JSON.stringify(data);if(lastSubmission?.fingerprint!==fingerprint)lastSubmission={fingerprint,id:crypto.randomUUID()};
  flushTraffic();const traffic=trafficAttribution();
  const response=await fetch('/api/partnerships',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,submissionId:lastSubmission.id,...(traffic?{traffic}:{})}),signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Your inquiry could not be saved. Please retry.');
  form.reset();lastSubmission=null;status.textContent='Your inquiry is saved for the GoPlan team. Reference: '+result.reference+'.';
 }catch(error){status.setAttribute('role','alert');status.textContent=error.name==='TimeoutError'?'This is taking longer than expected. Please retry. Your inquiry will not be duplicated.':error.message;}finally{button.disabled=false;}
});
