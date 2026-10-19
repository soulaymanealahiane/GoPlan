import OPPORTUNITIES from './opportunities.js';
import {DATA,programFor} from './planner.js';
import {selectedMinor} from './minors.js';
import {detectOpportunityThemes} from './opportunity-matching.js';

const clean=value=>String(value||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const normalized=value=>clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const join=items=>items.length<2?items[0]||'':items.slice(0,-1).join(', ')+' and '+items.at(-1);
const labels={'human-resources':'recruitment','software-services':'software development','agriculture-food':'food and agriculture','industrial-engineering':'industrial engineering','energy-water':'energy and water','supply-chain':'supply chains','saas':'software products','fintech':'financial technology','computing':'computing','ai':'artificial intelligence','international-studies':'international studies','digital-health':'digital health','banking':'banking','environment':'environmental science','renewable-energy':'renewable energy','data':'data analysis','cybersecurity':'cybersecurity','public-policy':'public policy'};
const readable=value=>labels[value]||clean(value).replace(/-/g,' ');
const reviewed=(t,type)=>OPPORTUNITIES[type]?.find(record=>record.id===t?.id);
const list=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'):[];
const fields=t=>[...new Set([...list(t.fields),...list(t.disciplines),...list(t.industries)].map(readable).filter(Boolean))];
const topics=t=>detectOpportunityThemes([...list(t.tags),...fields(t)].join(' '));
const undecided=text=>/^(undecided|not sure|unsure|still exploring|i am still (deciding|exploring))[.! ]*$/i.test(text);

export function opportunityWebsite(t,type){
 const record=reviewed(t,type);
 // Prefer the organization's own website, never an arbitrary research citation.
 for(const raw of [record?.officialUrl,t?.officialUrl,record?.sourceUrl,t?.sourceUrl])try{
  const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.')&&!/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)&&!url.hostname.endsWith('.local')&&!url.hostname.includes(':'))return url.href;
 }catch{}
 return '';
}

// A display freshness marker, not an authentication or eligibility decision.
export function opportunityContextKey(journey={}){
 const p=journey.profile||{},q=journey.questionnaire||{};
 const text=JSON.stringify([p.program,p.track,p.secondTrack||'',p.minor||'',Object.entries(p.choices||{}).sort(([a],[b])=>a.localeCompare(b)),['ambitions','activities','strengths','industries','priorities','entrepreneurship','automation','constraints'].map(key=>[key,clean(q[key])])]);
 let hash=2166136261;for(const char of text)hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16);
}

function context(journey,record){
 const p=journey?.profile||{},q=journey?.questionnaire||{},degree=DATA.programs.some(d=>d.id===p.program)?programFor(p):null;
 const degreeName=degree?.name.replace(/^Bachelor of (?:Science|Arts|Business Administration)\s*(?:in\s+)?/,'').trim()||degree?.name||'';
 const candidates=[degree?.tracks.find(t=>t.id===p.track)?.name,degree?.tracks.find(t=>t.id===p.secondTrack)?.name,selectedMinor(p)?.name,degreeName].filter(Boolean),targetTopics=topics(record);
 const ranked=candidates.map((name,i)=>({name,score:detectOpportunityThemes(name).filter(topic=>targetTopics.includes(topic)).length*10+(candidates.length-i)/10})).sort((a,b)=>b.score-a.score);
 const answers=[];
 for(const [i,id] of ['activities','ambitions','industries','strengths'].entries()){
  const raw=clean(q[id]);if(!raw||undecided(raw))continue;
  const parts=raw.split(/;|\. More about me: /).map(clean).filter(Boolean);
  for(const part of parts){if(undecided(part)||/\b(?:avoid|hate|dislike|don't|do not|not interested|no interest|rather than)\b/i.test(part))continue;
   const words=part.split(' '),quote=words.slice(0,12).join(' ').replace(/[.,;:!?]+$/,'');
   answers.push({id,quote,partial:words.length>12,score:detectOpportunityThemes(part).filter(topic=>targetTopics.includes(topic)).length*10+(4-i)/10});
  }
 }
 answers.sort((a,b)=>b.score-a.score);
 return {degreeName,study:ranked[0]?.name||degreeName,answer:answers[0],questionnaire:q,candidates};
}

function factualSentence(record,type){
 const name=clean(record.name),areas=fields(record).slice(0,3),first=clean(record.description||record.reason).split(/(?<=[.!?])\s+(?=[A-Z])/)[0];
 const generic=/^(?:Use|Check|Confirm|Explore|Consider|Research|YC |IFC |Its official|This )|recruitment location directory|careers presence|careers site|careers page/i;
 if(first&&first.split(' ').length<=38&&!generic.test(first)){
  const head=normalized(name).split(' ')[0];
  if(head&&normalized(first).startsWith(head)||/^(Its|The university|The company)\b/.test(first))return first.replace(/^Its\b/,name+'’s').replace(/^(The university|The company)\b/,name).replace(/[.!?]*$/,'.');
  if(type==='internships'&&/\b(platform|company|business|group|producer|broadcaster|think tank|utility)\b/i.test(first))return name+' is a '+first.replace(/^(Recruitment|Agricultural|Engineering)\b/,word=>word.toLowerCase()).replace(/[.!?]*$/,'.');
 }
 if(!areas.length)return 'Compare '+name+' with the subjects you want to explore.';
 if(type==='exchanges')return 'Subjects listed for '+name+' include '+join(areas)+'.';
 return name+' works in '+join(areas)+'.';
}

function usableAgentParagraph(t,c){
 if(t?.fitVersion!==2)return false;
 const reason=clean(t.reason),words=reason.split(' ');
 if(words.length<28||words.length>90||/answerIds|evidenceIds|inferred from|global .*forecasts|source publication|evidence checked|reviewed source|guaranteed|will hire|will accept|open internships?|vacanc|job openings/i.test(reason))return false;
 const quotes=[...reason.matchAll(/[“"]([^”"]+)[”"]/g)].map(m=>normalized(m[1]));
 return quotes.some(quote=>quote.split(' ').length>=3&&Object.values(c.questionnaire).some(answer=>normalized(answer).includes(quote)))&&c.candidates.some(name=>normalized(reason).includes(normalized(name)));
}

// The saved plan is sufficient: reading a match never calls an AI service.
// Old/generic reasons are replaced at display time, not by spending a revision.
export function opportunityDescription(t,journey={},type='internships',{preferAgent=true}={}){
 const record=reviewed(t,type)||t||{},c=context(journey,record);
 if(preferAgent&&t.fitContext===opportunityContextKey(journey)&&usableAgentParagraph(t,c))return clean(t.reason);
 const lead=c.answer?'You said “'+c.answer.quote+'”'+(c.degreeName?' and chose '+c.degreeName:'')+'.':c.degreeName?'You chose '+c.degreeName+'.':'You are still exploring your direction.';
 const fact=factualSentence(record,type),sector=readable(record.industries?.[0]),relevant=fields(record).filter(field=>detectOpportunityThemes(field).some(topic=>detectOpportunityThemes(c.study).includes(topic))).slice(0,2);
 const connection=c.study?type==='internships'?'That makes it a target for applying your '+c.study+' studies'+(sector?' to '+sector:' in a practical setting')+'.':'Its '+join(relevant.length?relevant:fields(record).slice(0,2))+' subjects make it worth considering for your '+c.study+' studies.':'';
 const restriction=record.sbaCoursesExcluded&&(journey.profile?.program==='BBA'||/business|finance|marketing|management/i.test(c.candidates.join(' ')))?' Business courses are excluded on this exchange route.':'';
 return [lead,fact,connection].filter(Boolean).join(' ')+restriction;
}
