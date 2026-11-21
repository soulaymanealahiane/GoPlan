import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {OFFER_FIELDS,OFFER_DEFAULTS,calculateOffer,offerPrice,offerSummary} from './dist/university-offer.js';

class Element {
 constructor(value=''){this.value=String(value);this.listeners={};this.attributes={};this.textContent='';this.disabled=false;}
 get value(){return this._value;}
 set value(value){this._value=String(value);}
 get valueAsNumber(){return this.value.trim()===''?NaN:Number(this.value);}
 addEventListener(name,handler){this.listeners[name]=handler;}
 setAttribute(name,value){this.attributes[name]=value;}
 dispatchEvent(event){this.listeners[event.type]?.(event);this.events=(this.events||0)+1;}
}
const ids=new Map();
const get=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id);};
const calculator=get('offer-calculator');
calculator.elements=Object.fromEntries(OFFER_FIELDS.map(([name])=>{const e=new Element(1);e.name=name;return [name,e];}));
const presets=['initial','starter','demo'].map(p=>Object.assign(new Element(),{dataset:{preset:p}}));
get('offer-cohort').value='500';
const document={querySelector:s=>get(s.slice(1)),getElementById:get,querySelectorAll:s=>s==='[data-preset]'?presets:[]};
const script=fs.readFileSync(new URL('./dist/site.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
vm.runInNewContext(script,{document,OFFER_FIELDS,OFFER_DEFAULTS,calculateOffer,offerPrice,offerSummary,Event});
const render=()=>calculator.listeners.input();
assert.equal(get('offer-price').textContent,'US$0.44');
assert.equal(get('offer-cohort-total').textContent,'US$220.00');
assert.equal(get('cost-total').textContent,'US$0.4433');
assert.equal(get('cost-jev').textContent,'US$0.0076');
assert.equal(get('cost-sol').textContent,'US$0.2000');
assert.equal(get('cost-luna').textContent,'US$0.0880');
presets[0].listeners.click();
assert.equal(get('offer-price').textContent,'US$0.26');
assert.equal(get('offer-requests').textContent,'5');
presets[2].listeners.click();
assert.equal(get('offer-price').textContent,'US$0.88');
assert.equal(get('offer-requests').textContent,'40');
assert.equal(presets[2].attributes['aria-pressed'],'true');
assert.equal(presets[1].attributes['aria-pressed'],'false');
get('offer-reset').listeners.click();
assert.equal(get('offer-price').textContent,'US$0.44');
const roadmaps=calculator.elements.roadmaps;
const step=delta=>calculator.listeners.click({target:{closest:()=>({dataset:{step:String(delta)},parentNode:{querySelector:()=>roadmaps}})}});
step(1);
assert.equal(get('offer-price').textContent,'US$0.89');
assert.equal(get('offer-cohort-total').textContent,'US$445.00');
roadmaps.value=0;render();step(-1);
assert.equal(Number(roadmaps.value),0);
assert.equal(get('offer-price').textContent,'US$0.00');
roadmaps.value=1000;render();step(1);
assert.equal(Number(roadmaps.value),1000);
for(const invalid of ['','-1','1.5','1001']){
 roadmaps.value=invalid;render();
 assert.equal(get('offer-price').textContent,'—');
 assert.equal(get('cost-total').textContent,'—');
 assert.equal(get('offer-cohort-total').textContent,'—');
 assert.equal(get('offer-discuss').disabled,true);
}
get('offer-reset').listeners.click();
assert.equal(get('offer-discuss').disabled,false);
get('offer-cohort').value='';get('offer-cohort').listeners.input();
assert.equal(get('offer-cohort-total').textContent,'—');
get('offer-cohort').value='1000';get('offer-cohort').listeners.input();
assert.equal(get('offer-cohort-total').textContent,'US$440.00');
for(const [key] of OFFER_FIELDS){const r=calculateOffer({...OFFER_DEFAULTS,[key]:2});assert.ok(Math.abs(Object.values(r.providerCosts).reduce((a,b)=>a+b,0)-r.apiCost)<1e-12);}
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
assert.equal(html,fs.readFileSync(new URL('./dist/site-home.html',import.meta.url),'utf8'));
assert.ok(html.includes('href="/calculator.css"'));
assert.equal((html.match(/data-step=/g)||[]).length,14);
assert.equal((html.match(/data-preset=/g)||[]).length,3);
console.log('Calculator presets, bounded steppers, provider breakdown, cohort estimates, invalid-input recovery and mirrored homepage passed.');
