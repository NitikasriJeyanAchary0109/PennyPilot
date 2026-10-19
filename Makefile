.PHONY: help install test lint format run eval clean

VENV ?= .venv
PYTHON ?= $(if $(wildcard $(VENV)/bin/python),$(VENV)/bin/python,python3)
PYTEST ?= $(if $(wildcard $(VENV)/bin/pytest),$(VENV)/bin/pytest,pytest)
RUFF ?= $(if $(wildcard $(VENV)/bin/ruff),$(VENV)/bin/ruff,ruff)
BLACK ?= $(if $(wildcard $(VENV)/bin/black),$(VENV)/bin/black,black)
MYPY ?= $(if $(wildcard $(VENV)/bin/mypy),$(VENV)/bin/mypy,mypy)
UVICORN ?= $(if $(wildcard $(VENV)/bin/uvicorn),$(VENV)/bin/uvicorn,uvicorn)

help:
	@echo "Available commands:"
	@echo "  make test      Run backend test suite with pytest"
	@echo "  make lint      Run code linters (ruff, black --check, mypy)"
	@echo "  make format    Format code (ruff --fix, black)"
	@echo "  make run       Start the FastAPI backend server with hot reload"
	@echo "  make eval      Run AI evaluation harness (Phase 2)"
	@echo "  make install   Install dependencies into virtual environment"
	@echo "  make clean     Remove cache files and test artifacts"

install:
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r backend/requirements.txt
	$(PYTHON) -m pip install -r backend/requirements-dev.txt

test:
	PYTHONPATH=backend $(PYTEST) backend/tests/ -v

lint:
	$(RUFF) check backend/
	$(BLACK) --check backend/
	$(MYPY) backend/app

format:
	$(RUFF) check backend/ --fix
	$(BLACK) backend/

run:
	PYTHONPATH=backend $(UVICORN) app.main:app --host 0.0.0.0 --port 8000 --reload

eval:
	@if [ -d "backend/evals" ]; then \
		PYTHONPATH=backend $(PYTHON) -m backend.evals.run; \
	else \
		echo "Evaluation harness will be created in Phase 2 under backend/evals/."; \
	fi

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -f backend/*.db backend/pytest_run.log
