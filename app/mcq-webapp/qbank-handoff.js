/* Receive a single XML via an expiring local session, never a filesystem path. */
(async()=>{
 const session=new URLSearchParams(location.search).get('qbankSession');if(!session)return;
 const text=(ja,en)=>document.documentElement.lang==='en'?en:ja;
 async function call(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{'X-Qbank-Request':'1','X-Editor-Session':session},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
 const status=document.createElement('p');status.setAttribute('role','status');
 const button=document.createElement('button');button.type='button';button.disabled=true;
 document.querySelector('main').prepend(status,button);
 function labels(){const caption=text('問題バンクに反映','Apply to question bank');if(button.textContent!==caption)button.textContent=caption;}
 labels();new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 let opened;try{await window.MCQ_WEBAPP_READY;opened=await call('/api/qbank/state');const include=await resolveMainInclude(opened.xml);importXmlText(opened.xml,opened.name+'.xml',include);button.disabled=false;status.textContent=text('問題バンクから読み込みました。入力欄やPRT構造の変更は自動返却せず、XML出力で確認します。','Loaded from qbank. Input or PRT structural changes require XML export and review.');}
 catch(error){status.textContent=error.message;return;}
 button.onclick=async()=>{button.disabled=true;try{await call('/api/qbank/save',{xml:generateXml()});if(window.opener)window.opener.postMessage({type:'qbank-editor-saved',token:opened.token},opened.origin);status.textContent=text('問題バンクへ反映しました。問題バンク画面を更新し、作業ZIPを保存してください。','Applied to qbank. Refresh the bank and save its project ZIP.');}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
})();
