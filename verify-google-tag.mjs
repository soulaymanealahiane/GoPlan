import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {GOOGLE_TAG} from './server/google-tag.mjs';
import {adminPageGate} from './server/admin-auth.mjs';
import {localDatabase} from './server/local-db.mjs';
import {testSession} from './tests/session-fixture.mjs';

const scriptUrl='https://www.googletagmanager.com/gtm.js?id=GTM-KQJH88L5';
function check(html,label){
 html=html.replaceAll('\r\n','\n');
 assert.ok(html.includes('<head>'+GOOGLE_TAG),label+': Google tag must immediately follow the opening head');
 const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*>/g)].map(m=>m[1]);
 assert.equal(scripts.filter(src=>src===scriptUrl).length,1,label+': exactly one container loader');
 assert.equal(scripts.filter(src=>/googletagmanager\.com\/(?:gtm|gtag)/.test(src)).length,1,label+': no second Google loader');
 assert.equal([...html.matchAll(/gtag\('js', new Date\(\)\)/g)].length,1,label+': exactly one initialization');
}
const pages=(await fs.readdir(new URL('./dist/',import.meta.url))).filter(f=>f.endsWith('.html'));
for(const file of pages)check(await fs.readFile(new URL('./dist/'+file,import.meta.url),'utf8'),file);
check(await fs.readFile(new URL('./admin/index.html',import.meta.url),'utf8'),'owner operations');

const DB=localDatabase(':memory:'),env={DB,ADMIN_EMAILS:'tag-owner@example.invalid'},base='https://planwithgoplan.com/admin';
const owner=await testSession(DB,'tag-owner','tag-owner@example.invalid'),student=await testSession(DB,'tag-student');
const anonymous=await adminPageGate(new Request(base),env);assert.equal(anonymous.status,200);check(await anonymous.text(),'anonymous admin gate');
const denied=await adminPageGate(new Request(base,{headers:student}),env);assert.equal(denied.status,403);check(await denied.text(),'non-owner admin gate');
assert.equal(await adminPageGate(new Request(base,{headers:owner}),env),null,'Owner authentication still grants access');

const inline=GOOGLE_TAG.match(/<script>([\s\S]*?)<\/script>/)[1];
for(const prior of [undefined,[{event:'synthetic_existing_event'}]]){
 const context={Date,...(prior?{dataLayer:prior}:{})};context.window=context;vm.createContext(context);vm.runInContext(inline,context);
 assert.equal(typeof context.gtag,'function');assert.equal(context.dataLayer.length,prior?2:1);assert.equal(context.dataLayer.at(-1)[0],'js');assert.ok(context.dataLayer.at(-1)[1] instanceof Date);if(prior)assert.equal(context.dataLayer[0].event,'synthetic_existing_event');
 assert.equal(context.dataLayer.at(-1).length,2,'Only the standard initialization date is queued');
}
DB.close();console.log('Google tag: all HTML pages and both admin gate states have one exact head bootstrap; initialization, existing data layer and owner authorization passed. Offline only; no Google events sent.');
