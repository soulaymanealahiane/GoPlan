const STAGES=new Set(['setup','direction','courses','targets','pace','replan','change','question']);
export const EVENTS=new Set(['plan_saved','plan_updated','targets_updated','excel_requested']);
const DAY=86400000;
export function channelFor(origin){return origin==='https://app.goplan.local'?'android':/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin||'')?'local':'web';}
const bounded=n=>Number.isFinite(n)?Math.max(0,Math.min(10000000,Math.round(n))):0;
export async function recordUsage(env,{kind='adviser',stage,channel='web',outcome='success',durationMs=0,providerCalls=0,inputTokens=0,outputTokens=0},now=Date.now()){
 if(env.ANALYTICS_ENABLED!=='true'||!env.DB||channel==='local')return;
 if(!['adviser','event'].includes(kind)||!(kind==='event'?EVENTS:STAGES).has(stage)||!['web','android'].includes(channel)||!['success','error','cached'].includes(outcome))return;
 const day=new Date(now).toISOString().slice(0,10),id=[day,kind,stage,channel,outcome].join(':'),cutoff=new Date(now-90*DAY).toISOString().slice(0,10);
 await env.DB.batch([
  env.DB.prepare('DELETE FROM usage_daily WHERE day<?').bind(cutoff),
  env.DB.prepare(`INSERT INTO usage_daily(id,day,kind,stage,channel,outcome,count,duration_ms,provider_calls,input_tokens,output_tokens) VALUES(?,?,?,?,?,?,1,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET count=count+1,duration_ms=duration_ms+excluded.duration_ms,provider_calls=provider_calls+excluded.provider_calls,input_tokens=input_tokens+excluded.input_tokens,output_tokens=output_tokens+excluded.output_tokens`).bind(id,day,kind,stage,channel,outcome,bounded(durationMs),bounded(providerCalls),bounded(inputTokens),bounded(outputTokens))
 ]);
}
export async function recordSafely(env,metric){try{await recordUsage(env,metric);}catch{console.warn('Usage counters unavailable.');}}
export function isAnalyticsAdmin(request,env){const key=env.ANALYTICS_ADMIN_KEY||env.FEEDBACK_REVIEW_KEY;return !!key&&request.headers.get('Authorization')==='Bearer '+key;}
export async function analyticsSnapshot(env,days=30,now=Date.now()){
 if(!env.DB)throw Error('Analytics storage unavailable.');
 days=Math.max(1,Math.min(90,Math.floor(Number(days)||30)));
 const since=new Date(now-(days-1)*DAY).toISOString().slice(0,10);
 const rows=(await env.DB.prepare('SELECT day,kind,stage,channel,outcome,count,duration_ms,provider_calls,input_tokens,output_tokens FROM usage_daily WHERE day>=? ORDER BY day,kind,stage').bind(since).all()).results;
 const reports=(await env.DB.prepare('SELECT status,COUNT(*) AS count FROM feedback_reports WHERE expires_at>? GROUP BY status').bind(now).all()).results;
 const total={operations:0,success:0,errors:0,cached:0,durationMs:0,providerCalls:0,inputTokens:0,outputTokens:0};
 for(const r of rows.filter(r=>r.kind==='adviser')){total.operations+=r.count;total[r.outcome==='error'?'errors':r.outcome]+=r.count;total.durationMs+=r.duration_ms;total.providerCalls+=r.provider_calls;total.inputTokens+=r.input_tokens;total.outputTokens+=r.output_tokens;}
 return {generatedAt:new Date(now).toISOString(),enabled:env.ANALYTICS_ENABLED==='true',days,since,totals:total,rows,reports,limits:['Counts begin with this release; earlier activity is unavailable.','These are operations and events, not unique students or retention.','Client events are best-effort; exports count download requests, not completed downloads.','Token totals reflect reported provider usage; consult OpenAI billing for actual cost.','Local preview activity is excluded. No names, answers, grades or plan contents are recorded.']};
}
