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
assert.ok(pendingSection[2].includes('<c r="A'+pendingRow+'" s="11"'));assert.ok(main.includes('ref="A'+pendingRow+':A'+(pendingRow+ids.length)+'"'));
for(const id of ids){const course=plan.courses.find(c=>c.id===id);assert.ok(course);assert.ok(main.includes(course.title));assert.ok(details.includes(course.title));if(course.code)assert.ok(main.includes(course.code));}
assert.ok(main.lastIndexOf('Needs placement')>main.lastIndexOf('Fall '));assert.ok(main.includes('s="8"'),'Appending Needs placement must preserve the final scheduled semester style.');
assert.ok(!main.includes('<c r="C'));assert.ok(details.includes('including a Needs placement section'));assert.ok(details.includes('Needs placement'));
for(const courses of [[],[plan.courses.find(c=>c.id==='int4301')]]){
 const terms=[{id:'pending',season:'Pending',year:0,courses:courses.map(c=>c.id),note:'Only pending & note'}];
 const xml=unzip(Buffer.from(await createWorkbook(terms,courses,plan.profile,[],[],styles,plan)))['xl/worksheets/sheet1.xml'];assert.ok(xml.includes('Needs placement'));assert.ok(xml.includes('Only pending &amp; note'));
}
const empty=unzip(Buffer.from(await createWorkbook([{id:'pending',courses:[]}],[],plan.profile,[],[],styles,plan)))['xl/worksheets/sheet1.xml'];assert.ok(empty.includes('No semesters yet'));assert.ok(!empty.includes('Needs placement'));
if(process.env.GOPLAN_EXPORT_QA_PATH){await fs.mkdir(path.dirname(process.env.GOPLAN_EXPORT_QA_PATH),{recursive:true});await fs.writeFile(process.env.GOPLAN_EXPORT_QA_PATH,buffer);}
console.log('Passed actual XLSX package: main Needs placement semester section, languages/civic/internship rows, notes, details, final semester styling, pending-only/empty plans and unchanged source roadmap.');
