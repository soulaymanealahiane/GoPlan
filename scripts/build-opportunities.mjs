import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL('data/guidance/'+name,root),'utf8'));
const companies=read('companies-v4.json'),exchanges=read('exchanges-v4.json');
for(const patch of read('exchange-graduate-additions.json').patches){
 const target=exchanges.exchanges.find(t=>t.id===patch.id);if(!target)throw Error('Unknown institution patch: '+patch.id);
 const {addPrograms,sourcesToAdd,...fields}=patch;Object.assign(target,fields);target.sources=[...target.sources,...(sourcesToAdd||[])];
}
const expansion=read('opportunities-expansion-v12.json');
for(const patch of expansion.exchangePatches){const target=exchanges.exchanges.find(t=>t.id===patch.id);if(!target)throw Error('Unknown AUI-listed institution: '+patch.id);const {sourcesToAdd,...fields}=patch;Object.assign(target,fields,{curated:true,academicFitReviewedAt:expansion.reviewedAt});target.sources=[...target.sources,...sourcesToAdd];target.constraints=[...target.constraints,patch.reason];}
const variety=read('opportunities-variety-v13.json');
for(const patch of variety.exchangePatches){
 const target=exchanges.exchanges.find(t=>t.id===patch.id);if(!target)throw Error('Unknown AUI-listed institution: '+patch.id);
 if(target.businessOnly&&patch.programs.some(program=>program!=='BBA'))throw Error('Business-only AUI route cannot be broadened: '+patch.id);
 const {sourcesToAdd,eligibilityToAdd,constraintsToAdd,...fields}=patch;
 Object.assign(target,fields,{curated:true,academicFitReviewedAt:variety.reviewedAt});target.sources=[...target.sources,...sourcesToAdd];target.eligibility=[...target.eligibility,...(eligibilityToAdd||[])];target.constraints=[...target.constraints,...(constraintsToAdd||[]),patch.reason];
}
const breadth=read('companies-breadth-v14.json');
const data={reviewedAt:breadth.reviewedAt,internships:[...companies.internships.map(t=>({...t,organizationType:t.organizationType||'established'})),...read('startups-v6.json').internships,...expansion.internships,...variety.internships,...breadth.internships],exchanges:exchanges.exchanges.filter(x=>x.curated),exchangeSource:{term:exchanges.sourceTerm,window:exchanges.sourceWindow,counts:exchanges.counts},isep:exchanges.isep};
if(new Set(data.internships.map(t=>t.id)).size!==data.internships.length)throw Error('Duplicate reviewed company ID.');
fs.writeFileSync(new URL('dist/opportunities.js',root),'// Reviewed primary-source evidence. Rebuild with node scripts/build-opportunities.mjs\nexport default '+JSON.stringify(data)+';\n');
