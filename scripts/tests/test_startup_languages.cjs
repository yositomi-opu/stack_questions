const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../../app/mcq-webapp/app.js'), 'utf8');
const LANGS = ['en', 'ja', 'fr', 'pt'];
let saved;
const ctx = vm.createContext({LANGS, INITIAL_LOCALE:'ja', LANGUAGE_SETTINGS_STORAGE_KEY:'languages',
  el:{baseLanguage:{value:'ja'},languageChecks:Object.fromEntries(LANGS.map(l=>[l,{checked:l==='ja'}]))},
  localStorage:{getItem:()=>saved,setItem:()=>{throw new Error('Startup must not overwrite preferences');}},
  updateBaseLanguageUi:()=>{},
});
vm.runInContext(source.match(/^function restoreLanguageSettings\([^]*?^}/m)[0], ctx);
for (const base of ['ja','en','fr','pt']) {
  saved = JSON.stringify({baseLanguage:base,languages:LANGS});
  ctx.restoreLanguageSettings(['ja','en']);
  assert.equal(ctx.el.baseLanguage.value, ['ja','en'].includes(base)?base:'ja');
  assert.deepEqual(LANGS.filter(l=>ctx.el.languageChecks[l].checked), ['en','ja']);
  assert.equal(JSON.parse(saved).baseLanguage,base);
}
saved=JSON.stringify({baseLanguage:'ja',languages:['ja','fr']});
ctx.restoreLanguageSettings(['ja','en']);
assert.deepEqual(LANGS.filter(l=>ctx.el.languageChecks[l].checked),['ja']);
ctx.restoreLanguageSettings();
assert.deepEqual(LANGS.filter(l=>ctx.el.languageChecks[l].checked),['ja','fr']);
assert.match(source,/restoreLanguageSettings\(Object\.keys\(DEFAULT_QUESTION_TEXTS\)\)/);
console.log('Passed: sample startup excludes missing languages, preserves supported base and stored preferences.');

let saves = 0, updates = 0;
ctx.baseLang = () => ctx.el.baseLanguage.value;
ctx.saveLanguageSettings = () => { saves++; };
ctx.updateQuestionLanguageVisibility = () => {};
ctx.markTranslationsStale = () => {};
ctx.updateOutput = () => { updates++; };
vm.runInContext(source.match(/^function selectAllLanguages\([^]*?^}/m)[0], ctx);
for (const base of LANGS) {
  ctx.el.baseLanguage.value = base;
  LANGS.forEach(l => ctx.el.languageChecks[l].checked = l === base);
  ctx.selectAllLanguages();
  assert.ok(LANGS.every(l => ctx.el.languageChecks[l].checked));
  ctx.selectAllLanguages();
  assert.deepEqual(LANGS.filter(l => ctx.el.languageChecks[l].checked), [base]);
}
assert.equal(saves, LANGS.length * 2);
assert.equal(updates, saves);
console.log('Passed: ALL toggles all/base-only for every base language and persists/updates each change.');
