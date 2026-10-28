/* File handles stay in this browser tab; no client path is sent to the server. */
(()=>{
 const handles={csv:null,xml:null};const bars=[];
 const tr=(ja,en)=>lang==='ja'?ja:en;
 function status(text){message(text);$('stackStatus').textContent='';}
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
  if(!view&&!window.PRT_EDITOR.requireName())return;
  const fields=window.PRT_EDITOR.isOpen()?window.PRT_EDITOR.fields():state.editFields;
  const title=fields.name.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\.(csv|xml)$/i,'').replace(/^011\./,'').replace(/-(ch|tr)$/,'')||'question';
  const mode=fields.template?JSON.parse(fields.template).mode:'chain';const filename=format==='csv'?title+'.csv':(window.generalEditor?title:'011.'+title+'-'+(mode==='tree'?'tr':'ch'))+'.xml';
  const response=await request('/api/export',{revision:state.revision,format,fields});const blob=await response.blob();
  if(view){const d=document.createElement('dialog');const pre=document.createElement('pre');pre.textContent=await blob.text();const close=document.createElement('button');close.textContent=tr('閉じる','Close');close.onclick=()=>d.remove();d.append(close,pre);document.body.append(d);d.showModal();return;}
  if(window.showSaveFilePicker){let handle=overwrite?handles[format]:null;
   if(!handle)handle=await showSaveFilePicker({suggestedName:filename,types:[{description:format.toUpperCase(),accept:{[format==='csv'?'text/csv':'application/xml']:['.'+format]}}]});
   const writer=await handle.createWritable();await writer.write(blob);await writer.close();handles[format]=handle;labels();
  }else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  message(tr('保存しました。','Saved.'),true);$('stackStatus').textContent='';dirty=false;window.PRT_EDITOR.markSaved();
 }catch(e){if(e.name!=='AbortError')status(e.message);}}
 function makeBar(parent){const bar=document.createElement('div');bar.className='file-menus';
  for(const format of ['csv','xml']){const group=document.createElement('details');group.className='file-menu';group.dataset.fileFormat=format;const name=document.createElement('summary');name.textContent=format.toUpperCase();group.append(name);const items=document.createElement('div');items.className='menu-items';group.append(items);
   for(const action of ['open','view','save','overwrite']){const button=document.createElement('button');button.type='button';button.dataset.format=format;button.dataset.action=action;button.onclick=()=>{group.open=false;return action==='open'?open(format):save(format,action==='overwrite',action==='view');};items.append(button);}
   bar.append(group);}
  parent.append(bar);bars.push(bar);
 }
 function labels(){for(const bar of bars)for(const group of bar.querySelectorAll('[data-file-format]'))group.hidden=!!window.generalEditor&&group.dataset.fileFormat==='csv';for(const bar of bars)for(const b of bar.querySelectorAll('button')){b.hidden=!!window.generalEditor&&b.dataset.format==='csv';b.textContent={open:tr('読込','Open'),view:tr('表示','View'),save:tr('保存','Save as'),overwrite:tr('上書','Overwrite')}[b.dataset.action];b.disabled=b.dataset.action==='overwrite'&&!window.showSaveFilePicker||b.dataset.action==='open'&&!!state?.callbackOrigin;b.title=b.dataset.action==='overwrite'?(handles[b.dataset.format]?.name||tr('保存先を選択','Choose destination')):'';}}
 window.PRT_FILES_LABELS=labels;window.PRT_FILES={clearHandles,load,save};
 window.addEventListener('DOMContentLoaded',()=>{
  makeBar($('fileMenus'));
  document.addEventListener('click',e=>document.querySelectorAll('header details[open]').forEach(d=>{if(!d.contains(e.target))d.open=false;}));
  $('openXml').hidden=true;$('exportXml').hidden=true;$('sourceFile').accept='.xml,.zip,.csv';
  $('sourceFile').addEventListener('change',clearHandles);
  if(window.generalEditor)for(const bar of bars)for(const b of bar.querySelectorAll('[data-format="csv"]'))b.hidden=true;
  labels();
 });
 $('language').addEventListener('change',labels);
})();
