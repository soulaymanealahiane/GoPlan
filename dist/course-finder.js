import {label,coursesFor} from './planner.js';
import {currentCourse} from './course-details.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const compact=s=>normalize(s).replaceAll(' ','');
const progress={planned:'Planned','in-progress':'Taking now',completed:'Passed',retake:'Retake'};

function nearbyWord(a,b){
 const max=a.length>=7?2:1;
 if(a.length<4||a.length-b.length>max)return false;
 // A student may still be typing: tolerate a typo in a word's prefix too.
 b=b.slice(0,a.length+max);
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];for(let k=1;k<=b.length;k++)row[k]=Math.min(row[k-1]+1,previous[k]+1,previous[k-1]+Number(a[i-1]!==b[k-1]));
  if(Math.min(...row)>max)return false;previous=row;
 }
 return previous.slice(Math.max(0,a.length-max)).some(distance=>distance<=max);
}

// Search the currently placed plan, including pending/prior study and separate
// retake attempts. No catalogue, provider, persisted query or plan mutation.
export function findPlanCourses(plan,query,{limit=8}={}){
 const text=normalize(String(query||'').slice(0,120));if(!text||!plan)return {matches:[],total:0};
 const tokens=text.split(' '),codeQuery=compact(text),byId=new Map(plan.courses.map(c=>[c.id,c])),currentCourses=new Map(coursesFor(plan.profile).map(c=>[c.id,c])),matches=[];
 for(const [order,term]of plan.terms.entries())for(const id of term.courses){
  const raw=byId.get(id);if(!raw)continue;const c=currentCourse(raw,plan.profile,currentCourses),title=normalize(c.title),code=compact(c.code),words=normalize(c.title+' '+(c.code||'')).split(' ');
  let score=code&&code===codeQuery?1200:code&&code.startsWith(codeQuery)?1000:title===text?900:0;
  if(!score){
   const parts=tokens.map(token=>Math.max(0,...words.map(word=>word===token?150:word.startsWith(token)?100:word.includes(token)?70:nearbyWord(token,word)?35:0)));
   if(parts.some(n=>!n))continue;score=parts.reduce((a,b)=>a+b,0)+(title.startsWith(text)?200:0);
  }
  matches.push({courseId:id,title:c.title,code:c.code||'',termId:term.id,semester:label(term),status:term.id==='prior'?'completed':plan.tracking?.[id]?.status||'planned',score,order});
 }
 matches.sort((a,b)=>b.score-a.score||a.order-b.order||a.title.localeCompare(b.title)||a.courseId.localeCompare(b.courseId));
 return {matches:matches.slice(0,limit),total:matches.length};
}

export function courseFinder(busy=false){
 return `<div class="board-course-finder" data-board-finder><label for="board-course-search">Find a course</label><div class="board-finder-field"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="board-course-search" data-board-search type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls="board-course-matches" aria-expanded="false" placeholder="Course name or code" maxlength="120" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" ${busy?'disabled':''}><button type="button" data-board-search-clear aria-label="Clear course search" hidden>×</button></div><div class="board-finder-popup" data-board-search-popup hidden><div id="board-course-matches" role="listbox" aria-label="Matching courses"></div><p class="board-finder-status" data-board-search-status role="status" aria-live="polite" aria-atomic="true"></p></div></div>`;
}

export function bindCourseFinder(root,controller){
 const doc=root.ownerDocument||root,win=doc.defaultView;
 const finderFor=target=>target.closest?.('[data-board-finder]');
 const place=finder=>{
  const popup=finder?.querySelector('[data-board-search-popup]');if(!popup||popup.hidden)return;
  const bounds=finder.getBoundingClientRect(),viewport=win?.visualViewport,top=viewport?.offsetTop||0,bottom=top+(viewport?.height||win?.innerHeight||720),below=Math.max(0,bottom-bounds.bottom-12),above=Math.max(0,bounds.top-top-12),up=below<Math.min(popup.scrollHeight,280)&&above>below;
  popup.dataset.above=String(up);popup.style.maxHeight=Math.max(60,Math.min(360,up?above:below))+'px';
 };
 const close=finder=>{if(!finder)return;finder.querySelector('[data-board-search-popup]').hidden=true;const input=finder.querySelector('[data-board-search]');input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
 const show=input=>{
  const finder=finderFor(input),popup=finder.querySelector('[data-board-search-popup]'),list=finder.querySelector('[role="listbox"]'),status=finder.querySelector('[data-board-search-status]');
  finder.querySelector('[data-board-search-clear]').hidden=!input.value;
  if(!input.value.trim()){list.innerHTML='';status.textContent='';close(finder);return;}
  const {matches,total}=controller.searchBoardCourses(input.value);popup.hidden=false;
  list.innerHTML=matches.map((c,i)=>`<button type="button" role="option" tabindex="-1" id="board-course-match-${i}" aria-selected="false" data-board-find-course="${esc(c.courseId)}"><span class="board-finder-name">${esc(c.title)}</span><span class="board-finder-meta">${esc(c.code||'Placement / choice')} · ${esc(c.semester)} · ${esc(progress[c.status]||'Planned')}</span></button>`).join('');
  status.textContent=total?total>matches.length?`Showing ${matches.length} of ${total} matches. Keep typing to narrow the list.`:`${total} ${total===1?'course':'courses'} found. Choose one to see it in your roadmap.`:'No courses found in your plan. Try a shorter name or code.';
  input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');place(finder);
 };
 root.addEventListener('input',e=>{if(e.target.hasAttribute?.('data-board-search')&&!e.isComposing)show(e.target);});
 root.addEventListener('compositionend',e=>{if(e.target.hasAttribute?.('data-board-search'))show(e.target);});
 root.addEventListener('focusin',e=>{if(e.target.hasAttribute?.('data-board-search')&&e.target.value.trim())show(e.target);});
 root.addEventListener('focusout',e=>{const finder=finderFor(e.target);if(finder&&!finder.contains(e.relatedTarget))close(finder);});
 root.addEventListener('pointerdown',e=>{
  const finder=root.querySelector('[data-board-finder]');if(!finder)return;
  if(!finder.contains(e.target))close(finder);
  else if(e.target.closest?.('[data-board-find-course],[data-board-search-clear]'))e.preventDefault();
 });
 root.addEventListener('click',e=>{
  const option=e.target.closest?.('[data-board-find-course]'),clear=e.target.closest?.('[data-board-search-clear]');
  if(option){e.stopPropagation();close(finderFor(option));controller.revealBoardCourse(option.dataset.boardFindCourse);}
  else if(clear){e.stopPropagation();const finder=finderFor(clear),input=finder.querySelector('[data-board-search]');input.value='';show(input);input.focus({preventScroll:true});}
 });
 root.addEventListener('keydown',e=>{
  const input=e.target;if(!input.hasAttribute?.('data-board-search')||e.isComposing||e.ctrlKey||e.metaKey||e.altKey)return;
  const finder=finderFor(input),popup=finder.querySelector('[data-board-search-popup]');
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(finder);return;}
  if(e.key==='Tab'){close(finder);return;}
  if(!['ArrowDown','ArrowUp','Enter'].includes(e.key))return;e.preventDefault();
  if(popup.hidden)show(input);const options=[...finder.querySelectorAll('[role="option"]')];if(!options.length)return;
  const selected=options.findIndex(o=>o.id===input.getAttribute('aria-activedescendant'));
  if(e.key==='Enter'){const option=options[Math.max(0,selected)];close(finder);controller.revealBoardCourse(option.dataset.boardFindCourse);return;}
  const index=selected<0?(e.key==='ArrowDown'?0:options.length-1):(selected+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
  options.forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});
 });
 const reposition=()=>place(root.querySelector('[data-board-finder]'));
 root.addEventListener('scroll',reposition,{capture:true,passive:true});win?.addEventListener?.('resize',reposition);win?.visualViewport?.addEventListener?.('resize',reposition);
}
