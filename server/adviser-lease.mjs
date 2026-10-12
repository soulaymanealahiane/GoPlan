// Durable concurrency protection across Worker instances; no prompts or answers.
export async function acquireAdviserLease(db,id){
 if(!db)return {release:async()=>{}};
 await db.prepare('CREATE TABLE IF NOT EXISTS adviser_leases (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
 const now=Date.now(),token=crypto.randomUUID();
 await db.prepare('DELETE FROM adviser_leases WHERE expires_at<=?').bind(now).run();
 const lease=await db.prepare('INSERT INTO adviser_leases(id,token,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING RETURNING token').bind(id,token,now+65000).first();
 if(!lease)return null;
 return {release:()=>db.prepare('DELETE FROM adviser_leases WHERE id=? AND token=?').bind(id,token).run()};
}
