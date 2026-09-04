TXTFILES := mcq_template_pre.txt mcq_template_post.txt mcq_template_fvar.txt \
		ky_linear_algebra.txt mcq_flags.txt tex_library.txt \
		multilang_library.txt
MACFILES := $(TXTFILES:.txt=.mac)

ifeq ($(OS),Windows_NT)
PYTHON ?= py -3
else
PYTHON ?= python3
endif

HOST ?=
PORT ?=
STACK_API_PORT ?=
LOCALE ?=
INCLUDE_BASE_URL ?=
RUNTIME_ARGS := $(if $(INCLUDE_BASE_URL),--include-base-url "$(INCLUDE_BASE_URL)")
SETUP_ARGS := $(if $(HOST),--host "$(HOST)") $(if $(PORT),--port "$(PORT)") $(if $(STACK_API_PORT),--stack-api-port "$(STACK_API_PORT)") $(if $(LOCALE),--locale "$(LOCALE)") $(RUNTIME_ARGS)

.PHONY: all clean check-python setup check install-deps start stop restart status

all: $(MACFILES)

%.mac: %.txt scripts/txt2mac.py
	$(PYTHON) scripts/txt2mac.py $< $@

clean:
	rm -f $(MACFILES)

ifeq ($(OS),Windows_NT)
check-python:
	@$(PYTHON) --version >NUL 2>&1 || (echo Python 3.10 or later is required. Install it from https://www.python.org/downloads/windows/ & exit /b 1)
else
check-python:
	@$(PYTHON) --version >/dev/null 2>&1 || { echo "Python 3.10 or later is required. Install Python 3 and retry."; exit 1; }
endif

setup: check-python
	@$(PYTHON) scripts/mcq-webapp.py setup $(SETUP_ARGS)

check: check-python
	@$(PYTHON) scripts/mcq-webapp.py check $(RUNTIME_ARGS)

install-deps: check-python
	@$(PYTHON) scripts/mcq-webapp.py install-deps

start: check-python
	@$(PYTHON) scripts/mcq-webapp.py start $(RUNTIME_ARGS)

stop: check-python
	@$(PYTHON) scripts/mcq-webapp.py stop

restart: check-python
	@$(PYTHON) scripts/mcq-webapp.py restart $(RUNTIME_ARGS)

status: check-python
	@$(PYTHON) scripts/mcq-webapp.py status $(RUNTIME_ARGS)
