import assert from 'node:assert/strict';import fs from 'node:fs';
import {notificationTimer,notificationExit,NOTIFICATION_DURATION,NOTIFICATION_EXIT_DURATION} from './dist/notifications.js';
let now=0,next=0,visible='',hidden=0;const jobs=new Map(),clock={setTimeout(fn,delay){jobs.set(++next,{fn,at:now+delay});return next;},clearTimeout(id){jobs.delete(id);}},advance=ms=>{now+=ms;for(const [id,job] of [...jobs])if(job.at<=now){jobs.delete(id);job.fn();}};
const center=notificationTimer((message,kind)=>{visible=kind+':'+message;},()=>{hidden++;visible='';},clock);
assert.equal(NOTIFICATION_DURATION,6000);center.push('Prerequisite course required.','error');advance(5999);assert.ok(visible);advance(1);assert.equal(visible,'');assert.equal(hidden,1);
center.push('First');advance(2000);center.push('Second','error');advance(4000);assert.equal(visible,'error:Second','A prior timer cannot dismiss the next error');advance(1999);assert.ok(visible);advance(1);assert.equal(visible,'');
center.push('Read this');center.pause();advance(10000);assert.ok(visible);center.resume();advance(5999);assert.ok(visible);advance(1);assert.equal(visible,'');center.push('Dismiss me');center.dismiss();assert.equal(jobs.size,0);assert.equal(visible,'');
assert.equal(NOTIFICATION_EXIT_DURATION,220);
let finishExit,cleaned=0,exitHides=0,animated=0;
const exit=notificationExit(()=>{exitHides++;visible='';},done=>{animated++;finishExit=done;return ()=>cleaned++;},clock);
const sliding=notificationTimer(message=>{exit.cancel();visible=message;},()=>exit.start(),clock);
sliding.push('Old message');advance(6000);assert.equal(visible,'Old message','The message stays mounted while sliding out');const oldFinish=finishExit;
advance(100);assert.equal(exitHides,0);sliding.push('New message');oldFinish();advance(200);assert.equal(visible,'New message','Neither stale animation completion nor fallback can hide a newer message');assert.equal(exitHides,0);
advance(5800);assert.equal(visible,'New message');finishExit();assert.equal(visible,'');assert.equal(exitHides,1);assert.equal(jobs.size,0);assert.ok(cleaned>=2);
visible='Fallback';exit.start();advance(300);assert.equal(visible,'','A missing animationend cannot leave a toast visible indefinitely');assert.equal(jobs.size,0);
const priorAnimations=animated;visible='Reduced motion';exit.start(true);assert.equal(visible,'');assert.equal(animated,priorAnimations,'Reduced motion skips animation and delay');assert.equal(jobs.size,0);
for(const file of [...fs.readdirSync('dist').filter(f=>f.endsWith('.html')).map(f=>'dist/'+f),'admin/index.html','server/admin-auth.mjs']){const s=fs.readFileSync(file,'utf8');assert.equal((s.match(/src="\/notifications.js"/g)||[]).length,1,file);assert.equal((s.match(/href="\/notifications.css"/g)||[]).length,1,file);}
assert.ok(!fs.readFileSync('dist/app.js','utf8').includes('6500'));assert.ok(!fs.readFileSync('dist/dashboard-controller.js','utf8').includes("r.boardNotice='Move not applied."));
console.log('Passed six-second countdown, mounted exit animation, stale completion/fallback isolation, reduced-motion dismissal, reading pause, manual dismissal and shared public/auth/admin coverage.');
