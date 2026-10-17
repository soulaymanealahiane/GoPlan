// Simulate an already completed, licensed package in offline API unit tests.
// No production endpoint can grant or reset these database counters.
import {serviceEntitlement,beginServiceAction} from '../server/service-allowance.mjs';
export async function serviceFixture(db,uid){
 const row=await serviceEntitlement(db,uid);
 await db.prepare('UPDATE service_entitlements SET saved=1,step=5,initial_mask=31 WHERE id=?').bind(row.id).run();
 const actions=[];for(let i=0;i<5;i++)actions.push((await beginServiceAction(db,uid,{id:crypto.randomUUID(),kind:'global',step:4})).action);
 return actions;
}
