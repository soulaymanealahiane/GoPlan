import fs from 'node:fs';
try{process.loadEnvFile(new URL('../.env',import.meta.url));}catch(e){if(e.code!=='ENOENT')throw e;}
const args=process.argv.slice(2),live=args.includes('--live'),[command,file]=args.filter(x=>x!=='--live');
const base=live?'https://goplan-aui-demo-k7m9.salahiane9.chatgpt.site':'http://127.0.0.1:4317';
if(!['list','review'].includes(command)||command==='review'&&!file)throw Error('Use: node scripts/review-feedback.mjs list [--live], or review decision.json [--live].');
if(!process.env.FEEDBACK_REVIEW_KEY)throw Error('Configure the private FEEDBACK_REVIEW_KEY in the ignored .env file. Never use the student demo code as the reviewer key.');
const body=command==='review'?JSON.parse(fs.readFileSync(file,'utf8')):{};
const response=await fetch(base+'/api/review/'+(command==='list'?'list':'decision'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FEEDBACK_REVIEW_KEY},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const result=await response.json();if(!response.ok)throw Error(result.error||'Review request failed.');
console.log(JSON.stringify(result,null,2));
