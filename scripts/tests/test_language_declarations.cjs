const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'app/mcq-webapp/app.js'), 'utf8');
const code = ['generateXml', 'inlineLanguageDeclarations', 'languageBlocks'].map(name =>
  source.match(new RegExp('^function ' + name + '\\([^]*?^}', 'm'))[0]).join('\n');
const state = {mode:'cb', templates:{}};
const el = {castextTemplate:{checked:true},questionId:{value:'test'},radioMultiplePrompt:{checked:false}};
const context = vm.createContext({state,el,selected:['en','ja']});
vm.runInContext(`${code}
function activeLangs(){return selected;}
function rewriteTemplateIncludeUrls(s){return s;}
function templateWithLibraryIncludes(s){return s;}
function refreshGeneratedIncludeSource(){}
function baseTitle(s){return s;} function xmlFileStem(s){return s;} function escapeXml(s){return s;}
function generateVariableBlock(){return '/* generated */';}
function editorMetadataComment(){return '';}
function casttextLiteral(s){return 'castext('+JSON.stringify(s)+')';}
`, context);


for (const cas of [true,false]) for (const mode of ['rb','cb']) {
  el.castextTemplate.checked=cas; state.mode=mode;
  const template=fs.readFileSync(path.join(root,`001.MCQ${cas?'_cas':''}-${mode}.xml`),'utf8');
  state.templates[mode+(cas?'Cas':'')]=template;
  for(const selected of [['en','ja'],['pt']]) {
    context.selected=selected;
    const out=context.generateXml();
    const fields=xml=>[...xml.matchAll(/<(questiontext|specificfeedback|generalfeedback|truefeedback|falsefeedback)\b[^>]*>[^]*?<\/\1>/g)].map(m=>m[0]);
    const before=fields(template),after=fields(out);
    assert.equal(before.length,after.length);
    for(let i=0;i<before.length;i++) {
      if(before[i].includes('%__mcq_langcode') || before[i].includes('[[lang') || (cas && before[i].startsWith('<questiontext'))) {
        assert.deepEqual([...after[i].matchAll(/\[\[lang code="([^"]+)"\]\]/g)].map(m=>m[1]),selected);
        assert.ok(!after[i].includes('{@%__mcq_langcode@}'));
      } else assert.equal(after[i],before[i]);
    }
  }
}
context.selected=['en','ja'];
const input='<questiontext><text><![CDATA[[[lang code="en"]][[/lang]][[lang code="ja"]][[/lang]]{@%__mcq_langcode@}<p>{@qtext@}</p>]]></text></questiontext>';
const clean=context.inlineLanguageDeclarations(input,true);
assert.equal((clean.match(/\[\[lang code=/g)||[]).length,2);
assert.equal(context.inlineLanguageDeclarations(clean,true),clean);
assert.ok(clean.includes('<p>{@qtext@}</p>'));
const meaningful='<truefeedback><text><![CDATA[[[lang code="ja"]]日本語[[/lang]][[lang code="en"]]English[[/lang]]]]></text></truefeedback>';
assert.equal(context.inlineLanguageDeclarations(meaningful),meaningful);
console.log('Passed: 4 templates; selected languages in question/feedback; duplicate removal; nonempty translations preserved.');
