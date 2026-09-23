/* Optional local-server API translation. No keys are stored in browser storage. */
(() => {
  const settings = document.querySelector('#aiSettingsDialog');
  const provider = document.querySelector('#aiProvider');
  const model = document.querySelector('#aiModel');
  const key = document.querySelector('#aiKey');
  const keyStatus = document.querySelector('#aiKeyStatus');
  const run = document.querySelector('#aiTranslateButton');
  const stop = document.querySelector('#aiTranslateStop');
  const progress = document.querySelector('#aiTranslationProgress');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  if (!local) {
    run.hidden = true;
    document.querySelector('#aiSettingsButton').hidden = true;
    document.querySelector('#aiTranslationNotice').hidden = true;
  }
  let profiles = {}, running = false, controller = null, cancelled = false;
  let sourceSignature = '', completed = new Set();
  const message = (text) => { progress.textContent = uiText(text); };

  async function request(path, payload, signal) {
    const response = await fetch(webappUrl(path), payload === undefined
      ? {cache: 'no-store', signal}
      : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal});
    const type = response.headers.get('content-type') || '';
    if (!type.includes('application/json')) throw new Error(uiText('AI機能には更新後のローカルサーバーが必要です。make restartを実行してください。'));
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  function showProfile() {
    const profile = profiles[provider.value] || {};
    model.value = profile.model || '';
    key.value = '';
    keyStatus.textContent = uiText(profile.configured ? 'APIキー登録済み（空欄なら維持）' : 'APIキー未登録');
  }
  document.querySelector('#aiSettingsButton').addEventListener('click', async () => {
    try {
      const result = await request('api/ai/settings');
      profiles = result.profiles;
      provider.value = result.provider;
      showProfile();
      settings.showModal();
    } catch (error) { message(error.message); }
  });
  provider.addEventListener('change', showProfile);
  settings.addEventListener('close', () => { key.value = ''; });
  document.querySelector('#aiSettingsClose').addEventListener('click', () => settings.close());
  async function save(removeKey = false) {
    const button = document.querySelector('#aiSettingsSave');
    button.disabled = true;
    try {
      const result = await request('api/ai/settings', {provider: provider.value, model: model.value.trim(), key: key.value.trim(), remove_key: removeKey});
      profiles = result.profiles;
      showProfile();
      keyStatus.textContent += ' — ' + uiText('保存しました');
    } catch (error) { keyStatus.textContent = error.message; }
    finally { key.value = ''; button.disabled = false; }
  }
  document.querySelector('#aiSettingsSave').addEventListener('click', () => save());
  document.querySelector('#aiKeyRemove').addEventListener('click', () => save(true));
  stop.addEventListener('click', () => { cancelled = true; controller?.abort(); });

  const signature = payload => JSON.stringify({source_language: payload.source_language, question_type: payload.question_type,
    question_text: payload.question_text, rows: payload.rows});

  run.addEventListener('click', async () => {
    if (running) return;
    const targets = translationTargets();
    if (!targets.length) { message('基本言語以外の展開先言語を1つ以上選択してください'); return; }
    copyLanguageIndependentValuesToTargets();
    const source = translationPayload();
    const currentSignature = signature(source);
    if (sourceSignature !== currentSignature) { sourceSignature = currentSignature; completed = new Set(); }
    if (targets.every(lang => completed.has(lang))) completed = new Set(); // explicit rerun of all completed languages
    const wasStale = state.translationsStale;
    let currentBatch = '';
    state.aiTranslationRunning = true;
    running = true; cancelled = false; run.disabled = true; stop.hidden = false;
    document.querySelector('#aiSettingsButton').disabled = true;
    try {
      const config = await request('api/ai/settings');
      if (!config.profiles[config.provider]?.configured || !config.profiles[config.provider]?.model) throw new Error(uiText('AI設定でモデルとAPIキーを登録してください。'));
      // A small batch limits output size; a language is applied only after every batch validates.
      const rows = source.rows.filter(row => row.choice !== null || row.feedback !== null);
      const batches = [];
      for (let i = 0; i < rows.length; i += 4) batches.push(rows.slice(i, i + 4));
      if (!batches.length) batches.push([]);
      for (const lang of targets) {
        if (completed.has(lang)) continue;
        const translation = {question_text: null, rows: []};
        for (let i = 0; i < batches.length; i++) {
          if (cancelled) throw new DOMException('', 'AbortError');
          currentBatch = `${lang} (${i + 1}/${batches.length})`;
          progress.textContent = `${uiText('翻訳中')} ${lang} (${i + 1}/${batches.length}) — ${completed.size}/${targets.length}`;
          controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 135000);
          let result;
          try {
            result = await request('api/ai/translate', {target: lang, source: {
              source_language: source.source_language, question_text: i === 0 ? source.question_text : null, rows: batches[i]
            }}, controller.signal);
          } finally { clearTimeout(timer); }
          if (cancelled) throw new DOMException('', 'AbortError');
          if (signature(translationPayload()) !== currentSignature || !translationTargets().includes(lang)) {
            throw new Error(uiText('翻訳中に原文または対象言語が変更されたため停止しました。再実行してください。'));
          }
          if (i === 0) translation.question_text = result.translations[lang].question_text;
          translation.rows.push(...result.translations[lang].rows);
        }
        applyTranslationResult({translations: {[lang]: translation}});
        if (el.translationStatus.classList.contains('error')) throw new Error(el.translationStatus.textContent);
        completed.add(lang);
        // Do not declare other pre-existing translations current after only one language.
        state.translationsStale = wasStale && targets.some(target => !completed.has(target));
        updateOutput();
      }
      message('自動翻訳が完了しました。内容を確認してCSVを保存してください。');
    } catch (error) {
      message((currentBatch ? currentBatch + ': ' : '') + (error.name === 'AbortError'
        ? uiText(cancelled ? '自動翻訳を停止しました。' : 'AIへの接続が時間切れになりました。') : error.message)
        + ' ' + uiText('完了した言語は保持しています。「自動翻訳」で未完了の言語から再開できます。'));
    } finally {
      state.aiTranslationRunning = false;
      updateOutput();
      running = false; controller = null; run.disabled = false; stop.hidden = true;
      document.querySelector('#aiSettingsButton').disabled = false;
    }
  });
})();
