export const QUESTIONS=[
 {id:'ambitions',label:'What problems would you like to solve?',hint:'Describe an impact, a possible career, or something you want to build. Being undecided is fine.',required:true},
 {id:'activities',label:'What work would you enjoy doing each day?',hint:'For example: building technology, investigating data, designing, writing, negotiating, or leading people.',required:true},
 {id:'strengths',label:'What do you enjoy learning, and what feels difficult?',hint:'Mention subjects, projects and skills. You do not need to share grades.',required:true},
 {id:'industries',label:'Which industries or communities interest you?',hint:'Explain why. Include industries you would prefer to avoid.'},
 {id:'priorities',label:'What matters most in your future work?',hint:'Rank or describe income, stability, impact, creativity, international work and flexibility.'},
 {id:'entrepreneurship',label:'Would you like to start a business?',hint:'Describe an idea, the customers you want to serve, or whether you prefer employment or research.'},
 {id:'automation',label:'How do you want to work with AI?',hint:'Build it, use it in another field, or prioritize work involving human judgment, relationships or physical systems?'},
 {id:'constraints',label:'What practical limits should your plan respect?',hint:'Study workload, summer availability, budget, exchange preferences, graduation timing or other commitments. Avoid private details.'}
];
export const emptyQuestionnaire=()=>Object.fromEntries(QUESTIONS.map(q=>[q.id,'']));
export function cleanQuestionnaire(raw={}){return Object.fromEntries(QUESTIONS.map(q=>[q.id,typeof raw[q.id]==='string'?raw[q.id].trim().slice(0,1200):'']));}
export function questionnaireGoal(raw={}){return QUESTIONS.filter(q=>raw[q.id]?.trim()).map(q=>q.label+' '+raw[q.id].trim()).join('\n').slice(0,4000);}
export function missingAnswers(raw={}){return QUESTIONS.filter(q=>q.required&&String(raw[q.id]||'').trim().length<10&&!/^(undecided|not sure|unsure)$/i.test(String(raw[q.id]||'').trim()));}
