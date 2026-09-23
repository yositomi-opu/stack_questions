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
const records=[['config','csv_schema','3'],['config','castext_template','true'],['config','base_language','ja'],['config','languages','ja,en'],['config','mode','cb'],['config','num_options','2'],['config','num_correct','1'],['qtextL','string','ja','選べ'],['qtextL','string','en','Choose'],['option1C','string','ja01','正解A{@a@}'],['option1C','string','ja2','正解B'],['option1C','string','en_01','Correct A{@a@}'],['option1C','string','en02','Correct B'],['option1W','string','ja','誤答'],['option1W','string','en','Wrong'],['feedback1C','string','ja','説明'],['feedback1C','string','en','Feedback'],['qvar','cas','n/a','a:3;']];
context.applyRecords(records);
let saved=context.currentCsvRecords('v3');
assert.equal(saved.find(r=>r[1]==='csv_schema')[2],'3');
assert.deepEqual(Array.from(saved.filter(r=>r[0]==='option1C'),r=>r[2]),['en_01','ja_01','en_02','ja_02']);
assert.deepEqual(Array.from(state.rows.filter(r=>r.truth==='C'),r=>r.candidate_id),['1','2']);
let xml=context.generateXml();
if(process.env.MCQ_SCHEMA3_REQUEST)fs.writeFileSync(process.env.MCQ_SCHEMA3_REQUEST,JSON.stringify({url:"http://127.0.0.1:3080",seed:1,lang:"en",questionDefinition:xml}));
assert.ok(xml.includes('opt1C_1:%__mcq_lang'));
assert.ok(xml.includes('opt1C:[opt1C_1, opt1C_2];'));
assert.ok(xml.includes('%__CoptL1:opt1C;'));
assert.ok(!xml.includes('%__CoptL1L:'));
context.importXmlText(xml);
let after=context.currentCsvRecords('v3');
for(const record of saved.filter(r=>/^option/.test(r[0]))) assert.deepEqual(Array.from(after.find(r=>r[0]===record[0]&&r[2]===record[2])||[]),Array.from(record));
// Renumber duplicates beyond all original numbers, with a warning and no overwrite.
const duplicate=context.applyRecords([...records,['option1C','string','ja_01','duplicate'],['option1C','string','ja_09','last']]);
assert.ok(duplicate.warnings.some(w=>w.includes('ja_10')));
assert.equal(state.rows.find(r=>r.candidate_id==='10').choice_ja,'duplicate');
assert.equal(state.rows.find(r=>r.candidate_id==='1').choice_ja,'正解A{@a@}');
// Partial translations are saved with stable identities.
saved=context.currentCsvRecords('partial');context.applyRecords(saved);
assert.equal(state.rows.find(r=>r.candidate_id==='10').choice_ja,'duplicate');
assert.ok(!state.rows.find(r=>r.candidate_id==='10').choice_en);
// Verbatim new CAS/list and ordinary string text are never rewritten.
context.applyRecords(records.filter(r=>!/^option/.test(r[0])).concat([['option1C','list','n/a','optionsL'],['option1W','cas','n/a','sconcat("keep")']]));
context.normalizeChoiceCasttext();
assert.equal(state.rows[0].choice_ja,'optionsL');assert.equal(state.rows[1].choice_ja,'sconcat("keep")');
saved=context.currentCsvRecords('opaque');assert.equal(saved.find(r=>r[0]==='option1C')[1],'list');
// Legacy CAS literal becomes string, opaque language variants survive.
context.applyRecords([['config','csv_schema','2'],['option1C','cas','ja','castext("旧本文")'],['option1W','cas','ja','f(a)'],['option1W','cas','en','g(a)']]);
saved=context.currentCsvRecords('legacy');
assert.equal(saved.find(r=>r[0]==='option1C')[1],'string');
assert.equal(saved.find(r=>r[0]==='option1W'&&r[2]==='en')[3],'g(a)');
context.applyRecords(saved);assert.equal(context.translationPayload().rows.find(r=>r.truth==='W').choice,null);
assert.throws(()=>context.applyRecords([['config','csv_schema','999']]),/schema/);
console.log('Passed: schema 3 identities, duplicate reassignment, partial CSV, fixed XML roundtrip, verbatim types, legacy language preservation.');
// Actual coverage checks reject XML, while CSV preserves untranslated slots.
vm.runInContext(functions.match(/function validateTranslationCoverage\([^]*?\n}/)[0],context);
context.applyRecords(records.filter(r=>r[2]!=='en02'));
assert.throws(()=>context.generateXml(),/翻訳/);
assert.equal(context.currentCsvRecords('partial').find(r=>r[0]==='option1C'&&r[2]==='en_02')[3],'');
context.applyRecords(records);
el.requirePairs.checked=true;el.numOptions.value='1';el.numCorrect.value='1';
xml=context.generateXml();context.importXmlText(xml);
assert.deepEqual(Array.from(state.rows.filter(r=>r.truth==='C'),r=>r.candidate_id),['1','2']);
// n/a identities and accepted alternate spellings remain stable.
context.applyRecords([['config','csv_schema','3'],['option1C','string','n/a1','A'],['option1C','string','n/a_02','B'],['option1W','string','n/a','W']]);
saved=context.currentCsvRecords('independent');assert.deepEqual(Array.from(saved.filter(r=>r[0]==='option1C'),r=>r[2]),['n/a_01','n/a_02']);
const payload=context.translationPayload();assert.equal(payload.rows[0].id,'option1C_1');
console.log('Passed: actual XML translation guard, paired candidate identity roundtrip, n/a suffixes and stable translation IDs.');
// Formal title key, legacy aliases, precedence independent of config order.
for(const key of ['title','question_id','id']) {
 context.applyRecords(records.concat([['config',key,'001.Example-rk2-cb.xml']]));
 assert.equal(el.questionId.value,'Example-rk2');
 const csv=context.currentCsvRecords(el.questionId.value);
 assert.equal(csv.find(r=>r[1]==='title')[2],'Example-rk2');
 assert.ok(!csv.some(r=>['question_id','id'].includes(r[1])));
 assert.ok(context.generateXml().includes('<text>001.Example-rk2-cb</text>'));
}
for(const configs of [
 [['config','title','Chosen'],['config','question_id','Old']],
 [['config','id','Old'],['config','title','Chosen']]
]) {context.applyRecords(records.concat(configs));assert.equal(el.questionId.value,'Chosen');}
console.log('Passed: title persistence, legacy aliases, precedence, normalized names and XML question title.');
// Export numeric patterns together, preserving multilingual candidates and qvar order.
for (const paired of [false, true]) {
 const input = records.filter(r => !/^feedback/.test(r[0])).concat([
  ['config','require_pairs',String(paired)],
  ['config','feedback_by_truth','false'],
  ['qvar','cas','n/a','b:a+1;'],
  ...[10,2].flatMap(n => [
   [`option${n}W`,'string','n/a',`wrong${n}`],
   [`option${n}C`,'string','n/a',`correct${n}`]
  ]),
  ...[10,1,2].flatMap(n => paired
   ? [[`feedback${n}`,'string','ja',`shared${n}`]]
   : [[`feedback${n}W`,'string','ja',`wrong feedback${n}`],
      [`feedback${n}C`,'string','ja',`correct feedback${n}`]])
 ]);
 context.applyRecords(input);
 const ordered = context.currentCsvRecords('ordered');
 const names = [...new Set(Array.from(ordered.filter(r=>/^(option|feedback)/.test(r[0])), r=>r[0]))];
 assert.deepEqual(names,[1,2,10].flatMap(n=>[
  `option${n}C`,`option${n}W`,...(paired?[`feedback${n}`]:[`feedback${n}C`,`feedback${n}W`])
 ]));
 assert.deepEqual(Array.from(ordered.filter(r=>r[0]==='qvar'),r=>r[3]),['a:3;','b:a+1;']);
 assert.deepEqual(Array.from(ordered.filter(r=>r[0]==='option1C'),r=>r[2]),['en_01','ja_01','en_02','ja_02']);
 context.applyRecords(ordered);
 assert.deepEqual(JSON.parse(JSON.stringify(context.currentCsvRecords('ordered'))),JSON.parse(JSON.stringify(ordered)));
}
console.log('Passed: numeric pattern grouping, shared/separate feedback, candidate/language and qvar order, CSV roundtrip.');
// CSV quoting preserves Maxima strings and rejects malformed input before resetting the editor.
const quotedRows=[['qvar','cas','n/a','a:1;\r\ntexput(WR, "\\\\mathbb{R}");'],['qtextL','string','ja','comma, "quote"']];
assert.deepEqual(JSON.parse(JSON.stringify(context.parseDelimited(context.csvText(quotedRows),',').filter(r=>r.some(Boolean)))),quotedRows);
assert.deepEqual(JSON.parse(JSON.stringify(context.parseDelimited('a,b\r\nc,d',','))),[['a','b'],['c','d']]);
assert.deepEqual(JSON.parse(JSON.stringify(context.parseDelimited('a\t"b\tc"','\t'))),[['a','b\tc']]);
const beforeInvalid=JSON.stringify(state.rows);
for(const bad of ['"qvar","cas","n/a","texput(WR, "abc");"','a,"unclosed','a,b"c','a,"b"tail']) {
 assert.throws(()=>context.applyRecords(context.parseDelimited(bad,',')),/CSV.*引用符/);
 assert.equal(JSON.stringify(state.rows),beforeInvalid);
}
assert.throws(()=>context.parseDelimited('a,b\r\n"qvar","cas","n/a","a:1;\r\ntexput(WR, "abc");"',','),/行: 3/);
console.log('Passed: strict CSV quotes, multiline/CRLF/TSV preservation, physical error lines and non-destructive rejection.');
