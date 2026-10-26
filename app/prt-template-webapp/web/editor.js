/* Basic STACK field editing. Source versions and unsupported fields stay intact. */
(() => {
 const tr=(ja,en)=>lang==='ja'?ja:en;
 let original=null, editorRevision='', editorId='', editorVersion=0, creating=false, templateEnabled=false;
 const newCheck=(n)=>({id:'check'+n,skills:'',description:'',answertest:'AlgEquiv',sans:'chkL['+(n+1)+']',tans:'true',testoptions:'',weight:'0',trueMessages:{ja:'',en:''},falseMessages:{ja:'',en:''}});
 const initialModel=()=>({version:2,mode:'chain',inputs:[{name:'ans1',type:'algebraic',tans:'ta1',options:'allowempty'}],validationCode:'%_validate(ansL):=not is(ansL[1]=EMPTYANSWER);',checkCode:'%_chkfunc(ansL):=[is(ansL[1]=ta1), false];',validation:{answertest:'AlgEquiv',sans:'chkV',tans:'false',testoptions:'',feedback:'[[lang code="ja"]]解答を確認してください。[[/lang]][[lang code="en"]]Check your answer.[[/lang]]'},correct:{answertest:'AlgEquiv',sans:'chkL[1]',tans:'true',testoptions:'',feedback:''},checks:[newCheck(1)]});

 let model=initialModel();
 const fields=()=>({name:$('stackName').value,questionvariables:$('stackVariables').value,
   questiontext:$('stackText').value,generalfeedback:$('stackFeedback').value,...(templateEnabled?{template:JSON.stringify(model)}:{})});
 window.PRT_EDITOR={fields:()=>fields(),isOpen:()=>$('stackEditor').open,markSaved:()=>{original=fields();}};
 const changed=()=>original && JSON.stringify(fields())!==JSON.stringify(original);
 function labels(){
  $('originalXmlLabel').textContent=tr('編集前のXMLを表示','View original XML');
  $('editStack').textContent=tr('STACKを編集・プレビュー','Edit / preview STACK');
  $('stackEditorTitle').textContent=window.generalEditor?'STACK Edit WebApp':tr('PRTテンプレート問題の編集','Edit PRT template question');
  $('closeStack').textContent=tr('閉じる','Close');
  $('stackHelp').textContent=window.generalEditor?tr('既存の入力欄・PRT・テストを保持して、本文と問題変数を編集します。','Edit question text and variables while preserving existing inputs, PRTs and tests.'):tr('基本編集では入力欄・PRT・問題テストを保持します。テンプレート設定時は入力欄とPRTを置き換えます。本文はHTML／CASTextで編集できます。適用後は「作業を保存」でZIPを保存してください。プレビューにはMCQ webappとSTACK APIが必要です。','Basic edits preserve inputs, PRTs and tests. Configuring a template replaces inputs and PRTs. Edit text as HTML / CASText. After applying changes, use Save project to download your ZIP. Preview requires the local MCQ webapp and STACK API.');
  $('stackNameLabel').textContent=tr('問題名','Question name');
  $('stackVariablesLabel').textContent=tr('問題変数（Maxima）','Question variables (Maxima)');
  $('stackTextLabel').textContent=tr('問題文（HTML / CASText）','Question text (HTML / CASText)');
  $('stackFeedbackLabel').textContent=tr('全般的フィードバック（HTML / CASText）','General feedback (HTML / CASText)');
  $('previewButton').textContent=tr('編集中の内容をプレビュー','Preview current edits');
  if(window.PRT_FILES_LABELS)window.PRT_FILES_LABELS();
  $('saveStack').textContent=tr('編集を適用','Apply edits');
  document.querySelector('[data-i18n="staticHelp"]').textContent=tr('本文のソース表示です。STACKは「STACKを編集・プレビュー」から編集・表示できます。','Source text view. Use Edit / preview STACK to edit or render STACK questions.');
 }
 labels();$('language').addEventListener('change',labels);
 $('editStack').onclick=()=>{
  const d=window.stackDetail;creating=false;templateEnabled=!window.generalEditor&&!!d.editFields.template;model=templateEnabled?JSON.parse(d.editFields.template):initialModel();renderTemplate();original=null;editorId=d.id;editorVersion=d.version;editorRevision=d.revision;
  $('stackName').value=d.editFields.name;$('stackVariables').value=d.editFields.questionvariables;
  $('stackText').value=d.editFields.questiontext;$('stackFeedback').value=d.editFields.generalfeedback;
  original=fields();$('stackStatus').textContent='';labels();$('stackEditor').showModal();
 };
 function close(){if(!changed()||confirm(tr('適用していない編集を破棄しますか？','Discard unapplied edits?'))){$('stackEditor').close();original=null;}}
 $('closeStack').onclick=close;
 $('stackEditor').addEventListener('cancel',e=>{e.preventDefault();close();});
 window.addEventListener('beforeunload',e=>{if($('stackEditor').open&&changed()){e.preventDefault();e.returnValue='';}});
 $('stackForm').onsubmit=async e=>{
  e.preventDefault();if($('saveStack').disabled)return;
  $('saveStack').disabled=true;$('stackStatus').textContent='';
  try{
   state=await(await request(creating?'/api/create-stack':'/api/action',{op:'edit_stack',id:editorId,version:editorVersion,fields:fields(),revision:editorRevision,parent:category})).json();
   dirty=true;render();original=null;$('stackEditor').close();if(!creating)await showDetail(editorId,false);message(t('updated'));
  }catch(error){$('stackStatus').textContent=error.message;}
  finally{$('saveStack').disabled=false;}
 };

 const createButton=document.createElement('button');createButton.type='button';createButton.id='newStack';
 document.querySelector('header nav').prepend(createButton);
 const panel=document.createElement('section');$('stackFeedback').parentElement.after(panel);
 function element(tag,text,parent){const e=document.createElement(tag);if(text)e.textContent=text;if(parent)parent.append(e);return e;}
 function input(parent,label,value,change,type='input'){
  const l=element('label',null,parent);element('span',label,l);const e=element(type,null,l);e.value=value;e.addEventListener('input',()=>change(e.value));return e;
 }
 function renderTemplate(){
  if(window.generalEditor){createButton.hidden=true;panel.replaceChildren();return;}
  createButton.textContent=tr('＋ STACK新規作成','＋ New STACK');panel.replaceChildren();
  const enable=element('button',tr('Validation・Tree／Chainテンプレートを設定','Configure Validation / Tree / Chain template'),panel);enable.type='button';enable.hidden=templateEnabled;
  enable.onclick=()=>{if(confirm(tr('現在の版の入力欄とPRTをテンプレートで置き換えます。元XML・旧版・問題テストは保持します。続けますか？','Replace inputs and PRTs in this version with the template? Original XML, versions and tests are retained. Continue?'))){templateEnabled=true;renderTemplate();}};
  if(!templateEnabled)return;
  if(model.version===2){renderNodes();return;}
  element('p',tr('Validation: Trueで停止、Falseで正解判定へ。正解: Trueで停止。Tree: 最初の誤答一致で停止。Chain: すべての誤答チェックを実行。フィードバックは問題変数の参照（例 {@fb1@}）を指定できます。','Validation: True stops, False checks correctness. Correct answers stop. Tree stops at the first matching error; Chain visits all error checks. Feedback can reference question variables, e.g. {@fb1@}.'),panel);
  for(const mode of ['tree','chain']){const l=element('label',null,panel);const r=element('input',null,l);r.type='radio';r.name='stackMode';r.checked=model.mode===mode;r.onchange=()=>model.mode=mode;element('span',mode==='tree'?tr('Tree（最初の一致で停止）','Tree (First Match)'):tr('Chain（すべての一致を表示）','Chain (all matching feedback)'),l);}
  model.inputs.forEach((row,i)=>{const box=element('fieldset',null,panel);element('legend',tr('解答欄 ','Input ')+(i+1),box);
   input(box,tr('解答欄名','Name'),row.name,v=>row.name=v);input(box,tr('正解（問題変数）','Model answer (variable)'),row.tans,v=>row.tans=v);
   const select=element('select',null,box);for(const type of ['algebraic','matrix','numerical','string']){const opt=element('option',type,select);opt.value=type;}select.value=row.type;select.onchange=()=>row.type=select.value;
   const remove=element('button',tr('解答欄を削除','Remove input'),box);remove.type='button';remove.disabled=model.inputs.length===1;remove.onclick=()=>{model.inputs.splice(i,1);renderTemplate();};
  });
  const add=element('button',tr('解答欄を追加','Add input'),panel);add.type='button';add.onclick=()=>{let n=1;while(model.inputs.some(r=>r.name==='ans'+n))n++;model.inputs.push({name:'ans'+n,type:'algebraic',tans:'ta'+n});renderTemplate();};
  function checkpoint(row,title,index){const box=element('fieldset',null,panel);element('legend',title,box);
   input(box,tr('判定する式（SAns）','Expression (SAns)'),row.sans,v=>row.sans=v);
   input(box,tr('比較対象（TAns / AlgEquiv）','Compare with (TAns / AlgEquiv)'),row.tans,v=>row.tans=v);
   input(box,tr('True時のフィードバック（CASText）','Feedback when True (CASText)'),row.feedback,v=>row.feedback=v,'textarea');
   if(index!==undefined){const del=element('button',tr('チェックを削除','Remove checkpoint'),box);del.type='button';del.onclick=()=>{model.checks.splice(index,1);renderTemplate();};
    if(index>0){const up=element('button',tr('上へ','Move up'),box);up.type='button';up.onclick=()=>{[model.checks[index-1],model.checks[index]]=[model.checks[index],model.checks[index-1]];renderTemplate();};}}
  }
  checkpoint(model.validation,tr('Node 1: Validation（不正ならTrue）','Node 1: Validation (True means invalid)'));
  checkpoint(model.correct,tr('Node 2: 正解判定','Node 2: Correctness'));
  model.checks.forEach((row,i)=>checkpoint(row,tr('チェックポイント ','Checkpoint ')+(i+1),i));
  const more=element('button',tr('チェックポイントを追加','Add checkpoint'),panel);more.type='button';more.onclick=()=>{model.checks.push({sans:'false',tans:'true',feedback:'{@fb'+(model.checks.length+1)+'@}'});renderTemplate();};
 }
 function renderNodes(){
  element('p',tr('Validationの成功時だけチェック関数を呼びます。chkL[1]は正解判定、残りはチェックポイントです。Trueの配点を合計したscを正解判定のFalse側で設定します。','Checks run only after Validation succeeds. chkL[1] means correct; remaining flags correspond to checkpoints. True weights sum to sc, assigned on the incorrect branch.'),panel);
  element('p',tr('ノードの追加・削除・並べ替え後は、チェック関数の戻り値を表示順に合わせてください。','After adding, removing or reordering nodes, align the check function result list with the displayed order.'),panel);
  const counter=element('p','%_Num_Nodes: '+model.checks.length,panel);counter.id='nodeCount';
  for(const mode of ['tree','chain']){const l=element('label',null,panel);const r=element('input',null,l);r.type='radio';r.name='stackMode';r.checked=model.mode===mode;r.onchange=()=>model.mode=mode;element('span',mode==='tree'?tr('Tree（Trueで終了）','Tree (stop on True)'):tr('Chain（全チェック）','Chain (all checks)'),l);}
  input(panel,tr('Validation関数（trueで有効）','Validation function (true means valid)'),model.validationCode,v=>model.validationCode=v,'textarea').id='validationCode';
  input(panel,tr('チェック関数（正解判定＋各チェックの真偽リスト）','Check function (correctness + checkpoint flags)'),model.checkCode,v=>model.checkCode=v,'textarea').id='checkCode';
  model.inputs.forEach((row,i)=>{const box=element('fieldset',null,panel);element('legend',tr('解答欄 ','Input ')+(i+1),box);
   for(const key of ['name','type','tans'])input(box,key,row[key]||'',v=>row[key]=v);
   const extra=element('details',null,box);element('summary',tr('STACK入力設定','STACK input settings'),extra);
   const defaults={boxsize:'4',strictsyntax:'1',insertstars:'1',forbidfloat:'1',requirelowestterms:'0',checkanswertype:'0',mustverify:'0',showvalidation:'0',options:'allowempty'};
   for(const key of new Set([...Object.keys(defaults),...Object.keys(row)])){if(['name','type','tans'].includes(key))continue;input(extra,key,row[key]??defaults[key]??'',v=>row[key]=v);}
   const remove=element('button',tr('解答欄を削除','Remove input'),box);remove.type='button';remove.disabled=model.inputs.length===1;remove.onclick=()=>{model.inputs.splice(i,1);renderTemplate();};
  });
  const add=element('button',tr('解答欄を追加','Add input'),panel);add.type='button';add.onclick=()=>{let n=1;while(model.inputs.some(x=>x.name==='ans'+n))n++;model.inputs.push({name:'ans'+n,type:'algebraic',tans:'ta'+n,options:'allowempty'});renderTemplate();};
  function testFields(row,box){for(const key of ['answertest','sans','tans','testoptions'])input(box,key,row[key]||'',v=>row[key]=v);}
  for(const [key,title] of [['validation',tr('Node 0: Validation（無効なら終了）','Node 0: Validation (stop if invalid)')],['correct',tr('Node 1: 正解判定','Node 1: Correctness')]]){const box=element('fieldset',null,panel);element('legend',title,box);testFields(model[key],box);input(box,tr('True側フィードバック（CASText）','True feedback (CASText)'),model[key].feedback||'',v=>model[key].feedback=v,'textarea');}
  let languages=[...new Set(['ja','en',...model.checks.flatMap(r=>[...Object.keys(r.trueMessages),...Object.keys(r.falseMessages)])])];
  const languageBox=element('fieldset',null,panel);element('legend',tr('フィードバック言語','Feedback languages'),languageBox);
  const languageInput=input(languageBox,tr('言語コード（例 fr, zh_cn）','Language code (e.g. fr, zh_cn)'),'',()=>{});
  const addLanguage=element('button',tr('言語を追加','Add language'),languageBox);addLanguage.type='button';addLanguage.onclick=()=>{const code=languageInput.value.trim();if(!/^[a-zA-Z][\w-]*$/.test(code))return;for(const row of model.checks){row.trueMessages[code]??='';row.falseMessages[code]??='';}renderTemplate();};
  const sourceLanguage=input(languageBox,tr('翻訳元言語','Source language'),'ja',()=>{});
  const targetLanguage=input(languageBox,tr('翻訳先言語','Target language'),'en',()=>{});
  const translationText=input(languageBox,tr('翻訳用JSON（True／Falseの本文のみ編集）','Translation JSON (edit True/False prose only)'),'',()=>{},'textarea');
  const translationStatus=element('p','',languageBox);
  const sourceMessages=()=>Object.fromEntries(model.checks.map(r=>[r.id,{true:r.trueMessages[sourceLanguage.value]||'',false:r.falseMessages[sourceLanguage.value]||''}]));
  let signature='';
  const prepare=element('button',tr('翻訳用JSONを作成','Prepare translation JSON'),languageBox);prepare.type='button';prepare.onclick=()=>{const messages=sourceMessages();signature=JSON.stringify(messages);translationText.value=JSON.stringify(messages,null,2);};
  const applyTranslation=async(result,messages)=>{if(signature!==JSON.stringify(sourceMessages()))throw Error(tr('翻訳元が変更されました。作り直してください。','Source changed; prepare the translation again.'));if(!/^[a-zA-Z][\w-]*$/.test(targetLanguage.value)||targetLanguage.value===sourceLanguage.value)throw Error(tr('翻訳先言語を確認してください。','Check the target language.'));const checked=await(await request('/api/translation-validate',{messages,result})).json();for(const r of model.checks){r.trueMessages[targetLanguage.value]=checked.result[r.id].true;r.falseMessages[targetLanguage.value]=checked.result[r.id].false;}renderTemplate();};
  const apply=element('button',tr('翻訳JSONを反映','Apply translation JSON'),languageBox);apply.type='button';apply.onclick=async()=>{try{await applyTranslation(JSON.parse(translationText.value),sourceMessages());}catch(e){translationStatus.textContent=e.message;}};
  const ai=element('button',tr('AIでフィードバックを翻訳（MCQ共通設定）','Translate feedback with AI (shared MCQ settings)'),languageBox);ai.type='button';ai.onclick=async()=>{ai.disabled=true;try{const messages=sourceMessages();const target=targetLanguage.value,source=sourceLanguage.value;signature=JSON.stringify(messages);translationStatus.textContent=tr('翻訳中…','Translating…');const result=await(await request('/api/translation',{messages,sourceLanguage:sourceLanguage.value,target:targetLanguage.value})).json();if(target!==targetLanguage.value||source!==sourceLanguage.value)throw Error('Translation language changed / 翻訳言語が変更されました。');await applyTranslation(result.result,messages);}catch(e){translationStatus.textContent=e.message;}finally{ai.disabled=false;}};
  element('p',tr('AIのモデルとキーはMCQ WebAppのAI設定を共用します。AIボタンを押すと本文を設定済みサービスへ送信します。問題変数内の多言語文字列は問題変数欄で編集します。','Provider settings are shared with MCQ WebApp. The AI button sends prose to the configured service. Edit multilingual strings in question variables directly.'),languageBox);
  function renumber(){model.checks.forEach((r,i)=>{if(/^chkL\[\d+\]$/.test(r.sans))r.sans='chkL['+(i+2)+']';});}
  model.checks.forEach((row,i)=>{const box=element('fieldset',null,panel);box.className='checkpoint';element('legend',tr('チェックポイント ','Checkpoint ')+(i+1),box);
   input(box,tr('チェックID','Checkpoint ID'),row.id,v=>row.id=v);input(box,tr('スキルID（カンマ区切り）','Skill IDs (comma separated)'),row.skills||'',v=>row.skills=v);
   input(box,tr('説明','Description'),row.description||'',v=>row.description=v);testFields(row,box);
   input(box,tr('True時の配点（0～1）','Weight when True (0–1)'),row.weight,v=>row.weight=v).className='checkpoint-weight';
   for(const code of languages){for(const [key,label] of [['trueMessages','True'],['falseMessages','False']]){row[key][code]??='';const e=input(box,code+' · '+label+' · CASText',row[key][code],v=>row[key][code]=v,'textarea');e.dataset.language=code;e.dataset.branch=label;}}
   const remove=element('button',tr('チェックを削除','Remove checkpoint'),box);remove.type='button';remove.disabled=model.checks.length===1;remove.onclick=()=>{model.checks.splice(i,1);renumber();renderTemplate();};
   for(const [offset,label] of [[-1,tr('上へ','Move up')],[1,tr('下へ','Move down')]]){const move=element('button',label,box);move.type='button';move.disabled=i+offset<0||i+offset>=model.checks.length;move.onclick=()=>{[model.checks[i],model.checks[i+offset]]=[model.checks[i+offset],model.checks[i]];renumber();renderTemplate();};}
  });
  const more=element('button',tr('チェックポイントを追加','Add checkpoint'),panel);more.type='button';more.onclick=()=>{let n=1;while(model.checks.some(x=>x.id==='check'+n))n++;const row=newCheck(n);row.sans='chkL['+(model.checks.length+2)+']';for(const code of languages){row.trueMessages[code]='';row.falseMessages[code]='';}model.checks.push(row);renderTemplate();};
 }
 const libraries=element('fieldset',null);$('stackVariables').parentElement.before(libraries);
 function renderLibraries(){libraries.replaceChildren();element('legend',tr('ライブラリー読み込み（MCQ共通）','Library includes (shared with MCQ)'),libraries);
  const url=input(libraries,tr('includeディレクトリーURL','Include directory URL'),localStorage.getItem('qbank-include-base')||'https://yositomi-opu.github.io/stack_questions/',v=>localStorage.setItem('qbank-include-base',v));
  for(const id of ['genmatrix_lib','trans_mat','rref_lib','polynomial_disp','texput_W','linalg_misc','ky_linear_algebra','multilang_library']){
   const b=element('button',id,libraries);b.type='button';b.onclick=()=>{try{const path=new URL(id+'.mac',url.value);if(!['http:','https:'].includes(path.protocol)||/["\\\r\n]/.test(path.href))throw Error('URL');const line='stack_include("'+path.href+'");';if(!$('stackVariables').value.includes(line))$('stackVariables').value=line+'\n'+$('stackVariables').value;}catch{$('stackStatus').textContent=tr('有効なincludeディレクトリーURLを指定してください。','Enter a valid include directory URL.');}};
  }
 }
 createButton.onclick=()=>{creating=true;editorId='';editorVersion=0;editorRevision=state?.revision;model=initialModel();templateEnabled=true;
  $('stackName').value=tr('新しいSTACK問題','New STACK question');$('stackVariables').value='ta1:1;';$('stackText').value='[[lang code="ja"]][[/lang]][[lang code="en"]][[/lang]]\n<p>[[input:ans1]][[validation:ans1]]</p>';$('stackFeedback').value='';$('stackStatus').textContent='';renderTemplate();original=fields();$('previewButton').disabled=false;$('stackEditor').showModal();};
 $('editStack').addEventListener('click',()=>{$('previewButton').disabled=false;});
 $('stackText').addEventListener('keydown',e=>{if(e.key!=='Tab'||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey)return;const text=e.target;const prefix=text.value.slice(0,text.selectionStart);const m=prefix.match(/\[\[(ans[A-Za-z0-9_]+)\]\]$/);if(!m||text.selectionStart!==text.selectionEnd)return;e.preventDefault();text.setRangeText('[[input:'+m[1]+']][[validation:'+m[1]+']]',text.selectionStart-m[0].length,text.selectionEnd,'end');text.dispatchEvent(new Event('input'));});
 renderTemplate();renderLibraries();$('language').addEventListener('change',()=>{renderTemplate();renderLibraries();});
 window.MCQ_PRACTICE={
  languages:()=>[...new Set(['ja','en',...model.checks.flatMap(r=>[...Object.keys(r.trueMessages||{}),...Object.keys(r.falseMessages||{})])])], language:()=>lang,
  snapshot:()=>({id:editorId,fields:fields(),revision:editorRevision,lang}),
  request:async(route,payload)=>(await request('/api/stack/'+route,payload)).json()
 };
})();
