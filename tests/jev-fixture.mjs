// Synthetic TypeSafe protocol fixture. No key, network or real student data.
import {JEV_MODEL} from '../server/jev.mjs';
export function jevFixture(body,{pick={},confidence=1,scoreFor}={}){
 const answers={};
 for(const [id,q]of Object.entries(body.questions)){
  if(q.type==='choice'){
   const keys=Object.keys(q.criteria),chosen=pick[id]||keys[0];
   const peak=confidence*(1-1/keys.length)+1/keys.length;
   answers[id]={type:'choice',choice:chosen,confidence,probabilities:Object.fromEntries(keys.map(k=>[k,k===chosen?peak:keys.length>1?(1-peak)/(keys.length-1):0]))};
  }else if(q.type==='score'){
   const value=scoreFor?scoreFor(id,body):2;
   answers[id]={type:'score',score:value,confidence:1,probabilities:Object.fromEntries(q.criteria.map((_,i)=>[String(i),i===value?1:0])),legend:Object.fromEntries(q.criteria.map((v,i)=>[String(i),v]))};
  }else answers[id]={type:'noul',noul:1};
 }
 return Response.json({model:JEV_MODEL,answers,usage:{input_tokens:1200,output_tokens:0}});
}
