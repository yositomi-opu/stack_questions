const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/mcq-webapp/app.js', 'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m => m[0]).join('\n');
const rows = [
  {pattern:'01',truth:'C',choice_ja:'A',choice_en:'English A',feedback_ja:'yes',feedback_by_truth:true,choice_list_expr_ja:true},
  {pattern:'01',truth:'W',choice_ja:'B',feedback_ja:'no',feedback_type_ja:'cas',feedback_by_truth:true},
  {pattern:'01',truth:'W',choice_ja:'C',feedback_ja:'no',feedback_by_truth:true},
  {pattern:'02',truth:'C',choice_ja:'D',feedback_ja:'shared'},
  {pattern:'02',truth:'W',choice_ja:'E',feedback_ja:'shared'},
];
const original = structuredClone(rows);
const state = {rows,casEvaluation:{status:'ready',expressions:{old:{ok:true}}}};
const el = {requirePairs:{checked:true},casDiagnostics:{textContent:''},casDiagnosticsPanel:{}};
const context = vm.createContext({state,el});
vm.runInContext(`${functions}\nfunction renderRows(){} function renderCasVariables(){} function updateOutput(){} function setCasEvaluationStatus(){} function setStatus(){}`,context);
context.swapPairedOptions('01');
assert.deepEqual(rows.map(r=>r.truth),['W','C','C','C','W']);
rows.forEach((r,i)=>assert.deepEqual({...r,truth:original[i].truth}, original[i]));
assert.equal(Object.keys(state.casEvaluation.expressions).length,0);
context.swapPairedOptions('01');
assert.deepEqual(rows,original);
context.swapPairedOptions();
assert.deepEqual(rows.map(r=>r.truth),['W','C','C','W','C']);
context.swapPairedOptions();
assert.deepEqual(rows,original);
el.requirePairs.checked=false;
context.swapPairedOptions();
assert.deepEqual(rows,original);
el.requirePairs.checked=true;
state.casEvaluation.status='loading';
context.swapPairedOptions();
assert.deepEqual(rows,original);
context.showCasDiagnostics({error:'failed',diagnostics:'<img src=x> line 3',expressions:[{id:'choice:1:ja',ok:false,error:'division by zero'}]});
assert.equal(el.casDiagnosticsPanel.open,true);
assert.ok(el.casDiagnostics.textContent.includes('<img src=x> line 3'));
assert.ok(el.casDiagnostics.textContent.includes('choice:1:ja'));
context.showCasDiagnostics({ok:true});
assert.equal(el.casDiagnosticsPanel.hidden,true);
console.log('Pair swapping and diagnostics checks passed');
