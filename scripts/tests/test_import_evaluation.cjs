const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../app/mcq-webapp/app.js'),'utf8');
const events=[];
const ctx=vm.createContext({el:{qvars:{value:'a:1;'},parameters:{value:''}}, stripMaximaComments:s=>s.replace(/\/\*[^]*?\*\//g,''), casChoiceExpressions:()=>[], setCasEvaluationStatus(){}, window:{confirm:()=>true},uiText:x=>x,readDelimited:async()=>[],applyRecords:()=>({warnings:[]}),renderRows(){},updateOutput(){},setStatus(){},resolveMainInclude:async()=>null,importXmlText:()=>({baseLanguage:'ja',languages:['ja'],patterns:1}),evaluateCasLocally:async()=>{events.push('evaluate');}});
for(const name of ['evaluateImportedQuestion','readSelectedFile','readSelectedXml']) vm.runInContext(source.match(new RegExp('^async function '+name+'\\([^]*?^}', 'm'))[0],ctx);
(async()=>{
 for(const [handler,name] of [['readSelectedFile','test.csv'],['readSelectedXml','test.xml']]) {
  const target={files:[{name,text:async()=>'<quiz/>'}],value:'selected'};
  await ctx[handler]({target});assert.equal(target.value,'');
 }
 assert.equal(events.length,2);
 ctx.el.qvars.value='';
 for(const handler of ['readSelectedFile','readSelectedXml']) await ctx[handler]({target:{files:[{name:'empty.csv',text:async()=>'<quiz/>'}],value:''}});
 assert.equal(events.length,2,'empty inputs must not call evaluation API');
 ctx.el.qvars.value='/* optional */'; await ctx.evaluateImportedQuestion(); assert.equal(events.length,2);
 ctx.el.parameters.value='a:1;'; await ctx.evaluateImportedQuestion(); assert.equal(events.length,3);
 ctx.el.parameters.value=''; ctx.casChoiceExpressions=()=>[{expression:'optionsL'}]; await ctx.evaluateImportedQuestion(); assert.equal(events.length,4);
 ctx.window.confirm=()=>false;
 await ctx.readSelectedXml({target:{files:[{name:'cancel.xml'}],value:''}});
 assert.equal(events.length,4);
 console.log('Passed: CSV and inline XML automatically evaluate after import; cancelled import does not.');
})().catch(error=>{console.error(error);process.exitCode=1;});
