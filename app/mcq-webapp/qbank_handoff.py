"""Bounded localhost hand-off of XML content; never open a client-supplied path."""
import json
import threading
import time
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler, HTTPRedirectHandler
from urllib.error import HTTPError
import xml.etree.ElementTree as E

LIMIT=8*1024*1024
LOCK=threading.RLock()


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None


def question(xml):
    raw=xml.encode()
    if len(raw)>LIMIT or b'<!DOCTYPE' in raw.replace(b'\0',b'').upper() or b'<!ENTITY' in raw.replace(b'\0',b'').upper():raise ValueError('Invalid XML')
    root=E.fromstring(raw);qs=[q for q in root.findall('question') if q.get('type')!='category']
    if root.tag!='quiz' or len(qs)!=1 or qs[0].get('type')!='stack':raise ValueError('One STACK question is required')
    return qs[0]


def canonical(e):return (e.tag,sorted(e.attrib.items()),(e.text or '').strip(),[canonical(c) for c in e])


def safe_fields(original,updated):
    old,new=question(original),question(updated)
    # This first version returns content-only changes. Structural edits are explicit failures.
    protected={'input','prt','defaultgrade','penalty','specificfeedback','questionnote','prtcorrect','prtpartiallycorrect','prtincorrect','simplify','assumepositive','assumereal'}
    for tag in protected:
        if [canonical(e) for e in old.findall(tag)] != [canonical(e) for e in new.findall(tag)]:
            raise ValueError('Input/PRT settings changed. Export XML for review; automatic structural replacement is not supported / 入力欄・PRT設定が変わりました。XMLを書き出して確認してください。自動構造置換は未対応です。')
    return {key:new.findtext(key+'/text','') for key in ('name','questionvariables','questiontext','generalfeedback')}


def reply(handler,data,status=200):
    raw=json.dumps(data,ensure_ascii=False).encode();handler.send_response(status);handler.send_header('Content-Type','application/json');handler.send_header('Content-Length',str(len(raw)));handler.send_header('Cache-Control','no-store');handler.send_header('Referrer-Policy','no-referrer');handler.end_headers();handler.wfile.write(raw)


def route(handler):
    if not handler.ai_local_request() or (handler.command=='POST' and handler.headers.get('X-Qbank-Request')!='1'):
        reply(handler,{'error':'Invalid origin'},403);return
    try:
        with LOCK:
            store=getattr(handler.server,'qbank_sessions',None)
            if store is None:store={};handler.server.qbank_sessions=store
            now=time.monotonic()
            for key in list(store):
                if now-store[key]['created']>=7200:del store[key]
            data={}
            if handler.command=='POST':
                n=int(handler.headers.get('Content-Length','0'))
                if not 0<n<=LIMIT:raise ValueError('Invalid request size')
                data=json.loads(handler.rfile.read(n))
            if handler.command=='POST' and handler.path=='/api/qbank/session':
                callback=data['callback'];p=urlsplit(callback)
                if p.scheme!='http' or p.hostname not in ('127.0.0.1','localhost') or p.username or p.password or p.path!='/api/editor-return' or p.query or p.fragment:raise ValueError('Invalid callback')
                question(data['xml'])
                if len(store)>=16:raise ValueError('Too many sessions')
                sid=uuid.uuid4().hex;store[sid]=dict(xml=data['xml'],callback=callback,token=data['token'],created=now,name=(data.get('fields') or {}).get('name','question'))
                reply(handler,{'session':sid});return
            session=store.get(handler.headers.get('X-Editor-Session',''))
            if not session:raise ValueError('Editor session expired')
            if handler.command=='GET' and handler.path=='/api/qbank/state':
                reply(handler,{'xml':session['xml'],'name':session['name'],'origin':session['callback'].rsplit('/',2)[0],'token':session['token']});return
            if handler.command=='POST' and handler.path=='/api/qbank/save':
                fields=safe_fields(session['xml'],data['xml'])
                callback=session['callback'];origin=callback.rsplit('/',2)[0]
                req=Request(callback,data=json.dumps({'token':session['token'],'fields':fields}).encode(),headers={'Origin':origin,'X-Qbank-Request':'1','Content-Type':'application/json'})
                try:
                    with build_opener(ProxyHandler({}),NoRedirect()).open(req,timeout=60) as response:answer=json.load(response)
                except HTTPError as e:
                    try:reason=json.loads(e.read(65536)).get('error','qbank rejected the edit')
                    finally:e.close()
                    raise ValueError(reason) from None
                if not answer.get('ok'):raise ValueError('qbank rejected the edit')
                session['xml']=data['xml'];reply(handler,{'ok':True});return
            reply(handler,{'error':'Not found'},404)
    except Exception as e:reply(handler,{'error':str(e)},400)
