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
SETUP_ARGS := $(if $(HOST),--host "$(HOST)") $(if $(PORT),--port "$(PORT)") $(if $(STACK_API_PORT),--stack-api-port "$(STACK_API_PORT)") $(if $(LOCALE),--locale "$(LOCALE)")

.PHONY: all clean setup check start stop restart status

all: $(MACFILES)

%.mac: %.txt scripts/txt2mac.py
	$(PYTHON) scripts/txt2mac.py $< $@

clean:
	rm -f $(MACFILES)

setup:
	@$(PYTHON) scripts/mcq-webapp.py setup $(SETUP_ARGS)

check:
	@$(PYTHON) scripts/mcq-webapp.py check

start:
	@$(PYTHON) scripts/mcq-webapp.py start

stop:
	@$(PYTHON) scripts/mcq-webapp.py stop

restart:
	@$(PYTHON) scripts/mcq-webapp.py restart

status:
	@$(PYTHON) scripts/mcq-webapp.py status
