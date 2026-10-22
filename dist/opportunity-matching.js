// Public academic interests only. These are relevance hints, not eligibility rules.
import {programFor,coursesFor} from './planner.js';
import {weightedPreferences,cleanRankings} from './preferences.js';
import {selectedMinor} from './minors.js';
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const themes={
 software:['software','programm','coding','comput','informat','digital product','technology'],
 data:['data','analytics','statistics','machine learning','artificial intelligence',' ai ','mathemat','robotics'],
 security:['cyber','security','securite','networks'],
 finance:['financ','fintech','bank','accounting','audit','payment','risk','money','invest'],
 business:['business','management','entrepreneur','startup','marketing','commerce','retail','human resources','recruit'],
 media:['media','journalis','communicat','film','design','advertis','creative','storytell','broadcast','writing'],
 environment:['environment','sustainab','climate','water','waste','ecolog','environnement'],
 energy:['energy','renewable','solar','wind','energie'],
 engineering:['engineering','manufactur','industrial','mechanic','materials','aerospace','automotive','electrical','construction'],
 logistics:['logistic','supply chain','transport','rail','operations'],
 policy:['politic','policy','international studies','international relations','governance','social sciences','social justice','human rights','humanitarian','education','teaching','mentoring','diploma','geopolit'],
 health:['health','medical','pharma','ultrasound','biolog','patient'],
 agriculture:['agricultur','food','farmer','forestry'],
};
export const detectOpportunityThemes=value=>{const text=' '+normalize(value)+' ';return Object.keys(themes).filter(key=>themes[key].some(term=>text.includes(term)));};
export function companySizePreference(request){
 const preference=text=>{
  text=normalize(text);
  if(/\b(?:avoid|exclude|no|not|without|rather than)\s+(?:any\s+)?(?:established|large|big|mature)\s+(?:compan(?:y|ies)|firms?|employers?|businesses)\b/.test(text))return 'startup';
  if(/\b(?:avoid|exclude|no|not|without)\s+(?:any\s+)?(?:startups?|scaleups?)\b/.test(text))return 'established';
  if(/\b(?:startups?|scaleups?)\b/.test(text))return 'startup';
  if(/\b(?:established|large|big|mature)\s+(?:compan(?:y|ies)|firms?|employers?|businesses)\b/.test(text))return 'established';
  return '';
 };
 // The latest explicit size preference supersedes an earlier questionnaire.
 const latest=preference(request.refinement);if(latest)return latest;
 const ranked=cleanRankings(request.questionnaireRankings,request.questionnaire);
 for(const id of ['entrepreneurship','industries'])for(const choice of ranked[id]||[]){const value=preference(choice);if(value)return value;}
 return preference(Object.values(request.questionnaire||{}).join(' '));
}
const hash=value=>{let n=2166136261;for(const c of value)n=Math.imul(n^c.charCodeAt(0),16777619);n^=n>>>16;n=Math.imul(n,0x85ebca6b);n^=n>>>13;n=Math.imul(n,0xc2b2ae35);return (n^n>>>16)>>>0;};
export function opportunityInterests(request){
 const p=request.profile||{},degree=p.program?programFor(p):null,minor=selectedMinor(p),q=request.questionnaire||{},weights={};
 const add=(text,weight)=>{for(const key of detectOpportunityThemes(text))weights[key]=(weights[key]||0)+weight;};
 add(request.refinement,10);const importance={activities:8,ambitions:7,industries:6,strengths:4,entrepreneurship:3,automation:2};weightedPreferences(q,request.questionnaireRankings,(text,weight,id)=>{if(importance[id])add(text,weight*importance[id]);});
 if(!Object.values(q).some(Boolean))add(request.goal,5);
 add(degree?.tracks.find(t=>t.id===p.track)?.name,2);add(degree?.tracks.find(t=>t.id===p.secondTrack)?.name,1);add(minor?.name,1);add(degree?.name,1);
 return {degree:degree?.name||'Undecided',focus:degree?.tracks.find(t=>t.id===p.track)?.name||'',secondFocus:degree?.tracks.find(t=>t.id===p.secondTrack)?.name||'',minor:minor?.name||'',themes:Object.entries(weights).sort((a,b)=>b[1]-a[1]).map(([theme,weight])=>({theme,weight})),skills:[...new Set((degree?coursesFor(p):[]).filter(c=>c.code).map(c=>c.title))].slice(0,12)};
}
export function rankOpportunityTargets(records,request,type,{limit=records.length}={}){
 const interests=opportunityInterests(request),weights=Object.fromEntries(interests.themes.map(t=>[t.theme,t.weight])),seed=JSON.stringify([request.profile?.program,request.profile?.track,request.profile?.secondTrack,request.profile?.minor,request.questionnaire,request.questionnaireRankings,request.refinement]),preference=normalize([request.refinement,...Object.values(request.questionnaire||{})].join(' '));
 const size=type==='internships'?companySizePreference(request):'',startups=size==='startup',preferNovel=request.preferNovel??(!!String(request.refinement||'').trim()&&((request.currentRecommendation?.[type]?.length||request.seenTargetIds?.[type]?.length)>0||/\b(?:new|different|alternative|alternatives|replace|other|more|refresh|broaden)\b/.test(normalize(request.refinement))));
 const prior=Array.isArray(request.currentRecommendation?.[type])?request.currentRecommendation[type]:[],seenIds=new Set([...(request.seenTargetIds?.[type]||[]),...prior.map(record=>record.id)]);
 const seenRecords=[...prior,...records.filter(record=>seenIds.has(record.id))],seenNames=new Set(seenRecords.map(record=>normalize(record.name)).filter(Boolean)),seenInstitutions=new Set(seenRecords.map(record=>normalize(record.institutionId)).filter(Boolean));
 const pool=records.map(record=>{
  const text=[...(record.tags||[]),...(record.fields||[]),...(record.industries||[]),...(record.disciplines||[]),record.reason,record.researchFit,record.academicFit].join(' '),topics=detectOpportunityThemes(text),matched=topics.filter(t=>weights[t]);
  // Broad conglomerates should not win simply because their record lists every field.
  const score=matched.reduce((sum,t)=>sum+weights[t],0)/Math.sqrt(Math.max(1,topics.length));
  const location=[record.country,...(record.regions||[])].some(place=>{const text=normalize(place);return text&&text!=='morocco'&&preference.includes(text);})?6:0;
  const seen=seenIds.has(record.id)||seenNames.has(normalize(record.name))||type==='exchanges'&&seenInstitutions.has(normalize(record.institutionId));
  return {record,topics,matched,seen,score:score+location+(startups&&['startup','scaleup'].includes(record.organizationType)||size==='established'&&record.organizationType==='established'?20:0),tie:hash(seed+record.id)};
 }),out=[],countries=new Map(),sectors=new Map();
 while(pool.length&&out.length<limit){
  const adjusted=item=>item.score-(type==='exchanges'?(countries.get(item.record.country)||0)*2:(sectors.get(item.record.industries?.[0]||item.topics[0])||0)*1.5);
  // When fewer than a full shortlist remain unseen, keep those remaining
  // alternatives first, then fill from the supported history. Never let a
  // familiar high score hide the final unexplored choices.
  pool.sort((a,b)=>(preferNovel?Number(a.seen)-Number(b.seen):0)||adjusted(b)-adjusted(a)||a.tie-b.tie||a.record.id.localeCompare(b.record.id));
  const item=pool.shift(),r=item.record;out.push({...r,matchThemes:item.matched,matchScore:Math.round(item.score*10)/10});countries.set(r.country,(countries.get(r.country)||0)+1);const sector=r.industries?.[0]||item.topics[0];sectors.set(sector,(sectors.get(sector)||0)+1);
 }
 return out;
}
