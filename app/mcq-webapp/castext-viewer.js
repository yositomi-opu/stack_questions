/* A standalone STACK experiment page; no MCQ editor state or templates. */
(() => {
  "use strict";
  const xml = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  function buildDefinition(variables, expressions, prefix = "cvprobe") {
    if (!expressions.length || expressions.length > 30) throw new Error("Use 1–30 expressions.");
    if (!/^[a-z][a-z0-9]*$/i.test(prefix)) throw new Error("Invalid internal prefix.");
    const definitions = [], sections = [];
    expressions.forEach((expression, i) => {
      const value = `${prefix}v${i}`, raw = `${prefix}r${i}`;
      const source = expression.trim().replace(/[;$]\s*$/, "");
      if (!source) throw new Error("Empty expression.");
      definitions.push(`${value}:(${source});`);
      // Escape the string for HTML *before* inserting it through CASText.
      definitions.push(`${raw}:ssubst("&gt;", ">", ssubst("&lt;", "<", ssubst("&amp;", "&", string(${value}))));`);
      sections.push(`<article><h3 id="label${i}"></h3><h4 class="render-label"></h4><div class="render">{@${value}@}</div><h4 class="raw-label"></h4><pre>{@${raw}@}</pre><p>listp: {@string(listp(${value}))@} · stringp: {@string(stringp(${value}))@}</p></article>`);
    });
    return `<quiz><question type="stack"><name><text>CASText viewer</text></name><questiontext format="html"><text>${xml(sections.join("\n"))}</text></questiontext><questionvariables><text>${xml(variables + "\n" + definitions.join("\n"))}</text></questionvariables><generalfeedback format="html"><text/></generalfeedback><questionnote><text>CASText viewer</text></questionnote><defaultgrade>1</defaultgrade><penalty>0</penalty><stackversion><text>2026062900</text></stackversion></question></quiz>`;
  }
  if (typeof module !== "undefined") { module.exports = {buildDefinition}; return; }
  const $ = id => document.getElementById(id), storageKey = "stack-castext-viewer-v1";
  let ui = window.MCQ_WEBAPP_CONFIG?.locale === "en" ? "en" : "ja", busy = false, mathReady;
  const t = (ja,en) => ui === "en" ? en : ja;
  const sample = {variables:'a:3;\nplain:castext("abc");\nct:castext("値は {@a@} です。行列：{@matrix([1,a],[0,-1/4])@}");', expressions:["plain", "ct", "listp(ct)", "[plain, ct]"], language:"ja", seed:1};
  function translate() {
    document.documentElement.lang = ui; $("ui-language").value = ui;
    document.querySelectorAll("[data-ja]").forEach(node => node.textContent = node.dataset[ui]);
    document.querySelectorAll(".expression textarea").forEach(node => node.setAttribute("aria-label",t("確認する式","Expression")));
    document.querySelectorAll(".remove").forEach(node => node.setAttribute("aria-label",t("式を削除","Remove expression")));
  }
  function snapshot() { return {variables:$("variables").value, expressions:[...document.querySelectorAll(".expression textarea")].map(n=>n.value),language:$("language").value,seed:Number($("seed").value),ui}; }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); } catch (_) {} }
  function invalidate() { $("status").className=""; $("results").hidden=true; $("error").hidden=true; $("status").textContent=t("入力を変更しました。実行して確認してください。","Inputs changed. Run to update results."); save(); }
  function addExpression(value="") {
    if ($("expressions").children.length >=30) return;
    const row=document.createElement("div"); row.className="expression";
    const input=document.createElement("textarea"); input.rows=1; input.spellcheck=false; input.value=value; input.setAttribute("aria-label",t("確認する式","Expression"));
    const remove=document.createElement("button"); remove.className="remove"; remove.textContent="×"; remove.setAttribute("aria-label",t("式を削除","Remove expression"));
    remove.onclick=()=>{row.remove();if(!$("expressions").children.length)addExpression();invalidate();};
    row.append(input,remove); $("expressions").append(row);
  }
  function apply(data) {
    $("variables").value=data.variables||""; $("expressions").replaceChildren();
    (Array.isArray(data.expressions)&&data.expressions.length?data.expressions:[""]).slice(0,30).forEach(v=>addExpression(String(v)));
    $("language").value=data.language||"ja"; $("seed").value=data.seed||1;
  }
  function loadMath() {
    if (!mathReady) mathReady=new Promise((resolve,reject)=>{
      window.MathJax={loader:{load:["[tex]/boldsymbol"],source:{"[tex]/boldsymbol":"[mathjax]/mathjax-boldsymbol-3.2.2.js"}},
        tex:{packages:{"[+]":["boldsymbol"]}},startup:{typeset:false},svg:{fontCache:"none"},options:{enableMenu:false}};
      const script=document.createElement("script"); script.src="./vendor/mathjax-tex-svg-3.2.2.js";
      script.onload=()=>window.MathJax.startup.promise.then(resolve,reject);
      script.onerror=()=>{mathReady=null;script.remove();reject(new Error(t("数式表示を読み込めません。再実行してください。","Cannot load math display. Please retry.")));};
      document.head.append(script);
    });
    return mathReady;
  }
  async function display(result, expressions) {
    if(typeof result.questionrender!=="string")throw new Error(t("描画結果がありません。","No rendering returned."));
    if(result.iframes?.length||result.isinteractive)throw new Error(t("対話型の図はこのビューアでは表示できません。","Interactive graphics are not supported in this viewer."));
    let html=result.questionrender;
    for(const [name,value] of Object.entries(result.previewassets||{}))html=html.split(name).join(value);
    const frame=$("output"); window.MathJax?.typesetClear?.();
    const ready=new Promise(resolve=>frame.onload=resolve);
    frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>body{font:16px/1.6 system-ui,sans-serif;color:#243248;margin:0;padding:6px}article{border-bottom:1px solid #d7dfe9;padding:0 0 18px;margin:0 0 18px}h3{font:15px ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#edf3fa;padding:8px}h4{font-size:13px;color:#526276;margin:12px 0 4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace;background:#f5f6f8;padding:10px}img,svg{max-width:100%}.render{overflow-x:auto}</style></head><body><main></main></body></html>`;
    await ready; const doc=frame.contentDocument;
    doc.querySelector("main").innerHTML=html;
    doc.querySelectorAll("script,iframe,object,embed,base,meta,link,style").forEach(n=>{if(n.closest("main"))n.remove();});
    doc.addEventListener("click",e=>{if(e.target.closest("a"))e.preventDefault();});doc.addEventListener("submit",e=>e.preventDefault());
    expressions.forEach((v,i)=>{const label=doc.getElementById(`label${i}`);if(label)label.textContent=v;});
    doc.querySelectorAll(".render-label").forEach(n=>n.textContent=t("描画結果","Rendered value"));
    doc.querySelectorAll(".raw-label").forEach(n=>n.textContent=t("内部表現（string）","Internal representation (string)"));
    await loadMath();
    // Only rendered values are typeset. Raw representations must stay literal.
    await window.MathJax.typesetPromise([...doc.querySelectorAll(".render")]);
    const sheet=document.querySelector("#MJX-SVG-styles"); if(sheet)doc.head.append(sheet.cloneNode(true));
    $("results").hidden=false;
    frame.style.height=`${Math.min(2400,Math.max(300,doc.body.scrollHeight+30))}px`;
  }
  async function run() {
    if(busy)return;
    const data=snapshot(), expressions=data.expressions.filter(v=>v.trim());
    $("results").hidden=true; $("error").hidden=true; $("status").className="";
    if(!expressions.length){$("status").textContent=t("確認する式を入力してください。","Enter an expression.");return;}
    if(!Number.isInteger(data.seed)||data.seed<1||data.seed>2147483647){$("status").textContent=t("乱数の種は1〜2147483647です。","Seed must be 1–2147483647.");return;}
    busy=true; document.querySelectorAll("button,input,textarea,select").forEach(n=>n.disabled=true); save();
    $("status").textContent=t("STACKで評価しています…","Evaluating with STACK…");
    try {
      const url=window.MCQ_WEBAPP_CONFIG?.stackApiUrl;
      if(!url)throw new Error(t("make startで起動したローカルWebAppから開いてください。","Open this page on the local WebApp started with make start."));
      const prefix="cv"+Array.from(crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(16)).join("");
      const questionDefinition=buildDefinition(data.variables,expressions,prefix);
      const response=await fetch("./api/stack/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,questionDefinition,seed:data.seed,lang:data.language}),signal:AbortSignal.timeout(90000)});
      let body;try{body=await response.json();}catch(_){throw new Error(t("APIがJSON以外を返しました。WebAppの起動状態を確認してください。","API returned non-JSON content. Check that the WebApp is running.")+` (HTTP ${response.status})`);}
      if(!response.ok||!body.ok)throw new Error(body.error||`HTTP ${response.status}`);
      await display(body.result,expressions);
      $("status").textContent=t("評価が完了しました。","Evaluation complete.");
    } catch(error) {
      $("status").className="error";$("status").textContent=t("評価できませんでした。エラーログを確認してください。","Evaluation failed. See the error log.");
      let detail=error.message;
      const start=detail.indexOf('{');
      if(start>=0){try{const response=JSON.parse(detail.slice(start));if(typeof response.message==="string")detail=detail.slice(0,start)+"\n"+response.message;}catch(_) {}}
      $("error").hidden=false;$("error").open=true;$("error-text").textContent=detail;
    } finally {busy=false;document.querySelectorAll("button,input,textarea,select").forEach(n=>n.disabled=false);}
  }
  const names={ja:"日本語",en:"English",fr:"Français",it:"Italiano",de:"Deutsch",pt:"Português",zh:"中文",ko:"한국어",ru:"Русский",sv:"Svenska",es:"Español"};
  for(const [code,name] of Object.entries(names)){const o=document.createElement("option");o.value=code;o.textContent=`${name} (${code})`;$("language").append(o);}
  let initial=sample;try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved&&typeof saved.variables==="string"){initial=saved;if(saved.ui==="en"||saved.ui==="ja")ui=saved.ui;}}catch(_){}
  apply(initial);translate();
  $("ui-language").onchange=()=>{ui=$("ui-language").value;translate();invalidate();};
  $("add").onclick=()=>{addExpression();invalidate();};$("run").onclick=run;
  $("sample").onclick=()=>{apply(sample);invalidate();};$("clear").onclick=()=>{apply({});invalidate();};
  ["variables","expressions","seed","language"].forEach(id=>$(id).addEventListener("input",invalidate));
})();
