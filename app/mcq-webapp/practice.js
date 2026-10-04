/* Public client sends a registered question ID, then an opaque token and answers. */
(() => {
  "use strict";
  let questions = [];
  const select = document.getElementById("question");
  const status = document.getElementById("catalogStatus");
  const button = document.getElementById("previewButton");
  const ui = document.getElementById("uiLanguage");
  const t = (ja, en) => ui.value === "en" ? en : ja;
  const selected = () => questions.find(q => q.id === select.value);
  window.MCQ_PRACTICE = {
    languages: () => selected()?.languages || ["ja", "en"],
    language: () => selected()?.languages.includes(ui.value) ? ui.value : selected()?.languages[0],
    snapshot: () => {
      if (!selected()) throw new Error(t("問題を選択してください。", "Select a question."));
      return {questionId: selected().id, lang: window.MCQ_PRACTICE.language()};
    },
    request: async (route, payload) => {
      const body = route === "grade" ? {token: payload.token, answers: payload.answers}
        : {questionId: payload.questionId, seed: payload.seed, lang: payload.lang};
      const response = await fetch(`/api/practice/${route}`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body), signal: AbortSignal.timeout(90000),
      });
      let data;
      try { data = await response.json(); }
      catch (_) { throw new Error(t(`サーバーに接続できません (HTTP ${response.status})。少し待って再試行してください。`, `Server unavailable (HTTP ${response.status}). Please retry shortly.`)); }
      if (!response.ok || !data.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data.result;
    },
  };
  function localize() {
    document.documentElement.lang = ui.value;
    document.getElementById("heading").textContent = t("STACK MCQ 練習", "STACK MCQ Practice");
    document.getElementById("intro").textContent = t("ログイン不要で練習できます。回答・成績は保存されません。", "Practice without signing in. Answers and scores are not saved.");
    document.getElementById("questionLabel").textContent = t("問題を選択", "Select a question");
    button.textContent = t("練習を開始", "Start practice");
  }
  ui.value = new URLSearchParams(location.search).get("ui") === "en" ? "en" : "ja";
  localize();
  ui.onchange = localize;
  select.onchange = () => {
    const url = new URL(location.href);
    url.searchParams.set("q", select.value);
    history.replaceState(null, "", url);
  };
  fetch("/api/practice/catalog").then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    questions = data.questions;
    for (const q of questions) {
      const option = document.createElement("option");
      option.value = q.id;
      option.textContent = q.title;
      select.append(option);
    }
    const id = new URLSearchParams(location.search).get("q");
    if (id && questions.some(q => q.id === id)) select.value = id;
    else if (id) status.textContent = t("指定された問題は見つかりません。一覧から選択してください。", "Requested question not found. Select one from the list.");
    if (!questions.length) status.textContent = t("問題はまだ登録されていません。", "No questions have been published yet.");
    select.disabled = button.disabled = !questions.length;
  }).catch(error => { status.textContent = error.message; });
})();
