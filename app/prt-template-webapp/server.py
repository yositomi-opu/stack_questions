#!/usr/bin/env python3
"""Independent loopback STACK editor with explicit qbank hand-off sessions."""
import argparse
import base64
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, ProxyHandler
import xml.etree.ElementTree as E
import zipfile
from authoring import apply_template, read_template
from preview import Preview, NoRedirect
from prt_nodes import import_pattern, base_variables, compact_fields
import csv_codec

LIMIT = 8 * 1024 * 1024
WEB = Path(__file__).parent / 'web'
FIELDS = {'name','questionvariables','questiontext','generalfeedback','template'}


def local_url(url, path=None):
    p = urlsplit(url)
    if p.scheme != 'http' or p.hostname not in ('localhost','127.0.0.1') or p.username or p.password or p.query or p.fragment or (path is not None and p.path != path):
        raise ValueError('A local HTTP service URL is required')
    return url


def parse(raw):
    if len(raw)>LIMIT or b'<!DOCTYPE' in raw.replace(b'\0',b'').upper() or b'<!ENTITY' in raw.replace(b'\0',b'').upper():
        raise ValueError('Invalid or oversized XML')
    root = E.fromstring(raw, parser=E.XMLParser(target=E.TreeBuilder(insert_comments=True)))
    questions = [q for q in root.findall('question') if q.get('type')!='category']
    if root.tag!='quiz' or len(questions)!=1 or questions[0].get('type')!='stack':
        raise ValueError('Open one STACK question in Moodle XML; use qbank for multi-question banks / STACK問題1件のXMLを開いてください。複数問題は問題バンクで管理してください。')
    return root, questions[0]


def default_xml():
    root=E.Element('quiz');q=E.SubElement(root,'question',{'type':'stack'})
    for key,val in dict(defaultgrade=1,penalty='0.1',hidden=0,questionlength=-1,stackversion='2024100800',simplify=1,assumepositive=0,assumereal=0,multiplicationsign='dot',sqrtsign=1,complexno='i',inversetrig='cos-1',logicsymbol='lang',matrixparens='[').items():E.SubElement(q,key).text=str(val)
    for key,val in dict(name='New STACK',questiontext='',questionvariables='',generalfeedback='',specificfeedback='[[feedback:prt1]]',questionnote='General STACK',prtcorrect='',prtpartiallycorrect='',prtincorrect='').items():E.SubElement(E.SubElement(q,key),'text').text=val
    return E.tostring(root)


def validate_fields(fields):
    if not isinstance(fields,dict) or not set(fields).issubset(FIELDS):raise ValueError('Invalid fields')
    for key,val in fields.items():
        if not isinstance(val,str) or len(val.encode())>1024*1024 or any((ord(c)<32 and c not in '\n\r\t') or 0xD800<=ord(c)<=0xDFFF or ord(c) in (0xFFFE,0xFFFF) for c in val):raise ValueError('Invalid field')


def edited(raw, fields):
    root,q=parse(raw)
    if not isinstance(fields,dict) or not set(fields).issubset(FIELDS):raise ValueError('Invalid fields')
    for key,val in fields.items():
        if not isinstance(val,str) or len(val.encode())>1024*1024 or any((ord(c)<32 and c not in '\n\r\t') or 0xD800<=ord(c)<=0xDFFF or ord(c) in (0xFFFE,0xFFFF) for c in val):raise ValueError('Invalid field')
        if key=='template':continue
        if key=='name' and not val.strip():raise ValueError('Name is required')
        parent=q.find(key)
        if parent is None:parent=E.SubElement(q,key)
        text=parent.find('text')
        if text is None:text=E.SubElement(parent,'text')
        text.text=val
    if 'template' in fields:apply_template(q,fields['template'])
    result=E.tostring(root,encoding='utf-8',xml_declaration=True)
    if len(result)>LIMIT:raise ValueError('Edited XML exceeds 8 MiB')
    return result


def xml_fields(raw):
    _,q=parse(raw)
    fields={k:q.findtext(k+'/text','') for k in FIELDS if k!='template'}
    if read_template(q):fields['template']=read_template(q)
    else:
        model=import_pattern(q)
        if model:
            fields['template']=json.dumps(model,ensure_ascii=False)
            fields['questionvariables']=base_variables(fields['questionvariables'])
    if fields.get('template') and json.loads(fields['template']).get('version')==2:
        fields['questionvariables']=base_variables(fields['questionvariables'],keep_functions=json.loads(fields['template']).get('layout')=='compact')
    return fields


class SessionExpired(ValueError):
    pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def reply(self,obj,status=200,mime='application/json',filename=None):
        raw=json.dumps(obj,ensure_ascii=False).encode() if isinstance(obj,dict) else obj
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'")
        if filename:self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
        self.end_headers();self.wfile.write(raw)
    def valid(self,write=False):
        base=f'http://127.0.0.1:{self.server.server_port}'
        origins={base,f'http://localhost:{self.server.server_port}'}
        return self.headers.get('Host') in {urlsplit(v).netloc for v in origins} and (not write or (self.headers.get('Origin') in origins and self.headers.get('X-Qbank-Request')=='1'))
    def session(self):
        sid=self.headers.get('X-Editor-Session','');s=self.server.sessions.get(sid)
        if not s or time.monotonic()-s['created']>7200:raise SessionExpired('Editor session expired; reopen from qbank or start a new sample / 編集セッションが失効しました。問題バンクから開き直すか、新規サンプルで開始してください。')
        return s
    def detail(self,s):
        return dict(id='q:1',version=0,revision=s['revision'],editFields=s['fields'],name=s['fields'].get('name','New STACK'),callbackOrigin=s.get('callbackOrigin'),token=s.get('token'),editorMode='general' if self.server.general else 'template',report=s.get('report',[]))
    def do_GET(self):
        if not self.valid():return self.reply({'error':'Invalid host'},403)
        try:
            if self.path=='/api/health':return self.reply({'app':'stack-edit-webapp' if self.server.general else 'prt-template-webapp','pid':os.getpid()})
            if self.path=='/api/state':return self.reply(self.detail(self.session()))
            if self.path=='/api/reference':return self.reply(self.session().get('reference') or self.session()['xml'],mime='application/xml')
            if self.path in ('/api/xml','/api/project','/api/original'):
                s=self.session()
                if self.path=='/api/original':return self.reply(s['original'],mime='application/xml',filename='original.xml')
                if s.get('previewError'):raise ValueError(s['previewError'])
                raw=edited(s['xml'],s['fields'])
                if self.path=='/api/xml':return self.reply(raw,mime='application/xml',filename='stack-question.xml')
                out=io.BytesIO()
                with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
                    z.writestr('source.xml',s['original']);z.writestr('current.xml',raw);z.writestr('project.json',json.dumps({'schema':1,'source_sha256':hashlib.sha256(s['original']).hexdigest(),'current_sha256':hashlib.sha256(raw).hexdigest()}))
                return self.reply(out.getvalue(),mime='application/zip',filename='stack-project.zip')
            if self.path=='/sample.csv':return self.reply((WEB.parent/'samples/BasisDimNullSpace.csv').read_bytes(),mime='text/csv; charset=utf-8')
            name='index.html' if self.path.split('?')[0]=='/' else self.path.lstrip('/').split('?')[0]
            assets={'index.html','host.js','editor.js','files.js','preview.js','style.css','skills.js','skills.json','vendor/mathjax-tex-svg-3.2.2.js','vendor/mathjax-boldsymbol-3.2.2.js'}
            if name not in assets:return self.reply({'error':'Not found'},404)
            mime='text/html; charset=utf-8' if name.endswith('.html') else ('application/json; charset=utf-8' if name.endswith('.json') else ('text/css' if name.endswith('.css') else 'text/javascript'))
            self.reply((WEB/name).read_bytes(),mime=mime)
        except SessionExpired as e:self.reply({'error':str(e),'code':'session_expired'},410)
        except Exception as e:self.reply({'error':str(e)},400)
    def do_POST(self):
        if not self.valid(True):return self.reply({'error':'Invalid origin'},403)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=(2*LIMIT+65536 if self.path in ('/api/open','/api/export') else LIMIT):raise ValueError('Invalid request size')
            raw=self.rfile.read(n)
            if self.path in ('/api/translation','/api/translation-validate'):
                self.session()
                import translation
                d=json.loads(raw)
                if not isinstance(d.get('messages'),dict) or not 1<=len(d['messages'])<=101:raise ValueError('Invalid translation checkpoints')
                translation.validate(d['messages'],d['messages'])
                result=translation.translate(d) if self.path=='/api/translation' else translation.validate(d['messages'],d['result'])
                return self.reply({'result':result})
            with self.server.lock:
                if self.path=='/api/session':
                    d=json.loads(raw);callback=d.get('callback')
                    if callback:local_url(callback,'/api/editor-return')
                    if len(self.server.sessions)>=16:
                        expired=[k for k,s in self.server.sessions.items() if time.monotonic()-s['created']>7200]
                        for k in expired:del self.server.sessions[k]
                        if len(self.server.sessions)>=16:raise ValueError('Too many active sessions')
                    sid=uuid.uuid4().hex
                    xml=d.get('xml') or default_xml().decode();parse(xml.encode())
                    s={'created':time.monotonic(),'xml':xml.encode(),'original':xml.encode(),'fields':d.get('fields') or {},'revision':uuid.uuid4().hex,'callback':callback,'token':d.get('token'),'previewError':d.get('previewError'),'reference':(d.get('referenceXml') or xml).encode(),'callbackOrigin':callback.rsplit('/',2)[0] if callback else None}
                    if not self.server.general and s['fields'].get('template') and json.loads(s['fields']['template']).get('version')==2:
                        s['fields']['questionvariables']=base_variables(s['fields'].get('questionvariables',''),keep_functions=json.loads(s['fields']['template']).get('layout')=='compact')
                    self.server.sessions[sid]=s
                    return self.reply({'session':sid,'url':f'http://127.0.0.1:{self.server.server_port}/?session={sid}&lang='+d.get('lang','ja')})
                s=self.session()
                if self.path=='/api/open':
                    if s.get('callback'):raise ValueError('Use a separate standalone editor to open files')
                    original=raw;current=raw
                    imported_fields=None
                    if raw.lstrip(b'\xef\xbb\xbf').startswith(b'kind,id,key,value'):
                        original,imported_fields=csv_codec.loads(raw);validate_fields(imported_fields);current=original
                    if raw.startswith(b'PK'):
                        with zipfile.ZipFile(io.BytesIO(raw)) as z:
                            if len(z.infolist())!=3 or set(z.namelist())!={'source.xml','current.xml','project.json'} or sum(i.file_size for i in z.infolist())>2*LIMIT+65536:raise ValueError('Invalid editor project')
                            meta=json.loads(z.read('project.json'));original=z.read('source.xml');current=z.read('current.xml')
                            if meta.get('schema')!=1 or meta.get('source_sha256')!=hashlib.sha256(original).hexdigest() or meta.get('current_sha256')!=hashlib.sha256(current).hexdigest():raise ValueError('Invalid project hashes')
                    fields=imported_fields or xml_fields(current);parse(original)
                    if self.server.general:
                        fields.pop('template',None)
                        fields['questionvariables']=parse(current)[1].findtext('questionvariables/text','')
                    report=[]
                    if not self.server.general and 'template' not in fields:report.append('PRT pattern not recognized; basic fields only. Inputs, PRTs and unsupported content remain intact. / PRTパターンを認識できないため基本項目のみ編集できます。入力欄・PRT・非対応内容は保持します。')
                    if not imported_fields and fields.get('template') and json.loads(fields['template']).get('version')==2 and not read_template(parse(original)[1]):
                        report=['Fixed PRT pattern recognized. Node weights replace feedback-variable scL; feedback is emitted per visited node. Original XML is retained. / 固定PRTを認識しました。配点はノード設定から生成し、フィードバックは訪問ノードから返します。元XMLは保持します。']
                    if imported_fields:report.append('CSV loaded with original XML retained / 原本XMLを保持してCSVを読み込みました。')
                    s.update(xml=current,original=original,reference=original,fields=fields,report=report,revision=uuid.uuid4().hex)
                    return self.reply(self.detail(s))
                d=json.loads(raw)
                if d.get('revision')!=s['revision']:raise ValueError('Editor view is outdated')
                if self.path=='/api/project-export':
                    definition=edited(s['xml'],d['fields']);out=io.BytesIO()
                    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
                        z.writestr('source.xml',s['original']);z.writestr('current.xml',definition);z.writestr('project.json',json.dumps({'schema':1,'source_sha256':hashlib.sha256(s['original']).hexdigest(),'current_sha256':hashlib.sha256(definition).hexdigest()}))
                    return self.reply(out.getvalue(),mime='application/zip',filename='stack-project.zip')
                if self.path=='/api/prepare':return self.reply({'fields':compact_fields(d['fields'])})
                if self.path=='/api/export':
                    fields=d.get('fields',s['fields']);validate_fields(fields)
                    if not fields.get('name','').strip():raise ValueError('問題名を入力してください。 / Enter a question title.')
                    if d.get('format')=='csv':return self.reply(csv_codec.dumps(s['original'],fields),mime='text/csv; charset=utf-8',filename='prt-question.csv')
                    if d.get('format')!='xml':raise ValueError('Unknown export format')
                    definition=edited(s['xml'],fields)
                    return self.reply(definition,mime='application/xml',filename='prt-question.xml')
                if self.path in ('/api/action','/api/create-stack'):
                    fields=d['fields'];edited(s['xml'],fields)
                    if s.get('callback'):
                        callbackbody=json.dumps({'token':s['token'],'fields':fields}).encode()
                        origin=s['callbackOrigin']
                        req=Request(s['callback'],data=callbackbody,headers={'Origin':origin,'X-Qbank-Request':'1','Content-Type':'application/json'})
                        try:
                            with build_opener(ProxyHandler({}),NoRedirect()).open(req,timeout=60) as result:answer=json.load(result)
                        except HTTPError as error:
                            try:reason=json.loads(error.read(65536)).get('error','qbank rejected the edit')
                            except ValueError:reason='qbank rejected the edit'
                            finally:error.close()
                            raise ValueError(reason) from None
                        if not answer.get('ok'):raise ValueError('qbank did not accept the edit')
                    s.update(fields=fields,revision=uuid.uuid4().hex)
                    return self.reply(self.detail(s))
                if self.path=='/api/stack/preview':
                    if s.get('previewError'):raise ValueError(s['previewError'])
                    definition=edited(s['xml'],d.get('fields',s['fields'])).decode()
                    return self.reply(self.server.preview.render(definition,d.get('seed',1),d.get('lang','ja')))
                if self.path=='/api/stack/grade':return self.reply(self.server.preview.grade(d.get('token'),d.get('answers')))
                self.reply({'error':'Not found'},404)
        except SessionExpired as e:self.reply({'error':str(e),'code':'session_expired'},410)
        except Exception as e:self.reply({'error':str(e)},400)


def create_server(port=4175,preview_server='http://127.0.0.1:4173',stack_api='http://127.0.0.1:3080',general=False):
    s=ThreadingHTTPServer(('127.0.0.1',port),Handler);s.general=general;s.sessions={};s.lock=threading.RLock();s.preview=Preview(preview_server,stack_api);return s


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4175);p.add_argument('--preview-server',default='http://127.0.0.1:4173');p.add_argument('--stack-api',default='http://127.0.0.1:3080');args=p.parse_args()
    s=create_server(args.port,args.preview_server,args.stack_api);print(f'PRT Template WebApp: http://127.0.0.1:{s.server_port}',flush=True)
    try:s.serve_forever()
    except KeyboardInterrupt:s.server_close()
