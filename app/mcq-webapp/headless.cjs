// DOM-free host for the editor's actual CSV parser and XML generator.
// No source extraction or duplicate conversion rules: app.js runs unchanged
// apart from its explicit MCQ_HEADLESS presentation/startup guards.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createConverter() {
  const fields = new Map();
  function field() {
    return {value:'', checked:false, dataset:{}, classList:{add(){},remove(){},toggle(){}},
      closest(){return this;}, replaceChildren(){}, querySelectorAll(){return [];}};
  }
  const document = {
    querySelector(selector) {
      if (!fields.has(selector)) fields.set(selector, field());
      return fields.get(selector);
    },
    querySelectorAll(){return [];},
  };
  const window = {MCQ_HEADLESS:true, location:{href:'http://localhost/'}};
  const context = vm.createContext({window, document, URL, TextEncoder, TextDecoder,
    structuredClone, btoa:s=>Buffer.from(s,'binary').toString('base64'),
    atob:s=>Buffer.from(s,'base64').toString('binary')});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8'), context, {filename:'app.js'});
  const api = vm.runInContext(`({state, el, parseDelimited, applyRecords, generateXml,
    normalizeChoiceCasttext, normalizeFeedbackCasttext, baseTitle, xmlFileStem,
    literalChoiceElements, casChoiceExpressions, evaluationVariableCode,
    problemVariableNames, validateCasListExpressionResults, activeLangs, baseLang,
    choiceEvaluationId})`, context);
  const root = path.resolve(__dirname,'../..');
  for (const mode of ['rb','cb']) {
    api.state.templates[mode] = fs.readFileSync(path.join(root,`001.MCQ-${mode}.xml`),'utf8');
    api.state.templates[mode+'Cas'] = fs.readFileSync(path.join(root,`001.MCQ_cas-${mode}.xml`),'utf8');
  }
  return api;
}

async function convertCsv(csv, options = {}) {
  const api = createConverter();
  api.el.includeBaseUrl.value = options.includeBaseUrl || 'https://yositomi-opu.github.io/stack_questions/001/';
  const summary = api.applyRecords(api.parseDelimited(csv, ','));
  if (!api.el.questionId.value) api.el.questionId.value = api.baseTitle(options.fallbackTitle || 'question');
  api.normalizeChoiceCasttext();
  api.normalizeFeedbackCasttext();
  const expressions = api.casChoiceExpressions();
  if (options.evaluate) {
    const endpoint = new URL('api/maxima/evaluate', (options.webappUrl || 'http://127.0.0.1:4173').replace(/\/?$/, '/'));
    const response = await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({managedLibraries:true, variables:api.evaluationVariableCode(), variableNames:api.problemVariableNames(), expressions}),
      signal:AbortSignal.timeout(90000)});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `Evaluation HTTP ${response.status}`);
    const failures = (result.expressions || []).filter(x=>!x.ok);
    if (failures.length) throw new Error(failures.map(x=>`${x.id}: ${x.error}`).join('\n'));
    api.state.casEvaluation = {status:'ready', stale:false, variables:result.variables || [],
      expressions:Object.fromEntries((result.expressions || []).map(x=>[x.id,x]))};
    const errors = api.validateCasListExpressionResults();
    if (errors.length) throw new Error(errors.join('\n'));
  } else {
    // Parse literal lists without evaluating any supplied Maxima code.
    for (const item of expressions) {
      const elements = api.literalChoiceElements(item.expression);
      if (elements) api.state.casEvaluation.expressions[item.id] = {ok:true,type:'list',length:elements.length};
    }
  }
  for (const [index,row] of api.state.rows.entries()) {
    for (const lang of row.choice_language_independent ? [api.baseLang()] : api.activeLangs()) {
      if (!row[`choice_list_expr_${lang}`]) continue;
      const id = api.choiceEvaluationId(index, lang);
      if (!api.state.casEvaluation.expressions[id]?.ok)
        throw new Error(`option${Number(row.pattern)}${row.truth}: リスト長が未評価です。--evaluate を指定し、WebAppを起動してください。`);
    }
  }
  return {xml:api.generateXml(), filename:api.state.xmlFilename || `${api.xmlFileStem(api.el.questionId.value)}.xml`,
    warnings:summary.warnings || []};
}

module.exports = {convertCsv};
if (require.main === module) {
  let input='';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk=>{input+=chunk;});
  process.stdin.on('end', async()=>{
    try {const request=JSON.parse(input); process.stdout.write(JSON.stringify(await convertCsv(request.csv,request.options)));}
    catch(error) {process.stderr.write(`${error.message}\n`);process.exitCode=1;}
  });
}
