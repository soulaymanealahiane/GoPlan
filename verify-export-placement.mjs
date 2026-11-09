import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createWorkbook} from './dist/export.js';
import {newJourney,makePlan} from './dist/guidance.js';
const styles=await fs.readFile('dist/template-styles.xml','utf8');
function unzip(buffer){const entries={};for(let offset=0;offset+4<buffer.length&&buffer.readUInt32LE(offset)===0x04034b50;){const size=buffer.readUInt32LE(offset+18),n=buffer.readUInt16LE(offset+26),extra=buffer.readUInt16LE(offset+28),start=offset+30+n+extra;entries[buffer.subarray(offset+30,offset+30+n).toString()]=buffer.subarray(start,start+size).toString();offset=start+size;}return entries;}
const j=newJourney();j.profile.program='BBA';const plan=makePlan(j),ids=['bba-french','bba-arabic','bba-civic','int4301'];
for(const term of plan.terms)term.courses=term.courses.filter(id=>!ids.includes(id));
plan.terms=plan.terms.filter(t=>t.id!=='pending');plan.terms.push({id:'pending',season:'Pending',year:0,courses:ids,note:'Confirm placement & internship eligibility.'});
const before=JSON.stringify(plan),buffer=Buffer.from(await createWorkbook(plan.terms,plan.courses,plan.profile,[],[],styles,plan)),entries=unzip(buffer),main=entries['xl/worksheets/sheet1.xml'],details=entries['xl/worksheets/sheet2.xml'];
assert.equal(JSON.stringify(plan),before,'Export must not mutate the actual roadmap.');
assert.equal((main.match(/>Needs placement</g)||[]).length,1);assert.ok(main.includes('Confirm placement &amp; internship eligibility.'));
const sheetRows=[...main.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)],pendingSection=sheetRows.find(row=>row[2].includes('>Needs placement<'));
assert.ok(pendingSection);const pendingRow=Number(pendingSection[1]);
assert.ok(pendingSection[2].includes('<c r="A'+pendingRow+'"')); assert.ok(main.includes('ref="A'+pendingRow+':A'+(pendingRow+ids.length)+'"'));
for(const id of ids){const course=plan.courses.find(c=>c.id===id);assert.ok(course);assert.ok(main.includes(course.title));assert.ok(details.includes(course.title));if(course.code)assert.ok(main.includes(course.code));}
assert.ok(main.lastIndexOf('Needs placement')>main.lastIndexOf('Fall '));assert.ok(main.includes('Semester total'));assert.ok(main.includes('<f>SUM(D'));assert.ok(entries['xl/styles.xml'].includes('FF173E35'));
assert.ok(main.includes('<c r="C'));assert.ok(main.includes('<c r="D'));assert.ok(main.includes('Course name'));assert.ok(main.includes('Course code')); assert.ok(details.includes('including a Needs placement section'));assert.ok(details.includes('Needs placement'));
for(const courses of [[],[plan.courses.find(c=>c.id==='int4301')]]){
 const terms=[{id:'pending',season:'Pending',year:0,courses:courses.map(c=>c.id),note:'Only pending & note'}];
 const xml=unzip(Buffer.from(await createWorkbook(terms,courses,plan.profile,[],[],styles,plan)))['xl/worksheets/sheet1.xml'];assert.ok(xml.includes('Needs placement'));assert.ok(xml.includes('Only pending &amp; note'));
}
const empty=unzip(Buffer.from(await createWorkbook([{id:'pending',courses:[]}],[],plan.profile,[],[],styles,plan)))['xl/worksheets/sheet1.xml'];assert.ok(empty.includes('No semesters yet'));assert.ok(!empty.includes('>Needs placement<'));
// Unsorted terms, prior credit, an empty term and unscheduled credit must roll forward correctly.
const fixtureCourses=[{id:'prior-credit',code:'OLD100',title:'Prior study',credits:6},{id:'spring-credit',code:'SPR100',title:'Spring study',credits:3.5},{id:'fall-credit',code:'FAL100',title:'Fall study',credits:3},{id:'unplaced-credit',code:'PEN100',title:'Unplaced study',credits:5}];
const fixtureTerms=[{id:'pending',courses:['unplaced-credit']},{id:'fall',season:'Fall',year:2027,courses:['fall-credit'],note:'Keep this note.'},{id:'prior',courses:['prior-credit']},{id:'summer',season:'Summer',year:2027,courses:[],lc:true},{id:'spring',season:'Spring',year:2027,courses:['spring-credit']}];
const fixtureBefore=JSON.stringify(fixtureTerms),fixture=unzip(Buffer.from(await createWorkbook(fixtureTerms,fixtureCourses,plan.profile,[],[],styles,{...plan,program:{...plan.program,degreeCredits:{min:130,max:134}}}))),fixtureXml=fixture['xl/worksheets/sheet1.xml'];
assert.equal(JSON.stringify(fixtureTerms),fixtureBefore,'Sorting the export must not reorder the saved roadmap.');
const fixtureRows=[...fixtureXml.matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/gs)],cumulativeRows=fixtureRows.filter(r=>r[2].includes('>Cumulative planned credits<')),totalRows=fixtureRows.filter(r=>r[2].includes('>Semester total<'));
const dValue=r=>Number(r[2].match(/<c r="D\d+"[^>]*>.*?<v>(.*?)<\/v>/)[1]);
assert.deepEqual(totalRows.map(dValue),[6,3.5,0,3,5]);
assert.deepEqual(cumulativeRows.map(dValue),[6,9.5,9.5,12.5]);
assert.ok(fixtureXml.indexOf('Completed before this plan')<fixtureXml.indexOf('Spring 2027'));
assert.ok(fixtureXml.indexOf('Spring 2027')<fixtureXml.indexOf('Summer 2027'));
assert.ok(fixtureXml.indexOf('Summer 2027')<fixtureXml.indexOf('Fall 2027'));
assert.ok(cumulativeRows.every(r=>r[2].includes('130–134 required')));
assert.ok(!fixtureRows.filter(r=>Number(r[1])>Number(totalRows.at(-1)[1])).some(r=>r[2].includes('Cumulative planned credits')),'Needs placement must not add to chronological cumulative credit.');
const numericCells=new Map([...fixtureXml.matchAll(/<c r="(D\d+)"[^>]*>(.*?)<\/c>/gs)].map(m=>[m[1],{formula:m[2].match(/<f>(.*?)<\/f>/)?.[1],value:Number(m[2].match(/<v>(.*?)<\/v>/)?.[1]||0)}]));
function evaluate(ref,overrides={},stack=new Set()){
 if(Object.hasOwn(overrides,ref))return overrides[ref];
 assert.ok(!stack.has(ref),'No circular formula dependency');const c=numericCells.get(ref);assert.ok(c,'Formula must reference an existing credit cell: '+ref);if(!c.formula)return c.value;
 const next=new Set(stack).add(ref),read=x=>{if(!x.includes(':'))return evaluate(x,overrides,next);const [a,b]=x.split(':').map(v=>Number(v.slice(1)));let n=0;for(let i=a;i<=b;i++)n+=evaluate('D'+i,overrides,next);return n;};
 return c.formula.startsWith('SUM(')?c.formula.slice(4,-1).split(',').reduce((n,x)=>n+read(x),0):read(c.formula);
}
for(const r of cumulativeRows)assert.equal(evaluate('D'+r[1]),dValue(r));
const finalCumulative='D'+cumulativeRows.at(-1)[1],springRow=fixtureRows.find(r=>r[2].includes('>SPR100<')),pendingRowFixture=fixtureRows.find(r=>r[2].includes('>PEN100<'));
assert.equal(evaluate(finalCumulative,{['D'+springRow[1]]:4.5}),13.5,'Editing a scheduled course credit must propagate once to later cumulative totals.');
assert.equal(evaluate(finalCumulative,{['D'+pendingRowFixture[1]]:25}),12.5,'Unplaced credit edits must not change cumulative scheduled credit.');
if(process.env.GOPLAN_EXPORT_QA_PATH){await fs.mkdir(path.dirname(process.env.GOPLAN_EXPORT_QA_PATH),{recursive:true});await fs.writeFile(process.env.GOPLAN_EXPORT_QA_PATH,buffer);}
console.log('Passed actual XLSX package: Needs placement, language/civic/internship rows, notes, details, chronological cumulative formulas/cached values, prior and empty terms, fractional credits, degree comparison, credit-edit propagation and unchanged source roadmap.');
