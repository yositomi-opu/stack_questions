const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let source = fs.readFileSync(path.resolve(__dirname, '../../app/mcq-webapp/preview.js'), 'utf8');
source = source.slice(0, source.indexOf('  document.getElementById("previewButton")')) + `
  globalThis.helpers = {questionHtml, feedbackHtml, assetHtml, answers,
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
