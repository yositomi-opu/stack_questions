const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root,'app/mcq-webapp/app.js'),'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m=>m[0]).join('\n');
const langs = ['en','ja','fr','it','de','pt','zh','ko','ru','sv','es'];
const field = (value='')=>({value,checked:false,hidden:false,closest:()=>({classList:{toggle(){},remove(){}}})});
const el = Object.fromEntries(['radioMultiplePrompt','castextTemplate','noCorrectOption','noIdeaOption','scoringMethod','stackApiUrl','parameters','qvars','questionId','baseLanguage','modeRb','modeCb','numOptions','numCorrect','randomCorrect','correctCounts','requirePairs','feedbackByTruth','saveVariablesSeparately','downloadIncludeButton','includeBaseUrl','correctCountsRow'].map(k=>[k,field()]));
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

assert.doesNotMatch(resetHtml.match(/<textarea id="parameters"[^>]*>/)[0], /placeholder=/, "Empty parameters must look empty rather than showing executable example code");

for (const input of ['', '  \n ', ';', '\n;\n;']) {
  el.parameters.value=input;
  assert.equal(context.cleanParameterStatements(input),'');
  assert.ok(context.parameterPreamble().every(line=>line.trim()!==';'));
}
for (const input of ['/* parameters */', '/* outer /* nested */ comment */']) {
  el.parameters.value=input;
  assert.equal(context.parameterPreamble().at(-1),input,'Comments do not need a terminator');
}
for (const input of ['%_rk:2;', '%_rk:2$', '%_rk:2; /* comment */', 's:";";', '%_rk:2\n;']) {
  el.parameters.value=input;
  assert.equal(context.parameterPreamble().at(-1),input,'Existing terminator and literals must remain intact');
}
el.parameters.value='%_rk:2';
assert.equal(context.parameterPreamble().at(-1),'%_rk:2;');
assert.equal(context.cleanParameterStatements('%_rk:2;\n;\n/* keep */;'),'%_rk:2;\n\n/* keep */');
assert.equal(context.cleanParameterStatements('s:";";'),'s:";";');
console.log('Passed: empty/comment-only parameters, stray terminators, literals, and necessary terminators.');

state.rows=Array.from({length:5},(_,i)=>({pattern:String(i+1).padStart(2,'0'),truth:'C'}));
assert.equal(context.nextPattern('C'),null);
assert.equal(context.nextPattern('W'),'01');
state.rows.splice(1,1);
assert.equal(context.nextPattern('C'),'02');
state.rows=Array.from({length:9},(_,i)=>({pattern:String(i+1).padStart(2,'0'),truth:'W'}));
assert.equal(context.nextPattern('W'),null);
context.document.createElement=()=>({children:[],dataset:{},classList:{add(){}},append(...items){this.children.push(...items);},setAttribute(){},addEventListener(){}});
const correctMenu=context.fixedPatternInput({truth:'C',pattern:'03',rows:[{pattern:'03'}]});
assert.equal(correctMenu.children.length,5);
assert.equal(correctMenu.value,'03');
assert.equal(correctMenu.children[0].textContent,'1');
assert.equal(context.fixedPatternInput({truth:'W',rows:[{pattern:'09'}]}).children.length,9);
const priorEvaluation=state.casEvaluation;
const lengthBadge=context.document.createElement();
lengthBadge.dataset.evalIds='a';
state.casEvaluation={status:'ready',stale:false,expressions:{a:{ok:true,type:'list',length:13,value:'[1,2,...]'}}};
context.updateCasEvaluationBadge(lengthBadge);
assert.equal(lengthBadge.textContent,'length:13');
state.casEvaluation=priorEvaluation;
state.rows=[{pattern:'06',truth:'C'}];
assert.throws(()=>context.generateVariableBlock(),/正解1〜5/);
console.log('Passed: pattern dropdown limits, free number reuse, invalid export rejection, compact list length.');

// Template selection survives metadata and CSV round trips; reset returns to legacy.
context.applyRecords(context.parseDelimited(fs.readFileSync(path.join(root,"app/mcq-webapp/sample.csv"),"utf8"),","));
for (const mode of ['rb', 'cb']) {
 state.mode=mode;
 for (const suffix of ['', 'Cas']) state.templates[mode+suffix]=fs.readFileSync(path.join(root,`app/mcq-webapp/templates/001.MCQ${suffix ? '_cas' : ''}-${mode}.xml`),'utf8');
 for (const enabled of [false,true]) {
  el.castextTemplate.checked=enabled;
  evaluateLists();
  const xml=context.generateXml();
  for (const stem of ['pre','post','fvar']) assert.ok(xml.includes(`mcq_template_${stem}${enabled ? '_cas' : ''}.mac`));
  const snap=context.decodeAppMetadata(xml.match(/MCQ_WEBAPP_DATA_BASE64:([A-Za-z0-9+/=]+)/)[1]);
  el.castextTemplate.checked=!enabled;context.applyAppStateSnapshot(snap);
  assert.equal(el.castextTemplate.checked,enabled);
  const records=context.currentCsvRecords('variant');
  el.castextTemplate.checked=!enabled;context.applyRecords(records);
  assert.equal(el.castextTemplate.checked,enabled);
 }
}
el.castextTemplate.checked=true;context.resetCsvImportState();assert.equal(el.castextTemplate.checked,false);
console.log('Passed: legacy/CASText template selection, metadata/CSV round trips, clear default.');

// Spanish content is preserved in CSV and XML; base-language checks cannot be cleared.
context.applyRecords(context.parseDelimited(fs.readFileSync(path.join(root,'app/mcq-webapp/sample.csv'),'utf8'),','));
el.baseLanguage.value='es';el.languageChecks.es.checked=true;
el.questions.es.value='Selecciona __SELTYPE__.';
state.rows.forEach(r=>{r.choice_es='Opción';r.feedback_es='Comentario';});
const esRecords=context.currentCsvRecords('Spanish');
context.applyRecords(esRecords);
assert.equal(el.baseLanguage.value,'es');assert.equal(el.questions.es.value,'Selecciona __SELTYPE__.');
assert.match(context.generateXml(),/Selecciona/);
vm.runInContext(source.match(/^function updateBaseLanguageUi\(\) \{[^]*?^}/m)[0],context);
el.choiceLanguageHeading={};el.feedbackLanguageHeading={};
context.document.querySelectorAll=()=>[];
for (const lang of ['ja','es','en']) {
 el.baseLanguage.value=lang;el.languageChecks[lang].checked=false;
 context.updateBaseLanguageUi();
 for(const code of langs) assert.equal(el.languageChecks[code].disabled,code===lang);
 assert.equal(el.languageChecks[lang].checked,true);
 assert.ok(context.activeLangs().includes(lang));
}
console.log('Passed: Spanish CSV/XML and locked base-language checkbox switching.');

// Include filenames follow titles until explicitly supplied and survive saves.
context.resetCsvImportState();
el.includeFilename={value:''};
for (const title of ['Example','Example-rb','Example-cb']) {
 el.questionId.value=title;context.syncIncludeFilename();
 assert.equal(el.includeFilename.value,'Example.txt');
}
state.includeFilename=context.normalizeIncludeFilename('shared');
state.includeSource={generated:true,autoUrl:true};el.questionId.value='Other-rb';
context.refreshGeneratedIncludeSource();
assert.equal(state.includeSource.filename,'shared.txt');
assert.equal(state.includeSource.path,'001/shared.txt');
assert.match(state.includeSource.url,/\/001\/shared.txt$/);
const nameSnapshot=context.appStateSnapshot();
state.includeFilename='';context.applyAppStateSnapshot(nameSnapshot);
assert.equal(state.includeFilename,'shared.txt');
assert.deepEqual(Array.from(context.currentCsvRecords('name').find(r=>r[1]==='include_filename')),['config','include_filename','shared.txt']);
context.applyConfig('include_filename','manual.txt');assert.equal(state.includeFilename,'manual.txt');
state.includeFilename='';context.refreshGeneratedIncludeSource();assert.equal(state.includeSource.filename,'Other.txt');
state.includeSource={generated:false,autoUrl:false,url:'https://example.org/005/original.txt',path:'005/original.txt',filename:'original.txt'};
state.includeFilename='renamed.txt';context.refreshGeneratedIncludeSource();
assert.equal(state.includeSource.url,'https://example.org/005/renamed.txt');
assert.equal(state.includeSource.path,'005/renamed.txt');
context.resetCsvImportState();assert.equal(state.includeFilename,'');assert.equal(el.includeFilename.value,'');
console.log('Passed: default/manual include names, rb/cb suffixes, metadata/CSV, URL consistency, reset.');

// rb2 is an instruction variant, not a different input type or random outcome.
context.applyRecords(context.parseDelimited(fs.readFileSync(path.join(root,'app/mcq-webapp/sample.csv'),'utf8'),','));
for (const cas of [false,true]) {
 el.castextTemplate.checked=cas;
 el.radioMultiplePrompt.checked=true;
 context.setMode('rb');
 for (const count of ['1','2']) {
  el.randomCorrect.checked=true;el.correctCounts.value=count;
  // Use the sample's complete C/W pair and sufficient evaluated capacity.
  evaluateLists();
  assert.match(context.generateXml(),/%__mcq_rb_cb:"rb2";/);
 }
 el.correctCounts.value='1, 2';evaluateLists();
 const saved=context.appStateSnapshot();
 el.radioMultiplePrompt.checked=false;context.applyAppStateSnapshot(saved);
 assert.equal(el.radioMultiplePrompt.checked,true);
 const records=context.currentCsvRecords('rb2');
 el.radioMultiplePrompt.checked=false;context.applyRecords(records);
 assert.equal(el.radioMultiplePrompt.checked,true);
 context.setMode('cb');assert.equal(el.radioMultiplePrompt.disabled,true);
 evaluateLists();assert.match(context.generateXml(),/%__mcq_rb_cb:"cb";/);
 context.setMode('rb');assert.equal(el.radioMultiplePrompt.disabled,false);
 assert.equal(el.radioMultiplePrompt.checked,true);
 el.radioMultiplePrompt.checked=false;evaluateLists();
 assert.match(context.generateXml(),/%__mcq_rb_cb:"rb";/);
}
context.resetCsvImportState();assert.equal(el.radioMultiplePrompt.checked,false);
console.log('Passed: rb/rb2/cb generation independent of drawn count, settings round trips and reset.');

// CASText migration preserves literal strings, legacy CAS expressions, and saved state.
context.applyRecords(context.parseDelimited(fs.readFileSync(path.join(root,'app/mcq-webapp/sample.csv'),'utf8'),','));
for(const lang of langs) {
 el.questionModes[lang].options=[{textContent:'文字列'}, {textContent:'CAS式'}];
 el.questions[lang].closest=()=>({classList:{add(){},remove(){},toggle(){}}});
}
const legacy='sconcat("行列 ", stack_disp(m,"i"), " __SELTYPE__")';
el.questions.ja.value=legacy;state.questionTypes.ja='cas';el.castextTemplate.checked=true;
context.syncCastextQuestionInputs();
const migrated=el.questions.ja.value;
assert.equal(migrated,'行列 {@m@} __SELTYPE__');
assert.equal(state.questionTypes.ja,'text');assert.equal(el.questionModes.ja.disabled,true);
context.syncCastextQuestionInputs();assert.equal(el.questions.ja.value,migrated,'migration is idempotent');
assert.equal(context.replaceCasttextPrompts(migrated),'行列 {@m@} {@%__SELTYPE@}');
assert.equal(context.replaceCasttextPrompts('{@f("__SELTYPE__")@}'),'{@f("__SELTYPE__")@}');
assert.equal(context.replaceCasttextPrompts('文 __SELTYPE__ {@a@} __SELPROMPT__'),'文 {@%__SELTYPE@} {@a@} {@%__SELPROMPT@}');
assert.equal(context.casttextLiteral('a\n"b"'), 'castext("a\n\\"b\\"")');
assert.match(context.langAssocFromFields(),/castext\(/);
const castSnapshot=context.appStateSnapshot();state.legacyQuestionInputs={};context.applyAppStateSnapshot(castSnapshot);
assert.equal(state.legacyQuestionInputs.ja.original,legacy);
const castRecords=context.currentCsvRecords('cast');context.applyRecords(castRecords);
assert.equal(state.legacyQuestionInputs.ja.original,legacy);
el.castextTemplate.checked=false;context.syncCastextQuestionInputs();
assert.equal(el.questions.ja.value,legacy);assert.equal(state.questionTypes.ja,'cas');
assert.equal(el.questionModes.ja.disabled,false);
assert.equal(context.feedbackOutputValue({value:'Test {@a@}',type:'text'}).type,'text');
el.castextTemplate.checked=true;
assert.equal(context.feedbackOutputValue({value:'Test {@a@}',type:'text'}).value,'castext("Test {@a@}")');
assert.match(context.feedbackOutputValue({value:'sconcat("Value: ",tex2(a))',type:'cas'}).value,/castext\("Value: \{@a@\}"\)/);
assert.equal(context.feedbackOutputValue({value:'custom_feedback(a)',type:'cas'}).value,'custom_feedback(a)');
console.log('Passed: CASText migration, escaping, prompt tokens, feedback wrapping, save/load and reversal.');

// Manual CASText is a distinct editable type before opting into the templates.
const manualCasttext='Value {@a@} [[if test="a>0"]]positive[[/if]]';
el.castextTemplate.checked=false;state.legacyQuestionInputs={};
el.questions.ja.value=manualCasttext;state.questionTypes.ja='castext';
el.baseLanguage.value='ja';el.languageChecks.ja.checked=true;
context.syncCastextQuestionInputs();
assert.equal(el.questions.ja.value,manualCasttext);
assert.throws(()=>context.langAssocFromFields(),/CASText/);
const manualRecords=context.currentCsvRecords('manual');
assert.ok(manualRecords.some(r=>r[0]==='qtextL' && r[1]==='castext'));
context.applyRecords(manualRecords);
assert.equal(state.questionTypes.ja,'castext');
assert.equal(el.questions.ja.value,manualCasttext);
const manualSnapshot=context.appStateSnapshot();context.applyAppStateSnapshot(manualSnapshot);
assert.equal(state.questionTypes.ja,'castext');
el.castextTemplate.checked=true;context.syncCastextQuestionInputs();
assert.equal(el.questions.ja.value,manualCasttext);
assert.equal(state.questionTypes.ja,'castext');
assert.ok(!state.legacyQuestionInputs.ja);
assert.ok(context.langAssocFromFields().includes('Value {@a@}'));
el.castextTemplate.checked=false;context.syncCastextQuestionInputs();
assert.equal(el.questions.ja.value,manualCasttext);
console.log('Passed: manual CASText CSV/metadata persistence, pre-migration export guard, unchanged opt-in and opt-out.');
// Choosing CASText enables the templates and announces feedback review once.
let migrationNotice='';
context.window.mcqNotice=message=>{migrationNotice=message;};
vm.runInContext('function markTranslationsStale(){}',context);
el.castextTemplate.checked=false;
el.questions.ja.value=manualCasttext;
context.changeQuestionValueType('ja','castext');
assert.equal(el.castextTemplate.checked,true);
assert.equal(el.questions.ja.value,manualCasttext);
assert.match(migrationNotice,/フィードバック/);
migrationNotice='';context.changeQuestionValueType('ja','castext');
assert.equal(migrationNotice,'');
el.castextTemplate.checked=false;context.changeQuestionValueType('ja','text');
assert.equal(el.castextTemplate.checked,false);
console.log('Passed: CASText selection enables templates, retains input, and notifies only on activation.');
state.qvars=['a:1;\n/* EOF */','/* only a comment */','b:2 /* trailing comment */','s:"semi;/* literal */"; /* end */'];
assert.deepEqual(Array.from(context.normalizedQvars()),['a:1;\n/* EOF */','/* only a comment */','b:2 /* trailing comment */;','s:"semi;/* literal */"; /* end */']);
console.log('Passed: trailing comments do not cause empty Maxima statements.');
