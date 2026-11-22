import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const home=read('./dist/index.html');
assert.equal(home,read('./dist/site-home.html'),'Both public homepage routes show the approved photo design');
const images=[...home.matchAll(/<img\b[^>]*\bsrc="(\/photo-[^"]+)"[^>]*>/g)];
assert.equal(images.length,7,'All seven approved scene photographs are on the page');
for(const [tag,source] of images){
 assert.match(tag,/\balt="[^"]+"/);
 assert.match(tag,/\bwidth="\d+"/);
 assert.match(tag,/\bheight="\d+"/);
 assert.ok(!source.slice(1).includes('/'),'Photo URLs match the Worker flat asset routing');
 const bytes=fs.readFileSync(new URL('./dist'+source,import.meta.url));
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
}
const faq=home.match(/<section class="faq-section wrap"[\s\S]*?<\/section>/)?.[0];
assert.match(faq,/Before we begin\./);
assert.match(faq,/src="\/photo-questions-/,'The selected campus-map photograph sits in the FAQ section');
const possibilities=home.match(/<ul[^>]*class="direction-tags"[\s\S]*?<\/ul>/)?.[0];
assert.deepEqual([...possibilities.matchAll(/<li>(.*?)<\/li>/g)].map(m=>m[1]).sort(),
 ['Degree','Major','Minor','Electives','Exchange semester','Internship'].sort());
assert.doesNotMatch(home,/<video\b/,'The approved release retains the still hero');

// Motion preferences and older browsers must never hide the photo content.
const motion=read('./dist/photo-landing.js');
for(const reduced of [true,false]){
 const context={matchMedia:()=>({matches:reduced}),window:{}};
 vm.runInNewContext(motion,context);
}
let observer,marked=0,revealed=0;
const photo={getBoundingClientRect:()=>({top:900}),classList:{add(){marked++;},remove(){revealed++;}}};
const context={matchMedia:()=>({matches:false,addEventListener(){}}),innerHeight:700,
 window:{IntersectionObserver:true},document:{querySelectorAll:()=>[photo],body:{classList:{add(){}}}},
 IntersectionObserver:class{constructor(callback){observer=callback;}observe(){}unobserve(){}disconnect(){}}};
vm.runInNewContext(motion,context);
assert.equal(marked,1);
observer([{target:photo,isIntersecting:true}]);
assert.equal(revealed,1,'A photo is revealed when it enters the viewport');
console.log('Public photography: scene assets, FAQ placement, academic terms and accessible motion verified.');
