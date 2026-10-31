/* Receive a single XML via an expiring local session, never a filesystem path. */
(async()=>{
 const session=new URLSearchParams(location.search).get('qbankSession');if(!session)return;
 const text=(ja,en)=>document.documentElement.lang==='en'?en:ja;
 async function call(path,data){const r=await fetch(path,{method:data===undefined?'GET':'POST',headers:{'X-Qbank-Request':'1','X-Editor-Session':session},...(data===undefined?{}:{body:JSON.stringify(data)})});const result=await r.json();if(!r.ok)throw Error(result.error);return result;}
 const status=document.createElement('p');status.setAttribute('role','status');
 const button=document.createElement('button');button.type='button';button.disabled=true;
 const backup=document.createElement('button');backup.type='button';backup.disabled=true;
 document.querySelector('main').prepend(status,button,backup);
 function labels(){const backupCaption=text('XMLをファイルに退避','Save a local XML copy');if(backup.textContent!==backupCaption)backup.textContent=backupCaption;const caption=text('保存して終了（問題バンクへ戻る）','Save and close (return to bank)');if(button.textContent!==caption)button.textContent=caption;}
 labels();new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 let opened;try{await window.MCQ_WEBAPP_READY;opened=await call('/api/qbank/state');const include=await resolveMainInclude(opened.xml);importXmlText(opened.xml,opened.name+'.xml',include);button.disabled=false;backup.disabled=false;status.textContent=text('問題バンクから読み込みました。保存して終了すると、現在のXMLを問題バンクへ返します。','Loaded from qbank. Save and close returns the current XML to the bank.');}
 catch(error){status.textContent=error.message;return;}
 window.MCQ_QBANK_SAVE_CLOSE=async()=>{button.disabled=true;try{await call('/api/qbank/save',{xml:generateXml()});if(window.opener)window.opener.postMessage({type:'qbank-editor-saved',token:opened.token},opened.origin);status.textContent=text('問題バンクへ保存しました。問題バンクで作業ZIPを保存してください。','Saved to qbank. Save its project ZIP.');window.close();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
 button.onclick=window.MCQ_QBANK_SAVE_CLOSE;
 backup.onclick=()=>{try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([generateXml()],{type:'application/xml'}));a.download='question-copy.xml';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){status.textContent=e.message;}};
})();
