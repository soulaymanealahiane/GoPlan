export function analyticsExport(snapshot,channel='all',format='csv'){
 if(!['all','web','android'].includes(channel)||!['csv','json'].includes(format))throw Object.assign(Error('Choose a valid export format and channel.'),{status:400});
 const rows=snapshot.rows.filter(r=>channel==='all'||r.channel===channel),columns=['day','kind','stage','channel','outcome','count','duration_ms','provider_calls','input_tokens','output_tokens'];
 const safeRows=rows.map(r=>Object.fromEntries(columns.map(k=>[k,r[k]])));
 const text=format==='csv'?[columns,...safeRows.map(r=>columns.map(k=>r[k]))].map(row=>row.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(',')).join('\r\n'):JSON.stringify({generatedAt:snapshot.generatedAt,since:snapshot.since,days:snapshot.days,channel,rows:safeRows,limits:snapshot.limits},null,2);
 return {text,headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="GoPlan-${snapshot.since}-${channel}.${format}"`}};
}
