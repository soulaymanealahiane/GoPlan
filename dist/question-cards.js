import {QUESTIONS,missingAnswers} from './questionnaire.js';
import {QUICK_CHOICES,isUnsure} from './preferences.js';
export {QUICK_CHOICES} from './preferences.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Broad interests reflect the demo's computing, business, engineering, arts,
// communication, international studies and sustainability programs, not a
// shortcut that maps a choice directly to a degree.
export const questionIndex=j=>Math.max(0,Math.min(QUESTIONS.length-1,Number.isInteger(j.questionIndex)?j.questionIndex:0));
export function cardAnswer(j,id){
 const saved=j.questionCards?.[id];
 return saved?{choices:(Array.isArray(saved.choices)?saved.choices:[]).filter(x=>QUICK_CHOICES[id]?.includes(x)),detail:typeof saved.detail==='string'?saved.detail.slice(0,1200):''}:{choices:[],detail:j.questionnaire?.[id]||''};
}
function save(j,id,answer){
 j.questionCards||={};j.questionCards[id]=answer;j.questionnaire||={};
 j.questionnaireRankings||={};j.questionnaireRankings[id]=[...answer.choices];
 const choices=answer.choices.length>1?'My priorities, highest first: '+answer.choices.map((c,i)=>`${i+1}. ${c}`).join('; '):answer.choices.join('');
 j.questionnaire[id]=[choices,answer.detail.trim()].filter(Boolean).join('. More about me: ').slice(0,2400);
}
export function selectQuickAnswer(j,id,value){
 if(!QUICK_CHOICES[id]?.includes(value))throw Error('Choose one of the displayed answers.');
 const answer=cardAnswer(j,id);
 answer.choices=answer.choices.includes(value)?answer.choices.filter(x=>x!==value):isUnsure(value)?[value]:[...answer.choices.filter(x=>!isUnsure(x)),value];
 save(j,id,answer);
}
export function writeCardDetail(j,id,value){if(!QUICK_CHOICES[id])return;save(j,id,{...cardAnswer(j,id),detail:String(value).slice(0,1200)});}
export function moveQuickAnswer(j,id,index,delta){
 const answer=cardAnswer(j,id),next=index+delta;
 if(!Number.isInteger(index)||![-1,1].includes(delta)||index<0||next<0||index>=answer.choices.length||next>=answer.choices.length)return false;
 [answer.choices[index],answer.choices[next]]=[answer.choices[next],answer.choices[index]];save(j,id,answer);return true;
}
export function questionnaireCard(j,validation={}){
 const index=questionIndex(j),q=QUESTIONS[index],answer=cardAnswer(j,q.id),required=index<3;
 return `<section class="question-card" aria-labelledby="question-card-title"><div class="question-card-progress"><span>${required?`${index+1} of 3 quick questions`:'Make it more personal · optional'}</span><span aria-hidden="true">${required?'●'.repeat(index+1)+'○'.repeat(2-index):'✦'}</span></div><h2 id="question-card-title" tabindex="-1">${esc(q.label)}</h2><p class="question-card-hint">Choose all that fit, then rank your selections. Your first choice matters most.</p><div class="quick-choices" role="group" aria-label="${esc(q.label)}">${QUICK_CHOICES[q.id].map((value,i)=>`<button type="button" class="quick-choice ${answer.choices.includes(value)?'selected':''}" data-question-choice="${q.id}" data-choice-index="${i}" aria-pressed="${answer.choices.includes(value)}"><span>${esc(value)}</span><span aria-hidden="true">${answer.choices.includes(value)?answer.choices.indexOf(value)+1:'+'}</span></button>`).join('')}</div>${answer.choices.length>1?`<section class="preference-ranking" aria-labelledby="ranking-title"><div class="ranking-heading"><h3 id="ranking-title">Your priorities</h3><span>Most important first</span></div><ol>${answer.choices.map((value,i)=>`<li><span class="ranking-number" aria-hidden="true">${i+1}</span><span>${esc(value)}</span><div class="ranking-controls"><button type="button" data-question-rank="${q.id}" data-rank-index="${i}" data-rank-move="-1" aria-label="Move ${esc(value)} up" ${i===0?'disabled':''}>↑</button><button type="button" data-question-rank="${q.id}" data-rank-index="${i}" data-rank-move="1" aria-label="Move ${esc(value)} down" ${i===answer.choices.length-1?'disabled':''}>↓</button></div></li>`).join('')}</ol><p class="sr-only" role="status">${esc(answer.choices.map((value,i)=>(i+1)+'. '+value).join('; '))}</p></section>`:''}<details class="question-elaboration" ${answer.detail?'open':''} data-disclosure="question-detail-${q.id}"><summary>Add your own words <span>optional</span></summary><label class="field"><span class="sr-only">More about ${esc(q.label)}</span><textarea data-question="${q.id}" rows="3" maxlength="1200" placeholder="${esc(q.hint)}">${esc(answer.detail)}</textarea></label></details><p class="field-error" id="error-${q.id}" ${validation[q.id]?'':'hidden'}>Choose an answer or add a few words.</p>${index===2?'<button type="button" class="text-button" data-action="question-more">Personalize further →</button>':''}</section>`;
}
export function questionNavigation(j){
 const index=questionIndex(j),end=index>=2;
 return `<button type="button" class="button secondary" data-action="question-back">← Back</button>${index>2&&index<QUESTIONS.length-1?'<button type="button" class="text-button" data-action="question-next">'+(j.questionnaire?.[QUESTIONS[index].id]?'Next question →':'Skip question →')+'</button>':''}<button type="button" class="button primary" data-action="${end?'question-done':'question-next'}">${end?'Find my direction →':'Continue →'}</button>`;
}
export function advanceQuestion(j){const index=questionIndex(j),q=QUESTIONS[index];if(q.required&&missingAnswers(j.questionnaire).some(x=>x.id===q.id))return false;j.questionIndex=Math.min(index+1,QUESTIONS.length-1);return true;}
