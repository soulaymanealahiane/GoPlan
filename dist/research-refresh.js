// A research refresh may update supporting evidence, never planning decisions.
export function applyResearchRefresh(j,stage,result){
 if(result?.kind!=='research'||!result.research||!['direction','targets'].includes(stage))throw Error('Research refresh did not return usable evidence.');
 if(stage==='direction'){if(j.advice)j.advice={...j.advice,research:result.research};return;}
 const fields=['sourceUrl','officialUrl','sources','researchCheckedAt','academicFit','researchFit','eligibilityEvidence','languageEvidence','termEvidence','sourcePublishedDate','sourceDateKnown','researchSources','researchLimitations','evidenceStatus'];
 const details={...j.details,targetResearch:result.research};
 for(const type of ['internships','exchanges'])details[type]=(j.details?.[type]||[]).map(t=>{
  const update=(result.evidenceUpdates?.[type]||[]).find(x=>x.id===t.id);
  return update?{...t,...Object.fromEntries(fields.filter(k=>update[k]!==undefined).map(k=>[k,update[k]]))}:t;
 });
 j.details=details;
}
