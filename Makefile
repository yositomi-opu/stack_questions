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
MOODLE_ROOT ?= /home/www/htdocs/moodle
MOODLE_WEB_USER ?= www-data
PHP_BIN ?= /usr/bin/php
WORKSHOP_ARGS ?= --help
RUNTIME_ARGS := $(if $(INCLUDE_BASE_URL),--include-base-url "$(INCLUDE_BASE_URL)")
SETUP_ARGS := $(if $(HOST),--host "$(HOST)") $(if $(PORT),--port "$(PORT)") $(if $(STACK_API_PORT),--stack-api-port "$(STACK_API_PORT)") $(if $(LOCALE),--locale "$(LOCALE)") $(RUNTIME_ARGS)

.PHONY: all clean check-python setup check install-deps start stop restart status install-moodle-auth workshop-users

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

install-moodle-auth:
	@./deploy/moodle-auth/install-plugin.sh "$(MOODLE_ROOT)"

workshop-users:
	@set -eu; \
		workshop_tmp=$$(mktemp -d /tmp/stack-questions-workshop.XXXXXX); \
		cleanup() { \
			rm -f "$$workshop_tmp/workshop_users.php" \
				"$$workshop_tmp/lib/credential_exporter.php" \
				"$$workshop_tmp/lib/workshop_user_manager.php"; \
			rmdir "$$workshop_tmp/lib" "$$workshop_tmp" 2>/dev/null || true; \
		}; \
		trap cleanup EXIT; \
		trap 'exit 1' HUP INT TERM; \
		mkdir -m 0755 "$$workshop_tmp/lib"; \
		install -m 0644 support/moodle/workshop_users.php "$$workshop_tmp/"; \
		install -m 0644 support/moodle/lib/credential_exporter.php "$$workshop_tmp/lib/"; \
		install -m 0644 support/moodle/lib/workshop_user_manager.php "$$workshop_tmp/lib/"; \
		chmod 0755 "$$workshop_tmp" "$$workshop_tmp/lib"; \
		sudo -u "$(MOODLE_WEB_USER)" "$(PHP_BIN)" \
			"$$workshop_tmp/workshop_users.php" --moodleroot="$(MOODLE_ROOT)" $(WORKSHOP_ARGS)
