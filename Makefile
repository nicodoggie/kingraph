.PHONY: help deps build test lint

help:
	@printf '%s\n' 'deps - install locked dependencies' 'build - compile ESM and declarations' 'test - build and run Vitest' 'lint - typecheck, lint and check formatting'

deps:
	npm ci

build:
	npm run build

test:
	npm test

lint:
	npm run typecheck
	npm run lint
	npm run format:check
