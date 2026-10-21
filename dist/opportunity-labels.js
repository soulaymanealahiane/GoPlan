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
 return {startup:'Startup',scaleup:'Scaleup',established:'Established company'}[record.organizationType]||'Type unconfirmed';
}
export function opportunityLabel(target,type='internships'){
 const record=reviewed(target,type)||target||{};
 return [type==='exchanges'?exchangeScheme(target):companyType(target),record.country||target?.country].filter(Boolean).join(' · ');
}
