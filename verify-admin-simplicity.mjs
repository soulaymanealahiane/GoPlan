import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const html=await readFile(new URL('./admin/index.html',import.meta.url),'utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
assert.equal(ids.length,new Set(ids).size,'Admin IDs must stay unique.');
const defaultCopy=html.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g,'');
for(const text of ['university-scoped hashes','retrain the underlying model','not online status','maximum 200','Tokens measure processed text'])assert.ok(!defaultCopy.includes(text),text+' should be available on demand.');
assert.ok(html.includes('Last seen is account activity, not online status.'));
assert.ok(html.includes('Emails omitted from the new list will lose access.'));
assert.ok(html.includes('<fieldset id="roster-fields" disabled>'));
assert.ok(!/<details\b[^>]*\bopen\b/.test(html),'Secondary details should start collapsed.');

// Execute the actual page modules against a small DOM surface and synthetic
// responses, so section refresh, labels, list safety and errors are exercised.
class Element{
 constructor(tag='div',id=''){this.tagName=tag;this.id=id;this.children=[];this.attrs={};this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.files=[];this.events={};this.classList={toggle:(name,on)=>{this.attrs[name]=on;}};}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return (this.text||'')+this.children.map(c=>c.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.text='';this.children=[...nodes];}
 setAttribute(name,value){this.attrs[name]=String(value);}
 addEventListener(name,callback){this.events[name]=callback;}
 reset(){nodes['roster-mode'].value='append';nodes['roster-confirm'].checked=false;}
 showModal(){this.open=true;}
 close(){this.open=false;}
 click(){this.onclick?.();}
 remove(){}
}
const nodes=Object.fromEntries(ids.map(id=>[id,new Element('div',id)]));
Object.assign(nodes.period,{value:'30'});Object.assign(nodes.channel,{value:'all'});Object.assign(nodes['report-filter'],{value:'all'});Object.assign(nodes['roster-mode'],{value:'append'});nodes['roster-fields'].disabled=true;
const views=['overview','reliability','students','feedback','pilots','data'].map(id=>nodes['view-'+id]);
const nav=views.map(v=>{const node=new Element('button');node.dataset.tab=v.id.slice(5);return node;});
nodes['feedback-shortcut'].dataset.tab='feedback';
const document={getElementById:id=>{assert.ok(nodes[id],'Missing admin element: '+id);return nodes[id];},createElement:tag=>new Element(tag),body:new Element('body'),querySelectorAll:selector=>selector==='.view'?views:selector==='nav [data-tab]'?nav:selector==='[data-tab]'?[...nav,nodes['feedback-shortcut']]:[]};
const calls=[];
let roster={mode:'demo',universityId:'',count:0},failRoster=false;
const analytics={enabled:true,days:1,since:'2026-10-18',generatedAt:'2026-10-19T00:00:00Z',limits:['Operation totals are not unique students.'],reports:[{status:'pending',count:1}],rows:[{kind:'advice',stage:'targets',channel:'web',count:2,outcome:'success',duration_ms:4000,provider_calls:2,input_tokens:100,output_tokens:60,day:'2026-10-18'},{kind:'advice',stage:'direction',channel:'web',count:1,outcome:'error',duration_ms:1000,provider_calls:1,input_tokens:20,output_tokens:0,day:'2026-10-18'},{kind:'advice',stage:'courses',channel:'web',count:1,outcome:'cached',duration_ms:0,provider_calls:0,input_tokens:0,output_tokens:0,day:'2026-10-18'},{kind:'event',stage:'plan_saved',count:4},{kind:'event',stage:'plan_updated',count:2}]};
const report={id:'report-one',status:'pending',createdAt:Date.parse('2026-10-18'),expiresAt:Date.parse('2026-11-18'),improve:false,report:{stage:'courses',academic:{program:'BSCSC'},issue:'A course appears missing.',category:'policy'}};
const fetch=async(path,options={})=>{
 calls.push({path,options});
 if(path.startsWith('/api/admin/analytics'))return Response.json(analytics);
 if(path==='/api/admin/reports')return Response.json({reports:[report]});
 if(path==='/api/admin/students')return Response.json({total:3,students:[{firstName:'Demo',lastName:'Student',email:'student@example.invalid',createdAt:Date.parse('2026-10-17'),lastSeenAt:Date.parse('2026-10-18')}]});
 if(path==='/api/admin/roster')return failRoster?Response.json({error:'Access information unavailable.'},{status:503}):Response.json(roster);
 if(path.startsWith('/api/admin/roster?mode='))return Response.json({added:1,count:4});
 if(path==='/api/admin/partnerships')return Response.json({inquiries:[]});
 throw Error('Unexpected admin fetch: '+path);
};
const common={document,fetch,AbortSignal,console,Date,location:{hostname:'planwithgoplan.com'},setTimeout};
const pilots=vm.createContext({...common});
vm.runInContext((await readFile(new URL('./admin/pilots.js',import.meta.url),'utf8')).replace('export async function refreshPilots','async function refreshPilots'),pilots);
const context=vm.createContext({...common,refreshPilots:pilots.refreshPilots});
vm.runInContext((await readFile(new URL('./admin/admin.js',import.meta.url),'utf8')).replace("import {refreshPilots} from './pilots.js';",''),context);
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
const tab=async name=>{nav.find(n=>n.dataset.tab===name).onclick();await settle();};
await settle();
assert.equal(nodes.cards.children.length,4);
assert.equal(nodes.events.children.length,3,'Saved plans already have a top card.');
assert.ok(!nodes.events.textContent.includes('Plans saved'));
assert.equal(nodes['feedback-shortcut'].hidden,false);
assert.ok(nodes.insights.textContent.includes('1 report awaits review.'));
assert.ok(nodes.insights.textContent.includes('1 request failed.'));

await tab('students');
assert.equal(nodes['period-control'].hidden,true);assert.equal(nodes.status.hidden,true);
assert.equal(nodes['student-count'].textContent,'Showing latest 1 of 3 registered profiles');
const oldStudentCalls=calls.filter(c=>c.path==='/api/admin/students').length;
await nodes.refresh.onclick();assert.equal(calls.filter(c=>c.path==='/api/admin/students').length,oldStudentCalls+1);
nodes['student-search'].value='missing';nodes['student-search'].oninput();assert.equal(nodes['student-count'].textContent,'0 matches in 1 loaded profiles');

await tab('feedback');assert.equal(nodes['report-status'].textContent,'1 report');
nodes['report-list'].children[0].children[1].onclick();
assert.equal(nodes['review-dialog'].open,true);assert.ok(nodes['report-detail'].textContent.includes('has not agreed to shared guidance'));
nodes.decision.value='confirmed';nodes.decision.onchange();
assert.equal(nodes['source-url'].required,true);assert.equal(nodes['evidence-checked'].required,true);

await tab('pilots');
assert.equal(nodes['pilot-status'].textContent,'Open demo · Anyone with an account can plan.');
assert.equal(nodes['roster-fields'].disabled,true);assert.equal(nodes['pilot-setup'].hidden,false);assert.equal(nodes['roster-form'].hidden,true);
assert.equal(nodes['partnership-status'].textContent,'No university inquiries.');
const beforeRefresh=calls.length;await nodes.refresh.onclick();assert.equal(calls.slice(beforeRefresh).filter(c=>c.path==='/api/admin/roster').length,1);assert.equal(calls.slice(beforeRefresh).filter(c=>c.path==='/api/admin/partnerships').length,1);
roster={mode:'roster',universityId:'aui',count:3};await nodes.refresh.onclick();
assert.equal(nodes['roster-fields'].disabled,false);assert.equal(nodes['roster-form'].hidden,false);assert.equal(nodes['pilot-status'].textContent,'aui · 3 approved students');
nodes['roster-mode'].value='replace';nodes['roster-mode'].events.change();
assert.equal(nodes['roster-confirm'].required,true);assert.equal(nodes['roster-replace-confirm'].hidden,false);
nodes['roster-file'].files=[{size:100,text:async()=>'new@example.invalid'}];
const beforeReplace=calls.length;
await nodes['roster-form'].events.submit({preventDefault(){},target:nodes['roster-form']});
assert.equal(calls.length,beforeReplace,'Unconfirmed replacement must not be sent.');
assert.equal(nodes['roster-status'].attrs.role,'alert');
nodes['roster-confirm'].checked=true;
await nodes['roster-form'].events.submit({preventDefault(){},target:nodes['roster-form']});
assert.ok(calls.some(c=>c.path==='/api/admin/roster?mode=replace'));
assert.equal(nodes['roster-mode'].value,'append');assert.equal(nodes['roster-confirm'].required,false);
assert.ok(nodes['roster-status'].textContent.includes('Omitted students lose access'));
failRoster=true;await nodes.refresh.onclick();assert.equal(nodes['roster-fields'].disabled,true);assert.equal(nodes['pilot-status'].attrs.role,'alert');assert.equal(nodes['pilot-status'].textContent,'Access information unavailable.');

await tab('data');assert.equal(nodes['period-control'].hidden,false);assert.equal(nodes.status.hidden,false);assert.equal(nodes.export.disabled,false);
assert.equal(calls.filter(c=>c.path.startsWith('/api/admin/analytics')).length,1,'Unrelated sections should not refresh analytics.');
console.log('Admin simplicity: all six sections, truthful counts, relevant filters, active-section refresh, collapsed diagnostics, demo/import states, replacement confirmation, feedback evidence and visible errors passed. Synthetic records only.');
