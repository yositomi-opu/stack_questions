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
const records=[
 ['config','csv_schema','2'],['config','question_id','metadata-test'],
 ['config','mode','cb'],['config','num_options','2'],['config','num_correct','1'],
 ['config','require_pairs','true'],['config','castext_template','true'],
 ['config','base_language','ja'],['qvar','cas','n/a','aa:3;'],
 ['qtextL','string','ja','選べ __SELPROMPT__'],
 ['option1C','string','ja','文章{@aa@}'],['option1W','cas','ja','castext("誤答")'],
 ['feedback1C','string','ja','正解{@aa@}'],['feedback1W','cas','ja','castext("不正解")'],
 ['option2C','cas_list','ja','[castext("A"),castext("B")]'],
 ['option2W','cas','ja','[1,2]'],
 ['feedback2C','string','ja','共通'],['feedback2W','string','ja','共通'],
];
for(const mode of ['cb','rb']) for(const cas of [false,true]) {
 for(const suffix of ['', 'Cas'])state.templates[mode+suffix]=fs.readFileSync(path.join(root,`app/mcq-webapp/templates/001.MCQ${suffix?'_cas':''}-${mode}.xml`),'utf8');
 context.applyRecords(records);state.mode=mode;el.castextTemplate.checked=cas;
 const before=context.currentCsvRecords('metadata-test');
 const xml=context.generateXml();
 if(mode==='cb' && cas && process.env.MCQ_EDITOR_FIXTURE) fs.writeFileSync(process.env.MCQ_EDITOR_FIXTURE,xml);
 assert.ok(xml.includes('MCQ_WEBAPP_EDITOR_V1'));
 assert.ok(!xml.includes('MCQ_WEBAPP_DATA_BASE64'));
 const meta=context.readEditorMetadata(xml);
 assert.equal(meta.options.option1C[0].languages.ja.input_type,'string');
 assert.ok(!JSON.stringify(meta).includes('文章'));
 context.importXmlText(xml);
 assert.equal(el.requirePairs.checked,true);
 assert.deepEqual(Array.from(state.rows,r=>`${r.pattern}${r.truth}`),['01C','01W','02C','02W'],'paired XML must restore adjacent C/W rows');
 const after=context.currentCsvRecords('metadata-test');
 for(const rec of before.filter(r=>/^(option|feedback|qtextL|qvar)/.test(r[0]))) {
   const actual=after.find(r=>r[0]===rec[0] && r[2]===rec[2]);
   assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(rec)),`${mode} ${cas}: ${rec[0]}`);
 }
 // Direct XML edits take precedence over hints, including loss of scalar shape.
 const edited=xml.replace(cas?'castext("文章{@aa@}")':'"文章{@aa@}"','custom_label(aa)');
 context.importXmlText(edited);
 const row=state.rows.find(r=>r.pattern==='01' && r.truth==='C');
 assert.equal(row.choice_type_ja,'cas');
 assert.equal(row.choice_list_expr_ja,true);
 assert.equal(row.choice_ja,'[custom_label(aa)]');
}
// Fixed slots can have non-consecutive pattern numbers and language-independent data.
context.applyRecords(records);
el.requirePairs.checked=false;
state.rows.forEach(r=>{r.pattern=r.pattern==='01'?'03':'05';r.choice_language_independent=true;r.feedback_language_independent=true;});
const fixed=context.generateXml();context.importXmlText(fixed);
assert.equal(el.requirePairs.checked,false);
assert.deepEqual([...new Set(state.rows.map(r=>r.pattern))],['03','05']);
assert.ok(state.rows.every(r=>r.choice_language_independent && r.feedback_language_independent));
// Independent source file remains authoritative while XML stores only hints.
context.applyRecords(records);
state.includeSource={url:'https://example.org/001/test.txt',path:'001/test.txt',filename:'test.txt',generated:true,autoUrl:false};
const includeContent=context.generateIncludeFileContent();
const includeXml=context.generateXml();
context.importXmlText(includeXml,'test.xml',{url:'https://example.org/001/test.txt',path:'001/test.txt',filename:'test.txt',content:includeContent});
assert.equal(state.rows.find(r=>r.pattern==='01' && r.truth==='C').choice_ja,'文章{@aa@}');
assert.ok(el.qvars.value.includes('aa:3;'));
// Selected languages retain their own input types and text.
const multilingual=records.concat(records.filter(r=>r[2]==='ja' && /^(qtextL|option|feedback)/.test(r[0])).map(r=>[r[0],r[1],'en',r[3]]));
context.applyRecords(multilingual);
const multiBefore=context.currentCsvRecords('metadata-test');
context.importXmlText(context.generateXml());
const multiAfter=context.currentCsvRecords('metadata-test');
for(const rec of multiBefore.filter(r=>/^(option|feedback|qtextL)/.test(r[0]))) {
 const actual=multiAfter.find(r=>r[0]===rec[0] && r[2]===rec[2]);
 assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(rec)));
}
context.applyRecords(records);
el.questionId.value='comment /* nested */ ]]> test';
const comment=context.editorMetadataComment();
assert.equal(comment.match(/\/\*/g).length,1);
assert.equal(comment.match(/\*\//g).length,1);
assert.ok(!comment.includes(']]>'));
assert.equal(context.readEditorMetadata(comment).questionId,el.questionId.value);
// Legacy Base64 snapshots must also render adjacent pairs on full XML import.
context.applyRecords(records);
const legacyXml=context.generateXml().replace(/\/\* MCQ_WEBAPP_EDITOR_V1[^]*?\*\//,'/* MCQ_WEBAPP_DATA_BASE64:'+context.encodeAppMetadata()+' */');
context.importXmlText(legacyXml);
assert.equal(el.requirePairs.checked,true);
assert.deepEqual(Array.from(state.rows,r=>`${r.pattern}${r.truth}`),['01C','01W','02C','02W']);
// Explicit editor settings override heuristic inference from expression syntax.
context.reconcileXmlChoices('%__CoptL1:[castext("C")]; %__WoptL1:[castext("W")];',true);
assert.equal(el.requirePairs.checked,true);
const legacy='/* MCQ_WEBAPP_DATA_BASE64:' +context.encodeAppMetadata()+' */';
assert.equal(context.readEditorMetadata(legacy).rows.length,state.rows.length);
assert.throws(()=>context.readEditorMetadata('/* MCQ_WEBAPP_EDITOR_V1 {broken} */'));
console.log('Passed: readable hints, legacy metadata, rb/cb regular/CASText CSV-XML-CSV, direct edits and safe comment escaping.');
