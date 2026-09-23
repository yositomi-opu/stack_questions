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
  translationTarget:field('pt'),translationJson:field(''),translationPanel:{open:false},requirePairs:{checked:false}};
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
const response={schema:'stack-mcq-translations-v1',translations:{pt:{question_text:String.raw`\({@%_nr@}\times{@%_nc@}\)`,rows:[{id:'0',choice:null,feedback:'castext("Correto.")'}]}}};
const json=JSON.stringify(response,null,2);
for(const wrapped of [json,'```\n'+json+'\n```','```json\n'+json+'\n```','以下が翻訳です。\n```json\n'+json+'\n```\n以上です。']) {
 assert.equal(JSON.stringify(context.parseTranslationResponse(wrapped)),JSON.stringify(response));
}
context.prepareTranslationRequest();
const request=el.translationJson.value;
assert.throws(()=>context.parseTranslationResponse(request),/翻訳依頼文が残っています/);
assert.equal(JSON.stringify(context.parseTranslationResponse(request+'\n```json\n'+json+'\n```')),JSON.stringify(response));
assert.throws(()=>context.parseTranslationResponse(json+'\n'+json),/複数/);
assert.throws(()=>context.parseTranslationResponse(json.slice(0,-3)),/有効なJSON/);
assert.throws(()=>context.parseTranslationResponse('{"translations":{"pt":{"question_text":"castext("bad")"}}}'),/有効なJSON/);
const prior=el.questions.pt.value;
el.translationJson.value=request;context.applyTranslationResult();assert.equal(el.questions.pt.value,prior);assert.equal(context.status.kind,'error');
if(process.env.MCQ_TRANSLATION_RESPONSE) {
 const pasted=fs.readFileSync(process.env.MCQ_TRANSLATION_RESPONSE,'utf8');
 const decoded=context.parseTranslationResponse(pasted);
 assert.equal(Object.keys(decoded.translations).length,10);
 assert.ok(decoded.translations.pt.question_text.includes(String.raw`\times`));
 el.translationJson.value=pasted;context.applyTranslationResult();
 assert.notEqual(context.status.kind,'error',context.status.message);
 assert.equal(el.questions.pt.value,decoded.translations.pt.question_text);
 assert.equal(state.rows[0].feedback_pt,decoded.translations.pt.rows[0].feedback);
 console.log('Passed: supplied ten-language response parses and its supported languages apply unchanged.');
}
console.log('Passed: JSON/fences/prose/request+response extraction, request-only guidance, malformed/ambiguous rejection, lossless strings.');
// Requests contain one selected target, stable IDs and no instruction to echo the source.
for (const lang of ['en','pt']) {
 el.translationTarget.value=lang;
 context.prepareTranslationRequest();
 const request=el.translationJson.value;
 const input=JSON.parse(request.slice(request.indexOf('\n{\n')+1));
 assert.deepEqual(input.target_languages,[lang]);
 assert.equal(input.rows[0].id,'option1C_0');
 assert.match(request,/最上位キーはtranslationsだけ/);
 assert.match(request,/原文・schema・設定は返答に再掲しない/);
 assert.ok(!request.includes('入力と同じ構造に translations を追加'));
 assert.throws(()=>context.parseTranslationResponse(request),/翻訳依頼文が残っています/);
 el.translationJson.value=JSON.stringify({translations:{[lang]:{question_text:`${lang} question`,rows:[{id:'option1C_0',choice:`${lang} choice`,feedback:`${lang} feedback`}]}}});
 context.applyTranslationResult();
 assert.notEqual(context.status.kind,'error');
}
assert.equal(el.questions.en.value,'en question');
assert.equal(el.questions.pt.value,'pt question');
assert.equal(state.rows[0].choice_en,'en choice');
assert.equal(state.rows[0].choice_pt,'pt choice');
el.translationTarget.value='ja';
assert.equal(context.syncTranslationTarget(),'en','base language is not a target');
vm.runInContext("function activeLangs(){return ['ja'];}",context);
const responseBefore=el.translationJson.value;
assert.equal(context.prepareTranslationRequest(),undefined);
assert.equal(el.translationJson.value,responseBefore,'no-target errors must preserve the pasted response');
context.syncTranslationTarget();assert.equal(el.translationTarget.disabled,true);
console.log('Passed: single-language requests, compact response instructions, stable IDs, sequential merge and unavailable target handling.');
