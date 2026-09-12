(() => {
  "use strict";

  const STORAGE_KEY = "mcq-webapp.ui-language";
  const translations = new Map(Object.entries({
    "CAS検証用コピー": "Copy CAS test code",
    "include保存": "Save include",
    "CSV見本": "CSV sample",
    "CSV保存": "Save CSV",
    "XML保存": "Save XML",
    "プレビュー": "Preview",
    "問題ファイル設定": "Question file settings",
    "タイトル": "Title",
    "例: MCQ_sampleXYZ": "Example: MCQ_sampleXYZ",
    "CSV/XLSX読込": "Load CSV/XLSX",
    "XML読込": "Load XML",
    "表示設定": "Display settings",
    "XMLを表示する": "Show XML",
    "左欄の幅": "Left panel width",
    "選択肢欄の幅": "Options panel width",
    "多言語設定": "Language settings",
    "基本言語": "Base language",
    "XMLに展開する言語を選択": "Select languages to include in XML",
    "多言語展開": "Prepare translations",
    "翻訳結果を確認・修正": "Review and edit translations",
    "生成された依頼をChatGPTへ貼り付け、返されたJSONでこの欄を置き換えてから「結果を反映」を押してください。": "Paste the generated request into ChatGPT, replace this field with the returned JSON, then click Apply results.",
    "依頼をコピー": "Copy request",
    "結果を反映": "Apply results",
    "問題変数を別ファイルに保存する": "Save question variables in a separate file",
    "include URLベース": "Include URL base",
    "Moodle/STACKサーバーから取得できる公開URLを指定します。": "Enter a public URL that the Moodle/STACK server can access.",
    "問題変数（ランダム変数）": "Question variables (random variables)",
    "問題変数を評価": "Evaluate question variables",
    "未評価": "Not evaluated",
    "問題文": "Question text",
    "パラメータ": "Parameters",
    "パラメータの入力について": "About entering parameters",
    "問題ごとに変えたい値を、問題変数本体より先に設定する欄です。不要なら空欄で構いません。": "Set values that vary between questions before the main question variables run. Leave this field blank if it is not needed.",
    "stack_includeで共通の問題変数を読み込む場合に特に有効です。同じファイルを使ったまま、%_rk:2; のようにrankなどを指定して別の問題を作れます。": "This is especially useful when loading shared question variables with stack_include. Reuse the same file while setting values such as %_rk:2; to create questions with different ranks or other parameters.",
    "実行順は「選択肢設定 → パラメータ → 問題変数本体（stack_include）」です。選択肢数と正解数は上の選択肢設定で指定します。": "Execution order: option settings → parameters → main question variables (stack_include). Set the number of options and correct answers in the option settings above.",
    "読み込み先の共通ファイルでは、パラメータが未設定の場合だけ既定値を入れるようにします。ここで指定した値は各問題のXMLに保存されます。": "In the shared file, assign defaults only when a parameter is not already set. Values entered here are saved in each question's XML.",
    "問題文の入力について": "About entering question text",
    "__SELTYPE__ は、上の選択肢設定に応じて「1つ選べ」「すべて選べ」、正解が複数あるRadio形式では「1つ選べ（正解が複数あっても1つでよい）」に置き換わります。": "__SELTYPE__ inserts “Choose”, “Choose all”, or “Choose one of the” according to the option settings. In Japanese, Radio questions with multiple correct options also explain that selecting one is enough.",
    "何を選ぶかは問題文に書きます。例：「間違っているものを __SELTYPE__。」「rankが1であるものを __SELTYPE__。」": "Write the selection criterion in the question text. For example: “__SELTYPE__ incorrect statements.” or “__SELTYPE__ matrices of rank 1.”",
    "__SELPROMPT__ は「正しいものを1つ選べ。」などの指示文全体を挿入します。「正しいものを」を前に重ねないでください。": "__SELPROMPT__ inserts a complete instruction such as “Select the correct answer.” Do not repeat that instruction in the surrounding text.",
    "どちらも使わず、自分で好きな指示文を書いても問題ありません。": "You can also leave out both placeholders and write your own instructions.",
    "左欄の幅を変更": "Resize left panel",
    "左右にドラッグして左欄の幅を変更": "Drag horizontally to resize the left panel",
    "選択肢設定": "Option settings",
    "形式": "Format",
    "選択肢数": "Number of options",
    "正解選択肢数": "Number of correct options",
    "正解数をランダムにする": "Randomize the number of correct options",
    "候補": "Candidates",
    "各パターンは正解・不正解1対以上を必須とする": "Require at least one correct/incorrect pair per pattern",
    "正解・不正解ごとにフィードバックを変える": "Use different feedback for correct and incorrect options",
    "追加時は正解・不正解別フィードバック": "Use separate correct/incorrect feedback for new patterns",
    "正解・不正解別": "Separate correct/incorrect feedback",
    "選択肢データ": "Option data",
    "行追加": "Add row",
    "クリア": "Clear",
    "パターン": "Pattern",
    "正解・不正解": "Correct/incorrect",
    "選択肢 ja": "Option ja",
    "共通FB ja": "Shared feedback ja",
    "正解・不正解別FB ja": "Correct/incorrect feedback ja",
    "正解選択肢": "Correct options",
    "正解パターン追加": "Add correct pattern",
    "誤答選択肢": "Incorrect options",
    "誤答パターン追加": "Add incorrect pattern",
    "選択肢リスト（1行1要素）": "Option list (one item per line)",
    "フィードバック": "Feedback",
    "問題変数評価結果": "Question variable evaluation results",
    "定義済み変数": "Defined variables",
    "変数": "Variable",
    "型": "Type",
    "評価値": "Evaluated value",
    "STACK API 動作確認": "STACK API verification",
    "STACK APIのベースURLを入力すると、接続確認と現在の生成XMLのテストを実行できます。": "Enter a STACK API base URL to check the connection and test the currently generated XML.",
    "接続確認": "Check connection",
    "生成XMLをテスト": "Test generated XML",
    "未確認": "Not checked",
    "API応答の詳細": "API response details",
    "生成XMLウィンドウ": "Generated XML window",
    "生成XMLの表示を切り替え": "Toggle generated XML",
    "生成XMLを閉じる": "Close generated XML",
    "生成XMLを開く": "Open generated XML",
    "生成XML": "Generated XML",
    "コピー": "Copy",
    "文字列": "Text",
    "CAS式": "CAS expression",
    "CASリスト式": "CAS list expression",
    "正↔不": "C↔I",
    "全体：正↔不": "All: C↔I",
    "正解と不正解を入れかえます": "Swap correct and incorrect options and feedback",
    "全パターンの正解と不正解を入れかえます": "Swap correct and incorrect options and feedback for all patterns",
    "正解・不正解を入れ替えました。必要に応じて再評価してください": "Correct/incorrect options swapped. Evaluate again if needed.",
    "評価ログ（エラー詳細）": "Evaluation log (error details)",
    "評価したコード（行番号付き）": "Evaluated code (with line numbers)",
    "Maximaのエラー出力と評価に送ったコードです。行番号はこのコード内の番号です。include先のエラーはログ内のファイル名も確認してください。": "Maxima error output and the submitted code are shown below. Line numbers refer to this code. For errors in included files, also check the file names in the log.",
    "評価中です。完了後に入れ替えてください": "Evaluation is running. Wait for it to finish before swapping.",
    "原因の推定（確定ではありません）": "Possible cause (not a confirmed diagnosis)",
    "Maximaの生ログ": "Raw Maxima log",
    "評価コードの行": "Evaluated code, line",
    "括弧の対応が合っていない可能性があります。丸括弧と角括弧を確認してください。": "Brackets may not match. Check parentheses and square brackets.",
    "文字列の閉じ引用符（\"）が不足している可能性があります。": "A closing double quote may be missing from the string.",
    "コメントの終わり（*/）が不足している可能性があります。": "The closing comment delimiter (*/) may be missing.",
    "この行で開いた括弧が閉じられていない可能性があります。": "A bracket opened on this line may not be closed.",
    "文末の ; または $ が不足している可能性があります。式の末尾を確認してください。": "A statement terminator (; or $) may be missing. Check the end of the expression.",
    "式が途中で終わっているか、区切り記号が不足している可能性があります。includeを使っている場合は読み込み先も確認してください。": "An expression may be incomplete or a separator may be missing. If using include, also check the included file.",
    "正解": "Correct",
    "不正解": "Incorrect",
    "選択肢は言語に依存しない": "Options are language-independent",
    "このチェックをオンにすると多言語展開されません": "When checked, this feedback is not translated into other languages.",
    "このチェックをオンにすると正解・不正解個別にフィードバックを設定できます": "When checked, you can set separate feedback for correct and incorrect options.",
    "言語に依存しない": "Language-independent",
    "パターンを削除": "Delete pattern",
    "削除": "Delete",
    "フィードバックは同じパターンの先頭行で編集します": "Edit feedback in the first row of the same pattern",
    "フィードバックは同じパターン・正解・不正解の先頭行で編集します": "Edit feedback in the first row with the same pattern and correct/incorrect status",
    "表示できる代入変数がありません": "No assigned variables to display",
    "エラー": "Error",
    "評価できませんでした": "Evaluation failed",
    "CAS評価中…": "Evaluating CAS…",
    "再評価が必要": "Re-evaluation required",
    "CAS未評価": "CAS not evaluated",
    "テンプレート読込完了": "Templates loaded",
    "アプリ内のXMLテンプレートを読み込めませんでした。ページを再読み込みしてください。": "Could not load the bundled XML templates. Reload the page.",
    "基本言語は展開対象から外せません": "The base language cannot be excluded",
    "少なくとも1言語を選択してください": "Select at least one language",
    "正解・不正解1対の選択肢行が追加されました": "A correct/incorrect option pair was added",
    "フィードバックの共有設定が変更されました": "The feedback sharing setting was changed",
    "STACK APIのURLを入力してください": "Enter the STACK API URL",
    "接続を確認しています…": "Checking connection…",
    "先に問題XMLを生成できる状態にしてください": "Make sure the question XML can be generated first",
    "生成XMLをSTACK APIでテストしています…": "Testing generated XML with the STACK API…",
    "テスト完了": "Test completed",
    "入力が変更されました。もう一度評価してください": "Input changed. Evaluate again.",
    "問題変数を評価できませんでした": "Could not evaluate question variables",
    "基本言語以外の展開先言語を1つ以上選択してください": "Select at least one target language other than the base language",
    "返答はJSONコードブロックで囲み、文字列内の二重引用符・バックスラッシュ・改行をJSONとしてエスケープしてください。プレースホルダーのアンダースコアを保持し、太字記法に変更しないでください。": "Wrap the response in a JSON code block. Escape double quotes, backslashes, and newlines inside strings as required by JSON. Keep underscores in placeholders; do not convert them to bold markup.",
    "CAS式をJSON文字列にする例:": "Example of a CAS expression encoded as a JSON string:",
    "translations は次の言語キーと形式で返してください:": "Return translations using these language keys and structure:",
    "次のSTACK MCQ教材を target_languages に翻訳してください。": "Translate the following STACK MCQ material into target_languages.",
    "数式、変数、__SELPROMPT__、__SELTYPE__、{@...@}、HTMLタグは変更しないでください。": "Do not change formulas, variables, __SELPROMPT__, __SELTYPE__, {@...@}, or HTML tags.",
    "CAS式は文字列内の文章だけを翻訳し、変数名・関数名・演算子・引用符を保持した式全体を返してください。nullの項目は翻訳不要です。": "For CAS expressions, translate only human-readable text inside strings. Return the complete expression, preserving identifiers, function names, operators, and quotation marks. Null fields need no translation.",
    "元のquestion_textとrowsは翻訳元として保持し、翻訳結果はtranslations内の各target_languagesのキーに入れてください。ptはポルトガル語です。": "Keep the original question_text and rows as source material. Put translated content under each target_languages key in translations. pt means Portuguese.",
    "説明文を付けず、入力と同じ構造に translations を追加した有効なJSONだけを返してください。": "Return only valid JSON with translations added to the same structure as the input, without explanatory text.",
    "translations は {\"en\":{\"question_text\":\"...\",\"rows\":[{\"id\":\"0\",\"choice\":\"...\",\"feedback\":\"...\"}]}} の形式にしてください。": "Use the format {\"en\":{\"question_text\":\"...\",\"rows\":[{\"id\":\"0\",\"choice\":\"...\",\"feedback\":\"...\"}]}} for translations.",
    "翻訳依頼を作成しました。ChatGPTへ貼り付けてください。": "Translation request created. Paste it into ChatGPT.",
    "クリップボードへコピーしました": "Copied to clipboard",
    "欄を選択しました。コピー操作を行ってください。": "The field is selected. Copy it manually.",
    "translations が見つかりません": "The translations object was not found",
    "対応言語の翻訳を読み込めませんでした": "No supported-language translations could be loaded",
    "XMLの構文が不正です": "The XML syntax is invalid",
    "questionvariables が見つかりません": "questionvariables was not found",
    "再編集用データが不正です": "The re-editing data is invalid",
    "%__mcq_qtextL を解析できません": "Could not parse %__mcq_qtextL",
    "問題文の多言語連想配列を解析できません": "Could not parse the multilingual question-text association",
    "選択肢の多言語連想配列を解析できません": "Could not parse the multilingual option association",
    "選択肢を復元できません": "Could not restore options",
    "文字列が閉じていません": "The string is not closed",
    "リストの区切りが不正です": "The list delimiter is invalid",
    "リストが閉じていません": "The list is not closed",
    "XLSXライブラリ読込待ち": "Waiting for the XLSX library",
    "option 行を読み込めませんでした": "No option rows could be loaded",
    "includeファイルを使用するXMLが読み込まれていません": "No XML using an include file has been loaded",
    "タイトルが未入力のため保存を中止しました": "Save cancelled because the title is empty",
    "保存に使用できるタイトルを入力してください": "Enter a title that can be used for saving",
    "コピーしました": "Copied",
    "XMLへ記述するCAS検証用コードをコピーしました": "Copied CAS test code for the XML",
    "テンプレート読込待ち": "Waiting for templates",
    "命題パターンがありません": "No proposition patterns are defined",
    "正解数が選択肢数を超えています": "The number of correct options exceeds the number of options",
    "正解数が命題パターン数を超えています": "The number of correct options exceeds the number of proposition patterns",
    "選択肢数が命題パターン数を超えています": "The number of options exceeds the number of proposition patterns",
    "正解数の候補に対して正解パターンが不足しています": "There are not enough correct patterns for the correct-count candidates",
    "正解数の候補に対して誤答パターンが不足しています": "There are not enough incorrect patterns for the correct-count candidates",
    "正解数の候補に対して正解選択肢が不足しています": "There are not enough correct options for the correct-count candidates",
    "正解数の候補に対して誤答選択肢が不足しています": "There are not enough incorrect options for the correct-count candidates",
    "多言語展開を更新してください": "Update the translations",
    "XMLの stack_include(...) に設定するURLです。必要な場合は手動で変更してください。": "URL used by stack_include(...) in the XML. Change it if necessary.",
    "include URLに引用符や改行は使用できません": "The include URL cannot contain quotes or line breaks",
    "include URLベースを入力してください": "Enter the include URL base",
    "include URLベースに引用符や改行は使用できません": "The include URL base cannot contain quotes or line breaks",
    "include URLベースはhttp://またはhttps://で始まるURLを指定してください": "The include URL base must start with http:// or https://",
    "include URLベースに認証情報、クエリ、フラグメントは指定できません": "Do not put credentials, a query, or a fragment in the include URL base",
    "タイトルが未入力です。保存するファイルのタイトルを入力してください。": "The title is empty. Enter a title for the saved file.",
    "表示言語を英語に切り替える": "Switch the interface language to English",
    "表示言語を日本語に切り替える": "Switch the interface language to Japanese",
    "問題変数の設定を stack_include して複数の問題で共通設定を保存する場合に使用します。公開先はinclude URLベースで設定します。": "Use stack_include to share question-variable settings across multiple questions. Configure the public location with the include URL base."
  }));

  const originals = new WeakMap();
  const serverLanguage = window.MCQ_WEBAPP_CONFIG?.locale;
  let savedLanguage;
  try {
    savedLanguage = localStorage.getItem(STORAGE_KEY);
  } catch (_error) { /* Storage may be unavailable in restricted browsers. */ }
  let language = ["ja", "en"].includes(savedLanguage)
    ? savedLanguage
    : (["ja", "en"].includes(serverLanguage) ? serverLanguage : "ja");

  const rules = [
    [/^(\d+)パターン・(\d+)選択肢から生成$/, "$1 patterns, generated from $2 options"],
    [/^選択肢 (\w+)$/, "Option $1"], [/^共通FB (\w+)$/, "Shared feedback $1"], [/^正解・不正解別FB (\w+)$/, "Correct/incorrect feedback $1"],
    [/^CAS評価エラー (\d+)件$/, "$1 CAS evaluation error(s)"],
    [/^CASリスト length: (\d+)$/, "CAS list length: $1"],
    [/^CAS値：1選択肢 \((.+)\)$/, "CAS value: 1 option ($1)"],
    [/^include URLベースを (.+) に設定しました$/, "Set the include URL base to $1"],
    [/^正解(\d+)個・誤答(\d+)個を、評価済みの候補数と重複しないパターンから生成できません$/, "Cannot generate $1 correct and $2 incorrect options from the evaluated capacities without reusing a pattern"],
    [/^テスト完了（メッセージ (\d+)件）$/, "Test completed ($1 message(s))"],
    [/^Maximaで評価中（変数 (\d+)件・CAS式 (\d+)件）$/, "Evaluating with Maxima ($1 variables, $2 CAS expressions)"],
    [/^評価完了：変数 (\d+)件・CAS式 (\d+)件成功／(\d+)件失敗$/, "Evaluation completed: $1 variables, $2 CAS expressions succeeded, $3 failed"],
    [/^評価完了：変数 (\d+)件・CAS式 (\d+)件$/, "Evaluation completed: $1 variables, $2 CAS expressions"],
    [/^(.+) を読み込みました$/, "Loaded $1"],
    [/^(.+) を保存しました$/, "Saved $1"],
    [/^(.+)言語の翻訳を反映しました$/, "Applied translations for $1 language(s)"],
    [/^XMLを読み込めません: (.+)$/, "Could not load XML: $1"],
    [/^XMLを保存できません: (.+)$/, "Could not save XML: $1"],
    [/^includeファイルを保存できません: (.+)$/, "Could not save include file: $1"],
    [/^CAS検証用コードをコピーできません: (.+)$/, "Could not copy CAS test code: $1"],
    [/^includeファイル (.+) を取得できませんでした（(.+)）$/, "Could not retrieve include file $1 ($2)"],
    [/^パターン (.+) には C と W の両方が必要です$/, "Pattern $1 requires both C and W"],
    [/^(.+)が不正です$/, "$1 is invalid"],
    [/^(.+) を読み込みます。\n現在の入力内容は置き換えられます。$/, "Load $1?\nThe current input will be replaced."],
    [/^(.+)。この機能は python3 app\/mcq-webapp\/server.py で起動してください$/, "$1. Start this app with python3 app/mcq-webapp/server.py to use this feature."],
    [/^(.+)。多言語展開を更新してください。$/, "$1. Update the translations."],
  ];

  function translateJapanese(value) {
    if (translations.has(value)) return translations.get(value);
    for (const [pattern, replacement] of rules) if (pattern.test(value)) return value.replace(pattern, replacement);
    return value;
  }

  function translate(value) {
    return language === "en" ? translateJapanese(String(value)) : String(value);
  }

  function translateTextNode(node) {
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    const original = originals.get(node);
    const trimmed = original.trim();
    if (!trimmed) return;
    const parent = node.parentElement;
    if (parent?.closest("textarea, pre, code, #xmlOutput, #stackApiResult")) return;
    const translated = language === "en" ? translateJapanese(trimmed) : trimmed;
    const nextValue = original.replace(trimmed, translated);
    if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
  }

  function translateAttributes(element) {
    for (const name of ["title", "aria-label", "placeholder"]) {
      if (!element.hasAttribute(name)) continue;
      const key = `i18nOriginal${name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`;
      if (!(key in element.dataset)) element.dataset[key] = element.getAttribute(name);
      const original = element.dataset[key];
      const nextValue = language === "en" ? translateJapanese(original) : original;
      if (element.getAttribute(name) !== nextValue) element.setAttribute(name, nextValue);
    }
  }

  function translateTree(root = document.body) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) translateTextNode(root);
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) translateTextNode(walker.currentNode);
      else translateAttributes(walker.currentNode);
    }
    document.documentElement.lang = language;
    const toggle = document.querySelector("#uiLanguageToggle");
    if (toggle) {
      const label = language === "ja" ? "English" : "日本語";
      const ariaLabel = language === "ja" ? "表示言語を英語に切り替える" : "Switch the interface language to Japanese";
      if (toggle.textContent !== label) toggle.textContent = label;
      if (toggle.getAttribute("aria-label") !== ariaLabel) toggle.setAttribute("aria-label", ariaLabel);
    }
  }

  function setLanguage(next) {
    language = next === "en" ? "en" : "ja";
    try { localStorage.setItem(STORAGE_KEY, language); } catch (_error) { /* Keep the session usable. */ }
    translateTree();
    window.dispatchEvent(new CustomEvent("mcq-language-change", { detail: { language } }));
  }

  window.mcqI18n = { get language() { return language; }, translate, setLanguage, translateTree };

  document.addEventListener("DOMContentLoaded", () => {
    translateTree();
    document.querySelector("#uiLanguageToggle")?.addEventListener("click", () => setLanguage(language === "ja" ? "en" : "ja"));
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => translateTree(node)));
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
