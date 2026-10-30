import assert from 'node:assert/strict';
import {OFFER_DEFAULTS,calculateOffer,offerSummary} from './dist/university-offer.js';
// Independent results from the workbook's C10:D16 arithmetic, rounding only
// after all roadmaps, buffer and markup have been included.
for(const [inputs,price,requests] of [
 [OFFER_DEFAULTS,.44,15],
 [{...OFFER_DEFAULTS,roadmaps:2},.89,15],
 [{roadmaps:1,direction:2,courses:2,companies:2,exchanges:2,semesters:2,global:5},.88,40],
 [{roadmaps:1,direction:0,courses:0,companies:0,exchanges:0,semesters:0,global:0},.26,5],
 [{roadmaps:1,direction:2,courses:3,companies:0,exchanges:4,semesters:6,global:2},.69,30],
 [{...OFFER_DEFAULTS,roadmaps:0},0,15]
]){const r=calculateOffer(inputs);assert.equal(r.price,price);assert.equal(r.backendRequestsPerRoadmap,requests);assert.equal(r.buffer,.25);assert.equal(r.markup,.2);}
for(const bad of [undefined,null,[],{},'1'])assert.throws(()=>calculateOffer(bad));
for(const value of [-1,1.2,1001,NaN,Infinity,null,'1',''])for(const key of Object.keys(OFFER_DEFAULTS))assert.throws(()=>calculateOffer({...OFFER_DEFAULTS,[key]:value}));
assert.equal(calculateOffer({...OFFER_DEFAULTS,price:0,buffer:0,markup:0}).price,.44);
assert.ok(offerSummary(OFFER_DEFAULTS).includes('US$0.44'));
assert.ok(offerSummary({...OFFER_DEFAULTS,roadmaps:2}).includes('Roadmaps / student: 2'));
console.log('Passed workbook-derived package estimates, per-roadmap scaling, unequal stage allowances, zero quantities, cent rounding, fixed buffer/markup and invalid input rejection.');
