const $=id=>document.getElementById(id);let email='',mode='signup';

const forms=['login','email','code','password'];

function show(form,title,intro){for(const name of forms)$(name+'-form').hidden=name!==form;$('auth-title').textContent=title;$('auth-intro').textContent=intro;$('auth-status').textContent='';}

async function call(path,body){const r=await fetch('/api/auth/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Please try again.');return d;}

async function submit(event,action){event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;$('auth-status').textContent='One moment…';try{await action();}catch(e){$('auth-status').textContent=e.name==='TimeoutError'?'This is taking longer than expected. Please try again.':e.message;}finally{button.disabled=false;}}

function done(){for(const id of ['login-password','new-password','confirm-password','code'])$(id).value='';location.replace(new URLSearchParams(location.search).get('next')==='admin'?'/admin':'/demo');}

function begin(nextMode){mode=nextMode;$('email').value=email||$('login-email').value;$('code').value='';show('email',mode==='signup'?'Your next chapter.':'Set your password.',mode==='signup'?'Use the email approved by your university for a pilot. Verify it, then create your own GoPlan password.':'Verify your email to choose a password. Your plans stay with you.');$('email').focus();}

$('login-form').onsubmit=e=>submit(e,async()=>{await call('login',{email:$('login-email').value.trim(),password:$('login-password').value});done();});

$('create-account').onclick=()=>begin('signup');$('reset-password').onclick=()=>begin('reset');

$('back-login').onclick=()=>{show('login','Welcome back.','Sign in to your personal roadmap.');$('login-email').focus();};

$('email-form').onsubmit=e=>submit(e,async()=>{email=$('email').value.trim();await call('send',{email,mode});show('code','Check your inbox.','Enter the verification code we sent you.');$('code').focus();});

$('code-form').onsubmit=e=>submit(e,async()=>{await call('verify',{email,code:$('code').value.trim()});$('code').value='';show('password','Email verified.','Choose a password for future sign-ins.');$('new-password').focus();});

$('password-form').onsubmit=e=>submit(e,async()=>{if($('new-password').value!==$('confirm-password').value)throw Error('Your passwords do not match.');await call('password',{email,password:$('new-password').value});done();});

$('different-email').onclick=()=>begin(mode);$('restart-verification').onclick=()=>begin(mode);
