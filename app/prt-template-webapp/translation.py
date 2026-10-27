"""Reuse MCQ's translation provider settings and math/CASText guards."""
import importlib.util
from pathlib import Path

path=Path(__file__).resolve().parents[1]/'mcq-webapp/ai_translation.py'
spec=importlib.util.spec_from_file_location('prt_mcq_ai_translation',path)
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)

def validate(source,result):
    if not isinstance(source,dict) or not isinstance(result,dict) or set(result)!=set(source):raise ValueError('Translation checkpoint IDs differ / チェックIDが一致しません。')
    for key,original in source.items():
        if not isinstance(original,dict) or set(original)!={'true','false'} or not isinstance(result[key],dict) or set(result[key])!=set(original):raise ValueError('Invalid translation branches')
        for branch,text in original.items():
            if not isinstance(text,str):raise ValueError('Invalid source text')
            shared.check_text(text,result[key][branch])
    return result

def translate(payload):
    source=payload['messages'];keys=list(source);result={}
    for start in range(0,len(keys),4):
        batch=keys[start:start+4];rows=[dict(id=f'option{i+1}C_1',choice=source[k]['true'],feedback=source[k]['false']) for i,k in enumerate(batch)]
        data=shared.translate(dict(target=payload['target'],source=dict(source_language=payload['sourceLanguage'],question_text=None,rows=rows)))['translations'][payload['target']]['rows']
        indexed={x['id']:x for x in data}
        for i,k in enumerate(batch):result[k]={'true':indexed[f'option{i+1}C_1']['choice'],'false':indexed[f'option{i+1}C_1']['feedback']}
    return validate(source,result)
