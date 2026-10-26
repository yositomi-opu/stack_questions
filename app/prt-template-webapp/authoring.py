"""General STACK template compiler; no imported CAS code is evaluated here."""
import copy
import json
import re
import xml.etree.ElementTree as E

MARKER = 'qbank-template:'

def template_metadata(variables):
    records = re.finditer(r'/\*\s*PRT_TEMPLATE_WEBAPP_V1\s+((?:(?!\*/)[\s\S])*)\*/', variables)
    found = None
    for match in records:
        try:
            data = json.loads(match.group(1))
            if data.get('schema') == 'prt-template-webapp-v1' and data.get('version') == 1 and isinstance(data.get('template'), dict):
                found = (match, data)
        except (ValueError, AttributeError):
            pass
    return found


def read_template(element):
    variables = element.findtext('questionvariables/text')
    if variables is None:
        variables = element.findtext('plugin_qtype_stack_question/stackoptions/questionvariables', '')
    metadata = template_metadata(variables)
    if metadata:
        return json.dumps(metadata[1]['template'], ensure_ascii=False)
    return next((n.text[len(MARKER):] for n in element if n.tag is E.Comment and (n.text or '').startswith(MARKER)), '')


def compile_template(text):
    m = json.loads(text)
    if isinstance(m, dict) and m.get('version') == 2:
        from prt_nodes import compile_nodes
        return compile_nodes(m)
    if not isinstance(m, dict) or m.get('mode') not in ('tree', 'chain'):
        raise ValueError('Invalid template mode / 判定方式が不正です。')
    inputs = m.get('inputs')
    checks = m.get('checks')
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= 32 or not isinstance(checks, list) or len(checks) > 100:
        raise ValueError('Invalid inputs/checkpoints / 解答欄・チェック数が不正です。')
    names = set()
    root = E.Element('sections')
    def put(parent, tag, value):
        E.SubElement(parent, tag).text = str(value)
    def rich(parent, tag, value):
        put(E.SubElement(parent, tag, {'format':'html'}), 'text', value)
    for item in inputs:
        if not isinstance(item, dict) or not isinstance(item.get('tans'), str) or not item['tans'].strip():
            raise ValueError('Model answer is required / 正解の変数・式を指定してください。')
        name = item['name']
        if not isinstance(name, str) or not re.fullmatch(r'ans[1-9][0-9]*', name) or name in names:
            raise ValueError('Use unique ans1, ans2, … / 解答欄名を確認してください。')
        names.add(name)
        if item.get('type') not in ('algebraic', 'matrix', 'numerical', 'string'):
            raise ValueError('Unsupported input type / 未対応の入力形式です。')
        inp = E.SubElement(root, 'input')
        for key, val in dict(name=name, type=item['type'], tans=item['tans'], boxsize=20, strictsyntax=1,
                             insertstars=0, syntaxhint='', syntaxattribute=0, forbidwords='', allowwords='',
                             forbidfloat=1, lowestterms=0, checkanswertype=0, mustverify=1, showvalidation=1, options='').items():
            put(inp, key, val)
    rows = [m['validation'], m['correct']] + checks
    prt = E.SubElement(root, 'prt')
    for key,val in dict(name='prt1',value=1,autosimplify=1).items():put(prt,key,val)
    rich(prt,'feedbackvariables','')
    for index,row in enumerate(rows):
        if not isinstance(row,dict) or any(not isinstance(row.get(k),str) for k in ('sans','tans','feedback')):
            raise ValueError('Invalid checkpoint / 判定式を確認してください。')
        node = E.SubElement(prt,'node')
        nxt = index+1 if index+1<len(rows) else -1
        true_next = nxt if index>=2 and m['mode']=='chain' else -1
        for key,val in dict(name=index,answertest='AlgEquiv',sans=row['sans'],tans=row['tans'],testoptions='',quiet=1,
                            truescoremode='=',truescore=1 if index==1 else 0,truepenalty='',truenextnode=true_next,
                            trueanswernote=f'prt1-{index}-T',falsescoremode='=',falsescore=0,falsepenalty='',
                            falsenextnode=nxt,falseanswernote=f'prt1-{index}-F').items():put(node,key,val)
        rich(node,'truefeedback',row['feedback']);rich(node,'falsefeedback','')
    root.append(E.Comment(MARKER + json.dumps(m,ensure_ascii=True).replace('--','\\u002d\\u002d')))
    return root


def apply_template(element, text, backup=False):
    sections = compile_template(text)
    model = json.loads(text)
    if model.get('version') == 2 and not backup:
        previous_inputs={i.findtext('name'):i for i in element.findall('input')}
        for inp in sections.findall('input'):
            previous=previous_inputs.get(inp.findtext('name'))
            if previous is not None:inp.attrib.update(previous.attrib)
        old = element.find('prt'); new = sections.find('prt')
        if old is not None and new is not None:
            new.attrib.update(old.attrib)
            known = {c.tag for c in new}
            for child in old:
                if child.tag not in known:new.append(copy.deepcopy(child))
            for previous, current in zip(old.findall('node'), new.findall('node')):
                current.attrib.update(previous.attrib)
                known_node = {c.tag for c in current}
                for child in previous:
                    if child.tag not in known_node:current.append(copy.deepcopy(child))

    if backup:
        plugin = element.find('plugin_qtype_stack_question')
        if plugin is None:raise ValueError('Missing STACK settings')
        for tag in ('stackinputs','stackprts'):
            old = plugin.find(tag)
            if old is not None:plugin.remove(old)
        inputs=E.SubElement(plugin,'stackinputs'); prts=E.SubElement(plugin,'stackprts')
        for child in sections:
            if child.tag=='input':child.tag='stackinput';inputs.append(child)
            if child.tag=='prt':
                child.tag='stackprt';prts.append(child)
                E.SubElement(child,'firstnodename').text='0'
                nodes=E.SubElement(child,'stackprtnodes')
                for n in list(child):
                    if n.tag=='feedbackvariables':n.text=n.findtext('text','');n.remove(n[0])
                    if n.tag=='node':
                        child.remove(n);n.tag='stackprtnode';nodes.append(n);n.find('name').tag='nodename'
                        for tag in ('truefeedback','falsefeedback'):
                            f=n.find(tag);f.text=f.findtext('text','');f.remove(f[0]);E.SubElement(n,tag+'format').text='1'
    else:
        for child in list(element):
            if child.tag in ('input','prt'):element.remove(child)
        element.extend(c for c in sections if c.tag is not E.Comment)
    feedback_parent = element.find('plugin_qtype_stack_question/stackoptions') if backup else element
    feedback = feedback_parent.find('specificfeedback')
    if feedback is None:
        feedback = E.SubElement(feedback_parent, 'specificfeedback')
    if not backup:
        feedback.set('format', 'html')
        text_node = feedback.find('text')
        if text_node is None:text_node = E.SubElement(feedback, 'text')
    else:
        text_node = feedback
    if '[[feedback:prt1]]' not in (text_node.text or ''):
        text_node.text = (text_node.text or '') + '\n[[feedback:prt1]]'
    for child in list(element):
        if child.tag is E.Comment and (child.text or '').startswith(MARKER):element.remove(child)
    element.append(sections[-1])
    model = json.loads(text)
    if model.get('version') == 2:
        from prt_nodes import generated_variables
        path = 'plugin_qtype_stack_question/stackoptions/questionvariables' if backup else 'questionvariables/text'
        node = element
        for tag in path.split('/'):
            child = node.find(tag)
            if child is None:child = E.SubElement(node, tag)
            node = child
        node.text = generated_variables(node.text or '', model)
    write_provenance(element, text, backup)


def write_provenance(element, text, backup=False):
    path = 'plugin_qtype_stack_question/stackoptions/questionvariables' if backup else 'questionvariables/text'
    node = element
    for tag in path.split('/'):
        child = node.find(tag)
        if child is None:child = E.SubElement(node, tag)
        node = child
    variables = node.text or ''
    previous = template_metadata(variables)
    if previous and not variables[previous[0].end():].strip():
        variables = variables[:previous[0].start()]
    metadata = {'schema':'prt-template-webapp-v1', 'version':1, 'application':'prt-template-webapp', 'template':json.loads(text)}
    body = json.dumps(metadata, ensure_ascii=True).replace('/', '\\u002f').replace('>', '\\u003e')
    node.text = variables + ('' if variables.endswith('\n') else '\n') + '/* PRT_TEMPLATE_WEBAPP_V1\n' + body + '\n*/'
