// Institutional estimate; independent of existing demo account entitlements.
export const OFFER_FIELDS=[
 ['roadmaps','Roadmaps / student'],
 ['direction','Direction edit prompts / roadmap'],
 ['courses','Courses edit prompts / roadmap'],
 ['companies','Companies edit prompts / roadmap'],
 ['exchanges','Exchanges edit prompts / roadmap'],
 ['semesters','Semesters edit prompts / roadmap'],
 ['global','Global changes / completed roadmap']
];
export const OFFER_DEFAULTS=Object.fromEntries(OFFER_FIELDS.map(([key])=>[key,1]));
export const OFFER_BUFFER=0.25,OFFER_MARKUP=0.20;
export function calculateOffer(values){
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Enter a whole number from 0 to 1,000 for each quantity.');
 const inputs={};
 for(const [key] of OFFER_FIELDS){const n=values[key];if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1000)throw Error('Enter a whole number from 0 to 1,000 for each quantity.');inputs[key]=n;}
 // Workbook C10:D16: round provider call counts per roadmap before scaling.
 const guided=inputs.direction+inputs.courses+inputs.companies+inputs.exchanges+inputs.semesters;
 const requests=5+guided+inputs.global*5;
 const jevCalls=inputs.roadmaps*Math.ceil(requests*1.2),solCalls=inputs.roadmaps*Math.ceil(requests*0.3),lunaCalls=inputs.roadmaps*4;
 const jev=jevCalls*10000*0.042/1000000;
 const sol=solCalls*(10000*2+2000*10)/1000000;
 const luna=lunaCalls*(10000*0.1+2000*0.5)/1000000+inputs.roadmaps*2*4*0.01;
 const api=jev+sol+luna,buffered=api*(1+OFFER_BUFFER),total=buffered*(1+OFFER_MARKUP);
 return {inputs,guidedEditsPerRoadmap:guided,backendRequestsPerRoadmap:requests,apiCost:api,bufferedApiCost:buffered,price:Math.round((total+Number.EPSILON)*100)/100,buffer:OFFER_BUFFER,markup:OFFER_MARKUP};
}
export const offerPrice=value=>'US$'+value.toFixed(2);
export function offerSummary(offer){
 const r=calculateOffer(offer.inputs||offer);
 return OFFER_FIELDS.map(([key,label])=>label+': '+r.inputs[key]).join('\n')+'\nEstimated one-time price / student: '+offerPrice(r.price)+' (25% usage buffer and 20% markup included).';
}
