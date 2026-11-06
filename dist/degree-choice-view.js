import {degreePolicy,degreeSelectionPath} from './degree-policy.js';
import {esc,options} from './views.js';

// Both manual editors use the same curriculum pathways; internal legacy field
// names remain stable so saved workspaces do not need a destructive migration.
export function degreeChoiceFields(profile,{program,minorOptions=[],binding='form'}={}){
 const policy=degreePolicy(program||profile.program),paths=policy.selectionPaths||[],path=paths.find(x=>x.id===degreeSelectionPath(profile))||paths[0];
 const field=(key,title,values,value)=>`<label class="field">${esc(title)}<select ${binding==='profile'?`data-profile="${key}"`:`name="${key}"`} data-degree-choice="${key}" data-current="${esc(value)}">${options(values,value)}</select></label>`;
 const minorMode=path?.minorMode||policy.minorMode,trackCount=path?.trackCount??(program.tracks.length?1:0);
 let html=paths.length>1?field('degreePath','Degree pathway',paths.map(x=>[x.id,x.label]),path?.id):'';
 if(program.tracks.length&&trackCount)html+=field('track',policy.trackLabel,program.tracks.map(t=>[t.id,t.name]),profile.track);
 if(trackCount>1)html+=field('secondTrack',policy.secondaryTrackLabel,[['','Choose a different '+policy.trackLabel.toLowerCase()],...program.tracks.filter(t=>t.id!==profile.track).map(t=>[t.id,t.name])],profile.secondTrack);
 if(['required','optional'].includes(minorMode))html+=field('minor',minorMode==='required'?'Minor (required)':'Minor',[[ '',minorMode==='required'?'Choose later — minor required':'No minor'],...minorOptions.map(m=>[m.id,m.name])],profile.minor);
 html+=`<p class="small-note degree-policy-help">${esc(policy.selectionHelp||'')}</p>`;
 html+='<p class="small-note">For the current curriculum. If you follow an earlier admission catalogue, confirm your requirements with your academic adviser.</p>';
 if(profile.selectionNotices?.length)html+=`<p class="academic-notice" role="status">${profile.selectionNotices.map(esc).join(' ')}</p>`;
 return html;
}

export function changeDegreeChoice(profile,key,value,program){
 const next={...profile,[key]:value,selectionNotices:[]};
 if(key==='degreePath'){
  const path=degreePolicy(program).selectionPaths.find(x=>x.id===value);
  if(!path)throw Error('Choose a supported degree pathway.');
  delete next.degreePath;
  next.secondTrack=path.trackCount>1?(program.tracks.some(t=>t.id===profile.secondTrack&&t.id!==profile.track)?profile.secondTrack:program.tracks.find(t=>t.id!==profile.track)?.id||''):'';
  if(path.minorMode==='none')next.minor='';
 }
 if(key==='track'&&next.secondTrack===value)next.secondTrack=profile.track;
 return next;
}

export function retainManualDirection(j){
 const {program,track,secondTrack,minor}=j.profile;
 j.programChosen=true;j.manual=true;
 j.advice={kind:'recommend',summary:'Your academic choices.',themes:[],questions:[],tradeoffs:[],academic:{program,track,secondTrack,minor,rationale:'Chosen by you.'}};
 return j;
}
