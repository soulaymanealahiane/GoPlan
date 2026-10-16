import {accountIdentity} from './auth.mjs';
export const isDemoPath=path=>['/demo','/demo/','/demo/aui','/demo.html'].includes(path);
export async function demoPageGate(request,env){
 if(!isDemoPath(new URL(request.url).pathname))return null;
 try{if(await accountIdentity(request,env))return null;}catch{return new Response('Sign-in is temporarily unavailable. Please try again shortly.',{status:503,headers:{'Cache-Control':'no-store'}});}
 return new Response(null,{status:302,headers:{Location:'/signin.html?mode=signup','Cache-Control':'private, no-store'}});
}
