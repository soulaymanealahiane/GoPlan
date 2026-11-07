// One viewport-level notification surface, shared by public, account and admin pages.
// Inline validation remains available to application logic but is presented here.
export const NOTIFICATION_DURATION=8000;
export function notificationTimer(show,hide,clock=globalThis){
 let timer=null,current='';
 const cancel=()=>{if(timer!==null)clock.clearTimeout(timer);timer=null;};
 const dismiss=()=>{cancel();current='';hide();};
 const resume=()=>{cancel();if(current)timer=clock.setTimeout(dismiss,NOTIFICATION_DURATION);};
 return {push(message,kind='status'){current=String(message||'').trim();if(!current)return dismiss();cancel();show(current,kind);resume();},dismiss,pause:cancel,resume};
}
const selector='[role="alert"],.field-error,.offer-error,[data-toast-error],[data-notification-container]';
const interactive='button,a,input,select,textarea';
let center,pending;
export function notify(message,kind='status'){if(center)center.push(message,kind);else pending={message,kind};}
export function installNotifications(doc){
 const win=doc.defaultView;if(!win||doc.getElementById('goplan-notification'))return;
 const box=doc.createElement('div');box.id='goplan-notification';box.className='goplan-notification';box.hidden=true;box.setAttribute('popover','manual');box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.setAttribute('aria-atomic','true');
 const text=doc.createElement('span'),close=doc.createElement('button');text.className='notification-text';close.type='button';close.className='notification-close';close.setAttribute('aria-label','Dismiss notification');close.textContent='×';box.append(text,close);doc.body.append(box);
 const timer=notificationTimer((message,kind)=>{
  const host=[...doc.querySelectorAll('dialog[open]')].at(-1)||doc.body;
  if(box.parentElement!==host){try{box.hidePopover?.();}catch{}host.append(box);}
  box.hidden=false;box.dataset.kind=kind;box.setAttribute('role',kind==='error'?'alert':'status');box.setAttribute('aria-live',kind==='error'?'assertive':'polite');text.textContent=message;
  try{box.showPopover?.();}catch{}box.classList.add('notification-visible');
 },()=>{box.classList.remove('notification-visible');box.hidden=true;try{box.hidePopover?.();}catch{}text.textContent='';},win);
 center=timer;if(pending){timer.push(pending.message,pending.kind);pending=null;}close.addEventListener('click',timer.dismiss);box.addEventListener('pointerenter',timer.pause);box.addEventListener('pointerleave',timer.resume);box.addEventListener('focusin',timer.pause);box.addEventListener('focusout',timer.resume);
 // Preserve retry/sign-in buttons when an existing error container also owns actions.
 function sources(node,force){
  if(!node.querySelector(interactive)){if(node.hasAttribute('data-notification-container')){node.removeAttribute('data-notification-container');node.setAttribute('data-toast-error','');}return [node];}
  node.setAttribute('data-notification-container','');if(node.hasAttribute('role'))node.removeAttribute('role');for(const name of ['error','warning','dashboard-error'])if(node.classList.contains(name))node.classList.remove(name);
  const result=[];let index=0;
  for(const child of [...node.childNodes]){
   if(child.nodeType===3){if(!child.textContent.trim())continue;const span=doc.createElement('span');span.textContent=child.textContent;child.replaceWith(span);span.setAttribute('data-toast-error','');span.dataset.notificationKey=(node.id||'error-actions')+'-'+index++;if(force)forced.add(span);result.push(span);}
   else if(child.nodeType===1&&!child.matches(interactive)){
    if(child.querySelector(interactive))result.push(...sources(child,force));
    else{child.setAttribute('data-toast-error','');child.dataset.notificationKey||=(node.id||'error-actions')+'-'+index++;if(force)forced.add(child);result.push(child);}
   }
  }
  return result;
 }
 let prior=new Map(),queued=false,observer;const forced=new Set(),observeOptions={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class','role']};
 function forward(){
  // Do not interpret our own message/action normalization as another failure.
  observer.disconnect();
  try{
  queued=false;const next=new Map(),messages=[],nodes=new Set();
  for(const node of doc.querySelectorAll('[data-notification-source]'))if(!node.matches(selector))node.removeAttribute('data-notification-source');
  for(const node of doc.querySelectorAll(selector)){
   if(node===box||box.contains(node)||node.closest('[hidden]'))continue;
   for(const source of sources(node,forced.has(node)))nodes.add(source);
  }
  for(const node of nodes){
   if(!node.isConnected||node.closest('[hidden]')||node.querySelector(interactive))continue;
   const message=node.textContent.trim();if(!message)continue;
   const key=node.id||node.dataset.notificationKey||message;next.set(key,message);node.setAttribute('data-notification-source','');
   if(prior.get(key)!==message||forced.has(node))messages.push(message);
  }
  prior=next;forced.clear();if(messages.length)timer.push(messages[0],'error');
  }finally{observer.observe(doc.body,observeOptions);}
 }
 observer=new win.MutationObserver(records=>{
  let relevant=false;
  for(const record of records){
   if(record.target===box||box.contains(record.target))continue;
   const element=record.target.nodeType===1?record.target:record.target.parentElement,source=element?.closest(selector);
   const containsError=node=>node.nodeType===1&&node!==box&&!box.contains(node)&&(node.matches(selector)||node.querySelector(selector));
   if(!source&&!element?.hasAttribute('data-notification-source')&&!(record.type==='attributes'&&record.attributeName==='hidden'&&element?.querySelector(selector))&&!(record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(containsError)))continue;
   relevant=true;
   if(source&&(record.type!=='attributes'||!source.hidden))forced.add(source);
  }
  if(relevant&&!queued){queued=true;queueMicrotask(forward);}
 });
 forward();
 // Browser validation uses the same surface instead of an off-screen tooltip.
 let invalidPending=false;
 doc.addEventListener('invalid',event=>{event.preventDefault();const field=event.target;field.setAttribute('aria-invalid','true');field.setAttribute('data-notification-invalid','');if(invalidPending)return;invalidPending=true;
  const label=field.labels?.[0]?.textContent.trim().replace(/\s+/g,' ')||field.getAttribute('aria-label')||'';
  timer.push((label?label+': ':'')+(field.validationMessage||'Check this field.'),'error');win.setTimeout(()=>{invalidPending=false;},0);
 },true);
 doc.addEventListener('input',event=>{const field=event.target;if(field.hasAttribute?.('data-notification-invalid')&&field.validity?.valid){field.removeAttribute('aria-invalid');field.removeAttribute('data-notification-invalid');}});
 doc.addEventListener('close',event=>{if(event.target.contains?.(box))timer.dismiss();},true);
 win.addEventListener('error',event=>{if(event.error)timer.push('Something could not be completed. Please try again.','error');});
 win.addEventListener('unhandledrejection',()=>timer.push('Something could not be completed. Please try again.','error'));
 return {notify:timer.push,dismiss:timer.dismiss,disconnect:()=>observer.disconnect()};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>installNotifications(document),{once:true});
 else installNotifications(document);
}
