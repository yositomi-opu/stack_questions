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
const context=vm.createContext({el,state,window:{},TextEncoder,TextDecoder,URL,structuredClone,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});
vm.runInContext(`const LANGS=${JSON.stringify(langs)}; const INITIAL_LOCALE='ja'; const SERVER_CONFIG={includeBaseUrl:'https://example.org/'};
const DEFAULT_INCLUDE_BASE_URL='https://example.org/'; const uiText=s=>s;
${functions}
function updateOutput(){} function updateQuestionLanguageVisibility(){} function updateBaseLanguageUi(){}
function validateTranslationCoverage(){} function languageBlocks(){return '';}
`,context);

vm.runInContext(`function renderRows(){} function updateCorrectCountControls(){} function resetDerivedResults(){}
function markTranslationsStale(){} function validatePatternNumbers(){}
`,context);
context.DOMParser=class {parseFromString(xml){return {querySelector(selector){
  if(selector==='questionvariables > text')return {textContent:xml.match(/<questionvariables>\s*<text><!\[CDATA\[([^]*?)\]\]><\/text>/)[1]};
  return null;
}}}};

for(const mode of ['rb','cb'])state.templates[mode+'Cas']=fs.readFileSync(path.join(root,`001.MCQ_cas-${mode}.xml`),'utf8');

const records=[['config','csv_schema','3'],['config','base_language','ja'],['config','languages','ja'],['config','mode','cb'],['config','num_options','2'],['config','num_correct','1'],['config','castext_template','true'],['qtextL','string','ja','選べ'],['option1C','string','ja','正解'],['option1W','string','ja','誤答']];
vm.runInContext('function markCasEvaluationStale(){state.casEvaluation.stale=true;}',context);
context.applyRecords(records);
assert.match(context.generateXml(), /stack_include\("https:\/\/example.org\/ky_linear_algebra.mac"\)/);
context.setLibraryIncluded('texput_W',true);
assert.equal(state.libraryIncludes.ky_linear_algebra,undefined);
context.setLibraryIncluded('rref_lib',true);
let xml=context.generateXml();
assert.ok(!xml.includes('stack_include("https://example.org/ky_linear_algebra.mac")'));
assert.equal((xml.match(/stack_include\("https:\/\/example.org\/texput_W.mac"\)/g)||[]).length,1);
assert.ok(xml.indexOf('texput_W.mac') < xml.indexOf('mcq_template_pre_cas.mac'));
assert.ok(context.evaluationVariableCode().includes('rref_lib.mac'));
const saved=context.currentCsvRecords('v3');
context.applyRecords(saved);
assert.equal(Object.keys(state.libraryIncludes).length,2);
context.importXmlText(xml,'question.xml');
assert.equal(Object.keys(state.libraryIncludes).length,2);
assert.equal(state.libraryIncludes.rref_lib,'https://example.org/rref_lib.mac');
// Stale metadata must not override removal from executable XML.
context.importXmlText(xml.replace('stack_include("https://example.org/rref_lib.mac");',''),'question.xml');
assert.equal(state.libraryIncludes.rref_lib,undefined);
// Handwritten includes retain URL and position; checkboxes remove only whole calls.
context.applyRecords([...records,['config','include_libraries','{}'],['qvar','cas','n/a','/* keep */ stack_include("https://custom.example/texput_W.txt");\na:3;\n/* stack_include("https://custom.example/rref_lib.mac"); */']]);
assert.equal(context.effectiveLibraryIncludes().texput_W,'https://custom.example/texput_W.txt');
context.setLibraryIncluded('texput_W',true);
xml=context.generateXml();
assert.equal((xml.match(/stack_include\("https:\/\/custom.example\/texput_W.txt"\)/g)||[]).length,1);
context.setLibraryIncluded('texput_W',false);
assert.ok(el.qvars.value.includes('/* keep */'));
assert.ok(el.qvars.value.includes('a:3'));
assert.ok(el.qvars.value.includes('/* stack_include('));
assert.ok(!el.qvars.value.includes('texput_W.txt'));
assert.equal(context.libraryIncludeRanges('if false then stack_include("https://a/rref_lib.mac");').length,0);
context.setLibraryIncluded('rref_lib',true);
context.setLibraryIncluded('ky_linear_algebra',true);
assert.deepEqual(Object.keys(state.libraryIncludes),['ky_linear_algebra']);
context.resetCsvImportState();
assert.deepEqual(Object.keys(context.effectiveLibraryIncludes()),[]);
assert.throws(()=>context.parseLibraryConfig('{"rref_lib":"javascript:rref_lib.mac"}'));
// External variable files keep libraries in the outer XML, not nested includes.
context.applyRecords([...records,['config','include_libraries','{"texput_W":"https://example.org/texput_W.mac"}']]);
state.includeSource={url:'https://example.org/001/test.txt',filename:'test.txt',generated:true};
assert.ok(context.generateXml().includes('stack_include("https://example.org/texput_W.mac")'));
assert.ok(!context.generateIncludeFileContent().includes('texput_W.mac'));
assert.ok(context.previewQuestionSnapshot().questionDefinition || context.previewQuestionSnapshot());
console.log('Passed: library selection, legacy defaults, CSV/XML roundtrip, authoritative XML, manual includes, reset, external variables and evaluation.');
