const $=id=>document.getElementById(id),number=n=>Number(n||0).toLocaleString(),percent=n=>Number(n||0).toFixed(1)+'%';
const labels={direct:'Direct / internal',search:'Search engines',social:'Social networks',referral:'Other websites',campaign:'Tagged campaigns',desktop:'Desktop',mobile:'Mobile',tablet:'Tablet','/':'Homepage','/demo':'AUI demo','/signin.html':'Sign in / create account','/privacy.html':'Privacy',nav_talk:'Navigation · Let’s talk',hero_talk:'Hero · Bring GoPlan to your university',campus_talk:'Campus · Let’s talk',university_talk:'Universities · Let’s talk about your campus',package_talk:'Pricing · Discuss this package',closing_talk:'Closing · Start a conversation',footer_contact:'Footer · Contact',demo_click:'Explore demo clicks',email_click:'Email link clicks',package_change:'Package quantity changes'};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const duration=ms=>{const s=Math.round(Number(ms||0)/1000);return s<60?s+'s':Math.floor(s/60)+'m '+s%60+'s';};
let snapshot,version=0;
function comparison(key){if(!snapshot.previous)return 'Baseline building';const before=snapshot.previous[key],current=snapshot.totals[key];return before?(current-before>=0?'+':'')+((current-before)/before*100).toFixed(1)+'% vs prior period':current?'No activity in prior period':'No change vs prior period';}
function card(label,value,detail,key,primary=false){const n=el('article',undefined,'card'+(primary?' primary':''));n.append(el('p',label),el('strong',value),el('small',detail));if(key)n.append(el('small',comparison(key),'traction-comparison'));return n;}
function table(id,rows,values,empty){$(id).replaceChildren(...rows.map(r=>{const tr=el('tr');for(const v of values(r))tr.append(el('td',v));return tr;}));if(!rows.length){const tr=el('tr'),td=el('td',empty||'No measured activity yet.');td.colSpan=values({label:'',visitors:0,visits:0,pageViews:0,activeMs:0}).length;tr.append(td);$(id).append(tr);}}
function chart(){
 if(!snapshot)return;const metric=$('traction-metric').value,max=Math.max(1,...snapshot.rows.map(r=>r[metric]));$('traction-chart').replaceChildren();
 if(!snapshot.totals.pageViews){$('traction-chart').append(el('p','Your first measured visits will appear here.','empty'));return;}
 for(const [i,r] of snapshot.rows.entries()){const wrap=el('div',undefined,'day'),bar=el('div',undefined,'bar');bar.style.height=Math.max(2,r[metric]/max*170)+'px';wrap.title=r.day+': '+number(r[metric])+' '+(metric==='pageViews'?'page views':metric);wrap.append(bar,el('small',i===0||i===snapshot.rows.length-1?r.day.slice(5):''));$('traction-chart').append(wrap);}
 $('traction-chart').setAttribute('aria-label','Daily '+metric+' for '+snapshot.days+' days. Exact values are in the daily table.');
}
function render(){
 const t=snapshot.totals,f=snapshot.funnel;
 $('traction-cards').replaceChildren(card('Visitors',number(t.visitors),'Approximate distinct browsers','visitors',true),card('Visits',number(t.visits),'New visit after 30 minutes inactive','visits'),card('Page views',number(t.pageViews),'Repeat page loads included','pageViews'),card('Active time / visit',t.visits?duration(t.avgActiveMs):'—','Visible, recently active time','avgActiveMs'),card('Contact clicks',number(t.talkClicks),'All contact buttons, including Let’s talk','talkClicks'),card('Saved inquiries',number(t.savedInquiries),number(t.trackedInquiries)+' attributed to measured visits','savedInquiries'));
 $('traction-conversion').textContent=t.visits?percent(t.conversionRate):'—';
 $('traction-conversion-detail').textContent=number(t.convertingVisits)+' converting visits / '+number(t.visits)+' measured visits';
 $('traction-form-rate').textContent=f.started?percent(f.submitted/f.started*100):'—';
 const stages=[['Measured visits',f.visits],['Clicked a contact button',f.clicked],['Started the form after clicking',f.started],['Saved an inquiry in that visit',f.submitted]];
 $('traction-funnel').replaceChildren(...stages.map(([name,n])=>{const row=el('div',undefined,'traction-funnel-row'),text=el('div',undefined,'panel-head'),track=el('div',undefined,'traction-track'),bar=el('div',undefined,'traction-fill');text.append(el('span',name),el('strong',number(n)));bar.style.width=(f.visits?n/f.visits*100:0)+'%';track.append(bar);row.append(text,track);return row;}));
 const stats=r=>[labels[r.label]||r.label,number(r.visitors),number(r.visits)];
 table('traction-sources',snapshot.sources,stats);table('traction-countries',snapshot.countries,stats);table('traction-devices',snapshot.devices,stats);
 table('traction-pages',snapshot.pages,r=>[labels[r.label]||r.label,number(r.pageViews),number(r.visitors),r.pageViews?duration(r.activeMs/r.pageViews):'—']);
 table('traction-clicks',Object.entries(labels).filter(([key])=>key in snapshot.clicks&&key!=='form_start').map(([key])=>({label:key,n:snapshot.clicks[key]})),r=>[labels[r.label],number(r.n)],'No measured clicks.');
 table('traction-daily',snapshot.rows,r=>[r.day,number(r.visitors),number(r.visits),number(r.pageViews),duration(r.activeMs),number(r.talkClicks),number(r.inquiries)]);
 $('traction-limits').replaceChildren(...snapshot.limits.map(s=>el('li',s)));
 $('traction-baseline').textContent=snapshot.collectionStartedAt?'Collection started '+new Date(snapshot.collectionStartedAt).toLocaleString()+'. '+(snapshot.previous?'Comparison uses the prior '+snapshot.days+' days.':'Prior-period comparisons will appear once enough history is available.'):'Collection is ready. The first consenting, non-owner visit will start your baseline.';
 $('traction-status').textContent=(snapshot.enabled?'Updated ':'Collection disabled · Updated ')+new Date(snapshot.generatedAt).toLocaleString()+' · Dates in UTC · Today is incomplete';
 $('traction-download').disabled=false;$('traction-json').disabled=false;chart();
}
export async function refreshTraction(days=30){
 const request=++version;$('traction-error').hidden=true;$('traction-status').textContent='Loading website measurements…';
 try{const response=await fetch('/api/admin/website-analytics?days='+encodeURIComponent(days),{credentials:'same-origin',signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load website analytics.');if(request!==version)return;snapshot=data;render();}
 catch(error){if(request!==version)return;$('traction-error').textContent=error.message;$('traction-error').hidden=false;$('traction-status').textContent=snapshot?'Showing the last successful website snapshot; these numbers are not fresh.':'Website measurements could not load.';}
}
function download(format){if(!snapshot)return;const a=el('a');a.href='/api/admin/website-export?days='+snapshot.days+'&format='+format;a.download='GoPlan-website.'+format;document.body.append(a);a.click();a.remove();}
function init(){if(!$('view-traction'))return;$('traction-download').onclick=()=>download('csv');$('traction-json').onclick=()=>download('json');$('traction-metric').onchange=chart;}
init();
