/* Standalone host for the relocated editor UI. Bank content is returned explicitly on save. */
const $=id=>document.getElementById(id);
let lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'ja';
let state=null,category='',dirty=false;
let session=new URLSearchParams(location.search).get('session');
const t=key=>key==='updated'?(lang==='ja'?'保存しました':'Saved'):key;
const startupText=(ja,en)=>lang==='ja'?ja:en;
let noticeTimer;function message(text,temporary=false){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').classList.toggle('toast',temporary);if(temporary)noticeTimer=setTimeout(()=>{$('notice').textContent='';$('notice').classList.remove('toast');},3500);}
async function request(url,data,raw=false){
 const headers={'X-Qbank-Request':'1','X-Editor-Session':session||''};
 const response=await fetch(url,{...(data===undefined?{}:{method:'POST',body:raw?data:JSON.stringify(data)}),headers});
 if(!response.ok){let payload;try{payload=await response.json();}catch{payload={error:'Request failed'};}const error=Error(payload.error);error.status=response.status;error.code=payload.code;throw error;}
 return response;
}
function render(){window.stackDetail=state;$('currentName').textContent=state.name;$('continueEdit').hidden=true;
 if(state.callbackOrigin&&window.opener)window.opener.postMessage({type:'qbank-editor-saved',token:state.token},state.callbackOrigin);
}
async function showDetail(){state=await(await request('/api/state')).json();window.stackDetail=state;}
function ownSession(){try{return sessionStorage.getItem('prtStandaloneSession')===session;}catch{return false;}}
async function createStandalone(){
 const r=await(await request('/api/session',{})).json();session=r.session;
 try{sessionStorage.setItem('prtStandaloneSession',session);}catch{}
 const url=new URL(location.href);url.searchParams.set('session',session);url.searchParams.set('standalone','1');url.searchParams.set('lang',lang);history.replaceState(null,'',url);
 await showDetail();
}
function startupFailure(error){
 $('startupPanel').hidden=false;$('startupMessage').textContent=startupText('編集画面を開けませんでした。問題バンクからの編集なら、問題バンクで開き直してください。独立した問題を作る場合は「サンプルで新規開始」を選んでください。','The editor could not open. Reopen bank questions from the question bank, or start a new independent sample.');
 $('startSample').hidden=false;$('reloadEditor').hidden=false;message(error.message);
}
async function initialize(fresh=false){
 $('startupPanel').hidden=false;$('startSample').hidden=true;$('reloadEditor').hidden=true;
 let recovered=false;
 if(fresh||!session)await createStandalone();
 else{
  try{await showDetail();}
  catch(error){
   const standalone=new URLSearchParams(location.search).get('standalone')==='1'||ownSession();
   if(standalone&&(error.code==='session_expired'||(error.status===400&&/session expired/i.test(error.message)))){await createStandalone();recovered=true;}
   else throw error;
  }
 }
 window.generalEditor=state.editorMode==='general';
 if(window.generalEditor){document.title='STACK Edit WebApp';document.querySelector('header b').textContent='STACK Edit WebApp';}
 $('openXml').disabled=!!state.callbackOrigin;
 if(window.generalEditor&&!Object.keys(state.editFields).length){state.editFields={name:'New STACK',questionvariables:'',questiontext:'',generalfeedback:''};}
 $('newStack').disabled=false;
 if(Object.keys(state.editFields).length){render();await window.PRT_EDITOR.load(state);}else await $('newStack').onclick();
 if(!window.PRT_EDITOR.isOpen())throw Error(startupText('編集フォームの初期化に失敗しました。再読込してください。','The editor form did not initialize. Please reload.'));
 $('startupPanel').hidden=true;
 if(recovered)message(startupText('以前のセッションが失効したため、新規サンプルを開きました。保存済みのCSV/XMLから作業を再開できます。','The previous session expired. A new sample is open; reload your saved CSV/XML to continue.'));
}
async function download(route){try{const r=await request(route);const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download=route==='/api/project'?'stack-project.zip':route==='/api/original'?'original.xml':'stack-question.xml';a.click();if(route==='/api/project')dirty=false;setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){message(e.message);}}
$('language').addEventListener('change',()=>{lang=$('language').value;document.documentElement.lang=lang;});
window.addEventListener('DOMContentLoaded',async()=>{
 $('language').value=lang;document.documentElement.lang=lang;
 $('reloadEditor').onclick=()=>location.reload();
 $('startSample').onclick=async()=>{try{await initialize(true);message('');}catch(error){startupFailure(error);}};
 $('continueEdit').onclick=()=>$('editStack').click();
 $('openXml').onclick=()=>$('sourceFile').click();$('openProject').onclick=()=>{$('projectMenu').open=false;$('sourceFile').accept='.zip';$('sourceFile').click();};
 $('exportXml').onclick=()=>download('/api/xml');$('saveProject').onclick=async()=>{if(!window.PRT_EDITOR.requireName())return;try{const r=await request('/api/project-export',{revision:state.revision,fields:window.PRT_EDITOR.fields()});const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download='stack-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);window.PRT_EDITOR.markSaved();dirty=false;message(startupText('保存しました。','Saved.'),true);}catch(e){message(e.message);}};$('originalDownload').onclick=()=>download('/api/original');

 $('sourceFile').onchange=async()=>{const f=$('sourceFile').files[0];if(!f)return;try{state=await(await request('/api/open',await f.arrayBuffer(),true)).json();render();$('editStack').click();}catch(e){message(e.message);}finally{$('sourceFile').value='';}};
 try{await initialize();}catch(error){startupFailure(error);}
});
window.addEventListener('beforeunload',e=>{if(dirty&&!state?.callbackOrigin){e.preventDefault();e.returnValue='';}});
