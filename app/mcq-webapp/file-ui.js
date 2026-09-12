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
  const widthKey = 'mcq-webapp-widths-v1';
  try {
    const saved = JSON.parse(localStorage.getItem(widthKey) || 'null');
    if (saved && Number.isFinite(saved.settings) && Number.isFinite(saved.data)) {
      el.settingsWidth.value = String(clamp(saved.settings, 300, 2400));
      el.dataWidth.value = String(clamp(saved.data, 420, 900));
      settingsWidthCustomized = true;
      updateLayout();
    }
  } catch (_error) { /* Defaults remain available when storage is disabled. */ }
  const saveWidths = () => {
    try { localStorage.setItem(widthKey, JSON.stringify({settings:Number(el.settingsWidth.value),data:Number(el.dataWidth.value)})); }
    catch (_error) { /* Layout remains usable without persistence. */ }
  };
  el.settingsWidth.addEventListener('input', saveWidths);
  el.dataWidth.addEventListener('input', saveWidths);
  window.addEventListener('pointerup', () => { if (settingsWidthCustomized) saveWidths(); });
})();
