// Existing academic fixtures describe planner proposals. Translate them into
// Groq's actual wire response so the provider adapter is exercised by the suite.
export function groqFixture(payload,options){
 if(payload?.status==='completed'&&Array.isArray(payload.output)){
  const content=payload.output.flatMap(x=>x.content||[]);
  return Response.json({model:payload.model||'fixture-provider',choices:[{finish_reason:'stop',message:{role:'assistant',content:content.filter(c=>c.type==='output_text').map(c=>c.text).join(''),refusal:content.find(c=>c.type==='refusal')?.refusal}}],usage:{prompt_tokens:payload.usage?.input_tokens||0,completion_tokens:payload.usage?.output_tokens||0}},options);
 }
 return Response.json(payload,options);
}
