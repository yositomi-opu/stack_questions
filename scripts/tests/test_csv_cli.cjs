const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {convertCsv} = require('../../app/mcq-webapp/headless.cjs');
const csv = `config,csv_schema,3
config,title,CLI-Test
config,mode,rb
config,num_options,2
config,num_correct,1
config,base_language,ja
config,languages,ja
qtextL,string,ja,\\(x\\) __SELPROMPT__
option1C,string,ja,正解
option1W,string,ja,誤答
feedback1C,string,ja,説明
`;

(async()=>{
  const basic = await convertCsv('\uFEFF'+csv);
  assert.equal(basic.filename,'001.CLI-Test-rb.xml');
  assert.ok(basic.xml.includes('castext("\\\\(x\\\\)'));
  assert.ok(basic.xml.includes('[[lang code="ja"]][[/lang]]'));
  assert.ok(basic.xml.includes('{@map(first,ta1)@}:{@ta1@}'));
  const paired = await convertCsv(csv.replace('config,mode,rb','config,mode,cb\nconfig,require_pairs,true').replace('config,num_options,2','config,num_options,1'));
  assert.ok(paired.xml.includes('%__mcq_pattern_order:random_permutation'));
  assert.equal(paired.filename,'001.CLI-Test-cb.xml');
  const rb2=await convertCsv(csv+'config,radio_multiple_prompt,true\n');
  assert.equal(rb2.filename,'001.CLI-Test-rb2.xml');
  assert.ok(rb2.xml.includes('%__mcq_rb_cb:"rb2"'));
  await assert.rejects(convertCsv(csv.replace('csv_schema,3','csv_schema,999')),/schema/);
  await assert.rejects(convertCsv(csv.replace('languages,ja','languages,"ja,en"')),/翻訳/);
  await assert.rejects(convertCsv(csv.replace('option1C,','option16C,')),/上限/);
  await assert.rejects(convertCsv(csv.replace('option1C,string,ja,正解','option1C,string,ja,"unclosed')),/CSV/);
  const list = csv.replace('num_options,2','num_options,3').replace('num_correct,1','num_correct,2')
    .replace('option1C,string,ja,正解','option1C,list,n/a,"[castext(""A""),castext(""B"")]"');
  assert.ok((await convertCsv(list)).xml.includes('%_MCQ_NUM_COPTS:2;'));
  const dynamic = list.replace('"[castext(""A""),castext(""B"")]"','optionsL');
  await assert.rejects(convertCsv(dynamic),/--evaluate/);
  const server=http.createServer((req,res)=>{
    let body=''; req.on('data',c=>body+=c); req.on('end',()=>{
      assert.equal(req.url,'/mcq/api/maxima/evaluate');
      const data=JSON.parse(body); assert.equal(data.expressions[0].expression,'optionsL');
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({ok:true,variables:[],expressions:data.expressions.map(x=>({id:x.id,ok:true,type:'list',length:2}))}));
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await convertCsv(dynamic,{evaluate:true,webappUrl:`http://127.0.0.1:${server.address().port}/mcq/`});}
  finally {await new Promise(resolve=>server.close(resolve));}

  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mcq-cli-'));
  try {
    const input=path.join(dir,'input.csv');fs.writeFileSync(input,csv);
    const cli=path.resolve(__dirname,'../mcq_csv2xml.py');
    const run=(...args)=>spawnSync('python3',[cli,input,...args],{cwd:dir,encoding:'utf8'});
    let result=run(); assert.equal(result.status,0,result.stderr);
    const target=path.join(dir,basic.filename);assert.equal(fs.readFileSync(target,'utf8'),basic.xml);
    assert.equal(run().status,1); assert.equal(run('--force').status,0);
    assert.equal(run('-o','-').stdout,basic.xml);
    assert.equal(run('-o',input,'--force').status,1);assert.equal(fs.readFileSync(input,'utf8'),csv);
    fs.writeFileSync(input,csv.replace('csv_schema,3','csv_schema,999'));
    assert.equal(run('--force').status,1);assert.equal(fs.readFileSync(target,'utf8'),basic.xml);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
  console.log('Passed: shared CSV/XML generation, rb/cb/rb2, paired mode, validation, static/dynamic lists, evaluation endpoint, CLI paths/stdout/overwrite protection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
