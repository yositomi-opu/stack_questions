const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function setup(writeText, fallback) {
  const nodes = new Map(); const events={};
  const node = id => {
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',hidden:false,open:false,classList:{toggle(){}},style:{},addEventListener(e,f){events[id+':'+e]=f;},focus(){},select(){this.selected=true;},remove(){},append(){},showModal(){this.open=true;},replaceChildren(){}});
    return nodes.get(id);
  };
  const saved = JSON.stringify({settings:550,data:700});
  let copied;
  const document = {getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{append(){}},createElement:()=>node('temporary')};
  document.execCommand=()=>{copied=node('temporary').value; return fallback;};
  const el={settingsWidth:node('settingsWidth'),dataWidth:node('dataWidth'),dataFileInput:node('dataFileInput'),xmlFileInput:node('xmlFileInput'),dataFileButton:node('dataFileButton'),xmlFileButton:node('xmlFileButton'),sampleCsvButton:node('sampleCsvButton'),questionId:node('questionId')};
  const context=vm.createContext({document,el,window:{addEventListener(){}},navigator:{clipboard:{writeText}},localStorage:{getItem:()=>saved,setItem(){}},settingsWidthCustomized:false,updateLayout(){},clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),uiText:s=>s,setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext(fs.readFileSync('app/mcq-webapp/file-ui.js','utf8'),context);
  return {context,node,get copied(){return copied;}};
}
(async()=>{
  let actual;
  const a=setup(async text=>{actual=text;},false);
  const text='aa1:"日本語";\nlist:[1,2];';
  assert.equal(await a.context.window.mcqCopyText(text),true);
  assert.equal(actual,text);
  assert.equal(a.node('actionNotice').textContent,'コピーしました');
  assert.equal(a.node('settingsWidth').value,'550');
  assert.equal(a.node('dataWidth').value,'700');
  const b=setup(async()=>{throw Error('Denied');},true);
  assert.equal(await b.context.window.mcqCopyText(text),true);
  assert.equal(b.copied,text);
  const c=setup(async()=>{throw Error('Denied');},false);
  assert.equal(await c.context.window.mcqCopyText(text),false);
  assert.equal(c.node('sourceDialog').open,true);
  assert.equal(c.node('sourceText').value,text);
  assert.equal(c.node('sourceText').selected,true);
  assert.equal(await c.context.window.mcqCopyText(''),false);
  assert.match(c.node('actionNotice').textContent,/ありません/);
  console.log('Passed: exact clipboard text, denied-permission fallback, manual copy, empty text, restored widths.');
})();
