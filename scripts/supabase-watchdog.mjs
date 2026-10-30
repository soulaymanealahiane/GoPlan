import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MANAGEMENT='https://api.supabase.com/v1/projects/';
const transitional=new Set(['COMING_UP','RESTORING','RESTARTING','PAUSING','ACTIVE_UNHEALTHY']);
const error=message=>new Error(message);

// Runs outside Supabase: a paused authentication project cannot run its own
// recovery job. Never restart an active project or retry a restore blindly.
export async function checkSupabase({projectRef,accessToken,publishableKey,autoResume=true,dryRun=false,fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,maxWaitMs=240000,pollMs=10000}={}){
 if(!/^[a-z0-9]{20}$/.test(projectRef||''))throw error('Set SUPABASE_PROJECT_REF to the exact GoPlan project reference.');
 if(!accessToken||/[\r\n]/.test(accessToken))throw error('Set the scoped SUPABASE_ACCESS_TOKEN repository secret.');
 if(!publishableKey||/[\r\n]/.test(publishableKey))throw error('Set SUPABASE_PUBLISHABLE_KEY for the authentication health check.');
 const deadline=now()+maxWaitMs;let firstState='',resumeRequested=false,polls=0;
 async function management(method='GET'){
  let response;
  try{response=await fetcher(MANAGEMENT+projectRef+(method==='POST'?'/restore':''),{method,headers:{Authorization:'Bearer '+accessToken,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});}
  catch{throw error('Supabase management '+(method==='POST'?'restore request':'status check')+' could not be confirmed. The next monitor run will check the project state again.');}
  if(!response.ok)throw error('Supabase management '+(method==='POST'?'restore':'status')+' returned HTTP '+response.status+'. Check the token permissions, expiry and project restrictions.');
  if(method==='POST')return;
  let project;try{project=await response.json();}catch{throw error('Supabase returned an invalid project status response.');}
  if((project.id||project.ref)!==projectRef||!(/^[A-Z_]{1,40}$/).test(project.status||''))throw error('Supabase project identity or status did not match the configured project.');
  return project.status;
 }
 async function authHealthy(){
  let response;try{response=await fetcher('https://'+projectRef+'.supabase.co/auth/v1/health',{headers:{apikey:publishableKey},redirect:'error',signal:AbortSignal.timeout(10000)});}catch{return false;}
  if([401,403].includes(response.status))throw error('Supabase rejected the publishable key used for authentication health checks.');
  if(!response.ok)return false;
  try{return (await response.json()).name==='GoTrue';}catch{return false;}
 }
 while(true){
  const status=await management();polls++;firstState||=status;
  if(status==='INACTIVE'){
   if(dryRun)return {healthy:false,needsResume:true,resumeRequested:false,status,polls};
   if(!autoResume)return {healthy:false,maintenance:true,resumeRequested:false,status,polls};
   if(!resumeRequested){await management('POST');resumeRequested=true;}
  }else if(status==='ACTIVE_HEALTHY'){
   if(await authHealthy())return {healthy:true,status,resumeRequested,recovered:resumeRequested||firstState!=='ACTIVE_HEALTHY'||polls>1,polls};
  }else if(!transitional.has(status))throw error('Supabase project state '+status+' requires owner review; no restore or restart was attempted.');
  const remaining=deadline-now();if(remaining<=0)throw error('Authentication did not recover within the monitor deadline. Check Supabase project status and logs.');
  await wait(Math.min(pollMs,remaining));
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=await checkSupabase({projectRef:process.env.SUPABASE_PROJECT_REF,accessToken:process.env.SUPABASE_ACCESS_TOKEN,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY,autoResume:process.env.SUPABASE_AUTO_RESUME!=='false',dryRun:process.env.SUPABASE_RECOVERY_DRY_RUN==='true'});
  if(!result.healthy&&!result.maintenance)throw error('The project is paused. Dry run confirmed that a resume is needed without changing the project.');
  // Normal healthy runs stay quiet. GitHub surfaces failed runs using the
  // owner's Actions notification preferences; no mail or user data is sent.
  if(result.recovered){const message='GoPlan authentication is healthy again. '+(result.resumeRequested?'The monitor resumed the paused Supabase project.':'Project recovery completed.');console.log(message);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,message+'\n');}
 }catch(failure){console.error(failure.message);process.exitCode=1;}
}
