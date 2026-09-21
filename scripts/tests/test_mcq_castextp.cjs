// Generate a real STACK /api/stack/preview request; validate its response separately.
// node scripts/tests/test_mcq_castextp.cjs request > /tmp/castextp-request.json
// node scripts/tests/test_mcq_castextp.cjs response /tmp/castextp-response.json
const fs=require('node:fs'), assert=require('node:assert/strict');
const {buildDefinition}=require('../../app/mcq-webapp/castext-viewer.js');
const source=fs.readFileSync('mcq_template_pre_cas.txt','utf8');
const helper=source.split('/* MCQ_CASTEXTP_BEGIN')[1].split('/* MCQ_CASTEXTP_END */')[0].split('*/').slice(1).join('*/');
const cases=[
 ['""',true],['"abc"',true],['castext("abc")',true],
 ['castext("Value {@2+3@}")',true],['castext("{@matrix([1,2],[3,4])@}")',true],
 ['castext("[[lang code=\'ja\']]日本語{@3@}[[/lang]][[lang code=\'en\']]English{@3@}[[/lang]]")',true],
 ['castext("[[if test=\'true\']]yes{@3@}[[/if]]")',true],
 ['castext("[[commonstring key=\'correct\'/]]")',true],
 ['["%root", "abc", ["smlt", "x"]]',true],['["%root"]',true],
 ['["%cs","key","name",["%root","text"]]',true],
 ['["smlt","x","1"]',true],
 ['42',false],['false',false],['unknown_symbol',false],['matrix([1,2])',false],
 ['[]',false],['["abc","def"]',false],['[["%root","a"],["%root","b"]]',false],
 ['["%root",42]',false],['["%root",["unexpected","text"]]',false],
 ['["smlt"]',false],['["smlt",42]',false],['["smlt","x","bad"]',false],
 ['["%cs","key","name"]',false],['["%cs",42]',false],['["%cs","key",3,"x"]',false]
];
if(process.argv[2]==='request') {
 const expression='['+cases.map(([v])=>`mcq_castextp(${v})`).join(',')+']';
 console.log(JSON.stringify({url:'http://127.0.0.1:3080',seed:1,lang:'ja',questionDefinition:buildDefinition(helper,[expression])}));
} else {
 const response=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 assert.equal(response.ok,true,response.error);
 const raw=response.result.questionrender.match(/<pre>(.*?)<\/pre>/s)[1].replace(/\s/g,'');
 assert.equal(raw,'['+cases.map(([,v])=>v).join(',')+']');
 console.log(`Passed: ${cases.length} real STACK CASText predicate cases.`);
}
