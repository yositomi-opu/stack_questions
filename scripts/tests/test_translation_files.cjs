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

vm.runInContext(source.match(/async function readTranslationFile\([^]*?^}/m)[0],context);
// Read-only request view and no pasted-output action in the UI.
const html=fs.readFileSync(path.resolve(__dirname,'../../app/mcq-webapp/index.html'),'utf8');
assert.match(html,/<textarea id="translationJson"[^>]*readonly/);
assert.ok(!html.includes('id="applyTranslationButton"'));
assert.match(html,/id="translationFileInput"[^>]*type="file"/);
context.prepareTranslationRequest();
assert.match(el.translationJson.value,/ダウンロード可能なUTF-8のJSONファイル/);
assert.match(el.translationJson.value,/Filename: mcq-translations-pt.json/);
assert.ok(!el.translationJson.value.includes('返答はJSONコードブロックで囲み'));

// Controlled source with protected CASText/LaTeX and stable candidate IDs.
state.questionTypes.ja='text';
el.questions.ja.value='問題 __SELPROMPT__';
state.rows[0].choice_ja=String.raw`行列 \(x^2\) {@a@}`;
state.rows[0].choice_type_ja='text';
state.rows[0].feedback_ja='説明';
state.rows[1].feedback_ja='不正解';state.rows[1].feedback_type_ja='text';
const result=lang=>({translations:{[lang]:{question_text:'Question __SELPROMPT__',rows:[
 {id:'option1C_0',choice:String.raw`Matrix \(x^2\) {@a@}`,feedback:'Feedback'},
 {id:'option2W_0',choice:null,feedback:'Incorrect'}]}}});
const event=text=>({target:{value:'chosen.json',files:[{size:text.length,text:async()=>text}]}});
const snapshot=()=>JSON.stringify({rows:state.rows,q:Object.fromEntries(Object.entries(el.questions).map(([k,v])=>[k,v.value]))});
(async()=>{
 let file=event('\ufeff'+JSON.stringify(result('pt')));
 await context.readTranslationFile(file);
 assert.notEqual(context.status.kind,'error',context.status.message);
 assert.equal(file.target.value,'');
 assert.equal(state.translationsStale,true,'other old translations still need refresh');
 assert.equal(state.rows[0].choice_pt,String.raw`Matrix \(x^2\) {@a@}`);
 const portuguese=state.rows[0].choice_pt;
 await context.readTranslationFile(event(JSON.stringify(result('en'))));
 assert.equal(state.rows[0].choice_pt,portuguese);
 assert.equal(state.rows[0].feedback_en,'Feedback');
 assert.equal(state.translationsStale,false);
 // One file applies all selected languages and clears stale state in one read.
 state.translationsStale=true;state.fileTranslationProgress=null;
 const combined={translations:{...result('en').translations,...result('pt').translations}};
 combined.translations.en.rows[0].feedback='Combined English';
 combined.translations.pt.rows[0].feedback='Combined Portuguese';
 await context.readTranslationFile(event(JSON.stringify(combined)));
 assert.notEqual(context.status.kind,'error',context.status.message);
 assert.equal(state.rows[0].feedback_en,'Combined English');
 assert.equal(state.rows[0].feedback_pt,'Combined Portuguese');
 assert.equal(state.translationsStale,false);
 assert.match(context.status.message,/2言語/);
 const baseline=snapshot();
 for(const mutation of [
  r=>r.translations.pt.rows.pop(),
  r=>r.translations.pt.rows.push(r.translations.pt.rows[0]),
  r=>r.translations.pt.rows[0].id='unknown',
  r=>r.translations.pt.rows[0].choice=String.raw`Matrix \(x^3\) {@a@}`,
  r=>r.translations.pt.question_text='Missing placeholder',
  r=>r.translations.pt.rows[0].feedback='',
  r=>r.translations.pt.rows[1].choice='unexpected',
  r=>r.translations.bad=r.translations.pt,
  r=>r.translations.en={question_text:'Incomplete __SELPROMPT__',rows:[]}
 ]) {
  const invalid=result('pt');mutation(invalid);
  await context.readTranslationFile(event(JSON.stringify(invalid)));
  assert.equal(context.status.kind,'error');assert.equal(snapshot(),baseline,'reject atomically');
 }
 for(const text of ['{"translations":','{}','```json\n'+JSON.stringify(result('pt'))+'\n```']) {
  await context.readTranslationFile(event(text));assert.equal(context.status.kind,'error');assert.equal(snapshot(),baseline);
 }
 let called=false;await context.readTranslationFile({target:{value:'x',files:[{size:5*1024*1024,text:async()=>{called=true;}}]}});
 assert.equal(called,false);assert.equal(snapshot(),baseline);
 const legacy=result('pt');legacy.translations.pt.rows.forEach((row,i)=>row.id=String(i));
 await context.readTranslationFile(event(JSON.stringify(legacy)));assert.notEqual(context.status.kind,'error');
 const changing=event(JSON.stringify(result('pt')));changing.target.files[0].text=async()=>{el.questions.ja.value='edited';return JSON.stringify(result('pt'));};
 const prior=state.rows[0].choice_pt;await context.readTranslationFile(changing);
 assert.equal(context.status.kind,'error');assert.equal(state.rows[0].choice_pt,prior);
 console.log('Passed: JSON file import, BOM, sequential languages, legacy IDs, atomic incomplete/duplicate/math rejection, size limit and source edits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
