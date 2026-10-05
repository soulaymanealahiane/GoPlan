// Explicit paid evaluation: node --env-file=.env scripts/verify-intelligence-live.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {advise,availableTargets} from '../server/advisor.mjs';
import {normalizeProfile} from '../dist/planner.js';
if(!process.env.GROQ_API_KEY)throw Error('Server key is required.');
const profile=normalizeProfile({program:'BSCSC',track:'AI'});
const prior=Object.fromEntries(['internships','exchanges'].map(type=>[type,availableTargets(type,profile).slice(0,5).map(t=>({id:t.id,name:t.name}))]));
const input={flowVersion:5,stage:'targets',profile,level:'undergraduate',questionnaire:{ambitions:'Automate old business processes in Morocco.',activities:'Build software products with a small team.',strengths:'Programming, mathematics and solving problems.',industries:'Logistics and fintech',entrepreneurship:'Become a technology founder',constraints:'I want practical technical experience.'},currentRecommendation:prior,refinement:'Please include some startups in the suggested companies in Morocco. Keep the exchange destinations unchanged.'};
const usage=[];fs.mkdirSync('.sites-runtime',{recursive:true});
const tracked=async(u,i)=>{if(!u.startsWith('https://api.groq.com/'))throw Error('Unexpected inference provider.');const r=await fetch(u,i);const p=await r.clone().json();usage.push({http:r.status,status:p.status,reason:p.incomplete_details?.reason,input:p.usage?.input_tokens??p.usage?.prompt_tokens,output:p.usage?.output_tokens??p.usage?.completion_tokens,model:p.model,tools:p.choices?.[0]?.message?.executed_tools?.length||0,search:!!JSON.parse(i.body).tools});fs.writeFileSync('.sites-runtime/intelligence-usage.json',JSON.stringify(usage));return r;};
const result=await advise(input,process.env,tracked);
fs.writeFileSync('.sites-runtime/intelligence-live.json',JSON.stringify({input,result,usage},null,2));
assert.ok(result.internships.filter(t=>['startup','scaleup'].includes(t.organizationType)).length>=2,'Requested startups are actually selected');
assert.ok(prior.exchanges.every(t=>result.exchanges.some(x=>x.id===t.id)),'Unaffected exchange destinations remain');
assert.ok(result.update.added.length,'Update has measurable additions');
assert.ok(result.internships.every(t=>/^https:\/\//.test(t.sourceUrl)),'Every company has a source');
console.log(JSON.stringify({passed:true,research:result.research.status,companies:result.internships.map(t=>({name:t.name,type:t.organizationType})),added:result.update.added,removed:result.update.removed,exchangesPreserved:true,usage},null,2));
