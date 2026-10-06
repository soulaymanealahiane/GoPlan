export const feedbackFor=(j,stage)=>j.refinements?.[stage]||'';
export function previousFor(j,stage){
 if(stage==='targets')return {internships:(j.details?.internships||[]).map(t=>({id:t.id,name:t.name,tier:t.tier,reason:t.reason,tierReason:t.tierReason,industryReason:t.industryReason,sourceUrl:t.sourceUrl,officialUrl:t.officialUrl,country:t.country,organizationType:t.organizationType||'unknown',constraints:t.constraints,caveat:t.caveat})),exchanges:(j.details?.exchanges||[]).map(t=>({id:t.id,name:t.name,tier:t.tier,reason:t.reason,tierReason:t.tierReason,industryReason:t.industryReason,sourceUrl:t.sourceUrl,country:t.country,institutionId:t.institutionId,constraints:t.constraints,caveat:t.caveat})),summary:j.details?.targetSummary||''};
 if(stage==='courses')return {choices:{...j.profile.choices},summary:j.details?.summary||''};
 if(stage==='direction')return {academic:j.advice?.academic||{},summary:j.advice?.summary||''};
 return stage==='pace'?{pace:j.profile.pace,regularCourses:j.profile.regularCourses,summerCourses:j.profile.summerCourses,summers:j.profile.summers,summary:j.paceAdvice?.summary||''}:{summary:j.setup?.summary||''};
}
export function agentContext(j,stage){return {refinement:feedbackFor(j,stage),feedbackHistory:(j.feedbackHistory?.[stage]||[]).slice(-4),currentRecommendation:previousFor(j,stage),replaceableChoices:stage==='courses'?Object.keys(j.agentChoices||{}).filter(id=>!j.protectedChoices?.[id]&&j.agentChoices[id]===j.profile.choices[id]):[]};}
export function rememberFeedback(j,stage,result){
 j.refinements||={};j.feedbackHistory||={};const request=feedbackFor(j,stage);
 if(request)j.feedbackHistory[stage]=[...(j.feedbackHistory[stage]||[]),{request,summary:result.update?.summary||result.summary||''}].slice(-4);
 j.lastUpdates={...j.lastUpdates,[stage]:result.update||null};
}
