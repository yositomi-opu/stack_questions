const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let source = fs.readFileSync(path.resolve(__dirname, '../../app/mcq-webapp/preview.js'), 'utf8');
source = source.slice(0, source.indexOf('  document.getElementById("previewButton")')) + `
  globalThis.helpers = {questionHtml, feedbackHtml, assetHtml, answers, request,
    setRequestState: () => {snapshot = {questionDefinition:"<quiz/>",url:"http://127.0.0.1:3080",lang:"ja"}; seed = {value:"7"};},
    setControls: controls => {frame = {contentDocument:{querySelectorAll:()=>controls}};}};
})();`;
const context = vm.createContext({document:{documentElement:{lang:'ja'}}});
vm.runInContext(source, context);
const h = context.helpers;
assert.equal(h.questionHtml({questionrender:'<p>[[input:ans1]] [[validation:ans1]] [[feedback:prt1]]</p>',questioninputs:{ans1:{render:'<input name="mcqpreview_ans1">'}}}), '<p><input name="mcqpreview_ans1">  </p>');
assert.equal(h.feedbackHtml({specificfeedback:'<div>[[feedback:prt1]]</div>',prts:{prt1:'正解です'}}),'<div>正解です</div>');
assert.equal(h.feedbackHtml({prts:{prt1:'解説1',prt2:'解説2'}}),'解説1\n解説2');
assert.equal(h.assetHtml('<img src="plot1.png"><img src="plot1.png">',{'plot1.png':'data:image/png;base64,abc'}),'<img src="data:image/png;base64,abc"><img src="data:image/png;base64,abc">');
h.setControls([
 {name:'mcqpreview_ans1',type:'radio',checked:false,value:'1'},
 {name:'mcqpreview_ans1',type:'radio',checked:true,value:'2'},
 {name:'mcqpreview_ans2_1',type:'checkbox',checked:true,value:'true'},
 {name:'mcqpreview_ans2_2',type:'checkbox',checked:false,value:'true'},
 {name:'mcqpreview_ans3',type:'text',value:'x^2'},
 {name:'unrelated',type:'text',value:'ignore'}
]);
assert.deepEqual(JSON.parse(JSON.stringify(h.answers())),{ans1:'2',ans2_1:'true',ans3:'x^2'});
console.log('Passed: API input/feedback placeholders, repeated assets, Radio and Checkbox answer collection.');

// Exercise the production request path behind the supported Moodle proxy prefixes.
(async () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../../app/mcq-webapp/app.js'), 'utf8');
  const urlHelpers = app.split('\n').filter(line => /^const (WEBAPP_BASE_URL|webappUrl) =/.test(line)).join('\n');
  for (const prefix of ['/', '/mcq-webapp/', '/moodle/mcq-webapp/']) {
    const requests = [];
    const c = vm.createContext({URL, AbortSignal, window:{location:{href:`https://example.org${prefix}`}},
      document:{documentElement:{lang:'ja'}},
      fetch: async (url, options) => {
        requests.push({url, payload:JSON.parse(options.body)});
        return {ok:true,status:200,json:async()=>({ok:true,result:{questionrender:'ok'}})};
      }});
    vm.runInContext(urlHelpers + '\n' + source, c);
    c.helpers.setRequestState();
    for (const route of ['preview', 'grade']) await c.helpers.request(route);
    assert.deepEqual(requests.map(r=>r.url),['preview','grade'].map(route=>`https://example.org${prefix}api/stack/${route}`));
    assert.equal(requests[0].payload.seed,7);
    c.fetch=async()=>({ok:false,status:404,json:async()=>{throw new SyntaxError("Unexpected token '<'");}});
    await assert.rejects(c.helpers.request('preview'), /JSON以外.*HTTP 404.*再起動/);
    c.fetch=async()=>({ok:true,status:200,redirected:true,json:async()=>{throw new SyntaxError("Unexpected token '<'");}});
    await assert.rejects(c.helpers.request('preview'), /ログイン状態/);
    c.fetch=async()=>({ok:false,status:503,json:async()=>({ok:false,error:'STACK unavailable'})});
    await assert.rejects(c.helpers.request('preview'), /STACK unavailable/);
    c.fetch=async()=>({ok:true,status:200,json:async()=>null});
    await assert.rejects(c.helpers.request('preview'), /HTTP 200/);
  }
  console.log('Passed: preview/grade paths at root and both proxy prefixes; HTML 404/login and JSON errors.');
})().catch(error=>{console.error(error);process.exitCode=1;});
