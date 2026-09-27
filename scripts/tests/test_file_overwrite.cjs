const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app/mcq-webapp/file-ui.js', 'utf8');
const block = source.slice(source.indexOf('  const handles ='), source.indexOf('  async function pickFile'));
function setup(supported = true) {
  const nodes = {}, writes = [], downloads = [], picks = [];
  const node = id => nodes[id] ||= {dataset:{},addEventListener(){}};
  const handle = name => ({name, async createWritable(){return {
    async write(text){writes.push([name, text]);}, async close(){}, async abort(){}
  };}});
  const win = {dataset:{},addEventListener(){}};
  if (supported) {
    win.showOpenFilePicker = async () => [];
    win.showSaveFilePicker = async options => {picks.push(options); return handle(options.suggestedName);};
  }
  const ctx = vm.createContext({window:win, $:node, uiText:s=>s, downloadText:(...args)=>downloads.push(args)});
  vm.runInContext(block, ctx);
  return {win, nodes, writes, downloads, picks, handle, save:win.mcqSaveQuestionFile};
}
(async () => {
  const t = setup();
  t.win.mcqFileTargets.imported('csv', {name:'original.csv'}, t.handle('original.csv'));
  await t.save('csv','new-title.csv','\ufeff"a","b"','text/csv',true);
  assert.deepEqual(t.writes.pop(), ['original.csv','\ufeff"a","b"']);
  assert.equal(t.picks.length,0);
  await t.save('xml','question.xml','<quiz/>','application/xml',true);
  assert.equal(t.picks.length,1);
  await t.save('csv','other.csv','other','text/csv');
  await t.save('csv','ignored.csv','updated','text/csv',true);
  assert.deepEqual(t.writes.pop(), ['other.csv','updated']);
  await t.save('xml','ignored.xml','updated XML','application/xml',true);
  assert.deepEqual(t.writes.pop(), ['question.xml','updated XML']);
  t.win.mcqFileTargets.reset();
  await t.save('csv','fresh.csv','new','text/csv',true);
  assert.equal(t.picks.at(-1).suggestedName,'fresh.csv');
  for(const name of ['sheet.xlsx','sheet.xls','sheet.tsv']) {
    t.win.mcqFileTargets.imported('csv',{name},t.handle(name));
    await t.save('csv','sheet.csv','csv','text/csv',true);
    assert.equal(t.writes.at(-1)[0],'sheet.csv');
  }
  const previous = t.writes.length;
  t.win.showSaveFilePicker = async () => {throw Object.assign(Error('cancel'),{name:'AbortError'});};
  assert.equal(await t.save('csv','cancel.csv','bad','text/csv'),null);
  assert.equal(t.writes.length,previous);
  await t.save('csv','ignored.csv','old target retained','text/csv',true);
  assert.equal(t.writes.at(-1)[0],'sheet.csv');
  let aborted = false;
  t.win.showSaveFilePicker = async () => ({name:'broken.csv',async createWritable(){return {
    async write(){throw Error('disk full');}, async abort(){aborted=true;}
  };}});
  await assert.rejects(t.save('csv','broken.csv','bad','text/csv'),/disk full/);
  assert.equal(aborted,true);
  await t.save('csv','ignored.csv','retained after failure','text/csv',true);
  assert.equal(t.writes.at(-1)[0],'sheet.csv');
  const u = setup(false);
  assert.equal(u.nodes.overwriteCsvButton.disabled,true);
  assert.equal((await u.save('csv','fallback.csv','data','text/csv')).downloaded,true);
  await assert.rejects(u.save('csv','fallback.csv','data','text/csv',true));
  assert.equal(u.downloads.length,1);
  const html=fs.readFileSync('app/mcq-webapp/index.html','utf8');
  assert.ok(!html.includes('id="sampleCsvButton"'));
  assert.ok(!html.includes('id="samplesDialog"'));
  for(const format of ['Csv','Xml']) assert.ok(html.includes(`id="overwrite${format}Button"`));
  console.log('Passed: separate overwrite targets, Save As, reset, Excel/TSV protection, cancellation, write failure and download fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
