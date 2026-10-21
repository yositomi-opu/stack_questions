const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/mcq-webapp/app.js', 'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m => m[0]).join('\n');
function node() { return {value:'',dataset:{},children:[],events:{},classList:{toggle(){}},
  append(...items){this.children.push(...items)},addEventListener(name,fn){this.events[name]=fn}}; }
const state = {rows:[]};
const el = {requirePairs:{checked:true}};
const context = vm.createContext({state,el,uiText:s=>s,document:{createElement:node}});
vm.runInContext(functions + `
function baseLang(){return 'ja'}
function markTranslationsStale(){} function updateOutput(){} function renderRows(){}
function feedbackValueTypeSelect(value){const n=document.createElement('select'); n.value=value; return n;}
function feedbackModeToggle(){return null} function languageIndependentToggle(){return document.createElement('input')}
function mirrorFeedbackEditors(){}
`, context);
state.rows = [1,2,3,4].flatMap(n=>['C','W'].map(truth=>({pattern:String(n).padStart(2,'0'),truth,
  choice_ja:`choice ${n}${truth}`,feedback_ja:`feedback ${n}`,candidate_id:'1'})));
const before = JSON.stringify(state.rows.map(({pattern,...data})=>data));
context.renumberPattern(state.rows.slice(4,6),'02');
assert.deepEqual(state.rows.map(r=>r.pattern),['01','01','03','03','02','02','04','04']);
assert.equal(new Set(state.rows.map(r=>r.pattern)).size,4);
assert.equal(JSON.stringify(state.rows.map(({pattern,...data})=>data)),before);
context.renumberPattern(state.rows.slice(4,6),'05');
assert.equal(state.rows[4].pattern,'05');
// Fixed-mode renumbering swaps only the same truth side.
el.requirePairs.checked=false;
context.renumberPattern([state.rows[0]],'03');
assert.equal(state.rows[0].pattern,'03');
assert.equal(state.rows[2].pattern,'01');
assert.equal(state.rows[3].pattern,'03');
// Every paired feedback editor remains editable after renumbering; updates are shared.
el.requirePairs.checked=true;
state.rows=[{pattern:'02',truth:'C',feedback_ja:'old'},{pattern:'02',truth:'W',feedback_ja:'old'}];
const editor=context.feedbackTextarea(state.rows[1],1);
const textarea=editor.children[1];
assert.equal(textarea.disabled,false);
textarea.value='updated';textarea.events.input();
assert.deepEqual(state.rows.map(r=>r.feedback_ja),['updated','updated']);
state.rows.forEach(r=>r.feedback_by_truth=true);
const separate=context.feedbackTextarea(state.rows[1],1).children[1];
separate.value='wrong-only';separate.events.input();
assert.deepEqual(state.rows.map(r=>r.feedback_ja),['updated','wrong-only']);
assert.throws(()=>context.generatePairedVariableBlock([{id:'01'},{id:'02'},{id:'04'}],4,[]),
 /選択肢数: 4; 内容のあるパターン数: 3 \(1, 2, 4\)/);
console.log('Passed: pattern swaps preserve four groups and content; editable shared/separate feedback; precise capacity error.');
