// Explicit school-dependent prerequisites from the supplied November 2025 BBA sheet, p4.
export const BUSINESS_SOURCE={file:'BBA-Program-sheet-Nov-2025 (5).pdf',page:4};
export function describeRule(rule){
 const parts=[];
 if(rule.all?.length)parts.push('Complete '+rule.all.join(' and '));
 if(rule.any?.length)parts.push('complete one of '+rule.any.join(' / '));
 if(rule.coreq?.length)parts.push('complete or take concurrently: '+rule.coreq.join(' and '));
 if(rule.minCredits)parts.push(rule.minCredits+' earned credits required');
 if(rule.finalTerm)parts.push('take in the final regular semester');
 return parts.length?parts.join('; ')+'.':'No additional prerequisite listed in this program rule.';
}
export function businessRule(program,code){
 const school=program==='BBA'?'SBA':['BSCSC','BSGE','BSRESE','BSEMS'].includes(program)?'SSE':['BACS','BAIS','BSESS'].includes(program)?'SSAH':null;
 if(!school)return null;
 if(['FIN3301','MGT3301','MKT3301'].includes(code))return {all:school==='SBA'?['ACC2302','ECO2302']:school==='SSE'?['ACC2301','EGR2302']:['ACC2301','ECO2302'],any:[]};
 if(program!=='BBA')return null;
 const rules={
  ACC2301:{all:[],any:['MTH1305','MTH1304','MTH1311','MTH1303']},
  ACC2302:{all:[],any:['ACC2301','EGR2391']},
  ACC3201:{all:['ACC2302'],any:[],minCredits:60},
  ECO2301:{all:[],any:['MTH1305','MTH1304','MTH1311','MTH1303']},
  ECO2302:{all:['ECO2301'],any:[]},
  GBU2301:{all:[],any:['MTH1305','MTH1304','MTH1311','MTH1303']},
  GBU3302:{minCredits:60},GBU3203:{minCredits:60},
  GBU3311:{all:['GBU2301'],any:[]},GBU4101:{minCredits:90,finalTerm:true},
  INT4301:{all:['INT4001','GBU3203','ACC3201'],any:[],minCredits:90},
  MGT3302:{all:['MGT3301','MKT3301','FIN3301'],any:[]},
  MGT4303:{all:['MGT3301'],any:['GBU3311','MTH3301']},
  MGT4301:{all:['INT4301','MGT3301'],any:[],finalTerm:true},
  MIS3301:{all:['MGT3301'],any:['CSC1300','CSC1401']}
 };return rules[code]||null;
}
