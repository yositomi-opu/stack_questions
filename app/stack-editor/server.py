#!/usr/bin/env python3
"""Compatibility launcher for the renamed PRT Template WebApp."""
from pathlib import Path
import runpy
import sys
root=Path(__file__).resolve().parents[1]/'prt-template-webapp'
sys.path.insert(0,str(root))
if __name__=='__main__':runpy.run_path(str(root/'server.py'),run_name='__main__')
