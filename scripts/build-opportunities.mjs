import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(fs.readFileSync(new URL('data/guidance/'+name,root),'utf8'));
const companies=read('companies-v4.json'),exchanges=read('exchanges-v4.json');
for(const patch of read('exchange-graduate-additions.json').patches){
 const target=exchanges.exchanges.find(t=>t.id===patch.id);if(!target)throw Error('Unknown institution patch: '+patch.id);
 const {addPrograms,sourcesToAdd,...fields}=patch;Object.assign(target,fields);target.sources=[...target.sources,...(sourcesToAdd||[])];
}
const data={reviewedAt:'2026-09-16',internships:[...companies.internships.map(t=>({...t,organizationType:t.organizationType||'established'})),...read('startups-v6.json').internships],exchanges:exchanges.exchanges.filter(x=>x.curated),exchangeSource:{term:exchanges.sourceTerm,window:exchanges.sourceWindow,counts:exchanges.counts},isep:exchanges.isep};
fs.writeFileSync(new URL('dist/opportunities.js',root),'// Reviewed primary-source evidence. Rebuild with node scripts/build-opportunities.mjs\nexport default '+JSON.stringify(data)+';\n');
