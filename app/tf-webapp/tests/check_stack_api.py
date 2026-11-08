#!/usr/bin/env python3
"""Explicit live STACK regression using public sample questions and loopback API only."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from urllib.request import Request,build_opener,ProxyHandler
APP=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(APP.parent/'prt-template-webapp'))
import truefalse as tf
spec=importlib.util.spec_from_file_location('tf_live_runtime',APP/'server.py')
server=importlib.util.module_from_spec(spec);spec.loader.exec_module(server)
spec=importlib.util.spec_from_file_location('tf_live_mcq',APP.parent/'mcq-webapp/server.py')
mcq=importlib.util.module_from_spec(spec);spec.loader.exec_module(mcq)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--api-url',required=True);args=parser.parse_args()
    url=args.api_url.rstrip('/');parsed=urlsplit(url)
    if parsed.scheme!='http' or parsed.hostname not in ('127.0.0.1','localhost') or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment:parser.error('Use an explicit loopback HTTP API URL')
    reports=[]
    for truth,enabled,lang in [('true',True,'ja'),('false',False,'en')]:
        model,variables=tf.sample();model['truth']=truth;model['%_noidea']=enabled
        fields=dict(name='Synthetic TF regression',questionvariables=variables,questiontext='',generalfeedback='',template=json.dumps(model,ensure_ascii=False))
        definition=mcq.preview_definition(server.runtime.edited(tf.TEMPLATE.read_bytes(),fields).decode(),1)
        def call(route,**extra):
            body=dict(questionDefinition=definition,seed=1,lang=lang,**extra)
            with build_opener(ProxyHandler({})).open(Request(url+'/'+route,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=90) as response:result=json.load(response)
            if result.get('message'):raise AssertionError(result['message'])
            return result
        rendered=call('render',renderInputs='mcqpreview_',readOnly=False)
        options=rendered['questioninputs']['ans1']['configuration']['options'];labels=model['labels'][lang]
        def key(label):return next(str(k) for k,v in options.items() if v==label)
        assert '-' in options.values(),options
        assert (model['noIdeaLabels'][lang] in options.values())==enabled,options
        results={}
        for answer,expected in [(labels[0],1 if truth=='true' else 0),(labels[1],0 if truth=='true' else 1)]+([(model['noIdeaLabels'][lang],0)] if enabled else []):
            graded=call('grade',answers={'ans1':key(answer)})
            assert graded['isgradable'] and graded['score']==expected,graded
            if enabled and answer==model['noIdeaLabels'][lang]:assert 'prt1-1-T' in graded['prtresults']['prt1']['prtanswernotes'],graded
            results[answer]=graded['score']
        unanswered=call('grade',answers={'ans1':key('-')});assert unanswered['isgradable'] is False,unanswered
        report=dict(truth=truth,noidea=enabled,language=lang,options=options,scores=results,unanswered='not gradable',api=rendered.get('aboutapi'))
        reports.append(report);print(json.dumps(report,ensure_ascii=False),flush=True)
    print('PASS live API: correct/incorrect, no-idea branch, unanswered, On/Off and Japanese/English.')
if __name__=='__main__':main()
