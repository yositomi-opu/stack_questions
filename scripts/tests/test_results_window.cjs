const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/mcq-webapp/file-ui.js', 'utf8');
const listeners = {}, observers = [];
const element = tag => ({tag, children:[], append(...nodes){this.children.push(...nodes)}, replaceChildren(...nodes){this.children=nodes}, addEventListener(event,fn){this[event]=fn}});
let child, opens=0, blocked=false, notice='';
const status={textContent:'Not evaluated'};
const button={addEventListener(event,fn){listeners[event]=fn}};
const panel={text:'initial values'};
const document={documentElement:{lang:'ja'}, querySelector(){return panel}};
const window={
 open(){
  opens++;
  if(blocked)return null;
  child={closed:false,focus(){},close(){this.closed=true},document:{head:element('head'),body:element('body'),documentElement:{},createElement:element,importNode(node){return {...node}}}};
  return child;
 },
 addEventListener(){},mcqNotice(message){notice=message},
};
const context=vm.createContext({document,window,el:{casEvaluationStatus:status},uiText:s=>s,URL,location:{href:'http://localhost:4173/'},$:()=>button,MutationObserver:class{constructor(fn){observers.push(fn)}observe(){}}});
vm.runInContext(source.slice(source.indexOf('  let resultsWindow = null;'), source.lastIndexOf('})();')),context);
listeners.click();assert.equal(opens,1);assert.equal(child.document.title,'問題変数評価結果');
assert.equal(child.document.body.children[1].text,'initial values');
status.textContent='Evaluated';panel.text='aa = 3';observers[0]();
assert.equal(child.document.body.children[0].children[0].textContent,'Evaluated');
assert.equal(child.document.body.children[1].text,'aa = 3');
listeners.click();assert.equal(opens,1,'reuse the results window');
child.document.body.children[0].children[1].click();assert.equal(child.closed,true);
blocked=true;listeners.click();assert.match(notice,/ポップアップ/);
console.log('Passed: results window creation, live updates, reuse, close and blocked-popup feedback.');
