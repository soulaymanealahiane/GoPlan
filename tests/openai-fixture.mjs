// Native Responses fixtures with explicit synthetic usage. No live requests.
export const openaiFixture=(payload,options)=>Response.json(payload.status==='completed'?{usage:{input_tokens:1000,output_tokens:500},...payload}:payload,options);
