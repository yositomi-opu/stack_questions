.PHONY: start check
start:
	python3 server.py
check:
	python3 -m py_compile server.py authoring.py prt_nodes.py csv_codec.py translation.py preview.py
	node --check web/host.js
	node --check web/editor.js
	node --check web/preview.js
	node --check web/files.js
	PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
