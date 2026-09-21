/* File menus, source viewers and local clipboard feedback. */
(() => {
  const $ = (id) => document.getElementById(id);
  let noticeTimer;
  window.mcqNotice = (message, error = false) => {
    const notice = $('actionNotice');
    notice.textContent = uiText(message);
    notice.classList.toggle('error', error);
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, error ? 12000 : 5000);
  };
  function showSource(title, text, message = '') {
    $('sourceTitle').textContent = title;
    $('sourceText').value = text;
    $('sourceMessage').textContent = uiText(message);
    if (!$('sourceDialog').open) $('sourceDialog').showModal();
  }
  window.mcqCopyText = async (text) => {
    if (!text) { window.mcqNotice('コピーする内容がありません', true); return false; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      // Works on HTTP pages where the Clipboard API is unavailable.
      const field = document.createElement('textarea');
      field.value = text;
      field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
      const previous = document.activeElement;
      (document.querySelector('dialog[open]') || document.body).append(field);
      field.focus(); field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (_ignored) { /* Offer manual copy below. */ }
      field.remove(); previous?.focus();
      if (!copied) {
        showSource(uiText('コピーする内容'), text, '自動コピーできませんでした。内容を選択しました。⌘C／Ctrl+Cでコピーしてください。');
        $('sourceText').focus(); $('sourceText').select();
        window.mcqNotice('自動コピーできませんでした。⌘C／Ctrl+Cでコピーしてください。', true);
        return false;
      }
    }
    $('sourceMessage').textContent = uiText('コピーしました');
    window.mcqNotice('コピーしました');
    return true;
  };
  $('copySourceButton').addEventListener('click', () => window.mcqCopyText($('sourceText').value));
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('showCsvButton').addEventListener('click', () => {
    try { showSource('CSV', csvText(currentCsvRecords(baseTitle(el.questionId.value) || 'MCQ_sample'))); }
    catch (error) { window.mcqNotice(error.message, true); }
  });
  $('showXmlButton').addEventListener('click', () => {
    try { showSource('XML', generateXml()); }
    catch (error) { window.mcqNotice(error.message, true); }
  });
  async function pickFile(format) {
    const input = format === 'csv' ? el.dataFileInput : el.xmlFileInput;
    if (!window.showOpenFilePicker) { input.click(); return; }
    try {
      // Stable IDs let the browser remember separate CSV and XML directories.
      const [handle] = await window.showOpenFilePicker({ id: `mcq-${format}`, multiple: false,
        types: [{ description: format.toUpperCase(), accept: format === 'csv'
          ? {'text/csv':['.csv','.tsv'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'], 'application/vnd.ms-excel':['.xls']}
          : {'application/xml':['.xml']} }] });
      const file = await handle.getFile();
      await (format === 'csv' ? readSelectedFile : readSelectedXml)({ target: {files:[file], value:''} });
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Unsupported contexts still retain the standard browser file picker.
        input.click();
      }
    }
  }
  el.dataFileButton.addEventListener('click', () => pickFile('csv'));
  el.xmlFileButton.addEventListener('click', () => pickFile('xml'));
  let sampleFiles = [], sampleFormat = 'csv', sampleRequest = 0, staticSamples = false;
  function renderSamples() {
    const query = $('sampleSearch').value.toLowerCase();
    $('samplesList').replaceChildren();
    sampleFiles.filter(item => item.path.toLowerCase().includes(query)).forEach(item => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = item.path;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const response = await fetch(staticSamples
            ? webappUrl(`../../${item.path.split("/").map(encodeURIComponent).join("/")}`)
            : webappUrl(`/api/repository/samples?format=${sampleFormat}&path=${encodeURIComponent(item.path)}`));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const file = new File([await response.text()], item.path.split('/').pop());
          if (sampleFormat === 'csv' && !window.confirm(uiText('見本を読み込みます。現在の入力内容は置き換えられます。'))) return;
          $('samplesDialog').close();
          await (sampleFormat === 'csv' ? readSelectedFile : readSelectedXml)({target:{files:[file],value:''}});
        } catch (error) { window.mcqNotice(error.message, true); }
        finally { button.disabled = false; }
      });
      $('samplesList').append(button);
    });
  }
  async function showSamples(format) {
    const request = ++sampleRequest;
    sampleFormat = format; sampleFiles = [];
    $('samplesTitle').textContent = `${format.toUpperCase()} — ${uiText('見本を読み込む')}`;
    $('sampleSearch').value = ''; $('samplesList').replaceChildren();
    $('samplesStatus').textContent = uiText('見本を取得しています…');
    if (!$('samplesDialog').open) $('samplesDialog').showModal();
    try {
      let files, useStatic = false;
      try {
        const response = await fetch(webappUrl(`/api/repository/samples?format=${format}`));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        files = (await response.json()).files;
      } catch (_error) {
        const response = await fetch(webappUrl('samples-index.json'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        files = (await response.json())[format];
        useStatic = true;
      }
      if (request !== sampleRequest) return;
      sampleFiles = files;
      staticSamples = useStatic;
      $('samplesStatus').textContent = format === 'csv' ? 'samples.ja / sample.csv' : '001 / samples';
      renderSamples();
    } catch (_error) {
      if (request === sampleRequest) $('samplesStatus').textContent = uiText('見本を取得できません。サーバーを更新・再起動してください。');
    }
  }
  el.sampleCsvButton.addEventListener('click', () => showSamples('csv'));
  $('sampleXmlButton').addEventListener('click', () => showSamples('xml'));
  $('sampleSearch').addEventListener('input', renderSamples);
  document.querySelectorAll('.file-menu').forEach(menu => {
    menu.addEventListener('click', event => { if (event.target.closest('button')) menu.open = false; });
    menu.addEventListener('toggle', () => {
      if (menu.open) document.querySelectorAll('.file-menu').forEach(other => { if (other !== menu) other.open = false; });
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.file-menu')) document.querySelectorAll('.file-menu').forEach(menu => { menu.open = false; });
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') document.querySelectorAll('.file-menu').forEach(menu => { menu.open = false; });
  });
  let resultsWindow = null;
  function refreshEvaluationWindow() {
    if (!resultsWindow || resultsWindow.closed) return;
    const doc = resultsWindow.document;
    doc.title = uiText('問題変数評価結果');
    doc.documentElement.lang = document.documentElement.lang;
    const panel = doc.importNode(document.querySelector('.cas-results-panel'), true);
    const heading = doc.createElement('div');
    heading.className = 'panel-heading';
    const status = doc.createElement('p');
    status.textContent = el.casEvaluationStatus.textContent;
    const close = doc.createElement('button');
    close.textContent = uiText('閉じる');
    close.addEventListener('click', () => resultsWindow.close());
    heading.append(status, close);
    doc.body.replaceChildren(heading, panel);
  }
  $('evaluationResultsButton').addEventListener('click', () => {
    if (!resultsWindow || resultsWindow.closed) {
      resultsWindow = window.open('', 'mcq-evaluation-results', 'popup,width=1000,height=700');
      if (!resultsWindow) { window.mcqNotice('評価結果のウィンドウを開けませんでした。ポップアップを許可してください。', true); return; }
      const doc = resultsWindow.document;
      doc.title = uiText('問題変数評価結果');
      doc.documentElement.lang = document.documentElement.lang;
      const style = doc.createElement('link');
      style.rel = 'stylesheet'; style.href = new URL('./styles.css?v=20260921-v08', location.href).href;
      doc.head.replaceChildren(style);
      doc.body.className = 'evaluation-window';
    }
    refreshEvaluationWindow(); resultsWindow.focus();
  });
  new MutationObserver(refreshEvaluationWindow).observe($('evaluationResultsSource'), {subtree:true, childList:true, characterData:true, attributes:true});
  new MutationObserver(refreshEvaluationWindow).observe(el.casEvaluationStatus, {subtree:true, childList:true, characterData:true});
  window.addEventListener('mcq-language-change', refreshEvaluationWindow);
})();
