const LANGS = ["ja", "en", "fr", "de", "it"];
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
};

const el = {
  questionId: document.querySelector("#questionId"),
  modeRb: document.querySelector("#modeRb"),
  modeCb: document.querySelector("#modeCb"),
  numOptions: document.querySelector("#numOptions"),
  numCorrect: document.querySelector("#numCorrect"),
  fileInput: document.querySelector("#fileInput"),
  qvars: document.querySelector("#qvars"),
  rowsBody: document.querySelector("#rowsBody"),
  xmlOutput: document.querySelector("#xmlOutput"),
  statusLine: document.querySelector("#statusLine"),
  addRowButton: document.querySelector("#addRowButton"),
  clearRowsButton: document.querySelector("#clearRowsButton"),
  sampleCsvButton: document.querySelector("#sampleCsvButton"),
  downloadButton: document.querySelector("#downloadButton"),
  copyButton: document.querySelector("#copyButton"),
  questions: Object.fromEntries(
    LANGS.map((lang) => [lang, document.querySelector(`#question${upperFirst(lang)}`)])
  ),
};

init();

async function init() {
  bindEvents();
  renderRows();
  await loadTemplates();
  updateOutput();
}

function bindEvents() {
  el.modeRb.addEventListener("click", () => setMode("rb"));
  el.modeCb.addEventListener("click", () => setMode("cb"));
  el.addRowButton.addEventListener("click", () => {
    state.rows.push({ pattern: nextPattern(), truth: "C", choice_ja: "", feedback_ja: "" });
    renderRows();
    updateOutput();
  });
  el.clearRowsButton.addEventListener("click", () => {
    state.rows = [];
    renderRows();
    updateOutput();
  });
  el.fileInput.addEventListener("change", readSelectedFile);
  el.sampleCsvButton.addEventListener("click", downloadSampleCsv);
  el.downloadButton.addEventListener("click", downloadXml);
  el.copyButton.addEventListener("click", copyXml);
  [el.questionId, el.numOptions, el.numCorrect, ...Object.values(el.questions)].forEach((node) => {
    node.addEventListener("input", updateOutput);
  });
  el.qvars.addEventListener("input", () => {
    state.qvars = [el.qvars.value];
    updateOutput();
  });
}

async function loadTemplates() {
  try {
    const [rb, cb] = await Promise.all([
      fetch("../../001.MCQ-rb.xml").then(checkResponse).then((r) => r.text()),
      fetch("../../001.MCQ-cb.xml").then(checkResponse).then((r) => r.text()),
    ]);
    state.templates = { rb, cb };
    setStatus("テンプレート読込完了");
  } catch (error) {
    setStatus("テンプレートを読めません。リポジトリのルートでローカルサーバーを起動してください。", true);
  }
}

function checkResponse(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

function setMode(mode) {
  state.mode = mode;
  el.modeRb.classList.toggle("active", mode === "rb");
  el.modeCb.classList.toggle("active", mode === "cb");
  updateOutput();
}

function renderRows() {
  el.rowsBody.replaceChildren();
  state.rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.append(
      cell(textInput(row, index, "pattern", "01")),
      cell(truthSelect(row, index)),
      cell(textareaInput(row, index, "choice_ja")),
      cell(textareaInput(row, index, "feedback_ja")),
      cell(removeButton(index))
    );
    el.rowsBody.append(tr);
  });
}

function cell(child) {
  const td = document.createElement("td");
  td.append(child);
  return td;
}

function truthSelect(row, index) {
  const select = document.createElement("select");
  select.innerHTML = '<option value="C">真の場合 (C)</option><option value="W">偽の場合 (W)</option>';
  select.value = normalizeTruth(row.truth);
  select.addEventListener("change", () => {
    state.rows[index].truth = select.value;
    updateOutput();
  });
  return select;
}

function textInput(row, index, key, fallback = "") {
  const input = document.createElement("input");
  input.value = row[key] ?? fallback;
  input.addEventListener("input", () => {
    state.rows[index][key] = input.value;
    updateOutput();
  });
  return input;
}

function textareaInput(row, index, key) {
  const textarea = document.createElement("textarea");
  textarea.rows = 2;
  textarea.value = row[key] ?? "";
  textarea.addEventListener("input", () => {
    state.rows[index][key] = textarea.value;
    updateOutput();
  });
  return textarea;
}

function removeButton(index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-row";
  button.textContent = "×";
  button.title = "削除";
  button.addEventListener("click", () => {
    state.rows.splice(index, 1);
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
    el.xmlOutput.value = "";
    setStatus(error.message, true);
  }
}

function generateXml() {
  const template = state.templates[state.mode];
  if (!template) throw new Error("テンプレート読込待ち");
  const id = cleanId(el.questionId.value);
  const variableBlock = generateVariableBlock();
  const patternCount = groupPatterns().length;
  const numCorrect = nonNegativeInt(el.numCorrect.value, "正解数");
  return template
    .replace(/<name>\s*<text>[\s\S]*?<\/text>\s*<\/name>/, `<name>\n      <text>${escapeXml(id)}</text>\n    </name>`)
    .replace(/%__mcq_rb_cb:"(?:rb|cb)";/, `%__mcq_rb_cb:"${state.mode}";`)
    .replace(/%__mcq_max_cp:\d+;/, `%__mcq_max_cp:${Math.max(5, numCorrect)};`)
    .replace(/%__mcq_max_wp:\d+;/, `%__mcq_max_wp:${Math.max(9, patternCount - numCorrect)};`)
    .replace(
      /(\/\*+\s*MAIN QUESTION VARIABLES\s*\*+\/\s*)[\s\S]*?(\s*\/\*+\s*END OF MAIN QUESTION VARIABLES\s*\*+\/)/,
      `$1\n${variableBlock}\n$2`
    )
    .replace(/<questionnote format="html">\s*<text>[\s\S]*?<\/text>\s*<\/questionnote>/, `<questionnote format="html">\n      <text>${escapeXml(id)}</text>\n    </questionnote>`);
}

function generateVariableBlock() {
  const numOptions = positiveInt(el.numOptions.value, "選択肢数");
  const numCorrect = nonNegativeInt(el.numCorrect.value, "正解数");
  const patterns = groupPatterns();
  if (!patterns.length) throw new Error("命題パターンがありません");
  if (numCorrect > patterns.length) throw new Error("正解数が命題パターン数を超えています");
  if (numOptions > patterns.length) throw new Error("選択肢数が命題パターン数を超えています");
  if (numCorrect > numOptions) throw new Error("正解数が選択肢数を超えています");
  patterns.forEach((pattern) => {
    if (!pattern.C.length || !pattern.W.length) {
      throw new Error(`パターン ${pattern.id} には C と W の両方が必要です`);
    }
  });

  const selectedWrong = numOptions - numCorrect;
  const lines = [
    "/**************** Generated by mcq-webapp ****************/",
    ...normalizedQvars(),
    ...(normalizedQvars().length ? [""] : []),
    `if not numberp(%_MCQ_NUM_OPTS) then %_MCQ_NUM_OPTS:${numOptions};`,
    `if not numberp(%_MCQ_NUM_COPTS) then %_MCQ_NUM_COPTS:${numCorrect};`,
    "",
    `%__mcq_qtextL:${langAssocFromFields()};`,
    "",
    `/* Randomly choose ${numCorrect} true and ${selectedWrong} false proposition patterns. */`,
    `%__mcq_pattern_order:random_permutation(makelist(k, k, 1, ${patterns.length}));`,
    "",
  ];

  for (let index = 0; index < numCorrect; index += 1) {
    appendRandomPattern(lines, "C", index + 1, index + 1, patterns);
  }
  for (let index = 0; index < selectedWrong; index += 1) {
    appendRandomPattern(lines, "W", index + 1, numCorrect + index + 1, patterns);
  }
  lines.push("/**************** End of generated variables ****************/");
  return lines.join("\n");
}

function appendRandomPattern(lines, truth, slot, orderPosition, patterns) {
  const optName = truth === "C" ? `%__CoptL${slot}L` : `%__WoptL${slot}L`;
  const msgName = truth === "C" ? `%__Cmsg${slot}L` : `%__Wmsg${slot}L`;
  lines.push(`${optName}:${randomizedLangAssoc(patterns, truth, orderPosition)};`);
  lines.push(`${msgName}:${randomizedFeedbackAssoc(patterns, orderPosition)};`);
  lines.push("");
}

function randomizedLangAssoc(patterns, truth, orderPosition) {
  const entries = availableLangs(patterns.flatMap((pattern) => pattern[truth]));
  return `[${entries.map((lang) => {
    const choicesByPattern = patterns.map((pattern) => {
      const values = pattern[truth]
        .map((row) => localized(row, "choice", lang))
        .filter(Boolean)
        .map(maximaString);
      return `[${values.join(", ")}]`;
    });
    return `["${lang}", [${choicesByPattern.join(", ")}][%__mcq_pattern_order[${orderPosition}]]]`;
  }).join(", ")}]`;
}

function randomizedFeedbackAssoc(patterns, orderPosition) {
  const allRows = patterns.flatMap((pattern) => [...pattern.C, ...pattern.W]);
  const entries = availableLangs(allRows);
  return `[${entries.map((lang) => {
    const values = patterns.map((pattern) => maximaString(localizedFeedback(pattern, lang)));
    return `["${lang}", [${values.join(", ")}][%__mcq_pattern_order[${orderPosition}]]]`;
  }).join(", ")}]`;
}

function availableLangs(rows) {
  const langs = LANGS.filter((lang) => rows.some((row) => localized(row, "choice", lang)));
  if (!langs.includes("en") && langs.includes("ja")) langs.push("en");
  return langs;
}

function localized(row, field, lang) {
  return String(row[`${field}_${lang}`] || (lang === "en" ? row[`${field}_ja`] : "") || "").trim();
}

function localizedFeedback(pattern, lang) {
  const rows = [...pattern.C, ...pattern.W];
  const exact = rows.find((row) => String(row[`feedback_${lang}`] || "").trim());
  const ja = rows.find((row) => String(row.feedback_ja || "").trim());
  return String(exact?.[`feedback_${lang}`] || (lang === "en" ? ja?.feedback_ja : "") || "").trim();
}

function groupPatterns() {
  const groups = new Map();
  state.rows.forEach((row) => {
    const choice = LANGS.some((lang) => String(row[`choice_${lang}`] || "").trim());
    if (!choice) return;
    const id = String(row.pattern || "").trim() || "01";
    if (!groups.has(id)) groups.set(id, { id, C: [], W: [] });
    groups.get(id)[normalizeTruth(row.truth)].push(row);
  });
  return [...groups.values()].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
}

function langAssocFromFields() {
  return maximaAssoc(
    LANGS.map((lang) => [lang, el.questions[lang].value.trim()]),
    "string"
  );
}

function maximaAssoc(entries, type) {
  const normalized = entries.filter(([, value]) => Array.isArray(value) ? value.length : String(value ?? "").trim());
  const ja = normalized.find(([lang]) => lang === "ja");
  if (!normalized.some(([lang]) => lang === "en") && ja) normalized.push(["en", ja[1]]);
  return `[${normalized.map(([lang, value]) => `["${lang}", ${type === "list" ? `[${value.map(maximaString).join(", ")}]` : maximaString(value)}]`).join(", ")}]`;
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
      qtexts[normalizeLang(record[1])] = String(record.slice(2).join(",")).trim();
    } else if (kind === "qvar") {
      qvars.push(String(record.slice(2).join(",")).trim());
    } else if (kind === "option") {
      const pattern = String(record[1] || "").trim();
      const truth = normalizeTruth(record[2]);
      const hasLang = LANGS.includes(String(record[3] || "").trim().toLowerCase()) && record.length >= 5;
      const lang = hasLang ? normalizeLang(record[3]) : "ja";
      const choice = String(record.slice(hasLang ? 4 : 3).join(",")).trim();
      let row = rows.find((item) => item.pattern === pattern && item.truth === truth && !item[`choice_${lang}`]);
      if (!row) {
        row = { pattern, truth };
        rows.push(row);
      }
      row[`choice_${lang}`] = choice;
    } else if (kind === "feedback") {
      const pattern = String(record[1] || "").trim();
      const hasLang = LANGS.includes(String(record[2] || "").trim().toLowerCase()) && record.length >= 4;
      const lang = hasLang ? normalizeLang(record[2]) : "ja";
      const value = String(record.slice(hasLang ? 3 : 2).join(",")).trim();
      if (!feedback.has(pattern)) feedback.set(pattern, {});
      feedback.get(pattern)[`feedback_${lang}`] = value;
    } else if (kind === "config") {
      applyConfig(String(record[1] || "").trim().toLowerCase(), String(record.slice(2).join(",")).trim());
    }
  });

  rows.forEach((row) => Object.assign(row, feedback.get(row.pattern) || {}));
  if (!rows.length) throw new Error("option 行を読み込めませんでした");
  LANGS.forEach((lang) => {
    if (qtexts[lang] != null) el.questions[lang].value = qtexts[lang];
  });
  state.rows = rows;
  state.qvars = qvars;
  el.qvars.value = qvars.join("\n");
}

function applyConfig(key, value) {
  if (key === "question_id" || key === "id") el.questionId.value = cleanId(value);
  if (key === "mode") setMode(value.toLowerCase().startsWith("c") ? "cb" : "rb");
  if (key === "num_options") el.numOptions.value = value;
  if (key === "num_correct") el.numCorrect.value = value;
}

function downloadSampleCsv() {
  const records = [
    ["config", "question_id", "000.sample-mcq"],
    ["config", "mode", state.mode],
    ["config", "num_options", "2"],
    ["config", "num_correct", "1"],
    ["qtextL", "ja", "次のうち正しいものを __SELTYPE__."],
    ["qtextL", "en", "__SELTYPE__ the correct statement."],
    ["qvar", "", "aa1:rand([1, 2, 3])"],
    ["qvar", "", "aa2:rand([3, 4, 5])"],
    ["option", "01", "C", "太陽は恒星である"],
    ["option", "01", "W", "太陽は惑星である"],
    ["feedback", "01", "太陽は自ら光を放つ恒星です。"],
    ["option", "02", "C", "地球は惑星である"],
    ["option", "02", "W", "地球は恒星である"],
    ["feedback", "02", "地球は太陽の周りを公転する惑星です。"],
  ];
  downloadText("mcq_sample.csv", records.map(csvLine).join("\n"), "text/csv;charset=utf-8");
}

function csvLine(values) {
  return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
}

function downloadXml() {
  downloadText(`${cleanId(el.questionId.value)}.xml`, el.xmlOutput.value, "application/xml;charset=utf-8");
}

async function copyXml() {
  await navigator.clipboard.writeText(el.xmlOutput.value);
  setStatus("コピーしました");
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
  return String(value || "000.hogehoge").trim().replace(/[^\w.-]+/g, "_");
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
