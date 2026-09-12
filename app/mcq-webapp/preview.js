/* Isolated, opt-in preview. No editor event handlers or saved state are replaced. */
(() => {
  "use strict";
  const t = (ja, en) => document.documentElement.lang === "en" ? en : ja;
  let dialog, frame, status, seed, renderButton, gradeButton, solutionButton, languageSelect;
  let snapshot, rendered, busy = false, mathReady;
  const prefix = "mcqpreview_";

  function message(text, error = false) {
    status.textContent = text;
    status.style.color = error ? "#a32121" : "";
  }

  function setBusy(value) {
    busy = value;
    renderButton.disabled = value;
    seed.disabled = value;
    if (languageSelect) languageSelect.disabled = value;
    gradeButton.disabled = value || !rendered;
    solutionButton.disabled = value || !rendered;
    frame.style.pointerEvents = value ? "none" : "";
    frame.inert = value;
  }

  function loadMath() {
    if (!mathReady) mathReady = new Promise((resolve, reject) => {
      window.MathJax = {startup: {typeset: false}, svg: {fontCache: "none"},
        options: {enableMenu: false}};
      const script = document.createElement("script");
      script.src = "./vendor/mathjax-tex-svg-3.2.2.js";
      script.onload = () => window.MathJax.startup.promise.then(resolve, reject);
      script.onerror = () => { mathReady = null; script.remove(); reject(new Error(t("数式表示を読み込めません。再度プレビューしてください。", "Cannot load math display. Please retry."))); };
      document.head.append(script);
    });
    return mathReady;
  }

  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "preview-dialog";
    dialog.setAttribute("aria-labelledby", "preview-title");
    dialog.innerHTML = `<div class="preview-heading"><h2 id="preview-title">${t("問題プレビュー", "Question preview")}</h2><button type="button" data-close>${t("閉じる", "Close")}</button></div>
      <p>${t("表示時点の編集内容で確認します。編集後は閉じてから再度プレビューしてください。", "Uses a snapshot of the editor. Close and reopen after editing.")}</p>
      <div class="preview-controls"><label>${t("乱数の種", "Seed")} <input type="number" min="1" max="2147483647" value="1" step="1" data-seed></label>
      <button type="button" data-render>${t("この種で表示", "Render this seed")}</button>
      <button type="button" data-next>${t("別バリエーション", "Another variant")}</button>
      <button type="button" data-grade class="primary">${t("回答を採点", "Grade answer")}</button>
      <button type="button" data-solution>${t("解説を表示", "Show explanation")}</button>
      <label class="preview-language" title="${t("プレビュー言語", "Preview language")}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></svg><select data-language aria-label="${t("プレビュー言語", "Preview language")}"></select></label></div>
      <p role="status" aria-live="polite" data-status></p>
      <iframe sandbox="allow-same-origin" title="${t("問題と回答", "Question and answer")}"></iframe>`;
    document.body.append(dialog);
    frame = dialog.querySelector("iframe");
    status = dialog.querySelector("[data-status]");
    seed = dialog.querySelector("[data-seed]");
    renderButton = dialog.querySelector("[data-render]");
    gradeButton = dialog.querySelector("[data-grade]");
    solutionButton = dialog.querySelector("[data-solution]");
    languageSelect = dialog.querySelector("[data-language]");
    const names = {ja:"日本語", en:"English", fr:"Français", it:"Italiano", de:"Deutsch", pt:"Português", zh:"中文", ko:"한국어", ru:"Русский", sv:"Svenska"};
    activeLangs().forEach(lang => {
      const option = document.createElement("option");
      option.value = lang;
      option.textContent = `${names[lang] || lang} (${lang})`;
      languageSelect.append(option);
    });
    languageSelect.value = baseLang();
    languageSelect.onchange = () => {
      if (busy || !snapshot) return;
      snapshot = {...snapshot, lang: languageSelect.value};
      render();
    };
    dialog.querySelector("[data-close]").onclick = () => dialog.close();
    renderButton.onclick = render;
    dialog.querySelector("[data-next]").onclick = () => {
      if (busy) return;
      seed.value = String((Number(seed.value) || 0) % 2147483647 + 1);
      render();
    };
    gradeButton.onclick = grade;
    solutionButton.onclick = async () => {
      if (!rendered || busy) return;
      try {
        await showFeedback(assetHtml(rendered.questionsamplesolutiontext || t("解説はありません。", "No explanation provided."), rendered.previewassets));
      } catch (error) { message(error.message, true); }
    };
    seed.oninput = () => {
      // Never grade old options with a newly entered seed.
      gradeButton.disabled = true;
      solutionButton.disabled = true;
      message(t("種を変更しました。「この種で表示」を押してください。", "Seed changed. Click Render this seed."));
    };
  }

  async function request(route, extra = {}) {
    const response = await fetch(webappUrl(`/api/stack/${route}`), {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({...snapshot, seed: Number(seed.value), ...extra}),
      signal: AbortSignal.timeout(90000),
    });
    let data;
    try {
      data = await response.json();
    } catch (_error) {
      const hint = response.redirected || [401, 403].includes(response.status)
        ? t("ログイン状態を確認してください。", "Please check your login session.")
        : t("WebAppを更新・再起動し、ページを再読み込みしてください。", "Update and restart the WebApp, then reload the page.");
      throw new Error(`${t("プレビューAPIからJSON以外の応答が返りました", "The preview API returned a non-JSON response")} (HTTP ${response.status})。${hint}`);
    }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    return data.result;
  }

  function questionHtml(result) {
    return result.questionrender.replace(/\[\[input:(\w+)\]\]/g, (_, name) => result.questioninputs?.[name]?.render || "")
      .replace(/\[\[(?:validation|feedback):\w+\]\]/g, "");
  }

  function assetHtml(html, assets = {}) {
    for (const [name, value] of Object.entries(assets)) html = html.split(name).join(value);
    return html;
  }

  function feedbackHtml(result) {
    return (result.specificfeedback || Object.values(result.prts || {}).join("\n"))
      .replace(/\[\[feedback:(\w+)\]\]/g, (_, name) => result.prts?.[name] || "");
  }

  async function typeset(target) {
    await loadMath();
    await window.MathJax.typesetPromise([target]);
    // MathJax adds SVG layout styles to the outer document; copy them to the frame.
    const sheet = document.querySelector("#MJX-SVG-styles");
    if (sheet && !frame.contentDocument.getElementById(sheet.id)) frame.contentDocument.head.append(sheet.cloneNode(true));
  }

  async function display(html) {
    window.MathJax?.typesetClear?.();
    // No scripts or navigation are permitted in the question document. The editor
    // accesses its controls, but question HTML cannot access or change the editor.
    const ready = new Promise(resolve => frame.onload = resolve);
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><style>
      body{font:17px/1.7 system-ui,sans-serif;color:#202b3b;padding:18px;margin:0;overflow-wrap:anywhere}label{cursor:pointer}input{margin-right:8px}input[type=radio],input[type=checkbox]{width:18px;height:18px}table{border-collapse:collapse}td{padding:4px 8px}img,svg{max-width:100%}.option{margin:12px 0}#preview-feedback{margin-top:24px;padding:16px;background:#f1f6fa;border-radius:8px}#preview-feedback:empty{display:none}.stackinputfeedback.empty{display:none}
      </style></head><body><main id="preview-question"></main><section id="preview-feedback"></section></body></html>`;
    await ready;
    const doc = frame.contentDocument;
    doc.getElementById("preview-question").innerHTML = html;
    // Suppress unsupported active elements and prevent links from replacing the preview.
    doc.querySelectorAll("script,iframe,object,embed,base,meta,link,style").forEach(node => node.remove());
    doc.addEventListener("click", event => { if (event.target.closest("a")) event.preventDefault(); });
    doc.addEventListener("submit", event => event.preventDefault());
    doc.addEventListener("input", () => {
      const feedback = doc.getElementById("preview-feedback");
      window.MathJax?.typesetClear?.([feedback]);
      feedback.replaceChildren();
      message(t("回答を変更しました。「回答を採点」で確認してください。", "Answer changed. Click Grade answer to check it."));
    });
    await typeset(doc.getElementById("preview-question"));
  }

  async function render() {
    if (busy || !snapshot) return;
    const value = Number(seed.value);
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
      message(t("乱数の種は1〜2147483647の整数で指定してください。", "Seed must be an integer from 1 to 2147483647."), true);
      return;
    }
    rendered = null;
    setBusy(true);
    frame.hidden = true;
    message(t("問題を生成しています…", "Rendering question…"));
    try {
      const result = await request("preview");
      if (typeof result.questionrender !== "string") throw new Error(t("APIから問題表示を取得できませんでした。", "The API returned no question display."));
      if (result.iframes?.length || result.isinteractive) throw new Error(t("この問題は対話型の図を含むため、このプレビューでは表示できません。Moodleで確認してください。", "This question contains interactive graphics. Please preview it in Moodle."));
      await display(assetHtml(questionHtml(result), result.previewassets));
      if (result.previewDefinition) snapshot = {...snapshot, questionDefinition: result.previewDefinition};
      rendered = result;
      frame.hidden = false;
      message(t("選択肢を選び「回答を採点」で確認できます。", "Select options and click Grade answer."));
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  }

  function answers() {
    const result = {};
    for (const element of frame.contentDocument.querySelectorAll("input,textarea,select")) {
      if (!element.name.startsWith(prefix)) continue;
      if (["radio", "checkbox"].includes(element.type) && !element.checked) continue;
      result[element.name.slice(prefix.length)] = element.value;
    }
    return result;
  }

  async function showFeedback(html) {
    const target = frame.contentDocument.getElementById("preview-feedback");
    window.MathJax?.typesetClear?.([target]);
    target.innerHTML = html;
    target.querySelectorAll("script,iframe,object,embed,base,meta,link,style").forEach(node => node.remove());
    await typeset(target);
    target.scrollIntoView({block: "nearest"});
  }

  async function grade() {
    if (!rendered || busy || gradeButton.disabled) return;
    setBusy(true);
    message(t("採点しています…", "Grading…"));
    try {
      const result = await request("grade", {answers: answers()});
      if (!result.isgradable) {
        await showFeedback("");
        message(t("採点できませんでした。回答が選択されているか確認してください。", "Unable to grade. Please check your answer."), true);
        return;
      }
      const score = result.scores?.total ?? result.score;
      await showFeedback(assetHtml(feedbackHtml(result), result.previewassets));
      message(`${t("得点", "Score")}: ${Math.round(Number(score) * 100)}%`);
    } catch (error) { message(error.message, true); }
    finally { setBusy(false); }
  }

  document.getElementById("previewButton").addEventListener("click", () => {
    // An in-flight request retains its own snapshot, even if the dialog is closed.
    if (busy) { dialog.showModal(); return; }
    if (dialog) dialog.remove();
    createDialog();
    rendered = null;
    dialog.showModal();
    try {
      snapshot = null;
      snapshot = previewQuestionSnapshot();
      render();
    } catch (error) {
      setBusy(false);
      renderButton.disabled = true;
      message(error.message, true);
    }
  });
})();
