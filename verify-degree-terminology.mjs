import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {normalizeProfile,coursesFor,programFor} from './dist/planner.js';
import {courseGroups} from './dist/course-groups.js';
import {academicChanges} from './dist/edit-updates.js';
import {createWorkbook} from './dist/export.js';
import {degreeChoiceFields,changeDegreeChoice} from './dist/degree-choice-view.js';
const styles=await fs.readFile(new URL('./dist/template-styles.xml',import.meta.url),'utf8');
function unzip(bytes){const b=Buffer.from(bytes),files={};for(let offset=0;offset+4<b.length&&b.readUInt32LE(offset)===0x04034b50;){const size=b.readUInt32LE(offset+18),n=b.readUInt16LE(offset+26),extra=b.readUInt16LE(offset+28),start=offset+30+n+extra;files[b.subarray(offset+30,offset+30+n).toString()]=b.subarray(start,start+size).toString();offset=start+size;}return files;}
// Explicit terminology in the supplied current CS/BBA sheets and engineering flowcharts.
for(const [program,track,other,label,minor] of [['BBA','FIN','MKT','Concentration','mathematics'],['BSCSC','SE','AI','Specialization','business-administration'],['BSEMS','FINANCE','DSS','Thematic area',''],['BSGE','ME','CS','Thematic area','']]){
 const profile=normalizeProfile({program,track,minor}),courses=coursesFor(profile),group=courseGroups(courses,profile).find(g=>g.id==='specialization');
 assert.ok(group,program+': chosen academic area must have a course group');assert.equal(group.title,'Your '+label.toLowerCase());assert.ok(group.description.includes(label.toLowerCase()));assert.ok(!group.description.includes('focus'));
 const details=unzip(await createWorkbook([],[],profile,[],[],styles))['xl/worksheets/sheet2.xml'];
 assert.ok(details.includes('>'+label+'<'),program+': exact export metadata label');assert.ok(!details.includes('Concentration / specialization'));
 assert.equal(details.includes('>Minor<'),Boolean(minor),program+': only source-defined minor component in export metadata');
 const changes=academicChanges(profile,{...profile,track:other});assert.ok(changes.some(s=>s.includes(label.toLowerCase())));assert.ok(!changes.some(s=>s.includes('focus')));
}
for(const [program,track,secondTrack,minor,label] of [['BBA','FIN','MKT','','Second concentration'],['BSCSC','SE','AI','business-administration','Second specialization']]){
 const profile=normalizeProfile({program,track,secondTrack,minor});const details=unzip(await createWorkbook([],[],profile,[],[],styles))['xl/worksheets/sheet2.xml'];
 assert.ok(details.includes('>'+label+'<'));assert.equal(details.includes('>Minor<'),program==='BSCSC','BBA second concentration replaces minor; CS retains it');
 const groups=courseGroups(coursesFor(profile),profile);assert.equal(groups.find(g=>g.id==='second')?.title,label);
 const changes=academicChanges({...profile,secondTrack:''},profile);assert.ok(changes.some(s=>s.includes(label.toLowerCase())));
}
for(const program of ['BACS','BAIS','BSESS','BSRESE']){
 const profile=normalizeProfile({program}),details=unzip(await createWorkbook([],[],profile,[],[],styles))['xl/worksheets/sheet2.xml'];
 assert.ok(!details.includes('>Academic area<'),'No invented academic-area export selector for '+program);
}
// The same controls appear during guided planning and in the saved-plan updater.
for(const binding of ['form','profile'])for(const program of ['BSEMS','BSGE','BSRESE','BBA','BSCSC','BACS','BAIS','BSESS']){
 const profile=normalizeProfile({program}),html=degreeChoiceFields(profile,{program:programFor(profile),binding});
 assert.ok(!html.includes('More choices'),'No empty disclosure in '+program);
 assert.ok(!html.includes('>Focus<'),'No generic academic Focus label');
 assert.equal(html.includes('data-degree-choice="minor"'),!['BSEMS','BSGE','BSRESE'].includes(program));
 assert.equal(html.includes('data-degree-choice="degreePath"'),['BBA','BSCSC'].includes(program));
 assert.equal(html.includes('data-degree-choice="track"'),['BBA','BSCSC','BSEMS','BSGE'].includes(program));
}
for(const program of ['BBA','BSCSC']){
 let p=normalizeProfile({program,minor:program==='BBA'?'mathematics':'business-administration'}),degree=programFor(p),originalTrack=p.track;
 p=normalizeProfile(changeDegreeChoice(p,'degreePath','double',degree));
 assert.ok(p.secondTrack&&p.secondTrack!==p.track);assert.equal(Boolean(p.minor),program==='BSCSC');
 let html=degreeChoiceFields(p,{program:degree});assert.ok(html.includes('data-degree-choice="secondTrack"'));assert.equal(html.includes('data-degree-choice="minor"'),program==='BSCSC');
 const other=p.secondTrack;p=normalizeProfile(changeDegreeChoice(p,'track',other,degree));assert.equal(p.track,other);assert.equal(p.secondTrack,originalTrack,'Changing the primary to the secondary swaps the pair');
 p=normalizeProfile(changeDegreeChoice(p,'degreePath',program==='BBA'?'minor':'single',degree));assert.equal(p.secondTrack,'');
 html=degreeChoiceFields(p,{program:degree});assert.ok(!html.includes('data-degree-choice="secondTrack"'));assert.ok(html.includes('data-degree-choice="minor"'));
 assert.throws(()=>changeDegreeChoice(p,'degreePath','unsupported',degree),/supported degree pathway/);
}
console.log('Degree terminology: source-specific course groups, academic change receipts and actual Excel metadata; BBA double-concentration replacement and CS retained minor passed.');
