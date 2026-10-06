import {DATA,label} from './planner.js';
import {normalizeScheduling} from './course-availability.js';
import {esc,options} from './views.js';

export function parseOfferingCodes(value){
 const codes=[...new Set(String(value||'').toUpperCase().split(/[,;\n\r]+/).map(x=>x.replace(/\s/g,'')).filter(Boolean))];
 for(const id of codes)if(!DATA.courses[id])throw Error('Unknown catalogue course '+id+'. Enter course codes separated by commas or new lines.');
 return codes;
}
export function offeringEditor(plan,termId){
 const scheduling=normalizeScheduling(plan.scheduling||{}),entry=scheduling.offerings.find(t=>t.termId===termId),legacy=scheduling.unavailable.filter(t=>t.termId===termId).map(t=>t.courseCode);
 const displayed=entry||{offeredCourseCodes:[],unavailableCourseCodes:legacy,complete:false};
 return `<details class="quiet-details" open><summary>University course offerings</summary><p>Enter the courses your university lists for a semester. A partial list leaves other courses unknown. Select complete only when every available course is included.</p><label class="field">Offering semester<select name="offeringTerm">${options(plan.terms.filter(t=>!['prior','pending'].includes(t.id)).map(t=>[t.id,label(t)]),termId)}</select></label><label class="checkbox-row"><input name="reportOfferings" type="checkbox" ${entry||legacy.length?'checked':''}>Use or replace an offering report for this semester</label><div class="field-grid"><label class="field">Reported offered course codes<textarea name="offeredCodes" rows="3" maxlength="7000" placeholder="MTH1304, CSC1401">${esc(displayed.offeredCourseCodes.join(', '))}</textarea></label><label class="field">Reported unavailable course codes<textarea name="unavailableCodes" rows="3" maxlength="7000" placeholder="Separate codes with commas or new lines">${esc(displayed.unavailableCourseCodes.join(', '))}</textarea></label></div><label class="checkbox-row"><input name="completeOfferings" type="checkbox" ${entry?.complete?'checked':''}>This is a complete offering list for the semester</label><p class="small-note">An empty partial report clears previous availability reports for this semester. Reports are your input; they do not confirm registration or timetable compatibility.</p><button type="button" class="button secondary" data-action="save-course-offerings">Save offerings to my plan</button><p id="offering-status" role="status"></p></details>`;
}
export function offeringChanges(form){
 if(!form.elements.reportOfferings.checked)return [];
 const entry={termId:form.elements.offeringTerm.value,offeredCourseCodes:parseOfferingCodes(form.elements.offeredCodes.value),unavailableCourseCodes:parseOfferingCodes(form.elements.unavailableCodes.value),complete:form.elements.completeOfferings.checked};
 return normalizeScheduling({offerings:[entry]}).offerings;
}
export function loadOfferingEditor(form,plan){
 const termId=form.elements.offeringTerm.value,scheduling=normalizeScheduling(plan.scheduling||{}),entry=scheduling.offerings.find(t=>t.termId===termId);
 form.elements.offeredCodes.value=entry?.offeredCourseCodes.join(', ')||'';
 form.elements.unavailableCodes.value=(entry?.unavailableCourseCodes||scheduling.unavailable.filter(t=>t.termId===termId).map(t=>t.courseCode)).join(', ');
 form.elements.completeOfferings.checked=entry?.complete===true;form.elements.reportOfferings.checked=!!entry||!!form.elements.unavailableCodes.value;
}
export function availabilityAssessmentView(a){
 const postponed=a.postponed||[],fillers=a.slotFillers||[],bottlenecks=a.bottlenecks||[],assumptions=a.assumptions||[];
 return (postponed.length?'<h3>Required courses postponed</h3>'+postponed.map(c=>`<p><strong>${esc(c.courseCode)}</strong> → ${esc(c.to)}. ${c.availability==='reported-offered'?'Reported offered in the destination semester.':'Future offering needs confirmation.'}${c.dependants?.length?' Dependent courses moved: '+c.dependants.map(d=>esc(d.courseCode)).join(', ')+'.':''}</p>`).join(''):'')+(fillers.length?'<h3>Courses brought forward to fill gaps</h3>'+fillers.map(c=>`<p><strong>${esc(c.course)}</strong>: ${esc(c.from)} → ${esc(c.to)}.</p>`).join(''):'')+(bottlenecks.length?'<details><summary>Offering bottlenecks</summary>'+bottlenecks.map(b=>`<p>${esc(b.message)}</p>`).join('')+'</details>':'')+(assumptions.length?'<details><summary>Availability still to confirm</summary>'+assumptions.map(s=>`<p class="small-note">${esc(s)}</p>`).join('')+'</details>':'');
}
