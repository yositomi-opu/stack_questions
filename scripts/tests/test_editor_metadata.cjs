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
 const templateNote=state.templates[mode+(cas?'Cas':'')].match(/<questionnote\b[^]*?<\/questionnote>/)[0];
 assert.equal(xml.match(/<questionnote\b[^]*?<\/questionnote>/)[0],templateNote,'questionnote must remain the template CASText');
 assert.equal(context.previewQuestionSnapshot().questionDefinition.match(/<questionnote\b[^]*?<\/questionnote>/)[0],templateNote,'preview must preserve questionnote');
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

// Template-derived limits and compact paired sources up to the active capacity.
context.applyRecords(records);
for (const mode of ['rb','cb']) state.templates[mode+'Cas']=fs.readFileSync(path.join(root,`001.MCQ_cas-${mode}.xml`),'utf8');
assert.equal(context.patternLimit('C'),15);
assert.equal(context.patternLimit('W'),15);
state.templates.cbCas=state.templates.cbCas.replace('%__mcq_max_cp:15;','%__mcq_max_cp:12;');
assert.equal(context.patternLimit(),12,'limits must follow template changes');
state.templates.cbCas=fs.readFileSync(path.join(root,'001.MCQ_cas-cb.xml'),'utf8');
state.rows=[];
for(let i=1;i<=15;i++) for(const truth of ['C','W'])state.rows.push({pattern:String(i).padStart(2,'0'),truth,choice_ja:`[castext("${truth}${i}a"),castext("${truth}${i}b")]`,choice_type_ja:'cas',choice_list_expr_ja:true,feedback_ja:`${truth} feedback ${i}`,feedback_type_ja:'text',feedback_by_truth:true});
el.numOptions.value='15';el.numCorrect.value='7';state.mode='cb';
const compact=context.generateXml();
assert.equal((compact.match(/castext\("C15a"\)/g)||[]).length,1,'candidate definitions must not repeat per output slot');
assert.ok(compact.includes('%__CoptL15:if 15<=%__mcq_num_cpatterns'));
assert.ok(compact.includes('%__WoptL15:if 15<=%__mcq_num_wpatterns'));
context.importXmlText(compact);
assert.equal(state.rows.length,30);
assert.equal(state.rows[28].pattern,'15');
assert.ok(state.rows[28].choice_ja.includes('C15a'));
for(const n of ['0','15']) { el.numCorrect.value=n;assert.ok(context.generateXml().includes('%__CoptL1:if 1<=')); }
el.numOptions.value='16';assert.throws(()=>context.generateXml(),/パターン数以下/);
el.numOptions.value='5';el.numCorrect.value='2';
if(process.env.MCQ_COMPACT_FIXTURE)fs.writeFileSync(process.env.MCQ_COMPACT_FIXTURE,context.generateXml());
console.log('Passed: template-derived limits, 15-context compact import/export, single source definitions and zero/all-correct guards.');

const plainCompact=compact.replace(/\/\* MCQ_WEBAPP_EDITOR_V1[^]*?\*\//,'');
context.importXmlText(plainCompact,'compact.xml');
assert.equal(state.rows.length,30);
assert.ok(!el.qvars.value.includes('%__mcq_CsourceL'));
assert.equal(el.requirePairs.checked,true);
console.log('Passed: compact XML without editor metadata restores all source patterns.');

// Manual CAS -> text switching decodes once and preserves the editable CASText.
context.applyRecords(records);
assert.equal(context.casExpressionToEditorText('castext (" abc def{@aaa@} xyz")'),' abc def{@aaa@} xyz');
assert.equal(context.casExpressionToEditorText('castext("\\\\(x={@x@}\\\\)\\\"quoted\\\"")'),'\\(x={@x@}\\)"quoted"');
assert.equal(context.casExpressionToEditorText('sconcat("値",tex1(aa),"と",tex2(bb))'),'値{@aa@}と{@bb@}');
assert.equal(context.casExpressionToEditorText('castext("値{@tex2(aa)@}と{@tex1(bb)@}")'),'値{@aa@}と{@bb@}');
assert.equal(context.casExpressionToEditorText('castext("tex2(aa) は関数名です")'),'tex2(aa) は関数名です');
assert.equal(context.casExpressionToEditorText('castext(dynamic_text)'),null);
const row=state.rows.find(r=>r.pattern==='01' && r.truth==='W');
row.choice_ja='castext (" abc def{@aaa@} xyz")';
assert.equal(context.changeRowValueType([row],'choice','ja','text'),true);
assert.equal(row.choice_type_ja,'text');assert.equal(row.choice_ja,' abc def{@aaa@} xyz');
const frow=state.rows.find(r=>r.pattern==='01' && r.truth==='C');
frow.feedback_type_ja='cas';frow.feedback_ja='castext("Feedback {@aa@}")';
assert.equal(context.changeRowValueType([frow],'feedback','ja','text'),true);
assert.equal(frow.feedback_ja,'Feedback {@aa@}');
assert.equal(context.currentCsvRecords('test').find(r=>r[0]==='option1W')[1],'string');
context.importXmlText(context.generateXml());
assert.equal(state.rows.find(r=>r.pattern==='01' && r.truth==='W').choice_ja,'abc def{@aaa@} xyz');
const group=[{choice_type_ja:'cas',choice_ja:'castext("safe")'},{choice_type_ja:'cas',choice_ja:'custom(x)'}];
const original=JSON.stringify(group);
assert.equal(context.changeRowValueType(group,'choice','ja','text'),false);
assert.equal(JSON.stringify(group),original,'failed conversion must be atomic');
const list={choice_type_ja:'cas',choice_list_expr_ja:true,choice_ja:'[castext("a"),castext("b")]'};
assert.equal(context.changeRowValueType([list],'choice','ja','text'),false);
assert.equal(list.choice_list_expr_ja,true);
el.castextTemplate.checked=false;
assert.equal(context.changeRowValueType([{choice_type_ja:'cas',choice_ja:'castext("text")'}],'choice','ja','text'),true);
assert.equal(el.castextTemplate.checked,true);
console.log('Passed: manual type conversion, CASText unwrapping, tex1/tex2, escapes, CSV/XML persistence and atomic safe rejection.');

// Static feedback CASText uses the text editor in both paired and fixed modes.
for (const paired of [false, true]) {
 context.applyRecords(records);
 el.requirePairs.checked=paired;
 const target=state.rows.find(r=>r.pattern==='01' && r.truth==='W');
 target.feedback_en='castext("English {@aa@}")';target.feedback_type_en='cas';
 const dynamic={feedback_ja:'castext(message)',feedback_type_ja:'cas'};
 const plain={feedback_ja:'castext("literal example")',feedback_type_ja:'text'};
 const expression={feedback_ja:'sconcat("message",aa)',feedback_type_ja:'cas'};
 state.rows.push(dynamic,plain,expression);
 context.normalizeFeedbackCasttext();
 assert.equal(target.feedback_ja,'不正解');assert.equal(target.feedback_type_ja,'text');
 assert.equal(target.feedback_en,'English {@aa@}');assert.equal(target.feedback_type_en,'text');
 assert.equal(dynamic.feedback_ja,'castext(message)');assert.equal(dynamic.feedback_type_ja,'cas');
 assert.equal(plain.feedback_ja,'castext("literal example")');
 assert.equal(expression.feedback_type_ja,'text');
 assert.ok(expression.feedback_ja.startsWith('message{@'));
 state.rows.splice(-3);
 const csv=context.currentCsvRecords('feedback-test');
 assert.equal(csv.find(r=>r[0]==='feedback1W' && r[2]==='ja')[1],'string');
 const xml=context.generateXml();
 assert.ok(xml.includes('castext("不正解")'));
 context.importXmlText(xml);
 assert.equal(state.rows.find(r=>r.pattern==='01' && r.truth==='W').feedback_ja,'不正解');
}
el.castextTemplate.checked=false;
const classic={feedback_ja:'castext("keep")',feedback_type_ja:'cas'};
context.normalizeFeedbackCasttext([classic]);
assert.equal(classic.feedback_type_ja,'cas');
console.log('Passed: static feedback CASText normalization, all languages, paired/fixed CSV/XML persistence and dynamic CAS preservation.');

// Editor types differ from the legacy serialized list marker for opaque lists.
context.applyRecords(records);
el.qvars.value='optionsL:["a","b"]; ListAL1:optionsL; cycleA:cycleB; cycleB:cycleA;';
const choices=[
 {choice_ja:'castext("説明{@aa@}")',choice_type_ja:'cas'},
 {choice_ja:'sconcat("値",tex2(aa))',choice_type_ja:'cas'},
 {choice_ja:'["説明{@aa@}", matrix([1,2]),castext("B")]',choice_type_ja:'cas'},
 {choice_ja:'optionsL',choice_type_ja:'cas'},
 {choice_ja:'ListAL1',choice_type_ja:'cas'},
 {choice_ja:'makelist(sconcat("値",tex2(k)),k,1,3)',choice_type_ja:'cas'},
 {choice_ja:'externalL',choice_type_ja:'cas',choice_list_expr_ja:true},
 {choice_ja:'aa+bb',choice_type_ja:'cas'},
];
context.normalizeChoiceCasttext(choices);
assert.equal(choices[0].choice_ja,'説明{@aa@}');assert.equal(choices[0].choice_type_ja,'text');
assert.equal(choices[1].choice_ja,'値{@aa@}');
assert.equal(choices[2].choice_ja,'["説明{@aa@}", "{@matrix([1,2])@}", "B"]');
assert.equal(context.choiceValueType(choices[2]),'cas_list');
for(const row of choices.slice(3,7)) {
 assert.equal(context.choiceValueType(row),'cas');assert.equal(row.choice_list_expr_ja,true);
}
assert.equal(choices[5].choice_ja,'makelist(sconcat("値",tex2(k)),k,1,3)');
assert.equal(choices[7].choice_ja,'aa+bb');assert.ok(!choices[7].choice_list_expr_ja);
assert.equal(context.knownChoiceList('cycleA'),false);
const once=JSON.stringify(choices);context.normalizeChoiceCasttext(choices);
assert.equal(JSON.stringify(choices),once,'normalization must be idempotent');
assert.equal(context.maximaChoiceList([context.localizedTyped(choices[2],'choice','ja')]),
 '[castext("説明{@aa@}"), castext("{@matrix([1,2])@}"), castext("B")]');
assert.equal(context.maximaChoiceList([context.localizedTyped(choices[3],'choice','ja')]),'optionsL','a list variable must not be wrapped in another list');
for (const row of choices.slice(2,7)) {
 context.applyRecords(records);
 el.qvars.value='optionsL:["a","b"]; ListAL1:optionsL;';state.qvars=[el.qvars.value];
 Object.assign(state.rows[0],row);
 const xml=context.generateXml();context.importXmlText(xml);context.normalizeChoiceCasttext();
 assert.equal(state.rows[0].choice_ja,row.choice_ja);
 assert.equal(context.choiceValueType(state.rows[0]),context.choiceValueType(row));
 const csv=context.currentCsvRecords('types');context.applyRecords(csv);context.normalizeChoiceCasttext();
 assert.equal(state.rows[0].choice_ja,row.choice_ja);
 assert.equal(context.choiceValueType(state.rows[0]),context.choiceValueType(row));
}
console.log('Passed: scalar/list CASText editing, mixed elements, opaque list variables/builders, aliases/cycles, idempotence and CSV/XML round trips.');

assert.equal(context.convertConstantChoiceBuilder('makelist(sconcat("A", "B"), k, 1, 3)'), 'makelist(castext("AB"), k, 1, 3)');
assert.equal(context.convertConstantChoiceBuilder('makelist(sconcat("A", tex2(k)), k, 1, 3)'), 'makelist(sconcat("A", tex2(k)), k, 1, 3)');

// v0.8 UI policy ignores old opt-out settings while retaining legacy parsers.
el.castextTemplate = vm.runInContext('({' + source.match(/castextTemplate: (\{ get checked\(\)[^\n]+),/)[0] + '})', context).castextTemplate;
el.xmlFilename=field();
context.applyRecords(records.map(r=>r[0]==='config' && r[1]==='castext_template' ? ['config','castext_template','false'] : r));
assert.equal(el.castextTemplate.checked,true);
context.resetCsvImportState();assert.equal(el.castextTemplate.checked,true);
context.applyRecords(records);
el.questionId.value='ABCxyz';state.mode='rb';el.radioMultiplePrompt.checked=false;
context.syncXmlFilename();assert.equal(el.xmlFilename.value,'001.ABCxyz-rb.xml');
el.radioMultiplePrompt.checked=true;context.syncXmlFilename();assert.equal(el.xmlFilename.value,'001.ABCxyz-rb2.xml');
state.mode='cb';context.syncXmlFilename();assert.equal(el.xmlFilename.value,'001.ABCxyz-cb.xml');
state.xmlFilename='custom.xml';context.syncXmlFilename();assert.equal(el.xmlFilename.value,'custom.xml');
const nameCsv=context.currentCsvRecords('ABCxyz');
context.applyRecords(nameCsv);assert.equal(state.xmlFilename,'custom.xml');
const nameXml=context.generateXml();context.importXmlText(nameXml);assert.equal(state.xmlFilename,'custom.xml');
assert.ok(nameXml.includes('mcq_template_pre_cas.mac'));
assert.equal(context.baseTitle('001.ABCxyz-rb2.xml'),'ABCxyz');
context.resetCsvImportState();assert.equal(state.xmlFilename,'');assert.equal(el.xmlFilename.value,'');
assert.equal(context.normalizedXmlFilename('notes'),'notes.xml');
assert.equal(context.normalizedXmlFilename('../custom.xml'),'custom.xml');
console.log('Passed: v0.8 CASText default, legacy opt-out import, rb/rb2/cb names, manual filename CSV/XML persistence and clear.');

context.applyRecords(records);
const namedXml=context.generateXml();
assert.ok(namedXml.includes('optC1:%__mcq_lang([["ja", castext("文章{@aa@}")]'));
assert.ok(namedXml.includes('msgC1:%__mcq_lang([["ja", castext("正解{@aa@}")]'));
assert.ok(namedXml.includes('%__mcq_Csource:[[optC1], optC2];'));
assert.ok(namedXml.includes('%__mcq_Cfeedback:[msgC1, msgC2];'));
assert.ok(!namedXml.includes('%__mcq_CsourceL:'));
context.importXmlText(namedXml.replace('castext("正解{@aa@}")','castext("編集した説明{@aa@}")'));
assert.equal(state.rows[0].feedback_ja,'編集した説明{@aa@}');
// Read previous direct sourceL tables as well as the new named definitions.
const variables=namedXml.match(/<questionvariables>\s*<text><!\[CDATA\[([^]*?)\]\]><\/text>/)[1];
const defs=new Map(context.splitMaximaStatements(context.stripMaximaComments(variables)).map(context.parseMaximaAssignment).filter(Boolean).map(d=>[d.name,d.expression]));
let oldBlock='/* MCQ_CHOICES_BEGIN */\n%__mcq_pattern_order:random_permutation([1,2]);\n';
for(const truth of ['C','W'])for(const kind of ['source','feedback']) {
 const assoc=context.namedChoiceAssociation(defs,truth,kind);
 oldBlock+=`%__mcq_${truth}${kind}L:[${[...assoc].map(([lang,node])=>`["${lang}", ${node.value}]`).join(',')}];\n`;
}
oldBlock+='/* MCQ_CHOICES_END */';
context.importXmlText(namedXml.replace(/\/\* MCQ_CHOICES_BEGIN \*\/[^]*?\/\* MCQ_CHOICES_END \*\//,oldBlock));
assert.equal(state.rows[0].choice_ja,'文章{@aa@}');assert.equal(state.rows[0].feedback_ja,'正解{@aa@}');
el.qvars.value='optC1:42;';
assert.throws(()=>context.generateXml(),/重複/);
console.log('Passed: named options/messages, direct edits, legacy sourceL import and variable collision protection.');
