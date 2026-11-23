import assert from 'node:assert/strict';
import {installNotifications} from './dist/notifications.js';

// A minimal event/element host runs the actual notification installer. Browser
// coverage separately exercises this same module with real DOM validation.
class Element extends EventTarget {
 constructor(tag){super();this.tagName=tag;this.nodeType=1;this.children=[];this.dataset={};this.attributes=new Map();this.hidden=false;this.style={setProperty(){}};this.classList={add(){},remove(){},contains(){return false;}};}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 hasAttribute(name){return this.attributes.has(name);}
 removeAttribute(name){this.attributes.delete(name);}
 append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 get textContent(){return this.text||this.children.map(child=>child.textContent).join('');}
 set textContent(value){this.text=String(value);this.children=[];}
}
const win=new EventTarget(),doc=new EventTarget(),jobs=new Map();let sequence=0;
Object.assign(win,{MutationObserver:class{observe(){}disconnect(){}},matchMedia:()=>({matches:true}),
 setTimeout(fn){const id=++sequence;jobs.set(id,fn);return id;},clearTimeout(id){jobs.delete(id);}});
Object.assign(doc,{defaultView:win,body:new Element('body'),createElement:tag=>new Element(tag),
 getElementById:()=>null,querySelectorAll:()=>[]});
const installed=installNotifications(doc),box=doc.body.children[0],message=box.children[0];
assert.equal(box.hidden,true);

function backgroundFailures(){
 const error=new Event('error',{cancelable:true});
 Object.defineProperties(error,{error:{value:new Error('Background script unavailable')},filename:{value:'https://tracking.example/script.js'}});
 assert.equal(win.dispatchEvent(error),true,'Native browser diagnostics are not suppressed');
 const rejection=new Event('unhandledrejection',{cancelable:true});
 Object.defineProperty(rejection,'reason',{value:new Error('Background measurement unavailable')});
 assert.equal(win.dispatchEvent(rejection),true,'Unhandled promise diagnostics remain available');
}
for(let scroll=0;scroll<8;scroll++)backgroundFailures();
assert.equal(box.hidden,true,'Browsing/background exceptions must not manufacture a failed user action');
assert.equal(message.textContent,'');
assert.equal(jobs.size,0,'Background failures must not start or renew a toast timer');

installed.notify('Your inquiry could not be saved. Please retry.','error');
assert.equal(box.hidden,false,'An explicit failed action still shows its useful error');
assert.equal(message.textContent,'Your inquiry could not be saved. Please retry.');
backgroundFailures();
assert.equal(message.textContent,'Your inquiry could not be saved. Please retry.','Unrelated errors cannot replace an actionable message');
installed.dismiss();
assert.equal(box.hidden,true);
assert.equal(jobs.size,0);
installed.disconnect();
console.log('Notification scope: repeated background errors stay in browser diagnostics; explicit action errors still display and dismiss.');
