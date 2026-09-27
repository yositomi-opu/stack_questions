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
  const handles = {csv: null, xml: null};
  let saving = false;
  let targetRevision = 0;
  const canOverwrite = () => Boolean(window.showOpenFilePicker && window.showSaveFilePicker);
  function updateOverwriteButtons() {
    for (const format of ['csv', 'xml']) {
      const button = $(format === 'csv' ? 'overwriteCsvButton' : 'overwriteXmlButton');
      button.disabled = saving || !canOverwrite();
      button.title = uiText(!canOverwrite()
        ? 'このブラウザでは上書保存できません。「保存」を使用してください。'
        : handles[format] ? '上書き先' : '保存先を選択して保存します');
      if (handles[format] && canOverwrite()) button.title += `: ${handles[format].name}`;
      button.dataset.i18nOriginalTitle = button.title;
    }
  }
  window.mcqFileTargets = {
    reset() { targetRevision += 1; handles.csv = null; handles.xml = null; updateOverwriteButtons(); },
    imported(format, file, handle) {
      this.reset();
      // Never write CSV bytes over an imported Excel workbook or TSV file.
      if (handle && file.name.toLowerCase().endsWith(`.${format}`)) handles[format] = handle;
      updateOverwriteButtons();
    }
  };
  window.mcqSaveQuestionFile = async (format, filename, text, type, overwrite = false) => {
    if (saving) return null;
    if (!window.showSaveFilePicker) {
      if (overwrite) throw new Error(uiText('このブラウザでは上書保存できません。「保存」を使用してください。'));
      downloadText(filename, text, type);
      return {name: filename, downloaded: true};
    }
    saving = true;
    const revision = targetRevision;
    updateOverwriteButtons();
    let writable;
    try {
      const handle = (overwrite && handles[format]) || await window.showSaveFilePicker({
        id: `mcq-${format}`, suggestedName: filename,
        types: [{description: format.toUpperCase(), accept: {[format === 'csv' ? 'text/csv' : 'application/xml']: [`.${format}`]}}]
      });
      writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      writable = null;
      if (revision === targetRevision) handles[format] = handle;
      return {name: handle.name, downloaded: false};
    } catch (error) {
      if (writable) { try { await writable.abort(); } catch (_) {} }
      if (error.name === 'AbortError') return null;
      throw error;
    } finally {
      saving = false;
      updateOverwriteButtons();
    }
  };
  $('overwriteCsvButton').addEventListener('click', () => downloadCurrentCsv(true));
  $('overwriteXmlButton').addEventListener('click', () => downloadXml(true));
  window.addEventListener('mcq-language-change', updateOverwriteButtons);
  updateOverwriteButtons();
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
      await (format === 'csv' ? readSelectedFile : readSelectedXml)({ target: {files:[file], value:''}, fileHandle: handle });
    } catch (error) {
      if (error.name !== 'AbortError') {
        // Unsupported contexts still retain the standard browser file picker.
        input.click();
      }
    }
  }
  el.dataFileButton.addEventListener('click', () => pickFile('csv'));
  el.xmlFileButton.addEventListener('click', () => pickFile('xml'));
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
