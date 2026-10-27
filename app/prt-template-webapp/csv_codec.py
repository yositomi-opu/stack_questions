"""One question per UTF-8 CSV. Original XML bytes are embedded for lossless retention."""
import base64
import csv
import hashlib
import io
import json
from prt_nodes import validate

HEADER=['kind','id','key','value']
SCHEMA='prt-template-csv-v1'

def dumps(source,fields):
    if 'template' not in fields:raise ValueError('Configure a template before saving CSV / CSV保存にはテンプレート設定が必要です。')
    model=json.loads(fields['template'])
    if model.get('version')==2:validate(model)
    out=io.StringIO(newline='');w=csv.writer(out);w.writerow(HEADER)
    w.writerow(['format','','schema',SCHEMA]);w.writerow(['source','','sha256',hashlib.sha256(source).hexdigest()]);w.writerow(['source','','xml_base64',base64.b64encode(source).decode()])
    for key,value in fields.items():
        if key!='template':w.writerow(['question','',key,value])
    for key,value in model.items():
        if key in ('inputs','checks'):
            for i,row in enumerate(value,1):
                for k,v in row.items():w.writerow([key,str(i),k,json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v])
        elif key in ('validation','correct'):
            for k,v in value.items():w.writerow([key,'',k,v])
        else:w.writerow(['template','',key,json.dumps(value,ensure_ascii=False) if isinstance(value,(dict,list)) else str(value)])
    return ('\ufeff'+out.getvalue()).encode('utf-8')

def loads(raw):
    csv.field_size_limit(12*1024*1024)
    rows=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline=''),strict=True))
    if not rows or rows[0]!=HEADER:raise ValueError('Expected PRT CSV columns: kind,id,key,value')
    if len(rows)>20000:raise ValueError('Too many CSV rows')
    groups={};seen=set()
    for row in rows[1:]:
        if not row:continue
        if len(row)!=4:raise ValueError('Invalid CSV row width')
        kind,index,key,value=row
        if kind not in ('format','source','question','template','inputs','checks','validation','correct'):raise ValueError('Unsupported CSV row: '+kind)
        identity=(kind,index,key)
        if identity in seen:raise ValueError('Duplicate CSV property: '+key)
        seen.add(identity);groups.setdefault(kind,{}).setdefault(index,{})[key]=value
    def single(kind):
        g=groups.get(kind,{})
        if set(g)-{''}:raise ValueError('Unexpected row ID: '+kind)
        return g.get('',{})
    if single('format')!={'schema':SCHEMA}:raise ValueError('Unsupported CSV schema')
    src=single('source')
    if set(src)!={'sha256','xml_base64'}:raise ValueError('Missing original XML')
    source=base64.b64decode(src['xml_base64'],validate=True)
    if len(source)>8*1024*1024 or hashlib.sha256(source).hexdigest()!=src['sha256']:raise ValueError('Original XML checksum mismatch')
    fields=single('question')
    if set(fields)!={'name','questionvariables','questiontext','generalfeedback'}:raise ValueError('Invalid question fields')
    model=single('template')
    if 'version' in model:model['version']=int(model['version'])
    if 'settings' in model:model['settings']=json.loads(model['settings'])
    model['validation']=single('validation');model['correct']=single('correct')
    for kind in ('inputs','checks'):
        indexed=groups.get(kind,{})
        if set(indexed)!={str(i) for i in range(1,len(indexed)+1)}:raise ValueError('Non-contiguous row IDs: '+kind)
        model[kind]=[]
        for i in range(1,len(indexed)+1):
            row=indexed[str(i)]
            for key in ('trueMessages','falseMessages'):
                if key in row:row[key]=json.loads(row[key])
            model[kind].append(row)
    if model.get('version')==2:validate(model)
    fields['template']=json.dumps(model,ensure_ascii=False)
    return source,fields
