"""Parsons proof authoring. Static parsing only; Maxima/CASText never executes here."""
import itertools
import json
import re
import xml.etree.ElementTree as E
from prt_nodes import statements, clean_prefix, split_list, as_string, quote, msg_expr, HELPERS, DEFAULT_INCLUDE, comment_spans, defined

BEGIN='/* PARSONS_GENERATED_BEGIN */'
END='/* PARSONS_GENERATED_END */'


def validate(m):
    if not isinstance(m,dict) or m.get('version')!=3 or m.get('mode')!='parsons':raise ValueError('Invalid Parsons model')
    languages=m.get('languages');steps=m.get('steps');answer=m.get('answer');alternatives=m.get('alternatives',[])
    if not isinstance(languages,list) or not 1<=len(languages)<=20 or len(set(languages))!=len(languages) or any(not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]+)*',x) for x in languages):raise ValueError('Invalid languages')
    if m.get('baseLanguage') not in languages or not isinstance(steps,list) or not 1<=len(steps)<=100:raise ValueError('Use 1–100 proof steps')
    ids=[]
    for step in steps:
        if not isinstance(step,dict) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,39}',step.get('id','')) or step['id'] in ids:raise ValueError('Unique step IDs are required')
        ids.append(step['id']);messages(step.get('messages'),languages)
    messages(m.get('question'),languages)
    for branch in ('true','false'):messages(m.get('feedback',{}).get(branch),languages)
    if not isinstance(alternatives,list) or len(alternatives)>128:raise ValueError('At most 128 alternative orders')
    for order in [answer]+alternatives:
        if not isinstance(order,list) or not order or any(not isinstance(x,str) for x in order) or len(set(order))!=len(order) or set(order)-set(ids):raise ValueError('Answers must contain unique, known step IDs')
    if m.get('grading','orders') not in ('orders','dag'):raise ValueError('Unknown grading mode')
    constraints=m.get('constraints',[])
    if not isinstance(constraints,list) or len(constraints)>200:raise ValueError('Invalid order constraints')
    for chain in constraints:
        if not isinstance(chain,list) or len(chain)<2 or len(chain)!=len(set(chain)) or set(chain)-set(answer):raise ValueError('Order constraints must use required answer steps')
        if any(answer.index(a)>=answer.index(b) for a,b in zip(chain,chain[1:])):raise ValueError('Teacher answer conflicts with order constraints / 正解例と順序制約が矛盾しています。')
    if m.get('grading')=='dag' and not constraints:raise ValueError('Add order constraints or select explicit orders')
    return m


def messages(value,languages):
    if not isinstance(value,dict) or any(not isinstance(k,str) or not isinstance(v,str) or len(v.encode())>65536 for k,v in value.items()) or any(lang not in value for lang in languages):raise ValueError('Provide text for every selected language / 選択した全言語の文章が必要です。')


def sample():
    return dict(version=3,mode='parsons',languages=['ja','en'],baseLanguage='ja',
        question={'ja':'偶数と偶数の和が偶数となる証明を完成させなさい。','en':'Complete a proof that the sum of two even integers is even.'},
        steps=[{'id':'s1','messages':{'ja':r'\(a=2m,\ b=2n\) とおく（\(m,n\) は整数）。','en':r'Write \(a=2m,\ b=2n\), with integers \(m,n\).'}},
               {'id':'s2','messages':{'ja':r'\(a+b=2(m+n)\) となる。','en':r'Then \(a+b=2(m+n)\).'}},
               {'id':'s3','messages':{'ja':r'\(m+n\) は整数なので、\(a+b\) は偶数である。','en':r'Since \(m+n\) is an integer, \(a+b\) is even.'}},
               {'id':'unused','messages':{'ja':'偶数どうしの和は奇数である。','en':'The sum of two even integers is odd.'}}],
        answer=['s1','s2','s3'],alternatives=[],constraints=[['s1','s2','s3']],grading='orders',
        feedback={'true':{'ja':'正しい証明です。','en':'Correct proof.'},'false':{'ja':'仮定、計算、結論の順を確認してください。','en':'Check the assumptions, calculation and conclusion.'}})


def base_variables(code):
    ranges=[];begin=None
    for start,end in comment_spans(code):
        text=code[start:end]
        if text==BEGIN:begin=start
        elif text==END and begin is not None:ranges.append((begin,end));begin=None
        elif re.match(r'/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+',text):
            try:
                data=json.loads(re.sub(r'^/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+','',text)[:-2])
                if data.get('schema')=='prt-template-webapp-v1' and data.get('template',{}).get('mode')=='parsons':ranges.append((start,end))
            except (ValueError,AttributeError):pass
    for start,end in sorted(ranges,reverse=True):code=code[:start]+code[end:]
    return code.rstrip()


def generated_variables(code,m):
    validate(m)
    base=base_variables(code)
    lines=[BEGIN]
    if not any(re.match(r'^stack_include_contrib\(\s*"prooflib\.mac"\s*\)',clean_prefix(s)) for s in statements(base)):lines.append('stack_include_contrib("prooflib.mac");')
    if not any(re.match(r'^stack_include\([^;]*multilang_library\.mac',clean_prefix(s)) for s in statements(base)):lines.append('stack_include('+quote(DEFAULT_INCLUDE+'multilang_library.mac')+');')
    if not any(defined(s)=='%__mcq_lang' for s in statements(base)):lines.append(HELPERS)
    lines.append('%_pp_q:'+msg_expr({k:m['question'][k] for k in m['languages']})+';')
    for i,step in enumerate(m['steps']):lines.append('%_pp_s'+str(i)+':'+msg_expr({k:step['messages'][k] for k in m['languages']})+';')
    lines.append('proof_steps:random_permutation(['+', '.join('['+quote(s['id'])+', %_pp_s'+str(i)+']' for i,s in enumerate(m['steps']))+']);')
    for lang in m['languages']:lines.append('proof_steps_'+lang.replace('-','_')+':proof_steps;')
    proof=lambda order:'proof('+', '.join(quote(x) for x in order)+')'
    lines+=['ta:'+proof(m['answer'])+';','ta_flat:ta;', '%_pp_alts:['+', '.join(proof(a) for a in [m['answer']]+m.get('alternatives',[]))+'];',
            '%_pp_orders:setify(map(proof_flatten,%_pp_alts));', 'tdag:'+json.dumps(m.get('constraints',[]))+';']
    for branch in ('true','false'):lines.append('%_pp_'+branch+'_text:['+', '.join('['+quote(k)+', '+quote(m['feedback'][branch][k])+']' for k in m['languages'])+'];')
    lines.append(END)
    return base+'\n'+'\n'.join(lines)+'\n'


def layout(m):
    blocks=''.join('[[lang code="'+lang+('' if i<len(m['languages'])-1 else ',other')+'"]][[/lang]]' for i,lang in enumerate(m['languages']))
    return '<p>'+blocks+'</p>\n<p>{@%_pp_q@}</p>\n[[parsons input="ans1"]]\n{# parsons_encode(proof_steps) #}\n[[/parsons]]\n<p>[[input:ans1]][[validation:ans1]]</p>'


def compile_parsons(m):
    validate(m);root=E.Element('sections')
    def put(parent,key,val):E.SubElement(parent,key).text=str(val)
    def rich(parent,key,val):put(E.SubElement(parent,key,format='html'),'text',val)
    inp=E.SubElement(root,'input')
    for k,v in dict(name='ans1',type='parsons',tans='[ta, proof_steps]',boxsize=15,strictsyntax=1,insertstars=0,syntaxhint='',syntaxattribute=0,forbidwords='',allowwords='',forbidfloat=1,requirelowestterms=0,checkanswertype=0,mustverify=0,showvalidation=0,options='').items():put(inp,k,v)
    prt=E.SubElement(root,'prt')
    for k,v in dict(name='prt1',value=1,autosimplify=1).items():put(prt,k,v)
    feedback='sa:parsons_decode(ans1);\n[pd,saa]:proof_assessment(sa,%_pp_alts);'
    if m.get('grading')=='dag':feedback+='\nsaprob:proof_assessment_dag(sa,tdag);'
    for branch in ('true','false'):feedback+='\n%_pp_'+branch+':'+msg_expr({k:m['feedback'][branch][k] for k in m['languages']})+';'
    rich(prt,'feedbackvariables',feedback)
    node=E.SubElement(prt,'node')
    sans='is(saprob=[]) and is(setify(args(sa))=setify(args(ta))) and is(length(args(sa))=length(args(ta)))' if m.get('grading')=='dag' else 'elementp(sa,%_pp_orders)'
    for k,v in dict(name=0,description='',answertest='AlgEquiv',sans=sans,tans='true',testoptions='',quiet=0,truescoremode='=',truescore=1,truepenalty='',truenextnode=-1,trueanswernote='prt1-0-T',falsescoremode='=',falsescore=0,falsepenalty='',falsenextnode=-1,falseanswernote='prt1-0-F').items():put(node,k,v)
    rich(node,'truefeedback','{@%_pp_true@}');rich(node,'falsefeedback','{@%_pp_false@}')
    root.append(E.Comment('qbank-template:'+json.dumps(m,ensure_ascii=True).replace('--','\\u002d\\u002d')))
    return root


def proof_orders(expr,depth=0):
    if depth>32 or len(expr)>65536:raise ValueError('Proof structure is too large or deeply nested')
    expr=expr.strip()
    if expr.startswith('"'):return [[as_string(expr)]]
    match=re.fullmatch(r'(proof|proof_c|proof_iff)\s*\(([\s\S]*)\)',expr)
    if not match:raise ValueError('Unsupported nested proof construction; use general STACK editor')
    parts=[proof_orders(x,depth+1) for x in split_list('['+match[2]+']')];orders=[]
    if len(parts)>7 and match[1] in ('proof_c','proof_iff'):raise ValueError('Too many commutative proof blocks')
    permutations=itertools.permutations(parts) if match[1] in ('proof_c','proof_iff') else [parts]
    for perm in permutations:
        for items in itertools.product(*perm):
            orders.append(list(itertools.chain.from_iterable(items)))
            if len(orders)>129:raise ValueError('More than 129 proof orders; use order constraints')
    return orders


def import_model(q):
    if len(q.findall('input'))!=1 or q.findtext('input/type')!='parsons':return None
    code=q.findtext('questionvariables/text','');defs={}
    for statement in statements(code):
        for a,b in reversed(list(comment_spans(statement))):statement=statement[:a]+statement[b:]
        match=re.match(r'([A-Za-z][A-Za-z0-9_]*)\s*:\s*([\s\S]*?)[;$]\s*$',statement.strip())
        if match and match[1] not in defs:defs[match[1]]=match[2].strip()
    languages=[name[len('proof_steps_'):] for name,expr in defs.items() if name.startswith('proof_steps_') and expr.startswith('[')]
    single=not languages and defs.get('proof_steps','').startswith('[')
    if single:languages=['en']
    if not languages:raise ValueError('No static proof_steps lists found; general STACK editing is available')
    for header in re.findall(r'\[\[parsons([^]]*)\]\]',q.findtext('questiontext/text','')):
        if re.search(r'(?:columns|rows)\s*=',header):raise ValueError('Grouping/grid Parsons is not a flat proof; use general STACK editing')
    steps={}
    for lang in languages:
        for pair in split_list(defs['proof_steps' if single else 'proof_steps_'+lang]):
            key,text=split_list(pair);key=as_string(key)
            steps.setdefault(key,{'id':key,'messages':{}})['messages'][lang]=as_string(defs.get(text,text))
    orders=proof_orders(defs.get('ta',''))
    def blocks(text):
        found=re.findall(r'\[\[lang\s+code=["\']([^"\']+)["\']\]\]([\s\S]*?)\[\[/lang\]\]',text)
        return {code.split(',')[0]:body for code,body in found}
    node=q.find('prt/node');feedback={}
    for branch in ('true','false'):
        text=node.findtext(branch+'feedback/text','') if node is not None else ''
        values=blocks(text);feedback[branch]={lang:values.get(lang,text) for lang in languages}
    m=dict(version=3,mode='parsons',languages=languages,baseLanguage=languages[0],steps=list(steps.values()),
        question={lang:(q.findtext('questiontext/text','').split('[[parsons',1)[0] if single else as_string(defs.get('Qtext_'+lang,'""'))) for lang in languages},answer=orders[0],alternatives=orders[1:],
        constraints=[],grading='orders',feedback=feedback)
    if 'tdag' in defs:
        m['constraints']=[[as_string(x) for x in split_list(row)] for row in split_list(defs['tdag'])];m['grading']='dag'
    validate(m);return m
