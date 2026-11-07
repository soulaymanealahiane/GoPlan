import assert from 'node:assert/strict';import fs from 'node:fs';
import {notificationTimer,NOTIFICATION_DURATION} from './dist/notifications.js';
let now=0,next=0,visible='',hidden=0;const jobs=new Map(),clock={setTimeout(fn,delay){jobs.set(++next,{fn,at:now+delay});return next;},clearTimeout(id){jobs.delete(id);}},advance=ms=>{now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}};
const center=notificationTimer((message,kind)=>{visible=kind+':'+message;},()=>{hidden++;visible='';},clock);
assert.equal(NOTIFICATION_DURATION,8000);center.push('Prerequisite course required.','error');advance(7999);assert.ok(visible);advance(1);assert.equal(visible,'');assert.equal(hidden,1);
center.push('First');advance(2000);center.push('Second','error');advance(6000);assert.equal(visible,'error:Second','A prior timer cannot dismiss the next error');advance(1999);assert.ok(visible);advance(1);assert.equal(visible,'');
center.push('Read this');center.pause();advance(10000);assert.ok(visible);center.resume();advance(7999);assert.ok(visible);advance(1);assert.equal(visible,'');center.push('Dismiss me');center.dismiss();assert.equal(jobs.size,0);assert.equal(visible,'');
for(const file of [...fs.readdirSync('dist').filter(f=>f.endsWith('.html')).map(f=>'dist/'+f),'admin/index.html','server/admin-auth.mjs']){const s=fs.readFileSync(file,'utf8');assert.equal((s.match(/src="\/notifications.js"/g)||[]).length,1,file);assert.equal((s.match(/href="\/notifications.css"/g)||[]).length,1,file);}
assert.ok(!fs.readFileSync('dist/app.js','utf8').includes('6500'));assert.ok(!fs.readFileSync('dist/dashboard-controller.js','utf8').includes("r.boardNotice='Move not applied."));
console.log('Passed eight-second dismissal, replacement-timer isolation, accessible reading pause, manual dismissal, shared public/auth/admin coverage and removal of persistent move-error copies.');
