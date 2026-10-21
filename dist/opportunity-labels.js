import OPPORTUNITIES from './opportunities.js';

const reviewed=(target,type)=>OPPORTUNITIES[type]?.find(record=>record.id===target?.id);
// Resolve old saved cards from reviewed records without changing a saved plan.
// A partner's membership of another network never changes its recommended route.
export function exchangeScheme(target){
 const scheme=String(reviewed(target,'exchanges')?.scheme||target?.scheme||'').trim();
 if(/^bilateral(?: exchange)?$/i.test(scheme))return 'Bilateral Exchange';
 if(/^pel$/i.test(scheme))return 'PEL';
 if(/^isep(?: exchange)?$/i.test(scheme))return 'ISEP Exchange';
 return 'Exchange route to confirm';
}
export function companyType(target){
 const record=reviewed(target,'internships')||target||{};
 if(record.kind==='organization')return 'Organization';
 return {startup:'Startup',scaleup:'Scaleup',established:'Established company'}[record.organizationType]||'Company';
}
const sectors={
 telecommunications:'Telecom & connectivity','agriculture-food':'Agriculture & food',
 'software-services':'Software & IT services',software:'Software & IT services',
 automotive:'Automotive',fintech:'Financial technology',aerospace:'Aerospace',
 'pharmaceuticals-biotech':'Pharmaceuticals & biotech',consulting:'Business consulting',
 advertising:'Advertising & marketing','media-publishing':'News & publishing',
 'renewable-energy':'Renewable energy','power-generation':'Energy & power',
 'logistics-trade':'Logistics & trade','industrial-engineering':'Industrial engineering',
 'mining-materials':'Mining & materials',proptech:'Property technology',
 logistics:'Logistics & transport',engineering:'Engineering',health:'Healthcare',
 agriculture:'Agriculture & food',politics:'Public policy & research',finance:'Financial services',
 water:'Water & environment',retail:'Retail & distribution',rail:'Rail & transport',
 materials:'Materials & manufacturing',media:'Media & broadcasting',
 'human-resources':'Recruitment & HR',energy:'Energy & power',cloud:'Cloud & IT services',
 electronics:'Electronics & semiconductors',banking:'Banking & finance',insurance:'Insurance',
 manufacturing:'Manufacturing',saas:'Business software',ai:'AI & robotics',
 cybersecurity:'Cybersecurity & digital trust',data:'Data & analytics',journalism:'News & media',
 food:'Food & beverages',aviation:'Aviation',technology:'Technology & distribution'
};
export function companySector(target){
 const record=reviewed(target,'internships')||target||{};
 const industries=Array.isArray(record.industries)?record.industries:[];
 const fields=[...industries,...(Array.isArray(record.fields)?record.fields:[])];
 // Use the documented activity, rather than an internal growth-stage status.
 if(fields.includes('proptech'))return 'Property technology';
 if(fields.includes('health')&&(fields.includes('software')||fields.includes('ai')))return 'Health technology';
 if(fields.includes('pharma'))return 'Pharmaceuticals';
 if(industries[0]==='water'&&fields.includes('food'))return 'Food & beverages';
 if(industries[0]==='retail'&&fields.some(f=>['software','fintech'].includes(f)))return 'Retail technology';
 if(industries[0]==='consulting'&&fields.includes('cloud'))return 'Technology consulting';
 return fields.map(field=>sectors[field]).find(Boolean)||'Business & services';
}
export function opportunityLabel(target,type='internships'){
 const record=reviewed(target,type)||target||{};
 return [type==='exchanges'?exchangeScheme(target):companySector(target),record.country||target?.country].filter(Boolean).join(' · ');
}
