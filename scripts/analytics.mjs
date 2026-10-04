import {createInterface} from 'node:readline/promises';
import {loadAnalytics} from './analytics-client.mjs';
const local=process.argv.includes('--local'),args=process.argv.slice(2).filter(x=>x!=='--local');
async function show(days){const data=await loadAnalytics(days,{local}),t=data.totals,n=t.success+t.errors;console.log(`\nGoPlan | ${data.since} onwards | ${data.enabled?'Measurement enabled':'Measurement disabled'}`);console.table({'Adviser operations':t.operations,'Completed successfully':t.success,'Failed':t.errors,'Cached responses':t.cached,'Success rate (excluding cache)':n?(100*t.success/n).toFixed(1)+'%':'No data','Average processing time':n?(t.durationMs/n/1000).toFixed(1)+' s':'No data','Provider calls':t.providerCalls,'Input tokens':t.inputTokens,'Output tokens':t.outputTokens});console.table(data.rows);console.log(data.limits.join('\n'));}
if(args[0]==='--json'){console.log(JSON.stringify(await loadAnalytics(args[1]||30,{local}),null,2));}
else if(args.length){await show(args[0]);}
else{
 const terminal=createInterface({input:process.stdin,output:process.stdout});
 console.log('GoPlan private usage terminal. Commands: 7, 30, 90 (days), help, exit. No paid AI calls.');
 try{while(true){const command=(await terminal.question('goplan> ')).trim().toLowerCase();if(command==='exit'||command==='quit')break;if(command==='help'){console.log('Enter 7, 30 or 90 to view live aggregate usage. Export JSON with npm run analytics -- --json 30.');continue;}if(!['7','30','90'].includes(command))continue;try{await show(command);}catch(e){console.log(e.message);}}}finally{terminal.close();}
}
