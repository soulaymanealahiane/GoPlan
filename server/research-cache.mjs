// Short-lived evidence only. Keys are hashed; no questionnaire or credentials.
const memory=new Map(),ttl=15*60*1000;
export async function researchCacheKey(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');}
async function table(db){await db.prepare('CREATE TABLE IF NOT EXISTS research_evidence_cache (id TEXT PRIMARY KEY, payload TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();}
export async function cachedResearch(db,key){
 const now=Date.now();for(const [id,item]of memory)if(item.expires<=now)memory.delete(id);
 if(memory.has(key))return structuredClone(memory.get(key).value);
 if(db)try{await table(db);const row=await db.prepare('SELECT payload FROM research_evidence_cache WHERE id=? AND expires_at>?').bind(key,now).first();if(row)return JSON.parse(row.payload);}catch{console.warn('Research evidence cache read unavailable.');}
 return null;
}
export async function saveResearch(db,key,value){
 if(!value.companies?.length&&!value.exchanges?.length&&!value.facts?.length)return;
 while(memory.size>=64)memory.delete(memory.keys().next().value);
 const expires=Date.now()+ttl;memory.set(key,{value:structuredClone(value),expires});
 if(db)try{
  await table(db);
  await db.prepare('INSERT INTO research_evidence_cache(id,payload,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(key,JSON.stringify(value),expires).run();
  await db.prepare('DELETE FROM research_evidence_cache WHERE expires_at<=?').bind(Date.now()).run();
  await db.prepare('DELETE FROM research_evidence_cache WHERE id NOT IN (SELECT id FROM research_evidence_cache ORDER BY expires_at DESC LIMIT 64)').run();
 }catch{console.warn('Research evidence cache write unavailable.');}
}
