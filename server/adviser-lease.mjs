import {REQUEST_TIMEOUT_MS} from './request-policy.mjs';
// Durable concurrency protection across Worker instances; no prompts or answers.
export async function acquireAdviserLease(db,id,{owner,actionId}={}){
 if(!db)return {release:async()=>{}};
 await db.prepare('CREATE TABLE IF NOT EXISTS adviser_leases (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
 const now=Date.now(),prefix=/^[a-f0-9]{64}$/.test(owner||'')&&/^[-a-zA-Z0-9]{16,80}$/.test(actionId||'')?owner+':'+actionId+':':'',token=prefix+crypto.randomUUID();
 await db.prepare('DELETE FROM adviser_leases WHERE expires_at<=?').bind(now).run();
 // Keep the lock through the request deadline and allow time for cleanup.
 const lease=await db.prepare('INSERT INTO adviser_leases(id,token,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING RETURNING token').bind(id,token,now+REQUEST_TIMEOUT_MS+30000).first();
 if(!lease)return null;
 return {release:()=>db.prepare('DELETE FROM adviser_leases WHERE id=? AND token=?').bind(id,token).run()};
}

// Recovery may retire only its own initial action's lease. Random suffixes keep
// an old finally handler from releasing a later action's lock.
export async function releaseAdviserActionLease(db,owner,actionId){
 await db.prepare('CREATE TABLE IF NOT EXISTS adviser_leases (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
 await db.prepare('DELETE FROM adviser_leases WHERE token LIKE ?').bind(owner+':'+actionId+':%').run();
}

// Exact failed-request hashes only: no student answers, proposals or credentials.
// Retain budget failures across Worker instances so an unchanged retry is free.
async function failureTable(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS adviser_failures (id TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
 await db.prepare('DELETE FROM adviser_failures WHERE expires_at<=?').bind(Date.now()).run();
}
export async function adviserFailure(db,id){
 if(!db)return null;await failureTable(db);
 return db.prepare('SELECT code,expires_at FROM adviser_failures WHERE id=?').bind(id).first();
}
export async function rememberAdviserFailure(db,id,code){
 if(!db)return;await failureTable(db);
 await db.prepare('INSERT INTO adviser_failures(id,code,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code,expires_at=excluded.expires_at').bind(id,code,Date.now()+600000).run();
}
