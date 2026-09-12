const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root,'app/mcq-webapp/app.js'),'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m=>m[0]).join('\n');
const langs = ['en','ja','fr','it','de','pt','zh','ko','ru','sv'];
const field = (value='')=>({value,checked:false,hidden:false,closest:()=>({classList:{toggle(){},remove(){}}})});
const el = Object.fromEntries(['noCorrectOption','noIdeaOption','scoringMethod','stackApiUrl','parameters','qvars','questionId','baseLanguage','modeRb','modeCb','numOptions','numCorrect','randomCorrect','correctCounts','requirePairs','feedbackByTruth','saveVariablesSeparately','downloadIncludeButton','includeBaseUrl','correctCountsRow'].map(k=>[k,field()]));
el.baseLanguage.value='ja';
el.includeBaseUrl.value='https://example.org/';
el.questions=Object.fromEntries(langs.map(l=>[l,field()]));
el.questionModes=Object.fromEntries(langs.map(l=>[l,field()]));
el.languageChecks=Object.fromEntries(langs.map(l=>[l,field()]));
const state={mode:'cb',rows:[],qvars:[],questionTypes:{},templates:{cb:fs.readFileSync(path.join(root,'app/mcq-webapp/templates/001.MCQ-cb.xml'),'utf8')},casEvaluation:{stale:false,expressions:{}}};
const context=vm.createContext({el,state,TextEncoder,TextDecoder,URL,structuredClone,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
vm.runInContext(`const LANGS=${JSON.stringify(langs)}; const INITIAL_LOCALE='ja';
const DEFAULT_INCLUDE_BASE_URL='https://example.org/'; const uiText=s=>s;
${functions}
function updateOutput(){} function updateQuestionLanguageVisibility(){} function updateBaseLanguageUi(){}
function validateTranslationCoverage(){} function languageBlocks(){return '';}
`,context);
const includeText=fs.readFileSync(path.join(root,'001/GaussElimMatrixGivenRank-A.txt'),'utf8');
function doc(xml){return {querySelector(selector){
 if(selector==='question > name > text')return {textContent:xml.match(/<name>\s*<text>([^]*?)<\/text>/)[1]};
 if(selector==='input > type')return {textContent:'checkbox'};
 return null;
}};}
function evaluateLists(){state.casEvaluation={stale:false,expressions:{}};state.rows.forEach((r,i)=>{for(const l of langs)state.casEvaluation.expressions[`choice:${i}:${l}`]={ok:true,type:'list',length:r.truth==='C'?4:13};});}
let shared;
for(const rank of [0,1,2]){
 const xml=fs.readFileSync(path.join(root,`001/001.GaussElimMatrixGivenRank-A-rk${rank}-cb.xml`),'utf8');
 const variables=xml.match(/<questionvariables>\s*<text><!\[CDATA\[([^]*?)\]\]>/)[1];
 context.importLegacyQuestionVariables(includeText,doc(xml),'',variables);
 state.includeSource={url:'https://example.org/001/GaussElimMatrixGivenRank-A.txt',path:'001/GaussElimMatrixGivenRank-A.txt',generated:false};
 assert.match(el.parameters.value,new RegExp(`%_rk:${rank};`));
 assert.equal(el.numOptions.value,'8');
 assert.equal(el.correctCounts.value,'2, 3, 4, 4');
 evaluateLists();
 const result=context.generateXml();
 const preview=context.previewQuestionSnapshot();
 const previewMain=context.extractMainVariableSection(preview.questionDefinition);
 assert.match(previewMain,new RegExp(`%_rk:${rank};`));
 assert.doesNotMatch(previewMain,/stack_include\(/);
 assert.ok(previewMain.indexOf(`%_rk:${rank};`) < previewMain.indexOf('if not numberp(%_rk)'));
 assert.equal(context.generateXml(),result,'preview must not change saved XML');
 if(process.env.MCQ_PREVIEW_FIXTURE_DIR) fs.writeFileSync(path.join(process.env.MCQ_PREVIEW_FIXTURE_DIR,`rank${rank}.xml`),preview.questionDefinition);
 const main=context.extractMainVariableSection(result);
 assert.ok(main.indexOf('%_MCQ_NUM_OPTS:8;') < main.indexOf(`%_rk:${rank};`));
 assert.ok(main.indexOf(`%_rk:${rank};`) < main.indexOf('stack_include('));
 assert.match(main,/%_MCQ_NUM_COPTS:rand\(\[2, 3, 4, 4\]\);/);
 const roundtrip=context.legacyIncludePreamble(main);
 assert.match(roundtrip.parameters,new RegExp(`%_rk:${rank};`));
 const metadata=result.match(/MCQ_WEBAPP_DATA_BASE64:([A-Za-z0-9+/=]+)/)[1];
 el.parameters.value='wrong';context.applyAppStateSnapshot(context.decodeAppMetadata(metadata));
 assert.match(el.parameters.value,new RegExp(`%_rk:${rank};`));
 const include=context.generateIncludeFileContent();
 assert.doesNotMatch(include, new RegExp(`^%_rk:${rank};`,'m'));
 if(shared)assert.equal(include,shared,'rank variants must keep the same shared include');
 shared=include;
 const evaluation=context.evaluationVariableCode();
 assert.ok(evaluation.indexOf(`%_rk:${rank};`) < evaluation.indexOf('if not numberp(%_rk)'));
 const csv=context.csvText(context.currentCsvRecords('variant'));
 const originalParams=el.parameters.value;
 context.applyRecords(context.parseDelimited(csv,','));
 assert.equal(el.parameters.value.trim(),originalParams.trim());
 assert.equal(el.correctCounts.value,'2, 3, 4, 4');
 assert.equal(state.includeSource,null,'CSV restores an inline editable body');
 evaluateLists();
 assert.ok(context.generateVariableBlock().indexOf(`%_rk:${rank};`) < context.generateVariableBlock().indexOf('if not numberp(%_rk)'));
 state.includeSource={generated:true};
 assert.doesNotMatch(context.generateIncludeFileContent(),new RegExp(`^%_rk:${rank};`,'m'));
}
// Wrapper settings win over the shared defaults, including zero and weighted draws.
const changed=context.legacyIncludePreamble('%_MCQ_NUM_OPTS:10; %_MCQ_NUM_COPTS:0; /* flag */ %_rk:0; stack_include("x");');
assert.equal(changed.settings['%_MCQ_NUM_OPTS'],'10');assert.equal(changed.settings['%_MCQ_NUM_COPTS'],'0');assert.match(changed.parameters,/%_rk:0;/);
const snapshot=context.appStateSnapshot();delete snapshot.parameters;el.parameters.value='stale';context.applyAppStateSnapshot(snapshot);assert.equal(el.parameters.value,'');
console.log('Passed: rank 0/1/2 XML preambles, weighted counts, metadata and CSV round trips, evaluation order, shared/generated include isolation, old metadata.');

// Extra options and scoring method persist through XML metadata and CSV.
for (const method of ['1','2','3','4']) {
 el.noCorrectOption.checked=true; el.noIdeaOption.checked=true; el.scoringMethod.value=method;
 const pre=context.parameterPreamble().join('\n');
 assert.match(pre,/%__mcq_nocorrectopt:true;/);
 assert.match(pre,/%__mcq_noidea:true;/);
 assert.ok(pre.includes(`%__mcq_scmethod:${method};`));
 assert.match(pre,/%__mcq_nocorrecttrue:is\(%_MCQ_NUM_COPTS=0\);/);
 const snap=context.appStateSnapshot();
 el.noCorrectOption.checked=false; el.noIdeaOption.checked=false; el.scoringMethod.value='1';
 context.applyAppStateSnapshot(snap);
 assert.equal(el.noCorrectOption.checked,true); assert.equal(el.noIdeaOption.checked,true); assert.equal(el.scoringMethod.value,method);
 const csv=context.csvText(context.currentCsvRecords('settings'));
 context.applyRecords(context.parseDelimited(csv,','));
 assert.equal(el.noCorrectOption.checked,true); assert.equal(el.noIdeaOption.checked,true); assert.equal(el.scoringMethod.value,method);
}
const old=context.appStateSnapshot(); delete old.settings.noCorrectOption; delete old.settings.noIdeaOption; delete old.settings.scoringMethod;
context.applyAppStateSnapshot(old);
assert.equal(el.noCorrectOption.checked,false); assert.equal(el.noIdeaOption.checked,false); assert.equal(el.scoringMethod.value,'1');
console.log('Passed: extra options and scoring method XML/CSV settings round trips and old defaults.');
const originalXml=fs.readFileSync(path.join(root,'001/001.GaussElimMatrixGivenRank-A-rk2-cb.xml'),'utf8');
const withFlags=originalXml.replace('%_rk:2;', '%_rk:2; %__mcq_noidea:true; %__mcq_nocorrectopt:true; %__mcq_scmethod:4;');
context.importLegacyQuestionVariables(includeText,doc(withFlags),'',withFlags.match(/<questionvariables>\s*<text><!\[CDATA\[([^]*?)\]\]>/)[1]);
assert.equal(el.noIdeaOption.checked,true); assert.equal(el.noCorrectOption.checked,true); assert.equal(el.scoringMethod.value,'4');
assert.ok(!el.parameters.value.includes('%__mcq_scmethod'));
assert.match(el.parameters.value,/%_rk:2;/);
console.log('Passed: legacy include wrapper flags restored without duplicate overriding assignments.');

el.scoringMethodField={hidden:false};
el.scoringMethod.value='2';
context.setMode('rb');
assert.equal(el.scoringMethodField.hidden,true);
assert.equal(el.scoringMethod.disabled,true);
assert.match(context.parameterPreamble().join('\n'),/%__mcq_scmethod:1;/);
context.setMode('cb');
assert.equal(el.scoringMethodField.hidden,false);
assert.equal(el.scoringMethod.disabled,false);
assert.equal(el.scoringMethod.value,'2');
assert.match(context.parameterPreamble().join('\n'),/%__mcq_scmethod:2;/);
console.log('Passed: Radio fixes scoring to Jaccard; Checkbox restores selected method and visibility.');

// Loading a new document must not inherit derived results or omitted settings.
for (const key of ['casDiagnostics','casDiagnosticSummary','casEvaluationSource','translationStatus','stackApiResult','stackApiStatus','casDiagnosticsPanel','casVariablesPanel','translationPanel','stackApiResultPanel','translationJson','evaluateCasButton','casEvaluationStatus','xmlOutput']) {
  el[key]={value:'old',textContent:'old',dataset:{source:'old'},open:true,hidden:false,disabled:true};
}
function dirtyEditor() {
  el.parameters.value='%_rk:99;';
  el.translationJson.value='old translation';
  el.casDiagnostics.textContent='old error';
  el.casEvaluationSource.dataset.source='old code';
  el.requirePairs.checked=true;
  el.randomCorrect.checked=true;
  el.questionId.value='old title';
  state.casEvaluation={status:'ready',variables:[{name:'old'}],expressions:{old:{length:13}}};
}
dirtyEditor();
context.applyRecords([['qtextL','string','ja','new question'],['option1C','string','ja','new choice']]);
assert.equal(el.parameters.value,'');
assert.equal(el.qvars.value,'');
assert.equal(el.questionId.value,'');
assert.equal(el.requirePairs.checked,false);
assert.equal(el.randomCorrect.checked,false);
assert.equal(el.translationJson.value,'');
assert.equal(el.casDiagnostics.textContent,'');
assert.equal(el.casEvaluationSource.dataset.source,'');
assert.equal(state.casEvaluation.status,'idle');
assert.equal(state.casEvaluation.variables.length,0);
assert.equal(Object.keys(state.casEvaluation.expressions).length,0);
assert.equal(el.questions.ja.value,'new question');
// Explicit file parameters and pair settings still take precedence.
context.applyRecords([['config','parameters','%_rk:2;'],['config','require_pairs','true'],['option1C','string','ja','choice'],['option1W','string','ja','wrong']]);
assert.equal(el.parameters.value,'%_rk:2;');
assert.equal(el.requirePairs.checked,true);
// XML metadata import uses the same cleanup, without losing imported parameters.
context.setMode("cb");
el.numOptions.value="1";
const xml=context.generateXml();
context.DOMParser=class {parseFromString(){return {querySelector(selector){
  return selector==='questionvariables > text'?{textContent:xml.match(/<questionvariables>\s*<text><!\[CDATA\[([^]*?)\]\]>/)[1]}:null;
}};}};
vm.runInContext('function renderRows(){}',context);
dirtyEditor();
context.importXmlText(xml);
assert.equal(el.parameters.value,'%_rk:2;');
assert.equal(el.casDiagnostics.textContent,'');
assert.equal(state.casEvaluation.status,'idle');
context.window={confirm:()=>false};
context.document={getElementById:()=>null};
vm.runInContext('function setStatus(){}',context);
dirtyEditor();context.clearAllEntries();assert.equal(el.parameters.value,'%_rk:99;');
context.window.confirm=()=>true;
context.clearAllEntries();
assert.equal(state.rows.length,0);
assert.equal(el.parameters.value,'');
assert.equal(el.requirePairs.checked,false);
assert.ok(langs.every(lang=>el.questions[lang].value===''));
assert.equal(el.xmlOutput.value,'');
console.log('Passed: CSV/XML reset old results, retain explicit settings, and clear all with cancel support.');

// An evaluation finishing after reset must not repopulate the cleared editor.
vm.runInContext(source.match(/^async function evaluateCasLocally\([^]*?^}/m)[0],context);
vm.runInContext('function casChoiceExpressions(){return [];} function evaluationVariableCode(){return "x:1;";} function problemVariableNames(){return [];} function updateCasEvaluationBadges(){} function webappUrl(p){return p;}',context);
let finishEvaluation;
context.fetch=()=>new Promise(resolve=>{finishEvaluation=resolve;});
const pending=context.evaluateCasLocally();
context.resetDerivedResults();
finishEvaluation({ok:true,json:async()=>({ok:true,variables:[{name:'old'}]})});
pending.then(()=>{
  assert.equal(state.casEvaluation.status,'idle');
  assert.equal(state.casEvaluation.variables.length,0);
  assert.equal(el.casEvaluationSource.dataset.source,'');
  console.log('Passed: late evaluation response is ignored after reset.');
}).catch(error=>{console.error(error);process.exitCode=1;});

const resetHtml=fs.readFileSync(path.join(root,"app/mcq-webapp/index.html"),"utf8");
assert.doesNotMatch(resetHtml,/id="clearRowsButton"/);
assert.doesNotMatch(source,/el\.clearRowsButton/);
assert.match(resetHtml,/id="clearAllButton"[^>]*>全入力クリア/);

// Reset must not generate XML midway through clearing fields.
vm.runInContext('function updateOutput(){throw new Error("Unexpected generation during reset");}',context);
dirtyEditor();
context.clearAllEntries();
assert.equal(el.parameters.value,'');
assert.equal(el.qvars.value,'');
// Exercise the real output handler as well, including a delayed initial render.
vm.runInContext(source.match(/^function updateOutput\([^]*?^}/m)[0],context);
const notices=[];
context.setStatus=(message,error)=>notices.push({message,error});
context.updateOutput();
assert.equal(el.xmlOutput.value,'');
assert.ok(notices.every(item=>!item.error));
console.log('Passed: reset never generates XML midway; empty output has no error.');
