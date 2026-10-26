"""Node-list PRT codec. Imported Maxima and CASText are preserved, never evaluated."""
import json
import re
import xml.etree.ElementTree as E
from decimal import Decimal, InvalidOperation

BEGIN='/* PRT_TEMPLATE_GENERATED_BEGIN */'
END='/* PRT_TEMPLATE_GENERATED_END */'

def statements(code):
    """Split only at top-level Maxima terminators, preserving strings and comments."""
    start=0;depth=0;quoted=False;comment=0;i=0
    while i<len(code):
        c=code[i];pair=code[i:i+2]
        if comment:
            if pair=='/*':comment+=1;i+=2;continue
            if pair=='*/':comment-=1;i+=2;continue
        elif quoted:
            if c=='\\':i+=2;continue
            if c=='"':quoted=False
        elif pair=='/*':comment=1;i+=2;continue
        elif c=='"':quoted=True
        elif c in '([':depth+=1
        elif c in ')]':depth-=1
        elif c in ';$' and depth==0:
            yield code[start:i+1];start=i+1
        i+=1
    if code[start:]:yield code[start:]

def clean_prefix(s):
    return re.sub(r'/\*[\s\S]*?\*/','',s).strip()

def defined(s):
    m=re.match(r'([%\w]+)\s*(?:\([^;]*?\))?\s*:(?:=)?',clean_prefix(s))
    return m.group(1) if m else None

def split_list(s):
    s=s.strip()
    if not(s.startswith('[') and s.endswith(']')):raise ValueError('Expected a Maxima list')
    # Top-level commas act as statement boundaries for the scanner.
    out=[];start=1;depth=0;quote=False;i=1
    while i<len(s)-1:
        c=s[i]
        if quote:
            if c=='\\':i+=2;continue
            if c=='"':quote=False
        elif c=='"':quote=True
        elif c in '([':depth+=1
        elif c in ')]':depth-=1
        elif c==',' and depth==0:out.append(s[start:i].strip());start=i+1
        i+=1
    if s[start:-1].strip():out.append(s[start:-1].strip())
    return out

def as_string(expr):
    # Decode only Maxima string quoting, without interpreting TeX escapes.
    if not(expr.startswith('"') and expr.endswith('"')):return '{@'+expr+'@}'
    return re.sub(r'\\(.)',r'\1',expr[1:-1])

def feedback_value(expr):
    expr=expr.strip()
    if expr.startswith('%__lang(') and expr.endswith(')'):
        try:
            result={}
            for row in split_list(expr[len('%__lang('):-1]):
                lang,text=split_list(row);result[as_string(lang)]=as_string(text)
            if result and all(re.fullmatch(r'[a-zA-Z][\w-]*',k) for k in result):return result
        except ValueError:pass
    return {'ja':as_string(expr)}

def managed_name(name):
    return name in ('%_Num_Nodes','scL','%_fmsgL') or bool(re.fullmatch(r'%_fmsg\d+[TF]?',name or ''))

def import_pattern(q):
    """Recognize the supplied fixed pattern only. Unknown structures remain basic XML."""
    if any(len(c) for inp in q.findall('input') for c in inp):return None
    prts=q.findall('prt')
    if len(prts)!=1:return None
    p=prts[0];nodes=p.findall('node');code=q.findtext('questionvariables/text','')
    values={defined(s):clean_prefix(s).split(':',1)[1].rstrip(';$').strip() for s in statements(code) if defined(s) and ':=' not in clean_prefix(s)}
    try:n=int(values.get('%_Num_Nodes',''))
    except ValueError:return None
    if not 1<=n<=100 or len(nodes)!=n+2:return None
    if [x.findtext('name') for x in nodes]!=[str(i) for i in range(n+2)]:return None
    if nodes[0].findtext('sans')!='chkV' or nodes[0].findtext('tans')!='false' or nodes[1].findtext('sans')!='chkL[1]':return None
    mode='chain' if all(x.findtext('truenextnode')==str(i+3 if i<n-1 else -1) for i,x in enumerate(nodes[2:])) else 'tree'
    for i,x in enumerate(nodes[2:]):
        nxt=str(i+3 if i<n-1 else -1)
        if x.findtext('sans')!=f'chkL[{i+2}]' or x.findtext('tans')!='true' or x.findtext('falsenextnode')!=nxt or x.findtext('truenextnode')!=(nxt if mode=='chain' else '-1'):return None
    if '%_chkfunc' not in code or '%_validate' not in code:return None
    # Do not discard arbitrary custom feedback-variable programs during recognition.
    allowed_defs={'ssc1','scL','ansL','chkV','FeedbackMsg','chkL','sc'}
    for statement in statements(p.findtext('feedbackvariables/text','')):
        compact=re.sub(r'\s+','',clean_prefix(statement))
        if not compact:continue
        name=defined(statement)
        if name in allowed_defs:continue
        if compact.startswith('ifchkVthenchkL:%_chkfunc(ansL)elsechkL:makelist(false,%_Num_Nodes+1)'):continue
        if compact in (
            'fork:1thru%_Num_NodesdoifchkL[k+1]thenFeedbackMsg:sconcat(FeedbackMsg,%_fmsgL[k][1])elseFeedbackMsg:sconcat(FeedbackMsg,%_fmsgL[k][2]);',
            'fork:1thru%_Num_NodesdoifchkL[k+1]thensc:sc+scL[k];',
            'ifchkVthenfork:1thru%_Num_NodesdoifchkL[k+1]thensc:sc+scL[k];'):continue
        return None

    try:weights=split_list(values['scL'])
    except (KeyError,ValueError):return None
    if len(weights)!=n:return None
    model={'version':2,'mode':mode,'inputs':[],'checks':[], 'validationCode':'','checkCode':'', 'validation':{'answertest':'AlgEquiv','sans':'chkV','tans':'false','testoptions':'','feedback':nodes[0].findtext('truefeedback/text','')},'correct':{'answertest':'AlgEquiv','sans':'chkL[1]','tans':'true','testoptions':'','feedback':nodes[1].findtext('truefeedback/text','')}}
    for s in statements(code):
        if defined(s)=='%_validate':model['validationCode']=s.strip()
        if defined(s)=='%_chkfunc':model['checkCode']=s.strip()
    for inp in q.findall('input'):
        model['inputs'].append({c.tag:c.text or '' for c in inp})
    for i,x in enumerate(nodes[2:]):
        model['checks'].append({'id':f'check{i+1}','skills':'','description':x.findtext('description',''), 'weight':weights[i], 'answertest':x.findtext('answertest','AlgEquiv'),'sans':f'chkL[{i+2}]','tans':x.findtext('tans','true'),'testoptions':x.findtext('testoptions',''), 'trueMessages':feedback_value(values.get(f'%_fmsg{i+1}T','""')), 'falseMessages':feedback_value(values.get(f'%_fmsg{i+1}F','""'))})
    # Any recognized template import is explicit in the UI; original XML stays separate.
    return model

def comment_spans(code):
    quoted=False;depth=0;start=0;i=0
    while i<len(code):
        pair=code[i:i+2];c=code[i]
        if depth:
            if pair=='/*':depth+=1;i+=2;continue
            if pair=='*/':
                depth-=1;i+=2
                if not depth:yield start,i
                continue
        elif quoted:
            if c=='\\':i+=2;continue
            if c=='"':quoted=False
        elif c=='"':quoted=True
        elif pair=='/*':start=i;depth=1;i+=2;continue
        i+=1

def base_variables(code):
    ranges=[];begin=None
    for start,end in comment_spans(code):
        text=code[start:end]
        if text==BEGIN:begin=start
        elif text==END and begin is not None:ranges.append((begin,end));begin=None
        elif re.match(r'/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+',text):
            try:
                body=re.sub(r'^/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+','',text)[:-2]
                data=json.loads(body)
                if data.get('schema')=='prt-template-webapp-v1':ranges.append((start,end))
            except (ValueError,AttributeError):pass
    for start,end in sorted(ranges,reverse=True):code=code[:start]+code[end:]
    return ''.join(s for s in statements(code) if not(managed_name(defined(s)) or defined(s) in ('%_validate','%_chkfunc'))).rstrip()

def quote(text):return '"'+text.replace('\\','\\\\').replace('"','\\"')+'"'

def msg_expr(messages):
    # Same language selection/fallback helper used by MCQ; CASText remains source.
    return '%__mcq_lang(['+', '.join('['+quote(k)+', '+'castext('+quote(v)+')'+']' for k,v in messages.items())+'], %_STACK_LANG)'

HELPERS='''%__prt_get(L,s):=block([r:"",x],for x in L do if first(x)=s then r:second(x),r);
%__mcq_lang(L,s):=block([r],r:%__prt_get(L,s),if r="" then r:%__prt_get(L,"en"),if r="" and length(L)>0 then r:second(first(L)),r);
'''

def validate(m):
    if m.get('version')!=2 or m.get('mode') not in ('tree','chain'):raise ValueError('Invalid PRT template version/mode')
    if not isinstance(m.get('checks'),list) or not 1<=len(m['checks'])<=100:raise ValueError('Use 1–100 checkpoints / チェック数は1～100です。')
    if not isinstance(m.get('inputs'),list) or not 1<=len(m['inputs'])<=32:raise ValueError('Use 1–32 inputs')
    for key in ('validationCode','checkCode'):
        if not isinstance(m.get(key),str) or not m[key].strip():raise ValueError('Define Validation and check functions / Validation・チェック関数を定義してください。')
    names=set()
    for inp in m['inputs']:
        name=inp.get('name','')
        if not re.fullmatch(r'ans[A-Za-z0-9_]+',name) or name in names:raise ValueError('Invalid/duplicate input name')
        names.add(name)
        if not inp.get('type') or not inp.get('tans'):raise ValueError('Input type/model answer required')
        if any(not isinstance(v,str) for v in inp.values()):raise ValueError('Invalid input settings')
    ids=set();total=Decimal(0)
    for row in m['checks']:
        if not isinstance(row.get('id'),str) or not row['id'] or row['id'] in ids:raise ValueError('Duplicate checkpoint ID')
        ids.add(row['id'])
        try:w=Decimal(row['weight'])
        except (InvalidOperation,KeyError,TypeError):raise ValueError('Invalid checkpoint weight')
        if not w.is_finite() or not 0<=w<=1:raise ValueError('Weights must be between 0 and 1')
        total+=w
        for key in ('trueMessages','falseMessages'):
            messages=row.get(key)
            if not isinstance(messages,dict) or not messages or any(not isinstance(k,str) or not re.fullmatch(r'[a-zA-Z][\w-]*',k) or not isinstance(v,str) for k,v in messages.items()):raise ValueError('Invalid feedback languages')
    if total>1:raise ValueError('Checkpoint weights exceed 1 / 配点合計が1を超えています。')
    for row in [m['validation'],m['correct']]+m['checks']:
        for key in ('sans','tans','answertest','testoptions'):
            if not isinstance(row.get(key),str) or (key!='testoptions' and not row[key].strip()):raise ValueError('Answer test and expressions required')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*',row['answertest']):raise ValueError('Invalid answer test name')
    return m

def compile_nodes(m):
    validate(m);root=E.Element('sections')
    def put(p,k,v):E.SubElement(p,k).text=str(v)
    def rich(p,k,v):put(E.SubElement(p,k,{'format':'html'}),'text',v)
    for inp in m['inputs']:
        x=E.SubElement(root,'input')
        defaults=dict(boxsize='4',strictsyntax='1',insertstars='1',syntaxhint='',syntaxattribute='0',forbidwords='',allowwords='',forbidfloat='1',requirelowestterms='0',checkanswertype='0',mustverify='0',showvalidation='0',options='allowempty')
        for k,v in (defaults|inp).items():
            if not re.fullmatch(r'[A-Za-z][\w]*',k):raise ValueError('Invalid input setting')
            put(x,k,v)
    p=E.SubElement(root,'prt')
    for k,v in dict(name='prt1',value='1',autosimplify='1',feedbackstyle='1').items():put(p,k,v)
    n=len(m['checks'])
    fv='ansL:['+', '.join(x['name'] for x in m['inputs'])+'];\nchkV:%_validate(ansL);\nif chkV then chkL:%_chkfunc(ansL) else chkL:makelist(false,%_Num_Nodes+1);\nsc:0;\nif chkV then for k:1 thru %_Num_Nodes do if chkL[k+1] then sc:sc+scL[k];\n'
    rich(p,'feedbackvariables',fv)
    for i,row in enumerate([m['validation'],m['correct']]+m['checks']):
        x=E.SubElement(p,'node');nxt=i+1 if i<n+1 else -1
        config=dict(name=i,description=row.get('description','Validation' if i==0 else 'Correctness' if i==1 else row['id']),answertest=row['answertest'],sans=row['sans'],tans=row['tans'],testoptions=row['testoptions'],quiet='1',truescoremode='=' if i<2 else '+',truescore='1' if i==1 else '0',truepenalty='',truenextnode=nxt if i>=2 and m['mode']=='chain' else -1,trueanswernote=f'prt1-{i}-T',falsescoremode='=' if i<2 else '+',falsescore='sc' if i==1 else '0',falsepenalty='',falsenextnode=nxt,falseanswernote=f'prt1-{i}-F')
        for k,v in config.items():put(x,k,v)
        rich(x,'truefeedback',row.get('feedback','') if i<2 else '{@%_fmsg'+str(i-1)+'T@}')
        rich(x,'falsefeedback','' if i<2 else '{@%_fmsg'+str(i-1)+'F@}')
    root.append(E.Comment('qbank-template:'+json.dumps(m,ensure_ascii=True).replace('--','\\u002d\\u002d')))
    return root

def generated_variables(code,m):
    validate(m);base=base_variables(code)
    # Keep user MCQ helper when already defined; otherwise use the same interface/fallback.
    helpers='' if '%__mcq_lang(' in base else HELPERS
    lines=[BEGIN,helpers,m['validationCode'],m['checkCode'],f'%_Num_Nodes:{len(m["checks"])};', 'scL:['+', '.join(x['weight'] for x in m['checks'])+'];']
    for i,row in enumerate(m['checks'],1):
        for suffix,key in [('T','trueMessages'),('F','falseMessages')]:lines.append(f'%_fmsg{i}{suffix}:'+msg_expr(row[key])+';')
    lines.append('%_fmsgL:['+', '.join(f'[%_fmsg{i}T,%_fmsg{i}F]' for i in range(1,len(m['checks'])+1))+'];')
    lines.append(END)
    return base+'\n'+'\n'.join(lines)+'\n'
