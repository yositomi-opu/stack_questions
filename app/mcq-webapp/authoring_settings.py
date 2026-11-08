"""Shared authoring settings: explicit URL probes, never evaluate downloaded code."""
import concurrent.futures
import json
import re
from urllib.parse import urlsplit,urlunsplit
from urllib.request import Request,build_opener,ProxyHandler,HTTPRedirectHandler
from urllib.error import HTTPError,URLError

LIBRARIES=('genmatrix_lib','trans_mat','rref_lib','polynomial_disp','texput_W','linalg_misc','ky_linear_algebra','multilang_library')
LIMIT=2*1024*1024

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

def normalize_base(value):
    if not isinstance(value,str) or not value.strip() or len(value)>2048 or re.search(r'[\x00-\x20"\\]',value.strip()):raise ValueError('Enter a valid Base URL / Base URLを確認してください。')
    p=urlsplit(value.strip())
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password or p.query or p.fragment:raise ValueError('Use an HTTP(S) directory URL without credentials, query or fragment / HTTP(S)のディレクトリーURLを指定してください。')
    p.port
    return urlunsplit((p.scheme,p.netloc,p.path.rstrip('/')+'/','',''))

def validate_base(payload,mcq=False):
    if not isinstance(payload,dict):raise ValueError('Invalid settings')
    base=normalize_base(payload.get('baseUrl'));ids=payload.get('libraries',[])
    if not isinstance(ids,list) or len(ids)>len(LIBRARIES) or any(not isinstance(i,str) or i not in LIBRARIES for i in ids):raise ValueError('Invalid library selection')
    ids=list(dict.fromkeys((['mcq_template_pre_cas','mcq_template_post_cas','mcq_template_fvar_cas','tex_library'] if mcq else ['multilang_library'])+ids))
    def probe(name):
        url=base+name+'.mac'
        try:
            with build_opener(ProxyHandler({}),NoRedirect()).open(Request(url,headers={'Accept':'text/plain'}),timeout=5) as response:
                raw=response.read(LIMIT+1);mime=response.headers.get_content_type()
            text=raw.decode('utf-8-sig')
            if not raw or len(raw)>LIMIT or mime=='text/html' or re.search(r'<!doctype\s+html|<html(?:\s|>)',text,re.I):raise ValueError('Not a library text file')
        except (OSError,ValueError,HTTPError,URLError) as e:raise ValueError('Library not available / ライブラリーを確認できません: '+name+'.mac') from e
        return name
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:checked=list(pool.map(probe,ids))
    return {'ok':True,'baseUrl':base,'checked':checked}

def evaluate_via_mcq(base,variables,names):
    payload={'variables':variables,'variableNames':names,'expressions':[],'managedLibraries':True}
    request=Request(base.rstrip('/')+'/api/maxima/evaluate',data=json.dumps(payload).encode(),headers={'Origin':base.rstrip('/'),'Content-Type':'application/json'})
    try:
        with build_opener(ProxyHandler({}),NoRedirect()).open(request,timeout=60) as response:raw=response.read(4*LIMIT+1)
    except HTTPError as e:
        try:detail=json.loads(e.read(LIMIT)).get('error','Evaluation failed')
        except (ValueError,AttributeError):detail='Evaluation failed'
        finally:e.close()
        raise ValueError(str(detail)) from None
    except (OSError,URLError):raise ValueError('Start the MCQ app and STACK/Maxima evaluation service / MCQアプリとSTACK/Maximaの評価サービスを起動してください。') from None
    if len(raw)>4*LIMIT:raise ValueError('Evaluation response too large')
    result=json.loads(raw)
    if not isinstance(result,dict):raise ValueError('Invalid evaluation response')
    return result
