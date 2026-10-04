import {hash} from '../server/feedback.mjs';
export async function testSession(DB,id,email=id+'@example.com'){
 const token=await hash('fixture:'+id);
 await DB.prepare('INSERT OR REPLACE INTO auth_sessions(token_hash,user_id,email,expires_at) VALUES(?,?,?,?)').bind(await hash(token),id,email,Date.now()+3600000).run();
 return {'Cookie':'__Host-goplan-session='+token};
}
