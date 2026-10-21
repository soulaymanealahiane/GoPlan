const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const numbers={one:1,two:2,three:3,four:4,five:5};
export function namedOpportunities(request,records){
 const include=new Set(),exclude=new Set();
 for(const clause of String(request||'').toLowerCase().split(/[.;\n]/)){
  const normalized=norm(clause),remove=/\b(avoid|exclude|remove|drop|don't include|do not include)\b/.test(clause),choose=/\b(recommend|include|add|choose|use|with|instead)\b/.test(clause)&&!/\b(like|similar to)\b/.test(clause);
  for(const t of records){const name=norm(t.name),tokens=name.split(' ').filter(w=>w.length>=5&&!['university','international','college','business','school','morocco'].includes(w)),hit=normalized.includes(name)||tokens.some(w=>new RegExp('\\b'+w+'\\b').test(normalized)&&records.filter(r=>norm(r.name).split(' ').includes(w)).length===1);if(hit){if(remove)exclude.add(t.id);else if(choose)include.add(t.id);}}
 }
 return {includeIds:[...include].filter(id=>!exclude.has(id)),excludeIds:[...exclude]};
}
export function opportunityEdits(request,current,types){
 const clauses=String(request||'').toLowerCase().split(/[.;\n]/),out={};
 for(const type of ['internships','exchanges']){
  const list=current[type]||[],keep=new Set(),exclude=new Set();let reorder=false,enabled=false;
  for(const clause of clauses){
   const other=type==='internships'?/exchange|universit|destination/:/compan|internship|startup|employer/;
   if(types.length===1&&!types.includes(type)||other.test(clause)&&!/(compan|internship|startup|employer)/.test(clause)&&type==='internships'||other.test(clause)&&!/(exchange|universit|destination)/.test(clause)&&type==='exchanges')continue;
   const preserve=/\b(keep|retain|preserve|leave)\b/.test(clause)&&!/\b(don't|do not|never)\s+(keep|retain|preserve)/.test(clause),remove=/\b(replace|remove|exclude|avoid|drop|don't include|do not include)\b/.test(clause);
   const hit=list.filter(t=>{const name=norm(t.name),first=name.split(' ')[0];return norm(clause).includes(name)||first.length>=5&&!['university','international','group','green'].includes(first)&&new RegExp('\\b'+first+'\\b').test(norm(clause));});
   if(preserve&&hit.length){enabled=true;hit.forEach(t=>keep.add(t.id));}
   if(remove&&hit.length){enabled=true;hit.forEach(t=>exclude.add(t.id));if(/\bonly\b|\brest\b|\bothers unchanged\b/.test(clause))list.filter(t=>!hit.includes(t)).forEach(t=>keep.add(t.id));}
   const ordinal=clause.match(/\b(?:keep|retain|preserve)\s+(?:the\s+)?(first|last)\s+(one|two|three|four|five|[1-5])\b/);
   if(ordinal){enabled=true;const n=numbers[ordinal[2]]||Number(ordinal[2]);(ordinal[1]==='first'?list.slice(0,n):list.slice(-n)).forEach(t=>keep.add(t.id));}
   if(/\b(?:reorder|re-rank|rerank|retier)\b|\b(?:reach|target|safety) tier\b/.test(clause)){reorder=true;enabled=true;}
  }
  for(const id of exclude)keep.delete(id);out[type]={enabled,keepIds:[...keep],excludeIds:[...exclude],reorder};
 }
 return out;
}
