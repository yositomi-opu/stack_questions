/* Shared TF/MCQ authoring controls. Imported text is never inserted as HTML. */
(() => {
 'use strict';
 const catalog=[
  ['genmatrix_lib','行列生成','Matrix generation','指定した行列式・正則行列などを生成します。','Generate matrices with specified determinants and invertibility.'],
  ['trans_mat','基本変形','Elementary operations','基本行列・掃き出し操作。','Elementary matrices and row reduction.'],
  ['rref_lib','階段行列・核','Echelon / nullspace','階段行列の生成・判定・簡約化と核の基底。','Echelon forms, reduction and nullspace bases.'],
  ['polynomial_disp','多項式表示','Polynomial display','多項式や一次式・行列成分の表示。','Polynomial, linear-expression and matrix-entry display.'],
  ['texput_W','太字・数集合','Bold / number sets','ベクトルの太字や数集合の黒板太字表示。','Bold vectors and blackboard-bold number sets.'],
  ['linalg_misc','その他','Other','基底の判定、整数ベクトル化、外積など。','Basis checks, integer vectors, cross products and more.'],
  ['ky_linear_algebra','旧一括版','Legacy bundle','上の6つをまとめて読み込みます。','Load the six libraries above together.']
 ];
 const DEFAULT_BASE='https://yositomi-opu.github.io/stack_questions/';
 function normalize(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||/[\s"\\]/.test(value))throw Error('HTTP(S) Base URL / HTTP(S)のBase URLを指定してください。');u.pathname=u.pathname.replace(/\/+$/,'')+'/';return u.href;}
 function id(url){try{const file=new URL(url).pathname.split('/').pop();return [...catalog.map(r=>r[0]),'multilang_library'].find(k=>file===k+'.mac'||file===k+'.txt')||'';}catch{return '';}}
 function infer(urls,fallback=DEFAULT_BASE){const preferred=urls.find(u=>id(u)==='multilang_library')||urls.find(u=>id(u));try{return preferred?new URL('./',preferred).href:normalize(fallback);}catch{return DEFAULT_BASE;}}
 function chooseBase({current,libraries,request,onSave,language}){
  const en=language()==='en',text=(ja,enText)=>en?enText:ja;
  const dialog=document.createElement('dialog');dialog.className='library-base-dialog';dialog.setAttribute('aria-label',text('Base URLを変更','Change Base URL'));
  const title=document.createElement('h2');title.textContent=text('Base URLを変更','Change Base URL');
  const label=document.createElement('label');label.textContent='stack_include Base URL';const input=document.createElement('input');input.type='url';input.value=current;input.spellcheck=false;input.autocomplete='off';input.setAttribute('aria-label','New Base URL');label.append(input);
  const hint=document.createElement('p');hint.textContent=text('必須・選択中のライブラリーを取得できるか確認してから保存します。','Save after checking that required and selected libraries are available.');
  const status=document.createElement('p');status.setAttribute('role','status');const save=document.createElement('button'),cancel=document.createElement('button');save.textContent=text('確認して保存','Check and save');cancel.textContent=text('キャンセル','Cancel');
  let busy=false;cancel.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());save.onclick=async()=>{if(busy)return;busy=true;save.disabled=true;const value=input.value;const ids=libraries();try{const base=normalize(value);status.textContent=text('確認中…','Checking…');const result=await request({baseUrl:base,libraries:ids});if(!dialog.open)return;if(input.value!==value||JSON.stringify(libraries())!==JSON.stringify(ids))throw Error(text('設定が変わったため、もう一度確認してください。','Settings changed; check again.'));if(!result.ok||result.baseUrl!==base)throw Error(result.error||'Validation failed');await onSave(base);dialog.close();}catch(e){status.textContent=e.message;}finally{busy=false;save.disabled=false;}};
  dialog.append(title,label,hint,status,save,cancel);document.body.append(dialog);dialog.showModal();input.focus();
 }
 window.AuthoringSettings={catalog,DEFAULT_BASE,normalize,id,infer,chooseBase};
})();
