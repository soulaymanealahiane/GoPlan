import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
// Local-only D1-compatible adapter. Production applies these migrations during deployment.
export function localDatabase(filename,migrations=path.resolve(import.meta.dirname,'../drizzle')){
 if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});
 const db=new DatabaseSync(filename);db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
 const journal=JSON.parse(readFileSync(path.join(migrations,'meta/_journal.json'),'utf8'));
 for(const entry of journal.entries){if(db.prepare('SELECT name FROM local_migrations WHERE name=?').get(entry.tag))continue;
  db.exec('BEGIN');try{db.exec(readFileSync(path.join(migrations,entry.tag+'.sql'),'utf8'));db.prepare('INSERT INTO local_migrations(name) VALUES (?)').run(entry.tag);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
 const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args)||null,
  all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};},runSync:()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}});
 return {prepare,batch:async statements=>{db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(s.runSync());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},close:()=>db.close()};
}
