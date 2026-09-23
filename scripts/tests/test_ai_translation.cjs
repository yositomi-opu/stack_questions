const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const code=fs.readFileSync(path.resolve(__dirname,'../../app/mcq-webapp/ai-translation.js'),'utf8');
function harness(hostname = "localhost") {
 const nodes={};
 const node=id=>nodes[id] ||= {value:'',disabled:false,hidden:false,textContent:'',handlers:{},addEventListener(event,fn){this.handlers[event]=fn;},showModal(){},close(){this.handlers.close?.();}};
 const original={source_language:'ja',question_type:'text',question_text:'Q',rows:Array.from({length:5},(_,i)=>({id:`option${i+1}C_0`,choice:`C${i}`,feedback:'F'}))};
 const translations={}, calls=[];
 let fail='fr', mutate=false, cancel=false;
 const el={translationJson:node('json'),translationStatus:{classList:{contains:()=>false}}};
 const state={translationsStale:true};
 const context=vm.createContext({window:{location:{hostname}},document:{querySelector:id=>node(id)},state,updateOutput(){},el,uiText:s=>s,webappUrl:s=>s,AbortController,DOMException,setTimeout,clearTimeout,
 translationTargets:()=>['en','fr'],copyLanguageIndependentValuesToTargets(){},translationPayload:()=>structuredClone(original),
 applyTranslationResult(result){Object.assign(translations,result.translations);},
 fetch:async (url,opts)=>{
  if(url.endsWith('settings'))return {ok:true,headers:{get:()=> 'application/json'},json:async()=>({ok:true,provider:'openai',profiles:{openai:{configured:true,model:'test'}}})};
  const data=JSON.parse(opts.body);calls.push(data);
  if(cancel) {node('#aiTranslateStop').handlers.click();throw new DOMException('','AbortError');}
  if(mutate) original.question_text='edited';
  const ok=data.target!==fail;
  return {ok,headers:{get:()=> 'application/json'},json:async()=>ok?{ok:true,translations:{[data.target]:{question_text:data.source.question_text===null?null:`${data.target} question`,rows:data.source.rows.map(r=>({...r,choice:`${data.target} ${r.choice}`}))}}}:{ok:false,error:'mock failure'}};
 }});
 vm.runInContext(code,context);
 return {nodes,node,original,translations,calls,state,run:()=>node('#aiTranslateButton').handlers.click(),setFail:v=>fail=v,setMutate:v=>mutate=v,setCancel:v=>cancel=v};
}
(async()=>{
 const publicSite=harness('example.org');
 for (const id of ['#aiTranslateButton','#aiSettingsButton','#aiTranslationNotice']) assert.equal(publicSite.nodes[id].hidden,true);
 const h=harness();await h.run();
 assert.equal(h.translations.en.rows.length,5);
 assert.equal(h.translations.fr,undefined);
 assert.deepEqual(h.calls.map(c=>c.source.rows.length),[4,1,4]);
 assert.equal(h.calls[1].source.question_text,null);
 assert.equal(h.nodes['#aiTranslateButton'].disabled,false);
 assert.equal(h.state.aiTranslationRunning,false);
 assert.match(h.nodes['#aiTranslationProgress'].textContent,/fr \(1\/2\)/);
 assert.match(h.nodes['#aiTranslationProgress'].textContent,/mock failure/);
 h.setFail('');await h.run();
 assert.deepEqual(h.calls.slice(3).map(c=>c.target),['fr','fr']);
 assert.equal(h.translations.en.question_text,'en question');
 assert.equal(h.translations.fr.rows.length,5);
 h.original.question_text='new';await h.run();
 assert.deepEqual(h.calls.slice(5).map(c=>c.target),['en','en','fr','fr']);
 const edited=harness();edited.setMutate(true);await edited.run();
 assert.deepEqual(edited.translations,{});assert.match(edited.nodes['#aiTranslationProgress'].textContent,/原文/);
 const stopped=harness();stopped.setCancel(true);await stopped.run();
 assert.deepEqual(stopped.translations,{});assert.match(stopped.nodes['#aiTranslationProgress'].textContent,/停止/);
 assert.equal(stopped.nodes['#aiTranslateStop'].hidden,true);
 assert.equal(stopped.state.aiTranslationRunning,false);
 const app=fs.readFileSync(path.resolve(__dirname,'../../app/mcq-webapp/app.js'),'utf8');
 const muted={state:{aiTranslationRunning:true},el:{xmlOutput:{value:'old XML'}}};
 vm.runInNewContext(app.match(/^function updateOutput\(\) \{[^]*?^}/m)[0]+'; updateOutput();',muted);
 assert.equal(muted.el.xmlOutput.value,'');
 console.log('Passed: batch limits, language-atomic apply, resume without overwrite, source change rejection, cancellation and UI cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
