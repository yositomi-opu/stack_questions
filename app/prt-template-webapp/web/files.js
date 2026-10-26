/* File handles stay in this browser tab; no client path is sent to the server. */
(()=>{
 const handles={csv:null,xml:null};const bars=[];
 const tr=(ja,en)=>lang==='ja'?ja:en;
 function status(text){message(text);$('stackStatus').textContent=text;}
 function clearHandles(){handles.csv=handles.xml=null;labels();}
 async function load(raw,format,handle){
  if(window.PRT_EDITOR.isOpen()&&!confirm(tr('現在の編集を置き換えますか？','Replace current edits?')))return;
  const next=await(await request('/api/open',raw,true)).json();
  clearHandles();if(handle)handles[format]=handle;state=next;dirty=false;
  render();await window.PRT_EDITOR.load(state);
  message((next.report||[]).join('\n'));$('stackStatus').textContent='';labels();
 }
 async function open(format){try{
  if(state?.callbackOrigin)throw Error(tr('ファイルは単独のアプリで開いてください。','Open files in a standalone app.'));
  if(window.showOpenFilePicker){const [handle]=await showOpenFilePicker({multiple:false,types:[{description:format.toUpperCase(),accept:{[format==='csv'?'text/csv':'application/xml']:['.'+format]}}]});await load(await(await handle.getFile()).arrayBuffer(),format,handle);}
  else{const f=document.createElement('input');f.type='file';f.accept='.'+format;f.onchange=async()=>{try{if(f.files[0])await load(await f.files[0].arrayBuffer(),format,null);}catch(e){status(e.message);}};f.click();}
 }catch(e){if(e.name!=='AbortError')status(e.message);}}
 async function save(format,overwrite=false,view=false){try{
  const fields=window.PRT_EDITOR.isOpen()?window.PRT_EDITOR.fields():state.editFields;
  const response=await request('/api/export',{revision:state.revision,format,fields});const blob=await response.blob();
  if(view){const d=document.createElement('dialog');const pre=document.createElement('pre');pre.textContent=await blob.text();const close=document.createElement('button');close.textContent=tr('閉じる','Close');close.onclick=()=>d.remove();d.append(close,pre);document.body.append(d);d.showModal();return;}
  if(window.showSaveFilePicker){let handle=overwrite?handles[format]:null;
   if(!handle)handle=await showSaveFilePicker({suggestedName:'prt-question.'+format,types:[{description:format.toUpperCase(),accept:{[format==='csv'?'text/csv':'application/xml']:['.'+format]}}]});
   const writer=await handle.createWritable();await writer.write(blob);await writer.close();handles[format]=handle;labels();
  }else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='prt-question.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  status(tr('保存しました。','Saved.'));dirty=false;window.PRT_EDITOR.markSaved();
 }catch(e){if(e.name!=='AbortError')status(e.message);}}
 function makeBar(parent){const bar=document.createElement('div');bar.className='file-menus';
  for(const format of ['csv','xml']){const group=document.createElement('span');const name=document.createElement('b');name.textContent=format.toUpperCase()+' ';group.append(name);
   for(const action of ['open','view','save','overwrite']){const button=document.createElement('button');button.type='button';button.dataset.format=format;button.dataset.action=action;button.onclick=()=>action==='open'?open(format):save(format,action==='overwrite',action==='view');group.append(button);}
   bar.append(group);}
  parent.append(bar);bars.push(bar);
 }
 function labels(){for(const bar of bars)for(const b of bar.querySelectorAll('button')){b.hidden=!!window.generalEditor&&b.dataset.format==='csv';b.textContent={open:tr('読込','Open'),view:tr('表示','View'),save:tr('保存','Save as'),overwrite:tr('上書','Overwrite')}[b.dataset.action];b.disabled=b.dataset.action==='overwrite'&&!window.showSaveFilePicker||b.dataset.action==='open'&&!!state?.callbackOrigin;b.title=b.dataset.action==='overwrite'?(handles[b.dataset.format]?.name||tr('保存先を選択','Choose destination')):'';}}
 window.PRT_FILES_LABELS=labels;window.PRT_FILES={clearHandles,load,save};
 window.addEventListener('DOMContentLoaded',()=>{
  makeBar(document.querySelector('header nav'));
  $('openXml').hidden=true;$('exportXml').hidden=true;$('sourceFile').accept='.xml,.zip,.csv';
  $('sourceFile').addEventListener('change',clearHandles);
  if(window.generalEditor)for(const bar of bars)for(const b of bar.querySelectorAll('[data-format="csv"]'))b.hidden=true;
  labels();
 });
 $('language').addEventListener('change',labels);
})();
