#!/usr/bin/env python3
"""Parsons editor sharing bounded XML/CSV/project/session/translation transport."""
from pathlib import Path
import argparse
import importlib.util
import sys
ROOT=Path(__file__).resolve().parents[1]/'prt-template-webapp'
sys.path.insert(0,str(ROOT))
spec=importlib.util.spec_from_file_location('parsons_runtime',ROOT/'server.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)
def create_server(port=4177,preview_server='http://127.0.0.1:4173',stack_api='http://127.0.0.1:3080'):
    return runtime.create_server(port,preview_server,stack_api,parsons=True,web=Path(__file__).parent/'web')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4177);p.add_argument('--preview-server',default='http://127.0.0.1:4173');p.add_argument('--stack-api',default='http://127.0.0.1:3080');a=p.parse_args()
    s=create_server(a.port,a.preview_server,a.stack_api);print(f'Parsons WebApp: http://127.0.0.1:{s.server_port}',flush=True)
    try:s.serve_forever()
    except KeyboardInterrupt:s.server_close()
