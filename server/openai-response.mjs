import {fetchOpenAI} from './openai-transport.mjs';
export const DEFAULT_MODEL='gpt-6-astra';
export const REASONING_EFFORTS=new Set(['low','medium','high','xhigh','max']);
export function reasoningEffort(value,fallback='high'){
 if(!value)return fallback;
 if(!REASONING_EFFORTS.has(value))throw Error('Unsupported OpenAI reasoning effort.');
 return value;
}
// Native Responses preserve reasoning/tool items and strict output schemas.
// Never downgrade the configured model or change provider after an error.
export function fetchOpenAIResponse(init,fetcher=fetch){
 return fetchOpenAI('https://api.openai.com/v1/responses',init,fetcher);
}
