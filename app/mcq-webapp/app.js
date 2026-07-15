const LANGS = ["en", "ja", "fr", "it", "de", "pt", "zh", "ko", "ru", "sv"];
const DEFAULT_QUESTION_TEXT = "次のうち正しいものを __SELTYPE__.";
const SAMPLE_ROWS = [
  { pattern: "01", truth: "C", choice_ja: "太陽は恒星である", feedback_ja: "太陽は自ら光を放つ恒星です。" },
  { pattern: "01", truth: "W", choice_ja: "太陽は惑星である", feedback_ja: "太陽は自ら光を放つ恒星です。" },
  { pattern: "02", truth: "C", choice_ja: "地球は惑星である", feedback_ja: "地球は太陽の周りを公転する惑星です。" },
  { pattern: "02", truth: "W", choice_ja: "地球は恒星である", feedback_ja: "地球は太陽の周りを公転する惑星です。" },
];

const state = {
  mode: "rb",
  rows: structuredClone(SAMPLE_ROWS),
  qvars: [],
  templates: { rb: "", cb: "" },
  xmlWidth: 520,
  translationsStale: false,
  questionTypes: Object.fromEntries(LANGS.map((lang) => [lang, "text"])),
  includeSource: null,
};

buildLanguageInputs();

const el = {
  questionId: document.querySelector("#questionId"),
  modeRb: document.querySelector("#modeRb"),
  modeCb: document.querySelector("#modeCb"),
  numOptions: document.querySelector("#numOptions"),
  numCorrect: document.querySelector("#numCorrect"),
  randomCorrect: document.querySelector("#randomCorrect"),
  correctCounts: document.querySelector("#correctCounts"),
  correctCountsRow: document.querySelector("#correctCountsRow"),
  requirePairs: document.querySelector("#requirePairs"),
  showXml: document.querySelector("#showXml"),
  settingsWidth: document.querySelector("#settingsWidth"),
  dataWidth: document.querySelector("#dataWidth"),
  settingsResizeHandle: document.querySelector("#settingsResizeHandle"),
  workspace: document.querySelector(".workspace"),
  xmlPane: document.querySelector("#xmlPane"),
  xmlToggleTab: document.querySelector("#xmlToggleTab"),
  xmlResizeHandle: document.querySelector("#xmlResizeHandle"),
  outputPanel: document.querySelector("#outputPanel"),
  dataFileButton: document.querySelector("#dataFileButton"),
  xmlFileButton: document.querySelector("#xmlFileButton"),
  dataFileInput: document.querySelector("#dataFileInput"),
  xmlFileInput: document.querySelector("#xmlFileInput"),
  qvars: document.querySelector("#qvars"),
  rowsBody: document.querySelector("#rowsBody"),
  pairedEditor: document.querySelector("#pairedEditor"),
  fixedEditor: document.querySelector("#fixedEditor"),
  correctPatternsBody: document.querySelector("#correctPatternsBody"),
  wrongPatternsBody: document.querySelector("#wrongPatternsBody"),
  xmlOutput: document.querySelector("#xmlOutput"),
  statusLine: document.querySelector("#statusLine"),
  addRowButton: document.querySelector("#addRowButton"),
  addCorrectPatternButton: document.querySelector("#addCorrectPatternButton"),
  addWrongPatternButton: document.querySelector("#addWrongPatternButton"),
  clearRowsButton: document.querySelector("#clearRowsButton"),
  sampleCsvButton: document.querySelector("#sampleCsvButton"),
  saveCsvButton: document.querySelector("#saveCsvButton"),
  downloadButton: document.querySelector("#downloadButton"),
  copyButton: document.querySelector("#copyButton"),
  copyCasButton: document.querySelector("#copyCasButton"),
  downloadIncludeButton: document.querySelector("#downloadIncludeButton"),
  languageChoices: document.querySelector("#languageChoices"),
  baseLanguage: document.querySelector("#baseLanguage"),
  prepareTranslationButton: document.querySelector("#prepareTranslationButton"),
  translationPanel: document.querySelector("#translationPanel"),
  translationJson: document.querySelector("#translationJson"),
  copyTranslationButton: document.querySelector("#copyTranslationButton"),
  applyTranslationButton: document.querySelector("#applyTranslationButton"),
  translationStatus: document.querySelector("#translationStatus"),
  choiceLanguageHeading: document.querySelector("#choiceLanguageHeading"),
  feedbackLanguageHeading: document.querySelector("#feedbackLanguageHeading"),
  languageChecks: Object.fromEntries(
    LANGS.map((lang) => [lang, document.querySelector(`#language${upperFirst(lang)}`)])
  ),
  questions: Object.fromEntries(
    LANGS.map((lang) => [lang, document.querySelector(`#question${upperFirst(lang)}`)])
  ),
  questionModes: Object.fromEntries(
    LANGS.map((lang) => [lang, document.querySelector(`#questionType${upperFirst(lang)}`)])
  ),
};

init();

async function init() {
  bindEvents();
  populateBaseLanguage();
  updateQuestionLanguageVisibility();
  updateCorrectCountControls();
  updateLayout();
  renderRows();
  await loadTemplates();
  updateOutput();
}

function updateCorrectCountControls() {
  el.correctCountsRow.hidden = !el.randomCorrect.checked;
  el.numCorrect.disabled = el.randomCorrect.checked;
}

function updateLayout() {
  el.workspace.style.setProperty("--settings-width", `${el.settingsWidth.value}px`);
  el.workspace.style.setProperty("--data-width", `${el.dataWidth.value}px`);
  el.workspace.style.setProperty("--xml-width", `${state.xmlWidth}px`);
  el.outputPanel.hidden = !el.showXml.checked;
  el.workspace.classList.toggle("xml-hidden", !el.showXml.checked);
  el.xmlToggleTab.setAttribute("aria-pressed", String(el.showXml.checked));
  el.xmlToggleTab.title = el.showXml.checked ? "生成XMLを閉じる" : "生成XMLを開く";
}

function bindEvents() {
  el.modeRb.addEventListener("change", () => setMode("rb"));
  el.modeCb.addEventListener("change", () => setMode("cb"));
  el.addRowButton.addEventListener("click", () => {
    state.rows.push({ pattern: nextPattern(), truth: "C", [`choice_${baseLang()}`]: "", [`feedback_${baseLang()}`]: "" });
    markTranslationsStale("選択肢行が追加されました");
    renderRows();
    updateOutput();
  });
  el.addCorrectPatternButton.addEventListener("click", () => addFixedPattern("C"));
  el.addWrongPatternButton.addEventListener("click", () => addFixedPattern("W"));
  el.clearRowsButton.addEventListener("click", () => {
    state.rows = [];
    markTranslationsStale("選択肢がクリアされました");
    renderRows();
    updateOutput();
  });
  el.dataFileButton.addEventListener("click", () => el.dataFileInput.click());
  el.xmlFileButton.addEventListener("click", () => el.xmlFileInput.click());
  el.dataFileInput.addEventListener("change", readSelectedFile);
  el.xmlFileInput.addEventListener("change", readSelectedXml);
  el.sampleCsvButton.addEventListener("click", downloadSampleCsv);
  el.saveCsvButton.addEventListener("click", downloadCurrentCsv);
  el.downloadButton.addEventListener("click", downloadXml);
  el.copyButton.addEventListener("click", copyXml);
  el.copyCasButton.addEventListener("click", copyCasDebugCode);
  el.downloadIncludeButton.addEventListener("click", downloadIncludeFile);
  el.requirePairs.addEventListener("change", () => {
    renderRows();
    updateOutput();
  });
  el.randomCorrect.addEventListener("change", () => {
    updateCorrectCountControls();
    updateOutput();
  });
  el.correctCounts.addEventListener("input", updateOutput);
  el.showXml.addEventListener("change", updateLayout);
  el.xmlToggleTab.addEventListener("click", toggleXmlPane);
  el.xmlResizeHandle.addEventListener("pointerdown", beginXmlResize);
  el.settingsResizeHandle.addEventListener("pointerdown", beginSettingsResize);
  el.settingsWidth.addEventListener("input", updateLayout);
  el.dataWidth.addEventListener("input", updateLayout);
  Object.values(el.languageChecks).forEach((node) => {
    node.addEventListener("change", () => {
      ensureOneLanguage(node);
      updateQuestionLanguageVisibility();
      markTranslationsStale("展開先言語が変更されました");
      updateOutput();
    });
  });
  el.baseLanguage.addEventListener("change", changeBaseLanguage);
  el.prepareTranslationButton.addEventListener("click", prepareTranslationRequest);
  el.copyTranslationButton.addEventListener("click", copyTranslationRequest);
  el.applyTranslationButton.addEventListener("click", applyTranslationResult);
  [el.questionId, el.numOptions, el.numCorrect].forEach((node) => {
    node.addEventListener("input", updateOutput);
  });
  Object.values(el.questions).forEach((node) => {
    node.addEventListener("input", () => {
      markTranslationsStale("基本言語の問題文が変更されました");
      updateOutput();
    });
  });
  Object.entries(el.questionModes).forEach(([lang, node]) => {
    node.addEventListener("change", () => {
      state.questionTypes[lang] = node.value;
      node.closest(".question-language-field")?.classList.toggle("cas", node.value === "cas");
      markTranslationsStale("問題文の入力形式が変更されました");
      updateOutput();
    });
  });
  el.qvars.addEventListener("input", () => {
    state.qvars = [el.qvars.value];
    updateOutput();
  });
}

function toggleXmlPane() {
  el.showXml.checked = !el.showXml.checked;
  updateLayout();
}

function beginXmlResize(event) {
  if (!el.showXml.checked) return;
  event.preventDefault();
  el.workspace.classList.add("resizing-xml");

  const onPointerMove = (moveEvent) => {
    const rect = el.workspace.getBoundingClientRect();
    const settingsWidth = Number.parseInt(el.settingsWidth.value, 10) || 330;
    const maxXmlWidth = Math.max(320, Math.min(900, rect.width - settingsWidth - 360 - 28));
    const nextWidth = clamp(Math.round(rect.right - moveEvent.clientX), 320, maxXmlWidth);
    state.xmlWidth = nextWidth;
    updateLayout();
  };

  const endResize = () => {
    el.workspace.classList.remove("resizing-xml");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endResize);
    window.removeEventListener("pointercancel", endResize);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endResize);
  window.addEventListener("pointercancel", endResize);
}

function beginSettingsResize(event) {
  if (window.matchMedia("(max-width: 780px)").matches) return;
  event.preventDefault();
  el.workspace.classList.add("resizing-settings");
  el.settingsResizeHandle.setPointerCapture?.(event.pointerId);

  const onPointerMove = (moveEvent) => {
    const rect = el.workspace.getBoundingClientRect();
    const maxWidth = Math.max(300, Math.min(620, rect.width - 460));
    const nextWidth = clamp(Math.round(moveEvent.clientX - rect.left), 300, maxWidth);
    el.settingsWidth.value = String(nextWidth);
    updateLayout();
  };

  const endResize = () => {
    el.workspace.classList.remove("resizing-settings");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endResize);
    window.removeEventListener("pointercancel", endResize);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endResize);
  window.addEventListener("pointercancel", endResize);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadTemplates() {
  try {
    const [rb, cb] = await Promise.all([
      fetch("./templates/001.MCQ-rb.xml").then(checkResponse).then((r) => r.text()),
      fetch("./templates/001.MCQ-cb.xml").then(checkResponse).then((r) => r.text()),
    ]);
    state.templates = { rb, cb };
    setStatus("テンプレート読込完了");
  } catch (error) {
    setStatus("アプリ内のXMLテンプレートを読み込めませんでした。ページを再読み込みしてください。", true);
    updateOutput();
  }
}

function checkResponse(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function setMode(mode) {
  state.mode = mode;
  el.modeRb.checked = mode === "rb";
  el.modeCb.checked = mode === "cb";
  updateOutput();
}

function buildLanguageInputs() {
  const choices = document.querySelector("#languageChoices");
  const fields = document.querySelector("#questionTextFields");
  LANGS.forEach((lang) => {
    const label = document.createElement("label");
    label.className = "language-choice";
    const checkbox = document.createElement("input");
    checkbox.id = `language${upperFirst(lang)}`;
    checkbox.type = "checkbox";
    checkbox.value = lang;
    checkbox.checked = lang === "ja";
    label.append(checkbox, document.createTextNode(lang));
    choices.append(label);

    const field = document.createElement("div");
    field.className = "question-language-field";
    field.dataset.lang = lang;
    field.hidden = lang !== "ja";
    const fieldLabel = document.createElement("label");
    fieldLabel.htmlFor = `question${upperFirst(lang)}`;
    fieldLabel.textContent = lang;
    const heading = document.createElement("div");
    heading.className = "typed-field-heading";
    const mode = valueTypeSelect("text");
    mode.id = `questionType${upperFirst(lang)}`;
    const textarea = document.createElement("textarea");
    textarea.id = `question${upperFirst(lang)}`;
    textarea.rows = 4;
    if (lang === "ja") textarea.value = DEFAULT_QUESTION_TEXT;
    heading.append(fieldLabel, mode);
    field.append(heading, textarea);
    fields.append(field);
  });
}

function valueTypeSelect(value = "text") {
  const select = document.createElement("select");
  select.className = "value-type-select";
  select.innerHTML = '<option value="text">文字列</option><option value="cas">CAS式</option>';
  select.value = value === "cas" ? "cas" : "text";
  return select;
}

function populateBaseLanguage() {
  LANGS.forEach((lang) => {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = lang;
    option.selected = lang === "ja";
    el.baseLanguage.append(option);
  });
  updateBaseLanguageUi();
}

function baseLang() {
  return el.baseLanguage.value || "ja";
}

function changeBaseLanguage() {
  el.languageChecks[baseLang()].checked = true;
  updateBaseLanguageUi();
  updateQuestionLanguageVisibility();
  renderRows();
  markTranslationsStale("基本言語が変更されました");
  updateOutput();
}

function updateBaseLanguageUi() {
  const lang = baseLang();
  el.choiceLanguageHeading.textContent = `選択肢 ${lang}`;
  el.feedbackLanguageHeading.textContent = `共通FB ${lang}`;
  document.querySelectorAll(".language-choice").forEach((label) => {
    label.classList.toggle("base-language", label.querySelector("input")?.value === lang);
  });
}

function activeLangs() {
  return LANGS.filter((lang) => el.languageChecks[lang].checked);
}

function ensureOneLanguage(changed) {
  if (changed.value === baseLang() && !changed.checked) {
    changed.checked = true;
    setStatus("基本言語は展開対象から外せません", true);
    return;
  }
  if (activeLangs().length) return;
  changed.checked = true;
  setStatus("少なくとも1言語を選択してください", true);
}

function updateQuestionLanguageVisibility() {
  document.querySelectorAll(".question-language-field").forEach((field) => {
    field.hidden = field.dataset.lang !== baseLang();
  });
}

function renderRows() {
  updateOptionLimit();
  const paired = el.requirePairs.checked;
  el.pairedEditor.hidden = !paired;
  el.fixedEditor.hidden = paired;
  el.addRowButton.hidden = !paired;
  if (!paired) {
    renderFixedGroups("C", el.correctPatternsBody);
    renderFixedGroups("W", el.wrongPatternsBody);
    return;
  }
  el.rowsBody.replaceChildren();
  state.rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(textInput(row, index, "pattern", "01")),
      cell(truthSelect(row, index)),
      cell(typedTextareaInput(row, index, "choice")),
      cell(feedbackTextarea(row, index)),
      cell(removeButton(index))
    );
    el.rowsBody.append(tr);
  });
}

function updateOptionLimit() {
  const patternCount = el.requirePairs.checked ? groupPatterns().length : countFixedPatterns();
  const maximum = Math.max(1, patternCount);
  el.numOptions.max = String(maximum);
  if (Number(el.numOptions.value) > maximum) el.numOptions.value = String(maximum);
}

function countFixedPatterns() {
  return ["C", "W"].reduce((total, truth) =>
    total + fixedGroups(truth).filter((group) =>
      group.rows.some((row) => activeLangs().some((lang) => String(row[`choice_${lang}`] || "").trim()))
    ).length, 0
  );
}

function renderFixedGroups(truth, target) {
  target.replaceChildren();
  fixedGroups(truth).forEach((group) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(fixedPatternInput(group)),
      cell(fixedChoicesTextarea(group)),
      cell(fixedFeedbackTextarea(group)),
      cell(removeFixedGroupButton(group))
    );
    target.append(tr);
  });
}

function fixedGroups(truth) {
  const groups = new Map();
  state.rows
    .filter((row) => normalizeTruth(row.truth) === truth)
    .forEach((row) => {
      const pattern = String(row.pattern || "").trim() || "01";
      if (!groups.has(pattern)) groups.set(pattern, { pattern, truth, rows: [] });
      groups.get(pattern).rows.push(row);
    });
  return [...groups.values()].sort((a, b) =>
    Number(a.pattern) - Number(b.pattern) || a.pattern.localeCompare(b.pattern)
  );
}

function fixedPatternInput(group) {
  const input = document.createElement("input");
  input.value = group.pattern;
  input.addEventListener("input", () => {
    group.rows.forEach((row) => {
      row.pattern = input.value;
    });
    updateOutput();
  });
  input.addEventListener("blur", renderRows);
  return input;
}

function fixedChoicesTextarea(group) {
  const typeKey = `choice_type_${baseLang()}`;
  const editor = document.createElement("div");
  editor.className = "typed-editor";
  const mode = valueTypeSelect(group.rows.find((row) => row[typeKey])?.[typeKey] || "text");
  const textarea = document.createElement("textarea");
  const independent = languageIndependentToggle(group.rows, () => {
    copyLanguageIndependentChoices(group.rows);
    markTranslationsStale("選択肢の言語依存設定が変更されました");
    updateOutput();
  });
  textarea.rows = Math.max(3, group.rows.length);
  textarea.value = group.rows.map((row) => row[`choice_${baseLang()}`] || "").join("\n");
  textarea.addEventListener("input", () => {
    setFixedGroupChoices(group, textarea.value.split(/\r?\n/));
    updateOptionLimit();
    updateOutput();
  });
  mode.addEventListener("change", () => {
    group.rows.forEach((row) => {
      row[typeKey] = mode.value;
      row[`choice_list_expr_${baseLang()}`] = false;
    });
    editor.classList.toggle("cas", mode.value === "cas");
    markTranslationsStale("選択肢の入力形式が変更されました");
    updateOutput();
  });
  editor.classList.toggle("cas", mode.value === "cas");
  editor.append(independent, mode, textarea);
  return editor;
}

function languageIndependentToggle(rows, onChange) {
  const label = document.createElement("label");
  label.className = "language-independent-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = rows.length > 0 && rows.every((row) => row.choice_language_independent);
  input.addEventListener("change", () => {
    rows.forEach((row) => { row.choice_language_independent = input.checked; });
    onChange?.(input.checked);
  });
  label.append(input, document.createTextNode("選択肢は言語に依存しない"));
  return label;
}

function copyLanguageIndependentChoices(rows) {
  const source = baseLang();
  activeLangs().filter((lang) => lang !== source).forEach((lang) => {
    rows.forEach((row) => {
      row[`choice_${lang}`] = row[`choice_${source}`] || "";
      row[`choice_type_${lang}`] = row[`choice_type_${source}`] || "text";
      row[`choice_list_expr_${lang}`] = Boolean(row[`choice_list_expr_${source}`]);
    });
  });
}

function setFixedGroupChoices(group, values) {
  const choiceKey = `choice_${baseLang()}`;
  const choiceTypeKey = `choice_type_${baseLang()}`;
  const feedbackKey = `feedback_${baseLang()}`;
  const feedbackTypeKey = `feedback_type_${baseLang()}`;
  const feedback = group.rows.find((row) => String(row[feedbackKey] || "").trim())?.[feedbackKey] || "";
  const choiceType = group.rows.find((row) => row[choiceTypeKey])?.[choiceTypeKey] || "text";
  const feedbackType = group.rows.find((row) => row[feedbackTypeKey])?.[feedbackTypeKey] || "text";
  values.forEach((value, index) => {
    if (!group.rows[index]) {
      const row = {
        pattern: group.pattern,
        truth: group.truth,
        choice_language_independent: group.rows.every((item) => item.choice_language_independent),
        [choiceKey]: "",
        [choiceTypeKey]: choiceType,
      };
      state.rows.push(row);
      group.rows.push(row);
    }
    group.rows[index][choiceKey] = value;
  });
  group.rows.slice(values.length).forEach((row) => {
    state.rows.splice(state.rows.indexOf(row), 1);
  });
  group.rows.length = values.length;
  group.rows.forEach((row) => {
    row[feedbackKey] = "";
  });
  if (group.rows[0]) group.rows[0][feedbackKey] = feedback;
  group.rows.forEach((row) => { row[feedbackTypeKey] = feedbackType; });
  if (group.rows.every((row) => row.choice_language_independent)) copyLanguageIndependentChoices(group.rows);
  markTranslationsStale("基本言語の選択肢が変更されました");
}

function fixedFeedbackTextarea(group) {
  const feedbackKey = `feedback_${baseLang()}`;
  const typeKey = `feedback_type_${baseLang()}`;
  const editor = document.createElement("div");
  editor.className = "typed-editor";
  const mode = valueTypeSelect(group.rows.find((row) => row[typeKey])?.[typeKey] || "text");
  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.value = group.rows.find((row) => String(row[feedbackKey] || "").trim())?.[feedbackKey] || "";
  textarea.addEventListener("input", () => {
    group.rows.forEach((row) => {
      row[feedbackKey] = "";
    });
    if (group.rows[0]) group.rows[0][feedbackKey] = textarea.value;
    markTranslationsStale("基本言語のフィードバックが変更されました");
    updateOutput();
  });
  mode.addEventListener("change", () => {
    group.rows.forEach((row) => { row[typeKey] = mode.value; });
    editor.classList.toggle("cas", mode.value === "cas");
    markTranslationsStale("フィードバックの入力形式が変更されました");
    updateOutput();
  });
  editor.classList.toggle("cas", mode.value === "cas");
  editor.append(mode, textarea);
  return editor;
}

function removeFixedGroupButton(group) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-row";
  button.textContent = "×";
  button.title = "パターンを削除";
  button.addEventListener("click", () => {
    state.rows = state.rows.filter((row) => !group.rows.includes(row));
    markTranslationsStale("選択肢パターンが削除されました");
    renderRows();
    updateOutput();
  });
  return button;
}

function addFixedPattern(truth) {
  state.rows.push({
    pattern: nextPattern(),
    truth,
    [`choice_${baseLang()}`]: "",
    [`feedback_${baseLang()}`]: "",
  });
  markTranslationsStale("選択肢パターンが追加されました");
  renderRows();
  updateOutput();
}

function cell(child) {
  const td = document.createElement("td");
  td.append(child);
  return td;
}

function truthSelect(row, index) {
  const select = document.createElement("select");
  select.innerHTML = '<option value="C">真</option><option value="W">偽</option>';
  select.value = normalizeTruth(row.truth);
  select.addEventListener("change", () => {
    state.rows[index].truth = select.value;
    markTranslationsStale("選択肢の真偽が変更されました");
    renderRows();
    updateOutput();
  });
  return select;
}

function textInput(row, index, key, fallback = "") {
  const input = document.createElement("input");
  input.value = row[key] ?? fallback;
  input.addEventListener("input", () => {
    state.rows[index][key] = input.value;
    if (key === "pattern") updateOptionLimit();
    updateOutput();
  });
  if (key === "pattern") input.addEventListener("blur", renderRows);
  return input;
}

function textareaInput(row, index, key) {
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.value = row[key] ?? "";
  textarea.addEventListener("input", () => {
    state.rows[index][key] = textarea.value;
    if (key.startsWith("choice_")) updateOptionLimit();
    markTranslationsStale("基本言語の選択肢が変更されました");
    updateOutput();
  });
  return textarea;
}

function typedTextareaInput(row, index, field) {
  const lang = baseLang();
  const editor = document.createElement("div");
  editor.className = "typed-editor";
  const modeKey = `${field}_type_${lang}`;
  const mode = valueTypeSelect(row[modeKey] || "text");
  const textarea = textareaInput(row, index, `${field}_${lang}`);
  mode.addEventListener("change", () => {
    state.rows[index][modeKey] = mode.value;
    state.rows[index][`${field}_list_expr_${lang}`] = false;
    editor.classList.toggle("cas", mode.value === "cas");
    markTranslationsStale("選択肢の入力形式が変更されました");
    updateOutput();
  });
  editor.classList.toggle("cas", mode.value === "cas");
  if (field === "choice") {
    const groupRows = state.rows.filter((candidate) =>
      String(candidate.pattern || "").trim() === String(row.pattern || "").trim()
      && normalizeTruth(candidate.truth) === normalizeTruth(row.truth)
    );
    editor.append(languageIndependentToggle(groupRows, () => {
      copyLanguageIndependentChoices(groupRows);
      markTranslationsStale("選択肢の言語依存設定が変更されました");
      renderRows();
      updateOutput();
    }));
  }
  editor.append(mode, textarea);
  return editor;
}

function feedbackTextarea(row, index) {
  const feedbackKey = `feedback_${baseLang()}`;
  const typeKey = `feedback_type_${baseLang()}`;
  const editor = document.createElement("div");
  editor.className = "typed-editor";
  const textarea = document.createElement("textarea");
  const key = feedbackGroupKey(row);
  const firstIndex = state.rows.findIndex((candidate) => feedbackGroupKey(candidate) === key);
  const groupRows = state.rows.filter((candidate) => feedbackGroupKey(candidate) === key);
  textarea.rows = 2;
  textarea.value = groupRows.find((candidate) => String(candidate[feedbackKey] || "").trim())?.[feedbackKey] || "";
  textarea.disabled = index !== firstIndex;
  if (textarea.disabled) textarea.title = "フィードバックは同じパターンの先頭行で編集します";
  textarea.addEventListener("input", () => {
    groupRows.forEach((candidate) => {
      candidate[feedbackKey] = "";
    });
    state.rows[index][feedbackKey] = textarea.value;
    markTranslationsStale("基本言語のフィードバックが変更されました");
    updateOutput();
  });
  const sourceWithType = groupRows.find((candidate) => candidate[typeKey]);
  const mode = valueTypeSelect(sourceWithType?.[typeKey] || "text");
  mode.disabled = textarea.disabled;
  mode.addEventListener("change", () => {
    groupRows.forEach((candidate) => { candidate[typeKey] = mode.value; });
    editor.classList.toggle("cas", mode.value === "cas");
    markTranslationsStale("フィードバックの入力形式が変更されました");
    updateOutput();
  });
  editor.classList.toggle("cas", mode.value === "cas");
  editor.append(mode, textarea);
  return editor;
}

function feedbackGroupKey(row) {
  const pattern = String(row.pattern || "").trim() || "01";
  return el.requirePairs.checked ? pattern : `${pattern}:${normalizeTruth(row.truth)}`;
}

function removeButton(index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-row";
  button.textContent = "×";
  button.title = "削除";
  button.addEventListener("click", () => {
    state.rows.splice(index, 1);
    markTranslationsStale("選択肢行が削除されました");
    renderRows();
    updateOutput();
  });
  return button;
}

function updateOutput() {
  try {
    const xml = generateXml();
    el.xmlOutput.value = xml;
    const patterns = groupPatterns();
    setStatus(`${patterns.length}パターン・${state.rows.length}選択肢から生成`);
  } catch (error) {
    el.xmlOutput.value = `<!-- XMLを生成できませんでした: ${error.message} -->`;
    setStatus(error.message, true);
  }
}

function generateXml() {
  const template = state.templates[state.mode];
  if (!template) throw new Error("テンプレート読込待ち");
  const id = xmlFileStem(baseTitle(el.questionId.value));
  const generatedVariables = generateVariableBlock();
  const metadataComment = `/* MCQ_WEBAPP_DATA_BASE64:${encodeAppMetadata()} */`;
  const variableBlock = state.includeSource
    ? `${metadataComment}\nstack_include("${state.includeSource.url}");`
    : `${metadataComment}\n${generatedVariables}`;
  const patterns = groupPatterns();
  const patternCount = patterns.length;
  const counts = correctCountChoices(positiveInt(el.numOptions.value, "選択肢数"));
  const maxSelectedCorrect = Math.max(...counts);
  const minSelectedCorrect = Math.min(...counts);
  const maxCorrect = el.requirePairs.checked
    ? maxSelectedCorrect
    : patterns.filter((pattern) => pattern.C.length).length;
  const maxWrong = el.requirePairs.checked
    ? patternCount - minSelectedCorrect
    : patterns.filter((pattern) => pattern.W.length).length;
  return template
    .replace(/(?:\[\[lang code=['"][^'"]+['"]\]\]\[\[\/lang\]\])+/g, languageBlocks())
    .replace(/<name>\s*<text>[\s\S]*?<\/text>\s*<\/name>/, `<name>\n      <text>${escapeXml(id)}</text>\n    </name>`)
    .replace(/%__mcq_rb_cb:"(?:rb|cb)";/, `%__mcq_rb_cb:"${state.mode}";`)
    .replace(/%__mcq_max_cp:\d+;/, `%__mcq_max_cp:${Math.max(5, maxCorrect)};`)
    .replace(/%__mcq_max_wp:\d+;/, `%__mcq_max_wp:${Math.max(9, maxWrong)};`)
    .replace(
      /(\/\*+\s*MAIN QUESTION VARIABLES\s*\*+\/\s*)[\s\S]*?(\s*\/\*+\s*END OF MAIN QUESTION VARIABLES\s*\*+\/)/,
      `$1\n${variableBlock}\n$2`
    )
    .replace(/<questionnote format="html">\s*<text>[\s\S]*?<\/text>\s*<\/questionnote>/, `<questionnote format="html">\n      <text>${escapeXml(id)}</text>\n    </questionnote>`);
}

function generateVariableBlock() {
  validateTranslationCoverage();
  const numOptions = positiveInt(el.numOptions.value, "選択肢数");
  const counts = correctCountChoices(numOptions);
  const patterns = groupPatterns();
  if (!patterns.length) throw new Error("命題パターンがありません");
  if (el.requirePairs.checked) {
    return generatePairedVariableBlock(patterns, numOptions, counts);
  }
  return generateFixedVariableBlock(patterns, numOptions, counts);
}

function correctCountChoices(numOptions) {
  if (!el.randomCorrect.checked) {
    const value = nonNegativeInt(el.numCorrect.value, "正解数");
    if (value > numOptions) throw new Error("正解数が選択肢数を超えています");
    return [value];
  }
  const values = el.correctCounts.value
    .split(/[,、\s]+/)
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));
  if (!values.length || values.some((value) => !Number.isInteger(value) || value < 0 || value > numOptions)) {
    throw new Error(`正解数の候補は0〜${numOptions}の整数をカンマ区切りで入力してください`);
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function baseVariableLines(numOptions, counts) {
  const correctExpression = counts.length === 1 ? String(counts[0]) : `rand([${counts.join(", ")}])`;
  return [
    "/**************** Generated by mcq-webapp ****************/",
    ...normalizedQvars(),
    ...(normalizedQvars().length ? [""] : []),
    `if not numberp(%_MCQ_NUM_OPTS) then %_MCQ_NUM_OPTS:${numOptions};`,
    `if not numberp(%_MCQ_NUM_COPTS) then %_MCQ_NUM_COPTS:${correctExpression};`,
    "",
    `%__mcq_qtextL:${langAssocFromFields()};`,
    "",
  ];
}

function appStateSnapshot() {
  return {
    version: 1,
    questionId: el.questionId.value,
    mode: state.mode,
    baseLanguage: baseLang(),
    activeLanguages: activeLangs(),
    questions: Object.fromEntries(LANGS.map((lang) => [lang, {
      value: el.questions[lang].value,
      type: state.questionTypes[lang] || "text",
    }])),
    rows: state.rows,
    qvars: el.qvars.value,
    settings: {
      numOptions: el.numOptions.value,
      numCorrect: el.numCorrect.value,
      randomCorrect: el.randomCorrect.checked,
      correctCounts: el.correctCounts.value,
      requirePairs: el.requirePairs.checked,
    },
    includeSource: state.includeSource ? {
      url: state.includeSource.url,
      path: state.includeSource.path,
      filename: state.includeSource.filename,
    } : null,
  };
}

function encodeAppMetadata() {
  const bytes = new TextEncoder().encode(JSON.stringify(appStateSnapshot()));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeAppMetadata(value) {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function generatePairedVariableBlock(patterns, numOptions, counts) {
  const minCorrect = Math.min(...counts);
  const maxCorrect = Math.max(...counts);
  if (maxCorrect > patterns.length) throw new Error("正解数が命題パターン数を超えています");
  if (numOptions > patterns.length) throw new Error("選択肢数が命題パターン数を超えています");
  patterns.forEach((pattern) => {
    if (!pattern.C.length || !pattern.W.length) {
      throw new Error(`パターン ${pattern.id} には C と W の両方が必要です`);
    }
  });

  const maxWrong = numOptions - minCorrect;
  const lines = [
    ...baseVariableLines(numOptions, counts),
    `/* Randomly choose the number of true patterns from [${counts.join(", ")}]. */`,
    `%__mcq_pattern_order:random_permutation(makelist(k, k, 1, ${patterns.length}));`,
    "",
  ];

  for (let index = 0; index < maxCorrect; index += 1) {
    appendRandomPattern(
      lines, "C", index + 1, String(index + 1), patterns,
      `${index + 1} <= %_MCQ_NUM_COPTS`
    );
  }
  for (let index = 0; index < maxWrong; index += 1) {
    appendRandomPattern(
      lines, "W", index + 1, `%_MCQ_NUM_COPTS + ${index + 1}`, patterns,
      `${index + 1} <= %_MCQ_NUM_OPTS - %_MCQ_NUM_COPTS`
    );
  }
  lines.push("/**************** End of generated variables ****************/");
  return lines.join("\n");
}

function generateFixedVariableBlock(patterns, numOptions, counts) {
  const correct = patterns.filter((pattern) => pattern.C.length);
  const wrong = patterns.filter((pattern) => pattern.W.length);
  const maxCorrect = Math.max(...counts);
  const maxWrong = numOptions - Math.min(...counts);
  if (maxCorrect > correct.length) throw new Error("正解数の候補に対して正解パターンが不足しています");
  if (maxWrong > wrong.length) throw new Error("正解数の候補に対して誤答パターンが不足しています");

  const lines = [
    ...baseVariableLines(numOptions, counts),
    "/* Fixed true/false patterns (pair requirement disabled). */",
    "",
  ];
  correct.forEach((pattern, index) => appendFixedPattern(lines, "C", index + 1, pattern));
  wrong.forEach((pattern, index) => appendFixedPattern(lines, "W", index + 1, pattern));
  lines.push("/**************** End of generated variables ****************/");
  return lines.join("\n");
}

function appendFixedPattern(lines, truth, slot, pattern) {
  const independent = pattern[truth].length > 0 && pattern[truth].every((row) => row.choice_language_independent);
  const optName = truth === "C" ? `%__CoptL${slot}${independent ? "" : "L"}` : `%__WoptL${slot}${independent ? "" : "L"}`;
  const msgName = truth === "C" ? `%__Cmsg${slot}L` : `%__Wmsg${slot}L`;
  const rows = pattern[truth];
  lines.push(`${optName}:${independent ? independentChoicesValue(rows) : choicesLangAssoc(rows)};`);
  lines.push(`${msgName}:${fixedFeedbackAssoc(rows)};`);
  lines.push("");
}

function independentChoicesValue(rows) {
  const items = rows.map((row) => localizedTyped(row, "choice", baseLang())).filter((item) => item.value);
  if (items.length === 1 && items[0].listExpression) return maximaTypedValue(items[0]);
  return `[${items.map(maximaTypedValue).join(", ")}]`;
}

function choicesLangAssoc(rows) {
  return maximaAssoc(
    activeLangs().map((lang) => [lang, rows.map((row) => localizedTyped(row, "choice", lang)).filter((item) => item.value)]),
    "list"
  );
}

function fixedFeedbackAssoc(rows) {
  return maximaAssoc(
    activeLangs().map((lang) => {
      const exact = rows.find((row) => String(row[`feedback_${lang}`] || "").trim());
      return [lang, {
        value: String(exact?.[`feedback_${lang}`] || "").trim(),
        type: exact?.[`feedback_type_${lang}`] || "text",
      }];
    }),
    "string"
  );
}

function appendRandomPattern(lines, truth, slot, orderPosition, patterns, condition) {
  const independent = patterns.every((pattern) =>
    pattern[truth].length > 0 && pattern[truth].every((row) => row.choice_language_independent)
  );
  const optName = truth === "C" ? `%__CoptL${slot}${independent ? "" : "L"}` : `%__WoptL${slot}${independent ? "" : "L"}`;
  const msgName = truth === "C" ? `%__Cmsg${slot}L` : `%__Wmsg${slot}L`;
  const optionValue = independent
    ? randomizedIndependentChoices(patterns, truth, orderPosition)
    : randomizedLangAssoc(patterns, truth, orderPosition);
  lines.push(`${optName}:if ${condition} then ${optionValue} else false;`);
  lines.push(`${msgName}:if ${condition} then ${randomizedFeedbackAssoc(patterns, orderPosition)} else false;`);
  lines.push("");
}

function randomizedIndependentChoices(patterns, truth, orderPosition) {
  const values = patterns.map((pattern) => independentChoicesValue(pattern[truth]));
  return `[${values.join(", ")}][%__mcq_pattern_order[${orderPosition}]]`;
}

function randomizedLangAssoc(patterns, truth, orderPosition) {
  const entries = availableLangs(patterns.flatMap((pattern) => pattern[truth]));
  return maximaAssociation(entries.map((lang) => {
    const choicesByPattern = patterns.map((pattern) => {
      const values = pattern[truth]
        .map((row) => localizedTyped(row, "choice", lang))
        .filter((item) => item.value)
        .map(maximaTypedValue);
      const sourceItems = pattern[truth].map((row) => localizedTyped(row, "choice", lang)).filter((item) => item.value);
      return sourceItems.length === 1 && sourceItems[0].listExpression ? maximaTypedValue(sourceItems[0]) : `[${values.join(", ")}]`;
    });
    return `["${lang}", [${choicesByPattern.join(", ")}][%__mcq_pattern_order[${orderPosition}]]]`;
  }));
}

function randomizedFeedbackAssoc(patterns, orderPosition) {
  const allRows = patterns.flatMap((pattern) => [...pattern.C, ...pattern.W]);
  const entries = availableLangs(allRows);
  return maximaAssociation(entries.map((lang) => {
    const values = patterns.map((pattern) => maximaTypedValue(localizedFeedbackTyped(pattern, lang)));
    return `["${lang}", [${values.join(", ")}][%__mcq_pattern_order[${orderPosition}]]]`;
  }));
}

function availableLangs(rows) {
  return activeLangs().filter((lang) => rows.some((row) => localized(row, "choice", lang)));
}

function localized(row, field, lang) {
  return String(row[`${field}_${lang}`] || "").trim();
}

function localizedTyped(row, field, lang) {
  return {
    value: localized(row, field, lang),
    type: row[`${field}_type_${lang}`] || "text",
    listExpression: Boolean(row[`${field}_list_expr_${lang}`]),
  };
}

function localizedFeedback(pattern, lang) {
  const rows = [...pattern.C, ...pattern.W];
  const exact = rows.find((row) => String(row[`feedback_${lang}`] || "").trim());
  return String(exact?.[`feedback_${lang}`] || "").trim();
}

function localizedFeedbackTyped(pattern, lang) {
  const rows = [...pattern.C, ...pattern.W];
  const exact = rows.find((row) => String(row[`feedback_${lang}`] || "").trim());
  return {
    value: String(exact?.[`feedback_${lang}`] || "").trim(),
    type: exact?.[`feedback_type_${lang}`] || "text",
  };
}

function groupPatterns() {
  const groups = new Map();
  state.rows.forEach((row) => {
    const choice = activeLangs().some((lang) => String(row[`choice_${lang}`] || "").trim());
    if (!choice) return;
    const id = String(row.pattern || "").trim() || "01";
    if (!groups.has(id)) groups.set(id, { id, C: [], W: [] });
    groups.get(id)[normalizeTruth(row.truth)].push(row);
  });
  return [...groups.values()].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
}

function langAssocFromFields() {
  return maximaAssoc(
    activeLangs().map((lang) => [lang, { value: el.questions[lang].value.trim(), type: state.questionTypes[lang] || "text" }]),
    "string"
  );
}

function maximaAssoc(entries, type) {
  const normalized = entries.filter(([, value]) => Array.isArray(value) ? value.length : String(value?.value ?? "").trim());
  return maximaAssociation(normalized.map(([lang, value]) => {
    const rendered = type === "list"
      ? (value.length === 1 && value[0].listExpression ? maximaTypedValue(value[0]) : `[${value.map(maximaTypedValue).join(", ")}]`)
      : maximaTypedValue(value);
    return `["${lang}", ${rendered}]`;
  }));
}

function maximaAssociation(entries) {
  return `[${entries.join(",\n ")}]`;
}

function maximaTypedValue(item) {
  const value = String(item?.value ?? "").trim();
  return item?.type === "cas" ? value : maximaString(value);
}

function languageBlocks() {
  return activeLangs().map((lang) => `[[lang code="${lang}"]][[/lang]]`).join("");
}

function maximaString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "<br>")}"`;
}

function normalizedQvars() {
  return state.qvars
    .map((expression) => String(expression).trim())
    .filter(Boolean)
    .map((expression) => /[;$]\s*$/.test(expression) ? expression : `${expression};`);
}

function validateTranslationCoverage() {
  const source = baseLang();
  const targets = translationTargets();
  if (!targets.length) return;
  if (state.translationsStale) throw new Error("多言語展開を更新してください");
  targets.forEach((lang) => {
    if (!el.questions[lang].value.trim()) throw new Error(`${lang} の問題文翻訳がありません`);
    state.rows.forEach((row, index) => {
      if (!row.choice_language_independent
          && String(row[`choice_${source}`] || "").trim()
          && !String(row[`choice_${lang}`] || "").trim()) {
        throw new Error(`${lang} の選択肢翻訳がありません（行 ${index + 1}）`);
      }
      if (String(row[`feedback_${source}`] || "").trim() && !String(row[`feedback_${lang}`] || "").trim()) {
        throw new Error(`${lang} のフィードバック翻訳がありません（行 ${index + 1}）`);
      }
    });
  });
}

function translationTargets() {
  return activeLangs().filter((lang) => lang !== baseLang());
}

function translationPayload() {
  const source = baseLang();
  const questionType = state.questionTypes[source] || "text";
  return {
    schema: "stack-mcq-translations-v1",
    source_language: source,
    target_languages: translationTargets(),
    preserve_exactly: ["__SELTYPE__", "Maxima expressions", "LaTeX", "STACK {@...@} blocks", "HTML tags"],
    question_type: questionType,
    question_text: questionType === "text" ? el.questions[source].value : null,
    rows: state.rows.map((row, index) => ({
      id: String(index),
      pattern: String(row.pattern || ""),
      truth: normalizeTruth(row.truth),
      choice_type: row[`choice_type_${source}`] || "text",
      choice: !row.choice_language_independent && (row[`choice_type_${source}`] || "text") === "text"
        ? String(row[`choice_${source}`] || "")
        : null,
      feedback_type: row[`feedback_type_${source}`] || "text",
      feedback: (row[`feedback_type_${source}`] || "text") === "text" ? String(row[`feedback_${source}`] || "") : null,
    })),
  };
}

function prepareTranslationRequest() {
  if (!translationTargets().length) {
    setTranslationStatus("基本言語以外の展開先言語を1つ以上選択してください", "error");
    return;
  }
  copyCasValuesToTargets();
  const payload = translationPayload();
  el.translationJson.value = [
    "次のSTACK MCQ教材を target_languages に翻訳してください。",
    "数式、変数、__SELTYPE__、{@...@}、HTMLタグは変更しないでください。",
    "説明文を付けず、入力と同じ構造に translations を追加した有効なJSONだけを返してください。",
    'translations は {"en":{"question_text":"...","rows":[{"id":"0","choice":"...","feedback":"..."}]}} の形式にしてください。',
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");
  el.translationPanel.open = true;
  setTranslationStatus("翻訳依頼を作成しました。ChatGPTへ貼り付けてください。", "");
}

async function copyTranslationRequest() {
  if (!el.translationJson.value.trim()) prepareTranslationRequest();
  if (!el.translationJson.value.trim()) return;
  try {
    await navigator.clipboard.writeText(el.translationJson.value);
    setTranslationStatus("クリップボードへコピーしました", "");
  } catch {
    el.translationJson.focus();
    el.translationJson.select();
    setTranslationStatus("欄を選択しました。コピー操作を行ってください。", "");
  }
}

function applyTranslationResult() {
  try {
    const raw = el.translationJson.value.trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const result = JSON.parse(raw);
    if (!result.translations || typeof result.translations !== "object") {
      throw new Error("translations が見つかりません");
    }
    let applied = 0;
    Object.entries(result.translations).forEach(([rawLang, translation]) => {
      const lang = normalizeLang(rawLang);
      if (!LANGS.includes(rawLang.toLowerCase()) || lang === baseLang()) return;
      el.languageChecks[lang].checked = true;
      if (typeof translation.question_text === "string") {
        el.questions[lang].value = translation.question_text;
        state.questionTypes[lang] = "text";
        el.questionModes[lang].value = "text";
      }
      if (Array.isArray(translation.rows)) {
        translation.rows.forEach((translatedRow) => {
          const index = Number.parseInt(translatedRow.id, 10);
          if (!state.rows[index]) return;
          if (typeof translatedRow.choice === "string") {
            state.rows[index][`choice_${lang}`] = translatedRow.choice;
            state.rows[index][`choice_type_${lang}`] = "text";
          }
          if (typeof translatedRow.feedback === "string") {
            state.rows[index][`feedback_${lang}`] = translatedRow.feedback;
            state.rows[index][`feedback_type_${lang}`] = "text";
          }
        });
      }
      applied += 1;
    });
    if (!applied) throw new Error("対応言語の翻訳を読み込めませんでした");
    state.translationsStale = false;
    updateBaseLanguageUi();
    updateOutput();
    setTranslationStatus(`${applied}言語の翻訳を反映しました`, "");
  } catch (error) {
    setTranslationStatus(`翻訳結果を反映できません: ${error.message}`, "error");
  }
}

function copyCasValuesToTargets() {
  const source = baseLang();
  translationTargets().forEach((lang) => {
    if ((state.questionTypes[source] || "text") === "cas") {
      el.questions[lang].value = el.questions[source].value;
      state.questionTypes[lang] = "cas";
      el.questionModes[lang].value = "cas";
    }
    state.rows.forEach((row) => {
      ["choice", "feedback"].forEach((field) => {
        const independentChoice = field === "choice" && row.choice_language_independent;
        if (!independentChoice && (row[`${field}_type_${source}`] || "text") !== "cas") return;
        row[`${field}_${lang}`] = row[`${field}_${source}`] || "";
        row[`${field}_type_${lang}`] = row[`${field}_type_${source}`] || "text";
        row[`${field}_list_expr_${lang}`] = Boolean(row[`${field}_list_expr_${source}`]);
      });
    });
  });
}

function markTranslationsStale(message) {
  if (!translationTargets().length) return;
  state.translationsStale = true;
  setTranslationStatus(`${message}。多言語展開を更新してください。`, "stale");
}

function setTranslationStatus(message, kind = "") {
  el.translationStatus.textContent = message;
  el.translationStatus.className = `translation-status${kind ? ` ${kind}` : ""}`;
}

async function readSelectedFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  try {
    const records = ext === "xlsx" || ext === "xls" ? await readWorkbook(file) : await readDelimited(file);
    applyRecords(records);
    renderRows();
    updateOutput();
    setStatus(`${file.name} を読み込みました`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    event.target.value = "";
  }
}

async function readSelectedXml(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    if (!window.confirm(`${file.name} を読み込みます。\n現在の入力内容は置き換えられます。`)) return;
    const xmlText = await file.text();
    const includeSource = await resolveMainInclude(xmlText);
    const summary = importXmlText(xmlText, file.name, includeSource);
    const includeNote = includeSource ? `／include: ${includeSource.path}` : "";
    setStatus(`${file.name} を読み込みました（基本言語: ${summary.baseLanguage}／言語: ${summary.languages.join(", ")}／パターン: ${summary.patterns}${includeNote}）`);
  } catch (error) {
    setStatus(`XMLを読み込めません: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
}

async function resolveMainInclude(xmlText) {
  if (/MCQ_WEBAPP_DATA_BASE64:/.test(xmlText)) return null;
  const documentNode = new DOMParser().parseFromString(xmlText, "application/xml");
  const variables = documentNode.querySelector("questionvariables > text")?.textContent || "";
  const main = extractMainVariableSection(variables);
  const match = stripMaximaComments(main).match(/stack_include\s*\(\s*"([^"]+)"\s*\)/);
  if (!match) return null;
  const url = match[1];
  const path = includePathFromUrl(url);
  const candidates = [];
  if (path) candidates.push(new URL(`../../${path}`, window.location.href).href);
  candidates.push(url);
  let lastError = "";
  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { url: path ? publicIncludeUrl(path) : url, path: path || url, filename: basenameFromPath(path || url), content: await response.text() };
    } catch (error) {
      lastError = error.message;
    }
  }
  throw new Error(`includeファイル ${path || url} を取得できませんでした（${lastError}）`);
}

function includePathFromUrl(url) {
  const prefixes = [
    "https://stack.mathedu.jp/sc/",
    "https://yositomi-opu.github.io/stack_questions/",
  ];
  const prefix = prefixes.find((candidate) => url.startsWith(candidate));
  if (!prefix) return "";
  const path = decodeURIComponent(url.slice(prefix.length)).replace(/^\/+/, "");
  return path.split("/").some((part) => part === "..") ? "" : path;
}

function publicIncludeUrl(path) {
  const encodedPath = String(path).split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://yositomi-opu.github.io/stack_questions/${encodedPath}`;
}

function basenameFromPath(value) {
  return String(value || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function importXmlText(xmlText, filename = "", includeSource = null) {
  const documentNode = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentNode.querySelector("parsererror")) throw new Error("XMLの構文が不正です");
  const variables = documentNode.querySelector("questionvariables > text")?.textContent || "";
  if (!variables.trim()) throw new Error("questionvariables が見つかりません");
  const metadata = variables.match(/MCQ_WEBAPP_DATA_BASE64:([A-Za-z0-9+/=]+)/)?.[1];
  if (metadata) {
    applyAppStateSnapshot(decodeAppMetadata(metadata));
  } else {
    importLegacyQuestionVariables(includeSource?.content || variables, documentNode, filename, variables);
    state.includeSource = includeSource;
    el.downloadIncludeButton.hidden = !includeSource;
  }
  renderRows();
  updateCorrectCountControls();
  updateQuestionLanguageVisibility();
  updateBaseLanguageUi();
  updateOutput();
  return {
    baseLanguage: baseLang(),
    languages: activeLangs(),
    patterns: groupPatterns().length,
  };
}

function applyAppStateSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rows)) throw new Error("再編集用データが不正です");
  el.questionId.value = baseTitle(snapshot.questionId);
  setMode(snapshot.mode === "cb" ? "cb" : "rb");
  el.baseLanguage.value = normalizeLang(snapshot.baseLanguage);
  LANGS.forEach((lang) => {
    el.languageChecks[lang].checked = (snapshot.activeLanguages || []).includes(lang) || lang === el.baseLanguage.value;
    const question = snapshot.questions?.[lang] || {};
    el.questions[lang].value = String(question.value || "");
    state.questionTypes[lang] = normalizeValueType(question.type);
    el.questionModes[lang].value = state.questionTypes[lang];
    el.questionModes[lang].closest(".question-language-field")?.classList.toggle("cas", state.questionTypes[lang] === "cas");
  });
  state.rows = structuredClone(snapshot.rows);
  el.qvars.value = String(snapshot.qvars || "");
  state.qvars = [el.qvars.value];
  el.numOptions.value = String(snapshot.settings?.numOptions || 2);
  el.numCorrect.value = String(snapshot.settings?.numCorrect ?? 1);
  el.randomCorrect.checked = Boolean(snapshot.settings?.randomCorrect);
  el.correctCounts.value = String(snapshot.settings?.correctCounts || "1, 2");
  el.requirePairs.checked = snapshot.settings?.requirePairs !== false;
  state.translationsStale = false;
  state.includeSource = snapshot.includeSource ? {
    url: String(snapshot.includeSource.url || ""),
    path: String(snapshot.includeSource.path || ""),
    filename: String(snapshot.includeSource.filename || basenameFromPath(snapshot.includeSource.path) || "include.txt"),
  } : null;
  el.downloadIncludeButton.hidden = !state.includeSource;
}

function importLegacyQuestionVariables(variables, documentNode, filename, xmlVariables = variables) {
  const main = extractMainVariableSection(variables);
  const uncommented = stripMaximaComments(main);
  const statements = splitMaximaStatements(uncommented);
  const assignments = statements.map(parseMaximaAssignment).filter(Boolean);
  const qtextAssignment = assignments.find((item) => item.name === "%__mcq_qtextL");
  if (!qtextAssignment) throw new Error("%__mcq_qtextL を解析できません");
  const qtextAssoc = extractLanguageAssociation(qtextAssignment.expression);
  if (!qtextAssoc) throw new Error("問題文の多言語連想配列を解析できません");

  const detectedLangs = [...qtextAssoc.keys()].filter((lang) => LANGS.includes(lang));
  const base = detectedLangs.includes("ja") ? "ja" : detectedLangs[0] || "ja";
  el.baseLanguage.value = base;
  LANGS.forEach((lang) => {
    el.languageChecks[lang].checked = detectedLangs.includes(lang) || lang === base;
    const item = qtextAssoc.get(lang);
    if (!item) return;
    const typed = typedFromAst(item);
    el.questions[lang].value = typed.value;
    state.questionTypes[lang] = typed.type;
    el.questionModes[lang].value = typed.type;
  });

  const cOptions = managedAssignments(assignments, /^%__CoptL?(\d+)L?$/, detectedLangs);
  const wOptions = managedAssignments(assignments, /^%__WoptL?(\d+)L?$/, detectedLangs);
  const cMessages = managedAssignments(assignments, /^%__Cmsg(\d+)L?$/, detectedLangs);
  const wMessages = managedAssignments(assignments, /^%__Wmsg(\d+)L?$/, detectedLangs);
  const allLegacyLangs = [...new Set([
    ...detectedLangs,
    ...[...cOptions, ...wOptions, ...cMessages, ...wMessages].flatMap((item) => [...item.assoc.keys()]),
  ])].filter((lang) => LANGS.includes(lang));
  allLegacyLangs.forEach((lang) => { el.languageChecks[lang].checked = true; });
  const cData = optionPatternData(cOptions, base);
  const wData = optionPatternData(wOptions, base);
  const patternCount = Math.max(cData.patterns.length, wData.patterns.length);
  if (!patternCount) throw new Error("選択肢の多言語連想配列を解析できません");

  const rows = [];
  for (let patternIndex = 0; patternIndex < patternCount; patternIndex += 1) {
    const pattern = String(patternIndex + 1).padStart(2, "0");
    appendImportedRows(rows, pattern, "C", patternIndex, cData, cMessages, allLegacyLangs);
    appendImportedRows(rows, pattern, "W", patternIndex, wData, wMessages, allLegacyLangs);
  }
  if (!rows.length) throw new Error("選択肢を復元できません");
  state.rows = rows;

  const managed = /^(?:%__mcq_qtextL|%__[CW](?:optL?|msg)\d+L?|%__mcq_pattern_order)$/;
  if (variables !== xmlVariables) {
    el.qvars.value = createIncludeEditSkeleton(variables);
  } else {
    const qvarStatements = statements.filter((statement) => {
      if (/^\s*if not numberp\(%_MCQ_NUM_(?:OPTS|COPTS)\)/.test(statement)) return false;
      const parsed = parseMaximaAssignment(statement);
      if (!parsed) return statement.trim();
      if (managed.test(parsed.name)) return false;
      return true;
    });
    el.qvars.value = qvarStatements.map((item) => item.trim()).filter(Boolean).join("\n");
  }
  state.qvars = [el.qvars.value];

  const xmlName = documentNode.querySelector("question > name > text")?.textContent?.trim();
  el.questionId.value = baseTitle(xmlName || filename);
  setMode(/%__mcq_rb_cb\s*:\s*"cb"/.test(xmlVariables) || documentNode.querySelector('input > type')?.textContent === "checkbox" ? "cb" : "rb");
  const numOptions = variables.match(/%_MCQ_NUM_OPTS\s*:\s*(\d+)/)?.[1];
  const numCorrect = variables.match(/%_MCQ_NUM_COPTS\s*:\s*(\d+)/)?.[1];
  el.numOptions.value = numOptions || String(Math.min(2, patternCount));
  el.numCorrect.value = numCorrect || "1";
  el.randomCorrect.checked = /%_MCQ_NUM_COPTS\s*:\s*rand\s*\(/.test(variables);
  const correctCounts = variables.match(/%_MCQ_NUM_COPTS\s*:\s*rand\s*\(\s*\[([^\]]+)\]/)?.[1];
  if (correctCounts) el.correctCounts.value = correctCounts.trim();
  el.requirePairs.checked = cData.paired && wData.paired;
  state.translationsStale = false;
}

function extractMainVariableSection(code) {
  const match = code.match(/MAIN QUESTION VARIABLES[^\n]*\*\/([\s\S]*?)\/\*+\s*END OF MAIN QUESTION VARIABLES/i);
  return match ? match[1] : code;
}

function stripMaximaComments(code) {
  let output = "";
  let quoted = false;
  let escaped = false;
  let commentDepth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1];
    if (commentDepth) {
      if (char === "/" && next === "*") { commentDepth += 1; index += 1; }
      else if (char === "*" && next === "/") { commentDepth -= 1; index += 1; }
      continue;
    }
    if (!quoted && char === "/" && next === "*") { commentDepth = 1; index += 1; continue; }
    output += char;
    if (quoted && char === "\\" && !escaped) { escaped = true; continue; }
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = false;
  }
  return output;
}

function splitMaximaStatements(code) {
  const statements = [];
  let start = 0;
  let quoted = false;
  let escaped = false;
  let depth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    if (quoted && char === "\\" && !escaped) { escaped = true; continue; }
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = false;
    if (quoted) continue;
    if ("([{ ".includes(char) && char !== " ") depth += 1;
    if (")]}`".includes(char)) depth = Math.max(0, depth - 1);
    if ((char === ";" || char === "$") && depth === 0) {
      statements.push(code.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (code.slice(start).trim()) statements.push(code.slice(start));
  return statements;
}

function parseMaximaAssignment(statement) {
  const match = statement.trim().match(/^([%A-Za-z_][%A-Za-z0-9_]*)\s*:/);
  if (!match) return null;
  return { name: match[1], expression: statement.trim().slice(match[0].length).replace(/[;$]\s*$/, "").trim(), raw: statement };
}

function managedCanonicalName(name) {
  if (name === "%__mcq_qtextL") return "qtext";
  const option = name.match(/^%__([CW])optL?(\d+)L?$/);
  if (option) return `${option[1]}opt${Number(option[2])}`;
  const message = name.match(/^%__([CW])msg(\d+)L?$/);
  if (message) return `${message[1]}msg${Number(message[2])}`;
  return "";
}

function createIncludeEditSkeleton(source) {
  let output = source;
  const ranges = findManagedAssignmentRanges(source);
  ranges.sort((a, b) => b.start - a.start).forEach((range) => {
    output = `${output.slice(0, range.start)}/* MCQ_WEBAPP_SLOT:${range.canonical} */${output.slice(range.end)}`;
  });
  return `${output.trim()}\n`;
}

function findManagedAssignmentRanges(source) {
  const masked = maskMaximaCommentsAndStrings(source);
  const pattern = /%__(?:mcq_qtextL|[CW](?:optL?\d+L?|msg\d+L?))\s*:/g;
  const ranges = [];
  let match;
  while ((match = pattern.exec(masked))) {
    const name = match[0].replace(/\s*:\s*$/, "");
    const canonical = managedCanonicalName(name);
    if (!canonical) continue;
    ranges.push({ start: match.index, end: scanMaximaStatementEnd(source, match.index), canonical, name });
  }
  return ranges;
}

function maskMaximaCommentsAndStrings(source) {
  let output = "";
  let quoted = false;
  let escaped = false;
  let commentDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (commentDepth) {
      if (char === "/" && next === "*") { output += "  "; commentDepth += 1; index += 1; continue; }
      if (char === "*" && next === "/") { output += "  "; commentDepth -= 1; index += 1; continue; }
      output += char === "\n" ? "\n" : " ";
      continue;
    }
    if (!quoted && char === "/" && next === "*") { output += "  "; commentDepth = 1; index += 1; continue; }
    if (quoted) {
      output += char === "\n" ? "\n" : " ";
      if (char === "\\" && !escaped) { escaped = true; continue; }
      if (char === '"' && !escaped) quoted = false;
      escaped = false;
      continue;
    }
    if (char === '"') { quoted = true; output += " "; }
    else output += char;
  }
  return output;
}

function scanMaximaStatementEnd(source, start) {
  let quoted = false;
  let escaped = false;
  let commentDepth = 0;
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (commentDepth) {
      if (char === "/" && next === "*") { commentDepth += 1; index += 1; }
      else if (char === "*" && next === "/") { commentDepth -= 1; index += 1; }
      continue;
    }
    if (!quoted && char === "/" && next === "*") { commentDepth = 1; index += 1; continue; }
    if (quoted && char === "\\" && !escaped) { escaped = true; continue; }
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = false;
    if (quoted) continue;
    if ("([{ ".includes(char) && char !== " ") depth += 1;
    else if (")]}".includes(char)) depth = Math.max(0, depth - 1);
    else if ((char === ";" || char === "$") && depth === 0) return index + 1;
  }
  return source.length;
}

function managedAssignments(assignments, pattern, fallbackLangs = []) {
  return assignments.map((item) => {
    const match = item.name.match(pattern);
    if (!match) return null;
    let assoc = extractLanguageAssociation(item.expression);
    const languageIndependent = /^%__(?:C|W)optL?\d+$/.test(item.name);
    if (!assoc) {
      const listStart = item.expression.indexOf("[");
      if (listStart >= 0) {
        try {
          const shared = parseMaximaValue(item.expression, listStart).node;
          assoc = new Map(fallbackLangs.map((lang) => [lang, shared]));
      } catch { /* leave unsupported expressions untouched */ }
      }
      if (!assoc && item.expression.trim()) {
        const shared = { kind: "raw", value: item.expression.trim() };
        assoc = new Map(fallbackLangs.map((lang) => [lang, shared]));
      }
    }
    return assoc ? { ...item, slot: Number(match[1]), assoc, languageIndependent } : null;
  }).filter((item) => item?.assoc).sort((a, b) => a.slot - b.slot);
}

function extractLanguageAssociation(expression) {
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] !== "[") continue;
    try {
      const parsed = parseMaximaValue(expression, index);
      if (parsed.node.kind !== "list") continue;
      const entries = parsed.node.items;
      if (!entries.length || !entries.every((entry) => entry.kind === "list" && entry.items[0]?.kind === "string" && LANGS.includes(entry.items[0].value))) continue;
      return new Map(entries.map((entry) => [entry.items[0].value, entry.items[1]]));
    } catch { /* try the next list */ }
  }
  return null;
}

function parseMaximaValue(text, start) {
  let index = skipWhitespace(text, start);
  if (text[index] === '"') {
    let value = "";
    index += 1;
    while (index < text.length) {
      if (text[index] === "\\" && index + 1 < text.length) {
        const escaped = text[index + 1];
        value += escaped === "n" ? "\n" : escaped;
        index += 2;
      } else if (text[index] === '"') {
        return { node: { kind: "string", value }, index: index + 1 };
      } else value += text[index++];
    }
    throw new Error("文字列が閉じていません");
  }
  if (text[index] === "[") {
    const items = [];
    index += 1;
    while (index < text.length) {
      index = skipWhitespace(text, index);
      if (text[index] === "]") {
        index += 1;
        while (text[skipWhitespace(text, index)] === "[") index = skipBalanced(text, skipWhitespace(text, index), "[", "]");
        return { node: { kind: "list", items }, index };
      }
      const parsed = parseMaximaValue(text, index);
      items.push(parsed.node);
      index = skipWhitespace(text, parsed.index);
      if (text[index] === ",") index += 1;
      else if (text[index] !== "]") throw new Error("リストの区切りが不正です");
    }
    throw new Error("リストが閉じていません");
  }
  const rawStart = index;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  while (index < text.length) {
    const char = text[index];
    if (quoted && char === "\\" && !escaped) { escaped = true; index += 1; continue; }
    if (char === '"' && !escaped) quoted = !quoted;
    escaped = false;
    if (!quoted) {
      if ("([{ ".includes(char) && char !== " ") depth += 1;
      else if (")]}".includes(char)) {
        if (depth === 0 && char === "]") break;
        depth = Math.max(0, depth - 1);
      } else if (char === "," && depth === 0) break;
    }
    index += 1;
  }
  return { node: { kind: "raw", value: text.slice(rawStart, index).trim() }, index };
}

function skipWhitespace(text, index) {
  while (/\s/.test(text[index] || "")) index += 1;
  return index;
}

function skipBalanced(text, start, open, close) {
  let depth = 0;
  let quoted = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && text[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (char === open) depth += 1;
    if (char === close && --depth === 0) return index + 1;
  }
  return text.length;
}

function typedFromAst(node) {
  if (!node) return { type: "text", value: "" };
  return node.kind === "string" ? { type: "text", value: node.value } : { type: "cas", value: node.value || "" };
}

function optionPatternData(assignments, base) {
  if (!assignments.length) return { paired: false, patterns: [], languages: new Map(), listExpressions: [], languageIndependent: [] };
  const firstValue = assignments[0].assoc.get(base);
  const nestedPatterns = firstValue?.kind === "list" && firstValue.items.every((item) => item.kind === "list");
  if (nestedPatterns) {
    return { paired: true, patterns: firstValue.items, languages: assignments[0].assoc, listExpressions: firstValue.items.map(() => false), languageIndependent: firstValue.items.map(() => assignments[0].languageIndependent) };
  }
  return {
    paired: false,
    patterns: assignments.map((item) => item.assoc.get(base)).filter(Boolean),
    languages: new Map(LANGS.map((lang) => [lang, { kind: "list", items: assignments.map((item) => item.assoc.get(lang)).filter(Boolean) }])),
    listExpressions: assignments.map((item) => item.assoc.get(base)?.kind === "raw"),
    languageIndependent: assignments.map((item) => item.languageIndependent),
  };
}

function appendImportedRows(target, pattern, truth, patternIndex, optionData, messageAssignments, languages) {
  const basePattern = optionData.patterns[patternIndex];
  const baseChoices = basePattern?.kind === "list" ? basePattern.items : basePattern ? [basePattern] : [];
  baseChoices.forEach((baseChoice, choiceIndex) => {
    const row = { pattern, truth };
    languages.forEach((lang) => {
      const langRoot = optionData.languages.get(lang);
      const langPattern = optionData.paired ? langRoot?.items?.[patternIndex] : langRoot?.items?.[patternIndex];
      const langChoices = langPattern?.kind === "list" ? langPattern.items : langPattern ? [langPattern] : [];
      const typedChoice = typedFromAst(langChoices[choiceIndex] || (lang === baseLang() ? baseChoice : null));
      row[`choice_${lang}`] = typedChoice.value;
      row[`choice_type_${lang}`] = typedChoice.type;
      row[`choice_list_expr_${lang}`] = Boolean(optionData.listExpressions?.[patternIndex] && typedChoice.type === "cas");
      row.choice_language_independent = Boolean(optionData.languageIndependent?.[patternIndex]);
    });
    target.push(row);
  });
  const firstRow = target.find((row) => row.pattern === pattern && row.truth === truth);
  if (!firstRow) return;
  languages.forEach((lang) => {
    const messages = messageAssignments[0]?.assoc?.get(lang);
    const messageNode = messages?.kind === "list" ? messages.items[patternIndex] : messageAssignments[patternIndex]?.assoc?.get(lang);
    const typedMessage = typedFromAst(messageNode);
    firstRow[`feedback_${lang}`] = typedMessage.value;
    firstRow[`feedback_type_${lang}`] = typedMessage.type;
  });
}

async function readWorkbook(file) {
  if (!window.XLSX) throw new Error("XLSXライブラリ読込待ち");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
}

async function readDelimited(file) {
  const delimiter = file.name.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  return parseDelimited(await file.text(), delimiter);
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  rows.push(row);
  return rows;
}

function applyRecords(records) {
  const rows = [];
  const feedback = new Map();
  const qvars = [];
  const qtexts = {};

  records.filter((record) => record.some((value) => String(value).trim())).forEach((record) => {
    const kind = String(record[0] || "").trim().toLowerCase();
    if (kind === "qtextl") {
      const type = isValueType(record[2]) ? normalizeValueType(record[2]) : "text";
      qtexts[normalizeLang(record[1])] = { type, value: String(record.slice(isValueType(record[2]) ? 3 : 2).join(",")).trim() };
    } else if (kind === "qvar") {
      qvars.push(String(record.slice(2).join(",")).trim());
    } else if (kind === "option") {
      const pattern = String(record[1] || "").trim();
      const truth = normalizeTruth(record[2]);
      const hasLang = LANGS.includes(String(record[3] || "").trim().toLowerCase()) && record.length >= 5;
      const lang = hasLang ? normalizeLang(record[3]) : "ja";
      const typeIndex = hasLang ? 4 : 3;
      const rawType = isValueType(record[typeIndex]) ? String(record[typeIndex]).trim().toLowerCase() : "text";
      const type = normalizeValueType(rawType);
      const independenceIndex = typeIndex + (isValueType(record[typeIndex]) ? 1 : 0);
      const independenceToken = String(record[independenceIndex] || "").trim().toLowerCase();
      const hasIndependence = ["independent", "dependent"].includes(independenceToken);
      const choice = String(record.slice(independenceIndex + (hasIndependence ? 1 : 0)).join(",")).trim();
      let row = rows.find((item) => item.pattern === pattern && item.truth === truth && !item[`choice_${lang}`]);
      if (!row) {
        row = { pattern, truth };
        rows.push(row);
      }
      row[`choice_${lang}`] = choice;
      row[`choice_type_${lang}`] = type;
      row[`choice_list_expr_${lang}`] = rawType === "cas_list";
      if (hasIndependence) row.choice_language_independent = independenceToken === "independent";
    } else if (kind === "feedback") {
      const pattern = String(record[1] || "").trim();
      const truthToken = String(record[2] || "").trim();
      const hasTruth = isTruthToken(truthToken);
      const langIndex = hasTruth ? 3 : 2;
      const hasLang = LANGS.includes(String(record[langIndex] || "").trim().toLowerCase());
      const lang = hasLang ? normalizeLang(record[langIndex]) : "ja";
      const possibleTypeIndex = hasLang ? langIndex + 1 : langIndex;
      const type = isValueType(record[possibleTypeIndex]) ? normalizeValueType(record[possibleTypeIndex]) : "text";
      const valueIndex = possibleTypeIndex + (isValueType(record[possibleTypeIndex]) ? 1 : 0);
      const value = String(record.slice(valueIndex).join(",")).trim();
      const key = hasTruth ? `${pattern}:${normalizeTruth(truthToken)}` : pattern;
      if (!feedback.has(key)) feedback.set(key, {});
      feedback.get(key)[`feedback_${lang}`] = value;
      feedback.get(key)[`feedback_type_${lang}`] = type;
    } else if (kind === "config") {
      applyConfig(String(record[1] || "").trim().toLowerCase(), String(record.slice(2).join(",")).trim());
    }
  });

  rows.forEach((row) => {
    Object.assign(row, feedback.get(`${row.pattern}:${row.truth}`) || feedback.get(row.pattern) || {});
  });
  if (!rows.length) throw new Error("option 行を読み込めませんでした");
  LANGS.forEach((lang) => {
    if (qtexts[lang] != null) {
      el.questions[lang].value = qtexts[lang].value;
      state.questionTypes[lang] = qtexts[lang].type;
      el.questionModes[lang].value = qtexts[lang].type;
      el.questionModes[lang].closest(".question-language-field")?.classList.toggle("cas", qtexts[lang].type === "cas");
      el.languageChecks[lang].checked = true;
    }
  });
  updateQuestionLanguageVisibility();
  state.rows = rows;
  state.qvars = qvars;
  el.qvars.value = qvars.join("\n");
  state.translationsStale = false;
  updateCorrectCountControls();
}

function applyConfig(key, value) {
  if (key === "question_id" || key === "id") el.questionId.value = baseTitle(value);
  if (key === "mode") setMode(value.toLowerCase().startsWith("c") ? "cb" : "rb");
  if (key === "num_options") el.numOptions.value = value;
  if (key === "num_correct") el.numCorrect.value = value;
  if (key === "random_correct") el.randomCorrect.checked = parseBoolean(value);
  if (key === "correct_counts") el.correctCounts.value = value;
  if (key === "require_pairs") el.requirePairs.checked = parseBoolean(value);
  if (key === "base_language") {
    el.baseLanguage.value = normalizeLang(value);
    el.languageChecks[el.baseLanguage.value].checked = true;
    updateBaseLanguageUi();
    updateQuestionLanguageVisibility();
  }
}

function downloadSampleCsv() {
  const records = [
    ["config", "question_id", "000.sample-mcq"],
    ["config", "mode", state.mode],
    ["config", "num_options", "2"],
    ["config", "num_correct", "1"],
    ["config", "random_correct", el.randomCorrect.checked ? "true" : "false"],
    ["config", "correct_counts", el.correctCounts.value],
    ["config", "require_pairs", el.requirePairs.checked ? "true" : "false"],
    ["config", "base_language", baseLang()],
    ["qtextL", "ja", "次のうち正しいものを __SELTYPE__."],
    ["qtextL", "en", "__SELTYPE__ the correct statement."],
    ["qvar", "", "aa1:rand([1, 2, 3])"],
    ["qvar", "", "aa2:rand([3, 4, 5])"],
  ];
  if (el.requirePairs.checked) {
    records.push(
      ["option", "01", "C", "太陽は恒星である"],
      ["option", "01", "W", "太陽は惑星である"],
      ["feedback", "01", "太陽は自ら光を放つ恒星です。"],
      ["option", "02", "C", "地球は惑星である"],
      ["option", "02", "W", "地球は恒星である"],
      ["feedback", "02", "地球は太陽の周りを公転する惑星です。"]
    );
  } else {
    records.push(
      ["option", "01", "C", "\\(x^2=1\\) の解は \\(x=1,-1\\) である"],
      ["option", "01", "C", "\\(x^2-1=0\\) の解は \\(x=\\pm1\\) である"],
      ["feedback", "01", "C", "因数分解すると \\((x-1)(x+1)=0\\) です。"],
      ["option", "02", "W", "\\(x^2=1\\) の解は \\(x=1\\) だけである"],
      ["option", "02", "W", "\\(x^2-1=0\\) の解は正の数だけである"],
      ["feedback", "02", "W", "負の解 \\(x=-1\\) もあります。"]
    );
  }
  downloadText("mcq_sample.csv", `\ufeff${records.map(csvLine).join("\n")}`, "text/csv;charset=utf-8");
}

function downloadCurrentCsv() {
  const title = titleForSave();
  if (!title) return;
  const records = [
    ["config", "question_id", title],
    ["config", "mode", state.mode],
    ["config", "num_options", el.numOptions.value],
    ["config", "num_correct", el.numCorrect.value],
    ["config", "random_correct", el.randomCorrect.checked ? "true" : "false"],
    ["config", "correct_counts", el.correctCounts.value],
    ["config", "require_pairs", el.requirePairs.checked ? "true" : "false"],
    ["config", "base_language", baseLang()],
  ];

  LANGS.forEach((lang) => {
    const value = el.questions[lang].value.trim();
    if (value) records.push(["qtextL", lang, state.questionTypes[lang] || "text", value]);
  });
  state.qvars
    .map((expression) => String(expression).trim())
    .filter(Boolean)
    .forEach((expression) => records.push(["qvar", "", expression]));

  state.rows.forEach((row) => {
    LANGS.forEach((lang) => {
      const value = String(row[`choice_${lang}`] || "").trim();
      if (!value) return;
      const type = row[`choice_list_expr_${lang}`] ? "cas_list" : (row[`choice_type_${lang}`] || "text");
      records.push([
        "option",
        row.pattern,
        normalizeTruth(row.truth),
        lang,
        type,
        row.choice_language_independent ? "independent" : "dependent",
        value,
      ]);
    });
  });

  const writtenFeedback = new Set();
  state.rows.forEach((row) => {
    const key = feedbackGroupKey(row);
    if (writtenFeedback.has(key)) return;
    writtenFeedback.add(key);
    const groupRows = state.rows.filter((candidate) => feedbackGroupKey(candidate) === key);
    LANGS.forEach((lang) => {
      const source = groupRows.find((candidate) => String(candidate[`feedback_${lang}`] || "").trim());
      const value = String(source?.[`feedback_${lang}`] || "").trim();
      if (!value) return;
      const base = el.requirePairs.checked
        ? ["feedback", row.pattern]
        : ["feedback", row.pattern, normalizeTruth(row.truth)];
      records.push([...base, lang, source?.[`feedback_type_${lang}`] || "text", value]);
    });
  });

  const filename = `${title}.csv`;
  downloadText(filename, `\ufeff${records.map(csvLine).join("\n")}`, "text/csv;charset=utf-8");
  setStatus(`${filename} を保存しました`);
}

function csvLine(values) {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
}

function downloadXml() {
  const title = titleForSave();
  if (!title) return;
  try {
    const xml = generateXml();
    el.xmlOutput.value = xml;
    const filename = `${xmlFileStem(title)}.xml`;
    downloadText(filename, xml, "application/xml;charset=utf-8");
    setStatus(`${filename} を保存しました`);
  } catch (error) {
    setStatus(`XMLを保存できません: ${error.message}`, true);
  }
}

function downloadIncludeFile() {
  if (!state.includeSource) {
    setStatus("includeファイルを使用するXMLが読み込まれていません", true);
    return;
  }
  try {
    const title = titleForSave();
    if (!title) return;
    const filename = `${title}.txt`;
    downloadText(filename, generateIncludeFileContent(), "text/plain;charset=utf-8");
    setStatus(`${filename} を保存しました。XML内のstack_includeは維持されます`);
  } catch (error) {
    setStatus(`includeファイルを保存できません: ${error.message}`, true);
  }
}

function titleForSave() {
  let value = el.questionId.value.trim();
  if (!value) {
    value = window.prompt("タイトルが未入力です。保存するファイルのタイトルを入力してください。", "NurseSample001")?.trim() || "";
    if (!value) {
      setStatus("タイトルが未入力のため保存を中止しました", true);
      el.questionId.focus();
      return "";
    }
    el.questionId.value = value;
    updateOutput();
  }
  const title = baseTitle(value);
  if (!title) {
    setStatus("保存に使用できるタイトルを入力してください", true);
    el.questionId.focus();
    return "";
  }
  if (el.questionId.value !== title) {
    el.questionId.value = title;
    updateOutput();
  }
  return title;
}

async function copyXml() {
  await navigator.clipboard.writeText(el.xmlOutput.value);
  setStatus("コピーしました");
}

async function copyCasDebugCode() {
  try {
    const code = state.includeSource ? generateIncludeFileContent() : generateVariableBlock();
    await navigator.clipboard.writeText(code);
    setStatus("XMLへ記述するCAS検証用コードをコピーしました");
  } catch (error) {
    setStatus(`CAS検証用コードをコピーできません: ${error.message}`, true);
  }
}

function generateIncludeFileContent() {
  const generated = generateVariableBlock();
  const generatedAssignments = splitMaximaStatements(stripMaximaComments(generated))
    .map(parseMaximaAssignment)
    .filter(Boolean);
  const managed = new Map();
  generatedAssignments.forEach((assignment) => {
    const canonical = managedCanonicalName(assignment.name);
    if (canonical) managed.set(canonical, assignment.raw.trim());
  });

  let output = el.qvars.value;
  const numOptions = positiveInt(el.numOptions.value, "選択肢数");
  const counts = correctCountChoices(numOptions);
  const correctExpression = counts.length === 1 ? String(counts[0]) : `rand([${counts.join(", ")}])`;
  output = output.replace(
    /if\s+not\s+numberp\(%_MCQ_NUM_OPTS\)\s+then\s+%_MCQ_NUM_OPTS\s*:[^;$]*(?:;|\$)/,
    `if not numberp(%_MCQ_NUM_OPTS) then %_MCQ_NUM_OPTS:${numOptions};`
  );
  output = output.replace(
    /if\s+not\s+numberp\(%_MCQ_NUM_COPTS\)\s+then\s+%_MCQ_NUM_COPTS\s*:[^;$]*(?:;|\$)/,
    `if not numberp(%_MCQ_NUM_COPTS) then %_MCQ_NUM_COPTS:${correctExpression};`
  );

  const used = new Set();
  output = output.replace(/\/\*\s*MCQ_WEBAPP_SLOT:([A-Za-z0-9]+)\s*\*\//g, (marker, canonical) => {
    const replacement = managed.get(canonical);
    if (!replacement) return marker;
    used.add(canonical);
    return replacement;
  });

  const additions = [...managed.entries()].filter(([canonical]) => !used.has(canonical)).map(([, statement]) => statement);
  if (additions.length) {
    const eofIndex = output.search(/\/\*+\s*EOF/i);
    const insertion = `\n\n${additions.join("\n\n")}\n`;
    output = eofIndex >= 0
      ? `${output.slice(0, eofIndex)}${insertion}${output.slice(eofIndex)}`
      : `${output.trimEnd()}${insertion}`;
  }
  return output.trim();
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function normalizeTruth(value) {
  return ["c", "correct", "true", "1", "正解", "真"].includes(String(value ?? "").trim().toLowerCase()) ? "C" : "W";
}

function isTruthToken(value) {
  return ["c", "w", "correct", "wrong", "true", "false", "1", "0", "正解", "誤答", "真", "偽"]
    .includes(String(value ?? "").trim().toLowerCase());
}

function parseBoolean(value) {
  return ["true", "1", "yes", "on", "必須"].includes(String(value ?? "").trim().toLowerCase());
}

function isValueType(value) {
  return ["text", "string", "cas", "cas_list", "expression", "式", "文字列"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizeValueType(value) {
  return ["cas", "cas_list", "expression", "式"].includes(String(value ?? "").trim().toLowerCase()) ? "cas" : "text";
}
function normalizeLang(value) {
  const lang = String(value || "ja").trim().toLowerCase();
  return LANGS.includes(lang) ? lang : "ja";
}

function positiveInt(value, label) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) throw new Error(`${label}が不正です`);
  return number;
}

function nonNegativeInt(value, label) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label}が不正です`);
  return number;
}

function cleanId(value) {
  return String(value || "").trim().replace(/[^\w.-]+/g, "_");
}

function baseTitle(value) {
  return cleanId(basenameFromPath(value))
    .replace(/\.(?:xml|csv|txt)$/i, "")
    .replace(/^001\./i, "")
    .replace(/-(?:cb|rb)$/i, "");
}

function xmlFileStem(title) {
  return `001.${baseTitle(title)}-${state.mode}`;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function upperFirst(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function nextPattern() {
  const values = state.rows.map((row) => Number(row.pattern) || 0);
  return String(Math.max(0, ...values) + 1).padStart(2, "0");
}

function setStatus(message, isError = false) {
  el.statusLine.textContent = message;
  el.statusLine.classList.toggle("error", isError);
}
