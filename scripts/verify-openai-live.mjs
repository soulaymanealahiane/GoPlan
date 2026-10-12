// Small opt-in paid check using synthetic inputs. Does not run a full journey.
// node --env-file=.env scripts/verify-openai-live.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {advise} from '../server/advisor.mjs';
import {fetchOpenAIResponse} from '../server/openai-response.mjs';
import {searchEvidence,retrieveEvidence} from '../server/research.mjs';
if(!process.env.OPENAI_API_KEY)throw Error('A server OpenAI key is required.');
const usage=[];
const tracked=async(url,init)=>{
 const r=await fetch(url,init);
 if(url.startsWith('https://api.openai.com/')){
  const p=await r.clone().json();usage.push({http:r.status,model:p.model,inputTokens:p.usage?.input_tokens||0,outputTokens:p.usage?.output_tokens||0,reasoningTokens:p.usage?.output_tokens_details?.reasoning_tokens||0,searches:p.output?.filter(x=>x.type==='web_search_call'&&x.status==='completed').length||0});
  if(!r.ok)throw Error('OpenAI smoke failed: '+r.status+' '+(p.error?.code||p.error?.type||'provider error'));
 }
 return r;
};
const env={...process.env,OPENAI_MODEL:process.env.OPENAI_MODEL||'gpt-6-astra',OPENAI_WEB_RESEARCH:'off'};
const answer=await advise({flowVersion:5,stage:'question',level:'undergraduate',questionnaire:{activities:'Building software.'},question:'Does selecting courses in a roadmap mean I have already earned their credits? Answer in one sentence.'},env,tracked);
assert.equal(answer.source,'openai');assert.ok(answer.answer.length);assert.match(answer.answer,/earn|complet|pass|credit/i);
const r=await fetchOpenAIResponse({method:'POST',signal:AbortSignal.timeout(120000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.OPENAI_API_KEY},body:JSON.stringify({model:env.OPENAI_MODEL,store:false,reasoning:{effort:'low'},max_output_tokens:2000,max_tool_calls:2,tools:[{type:'web_search',external_web_access:true,filters:{allowed_domains:['aui.ma']}}],tool_choice:'required',include:['web_search_call.action.sources'],input:'Find the official Al Akhawayn University international exchange office page. Give its name and source link in one sentence.'})},tracked);
const payload=await r.json();assert.equal(payload.status,'completed');
const evidence=await retrieveEvidence(searchEvidence(payload),tracked);assert.ok(evidence.documents.length,'At least one consulted primary page must be directly readable.');assert.ok(evidence.urls.every(url=>new URL(url).hostname==='aui.ma'||new URL(url).hostname.endsWith('.aui.ma')));
const report={synthetic:true,model:env.OPENAI_MODEL,advicePassed:true,webSearchPassed:true,directEvidencePassed:true,sourcePages:evidence.urls,usage};
fs.mkdirSync('.sites-runtime',{recursive:true});fs.writeFileSync('.sites-runtime/openai-smoke-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
