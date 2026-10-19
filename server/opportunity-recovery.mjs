import {sanitizeRequest,availableTargets,opportunityRefinementPolicy,validateOpportunitySelection} from './advisor.mjs';
import {rankOpportunityTargets} from './opportunity-matching.mjs';
import {cleanQuestionnaire,questionnaireGoal} from '../dist/questionnaire.js';
import {EVIDENCE_REVIEWED} from '../dist/evidence.js';
import {DATA} from '../dist/planner.js';

const initialPrompts=new Set(['','Choose company recommendations.','Choose exchange destinations and preserve the company recommendations.']);
export const isInitialOpportunityRequest=(input,env)=>env.GOPLAN_SERVICE_ACTION_KIND==='initial'&&initialPrompts.has(String(input?.refinement||'').trim());

// No model calls or live-source claims. Every new suggestion comes from the
// reviewed, degree-compatible pool and remains a target to explore, not an offer.
// This also lets the API recover an already-used failed INITIAL action without
// resetting the allowance or purchasing another generation.
export function reviewedOpportunityShortlist(input,{reasonCode='unavailable'}={}){
 if(!DATA.programs.some(p=>p.id===input?.profile?.program))throw Error('Choose a supported degree before exploring opportunities.');
 const questionnaire=cleanQuestionnaire(input?.questionnaire);
 const request=sanitizeRequest({...input,stage:'details',goal:questionnaireGoal(questionnaire)||String(input?.goal||'Help me explore university internships and exchanges.').slice(0,4000)});
 request.questionnaire=questionnaire;request.refinement=String(input?.refinement||'').slice(0,2500);
 const current=input?.currentRecommendation&&typeof input.currentRecommendation==='object'?input.currentRecommendation:{};
 const policy=opportunityRefinementPolicy(request.refinement,current),out={};
 for(const type of ['internships','exchanges']){
  const pool=availableTargets(type,request.profile),prior=Array.isArray(current[type])?current[type].slice(0,5):[];
  const preserve=policy.preserveTypes.includes(type)&&prior.length;
  const ranked=rankOpportunityTargets(pool,request,type,{limit:5});
  const selected=preserve?prior.map(t=>{
   const record=pool.find(r=>r.id===t.id);
   if(!record)throw Error('An existing target is outside the reviewed pool; preserve it separately before recovering missing suggestions.');
   return {...record,...Object.fromEntries(['reason','tierReason','industryReason','tier'].filter(k=>typeof t[k]==='string').map(k=>[k,t[k].slice(0,1000)]))};
  }):ranked;
  validateOpportunitySelection(selected,pool,type,{current:prior,policy:preserve?policy:{preserveTypes:[]}});
  out[type]=selected.map((record,i)=>{
   const tier=i<selected.length-2?'reach':i===selected.length-2?'target':'safety';
   return {...record,tier,
    reason:preserve&&record.reason?record.reason:record.matchThemes?.length?'Explore how '+record.matchThemes.slice(0,2).join(' and ')+' connect with your degree.':'A reviewed option to explore alongside your degree.',
    tierReason:preserve&&record.tierReason?record.tierReason:tier==='reach'?'A stretch to explore; compare preparation requirements.':tier==='target'?'Compare its subjects or activities with your interests.':'A broader search route; admission or hiring is not guaranteed.',
    industryReason:preserve&&record.industryReason?record.industryReason:'Fit is inferred from your profile and the reviewed source.',
    answerIds:[],evidenceIds:[]};
  });
 }
 const notice='Internship openings, exchange availability and individual eligibility still need confirmation.';
 return {source:'reviewed',recovery:'reviewed-opportunity-shortlist',recoveryReason:['budget','incomplete','invalid','provider','timeout','unavailable'].includes(reasonCode)?reasonCode:'unavailable',generatedAt:new Date().toISOString(),evidenceReviewed:EVIDENCE_REVIEWED,summary:'Your shortlist to explore.',...out,update:{summary:'Your reviewed shortlist is ready.',changes:[],limitations:[notice]},research:{status:'reviewed',companies:[],exchanges:[],facts:[],sources:[],gaps:[notice]}};
}
