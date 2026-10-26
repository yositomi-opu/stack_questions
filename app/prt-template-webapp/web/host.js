/* Standalone host for the relocated editor UI. Bank content is returned explicitly on save. */
const $=id=>document.getElementById(id);
let lang=new URLSearchParams(location.search).get('lang')==='en'?'en':'ja';
let state=null,category='',dirty=false;
let session=new URLSearchParams(location.search).get('session');
const t=key=>key==='updated'?(lang==='ja'?'保存しました':'Saved'):key;
function message(text){$('notice').textContent=text;}
async function request(url,data,raw=false){
 const headers={'X-Qbank-Request':'1','X-Editor-Session':session||''};
 const response=await fetch(url,{...(data===undefined?{}:{method:'POST',body:raw?data:JSON.stringify(data)}),headers});
 if(!response.ok){let error;try{error=(await response.json()).error;}catch{error='Request failed';}throw Error(error);}
 return response;
}
function render(){window.stackDetail=state;$('currentName').textContent=state.name;$('continueEdit').hidden=true;
 if(state.callbackOrigin&&window.opener)window.opener.postMessage({type:'qbank-editor-saved',token:state.token},state.callbackOrigin);
}
async function showDetail(){state=await(await request('/api/state')).json();window.stackDetail=state;}
async function download(route){try{const r=await request(route);const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download=route==='/api/project'?'stack-project.zip':route==='/api/original'?'original.xml':'stack-question.xml';a.click();if(route==='/api/project')dirty=false;setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){message(e.message);}}
$('language').addEventListener('change',()=>{lang=$('language').value;document.documentElement.lang=lang;});
window.addEventListener('DOMContentLoaded',async()=>{
 $('language').value=lang;document.documentElement.lang=lang;
 $('continueEdit').onclick=()=>$('editStack').click();
 $('openXml').onclick=()=>$('sourceFile').click();
 $('exportXml').onclick=()=>download('/api/xml');$('saveProject').onclick=async()=>{try{const r=await request('/api/project-export',{revision:state.revision,fields:window.PRT_EDITOR.fields()});const a=document.createElement('a');a.href=URL.createObjectURL(await r.blob());a.download='stack-project.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);window.PRT_EDITOR.markSaved();dirty=false;}catch(e){message(e.message);}};$('originalDownload').onclick=()=>download('/api/original');
 const source=document.createElement('details');const summary=document.createElement('summary');summary.textContent='XMLを参照 / View XML';const code=document.createElement('pre');source.append(summary,code);document.querySelector('main').append(source);source.ontoggle=async()=>{if(source.open){try{code.textContent=await(await request('/api/reference')).text();}catch(e){message(e.message);}}};
 $('sourceFile').onchange=async()=>{const f=$('sourceFile').files[0];if(!f)return;try{state=await(await request('/api/open',await f.arrayBuffer(),true)).json();render();$('editStack').click();}catch(e){message(e.message);}finally{$('sourceFile').value='';}};
 try{
  if(!session){const r=await(await request('/api/session',{})).json();session=r.session;history.replaceState(null,'','?session='+session);}
  await showDetail();window.generalEditor=state.editorMode==='general';if(window.generalEditor){document.title='STACK Edit WebApp';document.querySelector('header b').textContent='STACK Edit WebApp';}
  $('openXml').disabled=!!state.callbackOrigin;
  if(window.generalEditor&&!Object.keys(state.editFields).length){state.editFields={name:'New STACK',questionvariables:'',questiontext:'',generalfeedback:''};}
  if(Object.keys(state.editFields).length){render();await window.PRT_EDITOR.load(state);}else $('newStack').click();
 }catch(e){message(e.message);}
});

window.addEventListener('beforeunload',e=>{if(dirty&&!state?.callbackOrigin){e.preventDefault();e.returnValue='';}});
