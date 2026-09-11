const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../app/mcq-webapp/app.js'), 'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m=>m[0]).join('\n');
const field = value => ({value});
const el = {questions:{ja:field('sconcat("階数が", tex2(%_rk), "の行列を __SELTYPE__")'),en:field('sconcat("rank ", tex2(%_rk))'),pt:field('')},
  questionModes:{ja:field('cas'),en:field('cas'),pt:field('text')},
  languageChecks:{ja:{checked:true},en:{checked:true},pt:{checked:true}},
  translationJson:field(''),translationPanel:{open:false},requirePairs:{checked:false}};
const state = {questionTypes:{ja:'cas',en:'cas',pt:'text'},questionLanguageIndependent:false,translationsStale:true,
  rows:[{pattern:'01',truth:'C',choice_type_ja:'cas',choice_ja:'["正しい行列", tex2(matA)]',choice_list_expr_ja:true,
    choice_en:'["Correct matrix", tex2(matA)]',choice_type_en:'cas',feedback_ja:'正解です',feedback_type_ja:'text',feedback_en:'Correct'},
    {pattern:'02',truth:'W',choice_language_independent:true,choice_type_ja:'cas',choice_ja:'ListBL1',choice_list_expr_ja:true,
    feedback_type_ja:'cas',feedback_ja:'sconcat("誤りです", tex2(%_rk))',feedback_en:'sconcat("Incorrect", tex2(%_rk))'}]};
const context = vm.createContext({el,state});
vm.runInContext(`const LANGS=['ja','en','pt']; const uiText=s=>s; ${functions}
function baseLang(){return 'ja';} function activeLangs(){return ['ja','en','pt'];}
function feedbackLanguageIndependent(row){return Boolean(row.feedback_language_independent);}
function setTranslationStatus(message,kind){globalThis.status={message,kind};}
function updateBaseLanguageUi(){} function updateOutput(){}
`,context);
context.prepareTranslationRequest();
assert.equal(el.questions.en.value,'sconcat("rank ", tex2(%_rk))','request must retain existing English CAS');
assert.equal(el.questions.pt.value,'','request must not fill pt with Japanese CAS');
assert.equal(state.rows[0].choice_en,'["Correct matrix", tex2(matA)]');
assert.equal(state.rows[1].feedback_en,'sconcat("Incorrect", tex2(%_rk))');
const payload = context.translationPayload();
assert.equal(payload.question_text,el.questions.ja.value);
assert.equal(payload.rows[0].choice,state.rows[0].choice_ja);
assert.equal(payload.rows[1].choice,null,'language-independent CAS needs no translation');
assert.equal(payload.rows[1].feedback,state.rows[1].feedback_ja);
const exampleLine = el.translationJson.value.split('\n').find(line=>line.startsWith('{"question_text":'));
assert.equal(JSON.parse(exampleLine).question_text, 'sconcat("...", tex2(%_rk), " __SELTYPE__")');
assert.match(el.translationJson.value,/"pt":\{"question_text"/);
el.translationJson.value=JSON.stringify({translations:{pt:{
  question_text:'sconcat("Posto ", tex2(%_rk), ": __SELTYPE__")',
  rows:[{id:'0',choice:'["Matriz correta", tex2(matA)]',feedback:'Correto'},
    {id:'1',choice:null,feedback:'sconcat("Incorreto", tex2(%_rk))'}]}}});
context.applyTranslationResult();
assert.notEqual(context.status.kind,'error',context.status.message);
assert.equal(el.questionModes.pt.value,'cas');
assert.equal(state.questionTypes.pt,'cas');
assert.equal(state.rows[0].choice_type_pt,'cas');
assert.equal(state.rows[0].choice_list_expr_pt,true);
assert.equal(state.rows[0].feedback_type_pt,'text');
assert.equal(state.rows[1].feedback_type_pt,'cas');
assert.equal(state.rows[1].choice_pt,'ListBL1');
assert.equal(el.questions.en.value,'sconcat("rank ", tex2(%_rk))');
assert.equal(el.questions.ja.value,payload.question_text);
assert.equal(state.rows[0].choice_pt,'["Matriz correta", tex2(matA)]');
state.questionTypes.ja='text';el.questions.ja.value='問題文 __SELPROMPT__';
el.translationJson.value=JSON.stringify({translations:{pt:{question_text:'Pergunta __SELPROMPT__',rows:[]}}});
context.applyTranslationResult();
assert.equal(state.questionTypes.pt,'text','legacy text JSON must remain supported');
state.questionLanguageIndependent=true;
assert.equal(context.translationPayload().question_text,null);
console.log('Passed: pt CAS translation payload, non-destructive preparation, text/CAS/list types, independent expressions, legacy text JSON.');
