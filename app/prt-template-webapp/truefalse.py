"""True/False STACK authoring; imported CAS/CASText is parsed, never executed."""
import copy
import json
import re
import xml.etree.ElementTree as E
from pathlib import Path
from urllib.parse import urlsplit
from prt_nodes import statements, defined, comment_spans, as_string, quote, literal_messages, msg_expr, HELPERS, DEFAULT_INCLUDE

TEMPLATE=Path(__file__).resolve().parents[1]/'tf-webapp/template.xml'
BEGIN='/* TF_GENERATED_BEGIN */'
END='/* TF_GENERATED_END */'
USER_BEGIN='/* TF_USER_BEGIN */'
USER_END='/* TF_USER_END */'
LANGUAGES=['ja','en','fr','it','de','pt','zh','ko','ru','sv','es']


def clean(s):
    for a,b in reversed(list(comment_spans(s))):s=s[:a]+s[b:]
    return s.strip()


def textmap(value,languages,nonempty=True):
    if not isinstance(value,dict) or any(not isinstance(k,str) or not isinstance(v,str) or len(v.encode())>65536 for k,v in value.items()):raise ValueError('Invalid text / 文章の形式が不正です。')
    if any(not value.get(k,'').strip() for k in languages) and nonempty:raise ValueError('Provide every selected translation / 選択した全言語の文章を入力してください。')


def validate(m,complete=True):
    if not isinstance(m,dict) or m.get('version')!=4 or m.get('mode')!='truefalse':raise ValueError('Invalid TF model')
    langs=m.get('languages')
    if not isinstance(langs,list) or not 1<=len(langs)<=20 or any(not isinstance(x,str) or not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]+)*',x) for x in langs) or len(set(langs))!=len(langs) or m.get('baseLanguage') not in langs:raise ValueError('Invalid languages / 言語の設定を確認してください。')
    if type(m.get('%_noidea')) is not bool:raise ValueError('%_noidea must be boolean')
    if complete and m['%_noidea']:raise ValueError('This template does not support %_noidea:true; use Off for XML/preview or save a CSV draft / このTemplateは「わからない」に未対応です。XML出力・プレビューにはOffにするか、CSVの下書きで保存してください。')
    if m.get('truth') not in ('random','true','false'):raise ValueError('Invalid truth selection')
    for side in ('correct','wrong'):
        rows=m.get(side)
        if not isinstance(rows,list) or not 1<=len(rows)<=100:raise ValueError('Keep 1–100 assertions on each side / 正・誤とも主張を1～100件にしてください。')
        for row in rows:
            if not isinstance(row,dict) or type(row.get('dependent')) is not bool or not isinstance(row.get('shared'),str) or len(row['shared'].encode())>65536:raise ValueError('Invalid assertion')
            textmap(row.get('messages'),langs,nonempty=complete and row['dependent'])
            if complete and not row['dependent'] and not row['shared'].strip():raise ValueError('Shared assertion is empty / 言語非依存の主張を入力してください。')
    for key in ('prompt','msgT','msgF'):textmap(m.get(key),langs,nonempty=complete and key=='prompt')
    labels=m.get('labels')
    if not isinstance(labels,dict) or any(not isinstance(labels.get(k),list) or len(labels[k])!=2 or any(not isinstance(t,str) or (complete and not t.strip()) or len(t)>200 for t in labels[k]) for k in langs):raise ValueError('Provide True/False labels for every language / 全言語の正誤ラベルが必要です。')
    includes=m.get('includes')
    if not isinstance(includes,list) or not 1<=len(includes)<=30:raise ValueError('Invalid include URLs')
    for url in includes:
        if not isinstance(url,str):raise ValueError('Invalid include URL')
        p=urlsplit(url)
        if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or any(c in url for c in '\r\n'):raise ValueError('Use HTTP(S) include URLs without credentials')
    if not any(urlsplit(url).path.endswith('/multilang_library.mac') for url in includes):raise ValueError('multilang_library.mac is required / 多言語ライブラリーが必要です。')
    return m


def import_model(q):
    code=q.findtext('questionvariables/text','')
    if len(q.findall('input'))!=1 or q.findtext('input/type')!='dropdown' or q.findtext('input/tans')!='va1' or len(q.findall('prt'))!=1 or len(q.findall('prt/node'))!=1 or q.findtext('prt/node/sans')!='[ans1]' or q.findtext('prt/node/tans')!='ta1' or q.findtext('prt/node/answertest')!='AlgEquiv':raise ValueError('Not a supported TF template / 対応するTF Templateではありません。')
    defs={};includes=[];extra=[]
    managed={'%_tf','%_tfmsgL','va1','qtext0','qtext','ta1','msgT','msgF','%_noidea'}
    for raw in statements(code):
        s=clean(raw)
        inc=re.fullmatch(r'stack_include\(\s*("(?:\\.|[^"\\])*")\s*\)\s*[;$]',s)
        if inc:includes.append(as_string(inc[1]));continue
        name=defined(s)
        if name in managed or re.fullmatch(r'Assert[CW][1-9][0-9]*',name or ''):
            if name in defs:raise ValueError('Duplicate TF variable: '+name)
            defs[name]=s.split(':',1)[1].rstrip(';$').strip()
        elif s:extra.append(raw)
    def localized(expr):
        # Correct the supplied Korean prompt's castxt typo in generated code only.
        result=literal_messages(expr.replace('castxt(', 'castext('))
        if not result:raise ValueError('Expected literal multilingual CASText / 多言語CASTextの形式を確認してください。')
        return result
    prompt=localized(defs.get('qtext0',''));langs=list(prompt)
    truth={'rand([1,2])':'random','1':'true','2':'false'}.get(re.sub(r'\s+','',defs.get('%_tf','')))
    if not truth:raise ValueError('Unsupported %_tf expression')
    model=dict(version=4,mode='truefalse',languages=langs,baseLanguage='ja' if 'ja' in langs else langs[0],truth=truth,prompt=prompt,msgT=localized(defs.get('msgT','')),msgF=localized(defs.get('msgF','')),includes=includes,labels={})
    # Label pairs are plain strings, not CASText.
    from prt_nodes import split_list
    expr=defs.get('%_tfmsgL','')
    if not expr.startswith('%__lang(') or not expr.endswith(')'):raise ValueError('Unsupported TF labels')
    for row in split_list(expr[len('%__lang('):-1]):
        key,value=split_list(row);model['labels'][as_string(key)]=[as_string(x) for x in split_list(value)]
    for side,prefix in [('correct','AssertC'),('wrong','AssertW')]:
        names=sorted((n for n in defs if n.startswith(prefix)),key=lambda n:int(n[len(prefix):]))
        if names!=[prefix+str(i) for i in range(1,len(names)+1)]:raise ValueError('Assertion numbers must be contiguous')
        model[side]=[]
        for name in names:
            expr=defs[name]
            if expr.startswith('%__lang('):model[side].append(dict(dependent=True,messages=localized(expr),shared=''))
            elif expr.startswith('castext("') and expr.endswith(')'):model[side].append(dict(dependent=False,messages={},shared=as_string(expr[8:-1])))
            else:raise ValueError('Unsupported assertion expression; use CASText')
    model['%_noidea']=defs.get('%_noidea','false')=='true'
    if '%_noidea' in defs and defs['%_noidea'] not in ('true','false'):raise ValueError('Invalid %_noidea')
    expected='qtext:castext_concat(qtext0,[rand(['+','.join('AssertC'+str(i+1) for i in range(len(model['correct'])))+']),rand(['+','.join('AssertW'+str(i+1) for i in range(len(model['wrong'])))+'])][%_tf]);'
    if re.sub(r'\s+','','qtext:'+defs.get('qtext','')+';')!=expected:raise ValueError('Unsupported statement selection / 主張の選択式が未対応です。')
    validate(model)
    return model,''.join(extra).strip()


def sample():
    root=E.fromstring(TEMPLATE.read_bytes());return import_model(root.find('question'))


def base_variables(code):
    spans=[];begin=None;user='';user_start=None
    for a,b in comment_spans(code):
        text=code[a:b]
        if text==BEGIN:begin=a
        elif text==END and begin is not None:spans.append((begin,b));begin=None
        elif text==USER_BEGIN:user_start=b
        elif text==USER_END and user_start is not None:
            user=code[user_start:a].strip();user_start=None
        elif re.match(r'/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+',text):
            try:
                meta=json.loads(re.sub(r'^/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+','',text)[:-2])
                if meta.get('template',{}).get('mode')=='truefalse':spans.append((a,b))
            except (ValueError,AttributeError):pass
    for a,b in sorted(spans,reverse=True):code=code[:a]+code[b:]
    return (code.strip()+'\n'+user).strip()


def generated_variables(code,m):
    validate(m)
    if any(code[a:b] in (BEGIN,END,USER_BEGIN,USER_END) for a,b in comment_spans(code)):
        from authoring import template_metadata
        if not template_metadata(code):raise ValueError('TF generated markers are reserved / TF生成用コメントは予約されています。')
    base=base_variables(code)
    if any(base[a:b] in (BEGIN,END,USER_BEGIN,USER_END) for a,b in comment_spans(base)):raise ValueError('TF generated markers are reserved / TF生成用コメントは予約されています。')
    reserved={'%_tf','%_tfmsgL','%_noidea','va1','qtext0','qtext','ta1','msgT','msgF','%__mcq_lang','%__prt_get'}
    if any(defined(s) in reserved or re.fullmatch(r'Assert[CW]\d+',defined(s) or '') for s in statements(base)):raise ValueError('TF variable name conflict / 問題変数にTF予約変数が重複しています。')
    lines=[BEGIN]+['stack_include('+quote(url)+');' for url in m['includes']]+[HELPERS]
    lines+=['%_tf:'+{'random':'rand([1, 2])','true':'1','false':'2'}[m['truth']]+';', '%_noidea:false;']
    lines += [USER_BEGIN,base,USER_END]
    langs=m['languages'];labels={k:m['labels'][k] for k in langs}
    lines+=['%_tfmsgL:%__mcq_lang(['+', '.join('['+quote(k)+', ['+', '.join(quote(t) for t in labels[k])+']]' for k in langs)+'], %_STACK_LANG);','va1:makelist([k, if k=%_tf then true else false, if k=0 then "-" else %_tfmsgL[k]], k, 0, 2);']
    for key in ('prompt',):lines.append('qtext0:'+msg_expr({k:m[key][k] for k in langs})+';')
    for side,prefix in [('correct','AssertC'),('wrong','AssertW')]:
        for i,row in enumerate(m[side],1):lines.append(prefix+str(i)+':'+(msg_expr({k:row['messages'][k] for k in langs}) if row['dependent'] else 'castext('+quote(row['shared'])+')')+';')
    pool=lambda side,prefix:'rand(['+', '.join(prefix+str(i+1) for i in range(len(m[side])))+'])'
    lines+=['qtext:castext_concat(qtext0, ['+pool('correct','AssertC')+', '+pool('wrong','AssertW')+'][%_tf]);','ta1:mcq_correct(va1);']
    for key in ('msgT','msgF'):lines.append(key+':'+msg_expr({k:m[key].get(k,'') for k in langs})+';')
    lines.append(END)
    # User variables are inside the generated block but stored separately in fields/CSV.
    return '\n'.join(lines)+'\n'


def layout(m):
    blocks=''.join('[[lang code="'+lang+('' if i<len(m['languages'])-1 else ',other')+'"]][[/lang]]' for i,lang in enumerate(m['languages']))
    return '<p>'+blocks+'</p>\n<p>{@qtext@}</p>\n<p>[[input:ans1]] [[validation:ans1]]</p>'


def compile_tf(m):
    validate(m);q=E.fromstring(TEMPLATE.read_bytes()).find('question');sections=E.Element('sections')
    for tag in ('input','prt'):sections.append(copy.deepcopy(q.find(tag)))
    node=sections.find('prt/node')
    for key,var in [('truefeedback','msgT'),('falsefeedback','msgF')]:node.find(key+'/text').text='<p>{@'+var+'@}</p>'
    sections.append(E.Comment('qbank-template:'+json.dumps(m,ensure_ascii=True).replace('--','\\u002d\\u002d')))
    return sections
