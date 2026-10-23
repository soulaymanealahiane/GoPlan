// This contract describes implemented operations, not promised future features.
export const AGENT_CAPABILITIES={
 setup:['interpret a stated starting degree level'],
 direction:['change a supported degree, focus, second focus or minor'],
 courses:['replace or redistribute eligible courses within existing degree slots'],
 targets:['replace or rerank supported companies and exchange destinations'],
 pace:['change semester loads, summer study, course placement and eligible course swaps'],
 replan:['change semester loads, course placement and eligible course swaps'],
 change:['change supported academic choices, courses, opportunities and semester placement','rebuild a roadmap while retaining recorded study'],
 question:['explain the current plan and supplied academic rules']
};
const rulesMessage='GoPlan is designed not to let the AI change academic rules or dismiss degree-check warnings. No changes were made. I can adjust eligible course choices and semester placement. An academic rule correction requires a GoPlan application update.';
const blocks=[
 {id:'academic-rules',message:rulesMessage,patterns:[
  /\b(?:remove|clear|dismiss|hide|ignore|disable|waive|override|delete|turn off)\s+(?:(?:the|this|that|a|my|your|remaining|incorrect|wrong|review|prerequisite|corequisite|degree|check)\s+){0,7}(?:flags?|warnings?|checks?|prerequisites?|corequisites?|(?:academic|degree|prerequisite|corequisite) rules?)\b/i,
  /\b(?:change|edit|rewrite|correct|waive|override)\s+(?:(?:the|this|that|a|my|your|incorrect|wrong|official)\s+){0,4}(?:prerequisite|corequisite|degree requirement|academic rule)\b/i,
  /\b(?:remove|drop|waive)\s+[A-Z]{3}\s*\d{4}\s+(?:as|from|as being)\s+(?:a |the )?(?:prerequisite|corequisite)\b/i
 ]},
 {id:'portal-actions',message:'GoPlan’s AI is not programmed to register courses, apply for exchanges or internships, or change university records. No action was taken. I can prepare your roadmap; complete official submissions through the university or organization.',patterns:[/\b(?:register|enroll)\s+me\b/i,/\b(?:submit|send|complete)\s+(?:my |the |an? )?(?:exchange|internship|university|course)?\s*application\b/i,/\b(?:change|edit|update|delete)\s+(?:my |the )?(?:official )?(?:grades?|transcript|university records?)\b/i]},
 {id:'attachments',message:'This GoPlan field accepts text only. The AI is not programmed to receive images, screenshots or files here. Describe a supported plan change in text. No changes were made.',patterns:[/\b(?:upload|attach|paste|send|share)\s+(?:(?:an?|the|my|this|you|a copy of)\s+){0,4}(?:image|screenshot|photo|picture|flowchart|diagram|pdf|file|attachment)\b/i]},
 {id:'external-messages',message:'GoPlan’s AI is not programmed to send emails or contact advisers, companies or universities. No message was sent. I can explain your plan and suggest next steps.',patterns:[/\b(?:send|email|message|contact)\s+(?:(?:an?|the|my|this|to|a message to|an email to)\s+){0,4}(?:adviser|advisor|professor|university|company|employer|email)\b/i]}
];
const activeClauses=text=>String(text||'').split(/[.;\n]|\b(?:and|but|while)\s+(?=(?:keep|retain|preserve|do not|don't)\b)/i).filter(s=>!/^\s*(?:do not|don't|dont|never)\b/i.test(s));
export function unsupportedOperation(text){
 for(const clause of activeClauses(text)){
  // Resolving a flag by a supported course move is a plan edit, not suppression.
  if(/\b(?:by|through)\s+(?:moving|swapping|replacing|rescheduling|taking)\b/i.test(clause))continue;
  const match=blocks.find(block=>block.patterns.some(pattern=>pattern.test(clause)));if(match)return {id:match.id,message:match.message};
 }
 return null;
}
export const capabilityResponse=blocked=>({kind:'answer',source:'capability-policy',unsupported:true,summary:blocked.message,answer:blocked.message,update:{summary:blocked.message,changes:[],limitations:[blocked.message]}});
export const requestedOperation=input=>input?.refinement||input?.changeRequest||input?.question||'';
export function clearlySupportedOperation(text,stage){
 if(unsupportedOperation(text))return false;
 if(['pace','replan','change'].includes(stage)&&/\b(?:by|through)\s+(?:moving|swapping|replacing|rescheduling|taking)\b/i.test(text))return true;
 const patterns={direction:/\b(?:change|switch|choose|select|recommend|replace|add|remove|drop)\b.*\b(?:degree|major|minor|focus|speciali[sz]ation|concentration)\b/i,courses:/\b(?:change|replace|swap|redistribute|rebalance|clear)\b.*\b(?:electives?|courses?|course choices)\b/i,targets:/\b(?:change|recommend|replace|rerank|find|show)\b.*\b(?:compan(?:y|ies)|startups?|internships?|exchanges?|destinations?|universities)\b/i,pace:/\b(?:move|swap|change|rebalance|make|increase|reduce|set)\b.*\b(?:courses?|semesters?|summers?|loads?|terms?)\b/i};
 if(stage==='replan')stage='pace';return stage==='change'?Object.values(patterns).some(p=>p.test(text)):!!patterns[stage]?.test(text);
}
export function capabilityContext(stage){return {allowed:AGENT_CAPABILITIES[stage]||[],input:'Text only; no image, file or attachment input.',notImplemented:blocks.map(({id,message})=>({id,explanation:message})),policy:'Apply supported edits. For a genuinely unimplemented operation, explicitly say GoPlan is not programmed to perform it and no change was made; offer a supported alternative. Missing information, a constraint, a failed service call and an unimplemented capability are different conditions. Never label a supported edit unimplemented merely because it requires reasoning. Ask only questions the student can answer as text. Never ask for screenshots, flowcharts, uploads or attachments. Never claim to modify academic rules or dismiss validation flags. A corequisite can be earlier or concurrent; never insist on the same semester.'};}
export function unsupportedModelResponse(stage){return capabilityResponse({message:'GoPlan’s AI is not programmed to carry out that operation in this version. No changes were made. In this step I can '+(AGENT_CAPABILITIES[stage]||AGENT_CAPABILITIES.change).join(', or ')+'.'});}
export function validateCapabilityOutput(value){
 const prose=[];const visit=(node,key='')=>{if(typeof node==='string'&&/^(answer|summary|reason|explanation|rationale|.*Rationale|questions|changes|limitations)$/.test(key))prose.push(node);else if(Array.isArray(node))node.forEach(x=>visit(x,key));else if(node&&typeof node==='object')Object.entries(node).forEach(([k,v])=>visit(v,k));};visit(value);
 for(const text of prose){
  const asks=/\b(?:upload|attach|paste|share|send|provide)\b[^.!?\n]{0,100}\b(?:image|screenshot|photo|picture|flowchart|diagram|pdf|attachment)\b/i;
  const claims=/\b(?:i|we)\s+(?:have\s+)?(?:removed|dismissed|disabled|waived|overridden|changed)\s+(?:(?:the|your|a|remaining)\s+){0,3}(?:prerequisite|corequisite|academic|degree.check|review)?\s*(?:flag|warning|rule|requirement)\b/i;
  if(asks.test(text)&&!/(?:cannot|can't|does not|not programmed|text.only)[^.!?\n]{0,60}(?:upload|attach|paste|share|send|provide)/i.test(text)||claims.test(text))throw Object.assign(Error('The response requested an unavailable input or claimed an operation outside the capability contract. Explain the actual limitation, ask only text-answerable questions and claim no unimplemented action.'),{code:'CAPABILITY_OUTPUT'});
 }
}
