import {accountIdentity} from './auth.mjs';
export async function ownerIdentity(request,env){const user=await accountIdentity(request,env);const allowed=String(env.ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return user&&allowed.includes(user.email.toLowerCase())?user.email:null;}
export const privateHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function adminPageGate(request,env){
 if(await ownerIdentity(request,env))return null;
 const signedIn=!!await accountIdentity(request,env);
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GoPlan · Admin</title><link rel="stylesheet" href="/admin/admin.css"><main class="login panel"><a class="brand" href="/">GoPlan.</a><h1>${signedIn?'Admin access only':'Welcome back.'}</h1><p>${signedIn?'This account does not have dashboard access.':'Sign in with your GoPlan admin email.'}</p><a class="button primary" href="/signin.html?next=admin">${signedIn?'Use another email':'Sign in'}</a></main></html>`,{status:signedIn?403:200,headers:{...privateHeaders,'Content-Type':'text/html; charset=utf-8'}});
}
