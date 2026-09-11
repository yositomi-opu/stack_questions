const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root,'app/mcq-webapp/app.js'),'utf8');
const functions = [...source.matchAll(/^function \w+\([^]*?^}/gm)].map(m=>m[0]).join('\n');
const langs = ['en','ja','fr','it','de','pt','zh','ko','ru','sv'];
const field = (value='')=>({value,checked:false,hidden:false,closest:()=>({classList:{toggle(){},remove(){}}})});
const el = Object.fromEntries(['stackApiUrl','parameters','qvars','questionId','baseLanguage','modeRb','modeCb','numOptions','numCorrect','randomCorrect','correctCounts','requirePairs','feedbackByTruth','saveVariablesSeparately','downloadIncludeButton','includeBaseUrl','correctCountsRow'].map(k=>[k,field()]));
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
