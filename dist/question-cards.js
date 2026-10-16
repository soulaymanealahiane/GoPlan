import {QUESTIONS,missingAnswers} from './questionnaire.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Broad interests reflect the demo's computing, business, engineering, arts,
// communication, international studies and sustainability programs, not a
// shortcut that maps a choice directly to a degree.
export const QUICK_CHOICES={
 ambitions:['Build useful technology','Grow a business','Solve environmental problems','Improve communities','Create and communicate ideas','Understand global challenges','Design better systems','Undecided'],
 activities:['Programming and building products','Analyzing data and patterns','Leading people and projects','Designing and creating','Writing and storytelling','Negotiating and connecting people','Experimenting with physical systems','Undecided'],
 strengths:['Mathematics and logic','Coding and technology','Business and economics','Science and engineering','Languages and writing','Creative projects','People and social questions','Undecided'],
 industries:['Technology and AI','Finance and fintech','Energy and sustainability','Manufacturing and logistics','Media and creative industries','Public policy and international affairs','Startups and small businesses','Still exploring'],
 priorities:['Good income','Stable employment','Meaningful impact','Creative freedom','International opportunities','Flexible working life','Learning and research'],
 entrepreneurship:['I want to start a business','I want startup experience first','I prefer an established employer','I am interested in research','I am still deciding'],
 automation:['Build AI systems','Use AI in another industry','Work with people and human judgment','Build or operate physical systems','I am still exploring'],
 constraints:['A manageable regular workload','Finish as soon as feasible','Keep summers free','Include summer study','Explore an exchange','Keep costs in mind','No particular constraints yet']
};
export const questionIndex=j=>Math.max(0,Math.min(QUESTIONS.length-1,Number.isInteger(j.questionIndex)?j.questionIndex:0));
export function cardAnswer(j,id){
 const saved=j.questionCards?.[id];
 return saved?{choices:(Array.isArray(saved.choices)?saved.choices:[]).filter(x=>QUICK_CHOICES[id]?.includes(x)),detail:typeof saved.detail==='string'?saved.detail.slice(0,1200):''}:{choices:[],detail:j.questionnaire?.[id]||''};
}
function save(j,id,answer){
 j.questionCards||={};j.questionCards[id]=answer;j.questionnaire||={};
 j.questionnaire[id]=[answer.choices.join('; '),answer.detail.trim()].filter(Boolean).join('. More about me: ').slice(0,1200);
}
export function selectQuickAnswer(j,id,value){
 if(!QUICK_CHOICES[id]?.includes(value))throw Error('Choose one of the displayed answers.');
 const answer=cardAnswer(j,id),unsure=x=>/^(Undecided|Still exploring|I am still)/.test(x);
 answer.choices=answer.choices.includes(value)?answer.choices.filter(x=>x!==value):unsure(value)?[value]:[...answer.choices.filter(x=>!unsure(x)),value];
 save(j,id,answer);
}
export function writeCardDetail(j,id,value){if(!QUICK_CHOICES[id])return;save(j,id,{...cardAnswer(j,id),detail:String(value).slice(0,1200)});}
export function questionnaireCard(j,validation={}){
 const index=questionIndex(j),q=QUESTIONS[index],answer=cardAnswer(j,q.id),required=index<3;
 return `<section class="question-card" aria-labelledby="question-card-title"><div class="question-card-progress"><span>${required?`${index+1} of 3 quick questions`:'Make it more personal · optional'}</span><span aria-hidden="true">${required?'●'.repeat(index+1)+'○'.repeat(2-index):'✦'}</span></div><h2 id="question-card-title" tabindex="-1">${esc(q.label)}</h2><p class="question-card-hint">Pick what fits. You can choose more than one.</p><div class="quick-choices" role="group" aria-label="${esc(q.label)}">${QUICK_CHOICES[q.id].map((value,i)=>`<button type="button" class="quick-choice ${answer.choices.includes(value)?'selected':''}" data-question-choice="${q.id}" data-choice-index="${i}" aria-pressed="${answer.choices.includes(value)}"><span>${esc(value)}</span><span aria-hidden="true">${answer.choices.includes(value)?'✓':'+'}</span></button>`).join('')}</div><details class="question-elaboration" ${answer.detail?'open':''} data-disclosure="question-detail-${q.id}"><summary>Add your own words <span>optional</span></summary><label class="field"><span class="sr-only">More about ${esc(q.label)}</span><textarea data-question="${q.id}" rows="3" maxlength="1200" placeholder="${esc(q.hint)}">${esc(answer.detail)}</textarea></label></details><p class="field-error" id="error-${q.id}" ${validation[q.id]?'':'hidden'}>Choose an answer or add a few words.</p>${index===2?'<button type="button" class="text-button" data-action="question-more">Personalize further →</button>':''}</section>`;
}
export function questionNavigation(j){
 const index=questionIndex(j),end=index>=2;
 return `<button type="button" class="button secondary" data-action="question-back">← Back</button>${index>2&&index<QUESTIONS.length-1?'<button type="button" class="text-button" data-action="question-next">'+(j.questionnaire?.[QUESTIONS[index].id]?'Next question →':'Skip question →')+'</button>':''}<button type="button" class="button primary" data-action="${end?'question-done':'question-next'}">${end?'Find my direction →':'Continue →'}</button>`;
}
export function advanceQuestion(j){const index=questionIndex(j),q=QUESTIONS[index];if(q.required&&missingAnswers(j.questionnaire).some(x=>x.id===q.id))return false;j.questionIndex=Math.min(index+1,QUESTIONS.length-1);return true;}
