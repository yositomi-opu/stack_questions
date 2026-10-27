#!/usr/bin/env python3
"""General STACK source editor, sharing the local runtime and preview client."""
from pathlib import Path
import argparse
import importlib.util
import sys
root=Path(__file__).resolve().parents[1]/'prt-template-webapp'
sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location('stack_edit_runtime',root/'server.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

def create_server(port=4176,preview_server='http://127.0.0.1:4173',stack_api='http://127.0.0.1:3080'):
    return runtime.create_server(port,preview_server,stack_api,general=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=4176);p.add_argument('--preview-server',default='http://127.0.0.1:4173');p.add_argument('--stack-api',default='http://127.0.0.1:3080');a=p.parse_args()
    s=create_server(a.port,a.preview_server,a.stack_api);print(f'STACK Edit WebApp: http://127.0.0.1:{s.server_port}',flush=True)
    try:s.serve_forever()
    except KeyboardInterrupt:s.server_close()
