WEB := pnpm --dir web
PORT ?= 8080

.PHONY: setup setup-web setup-go dev lint lint-web lint-go typecheck packs contact-sheet test test-web test-go test-e2e
.PHONY: build-web build run check-web check-go check

setup: setup-web setup-go

setup-web:
	$(WEB) install --frozen-lockfile

setup-go:
	go mod download

dev:
	$(WEB) dev

lint: lint-web lint-go

lint-web:
	$(WEB) lint

lint-go:
	golangci-lint run

typecheck:
	$(WEB) typecheck

packs:
	$(WEB) validate:packs

contact-sheet:
	$(WEB) contact-sheet

test: test-web test-go

test-web:
	$(WEB) test

test-go:
	go test ./...

test-e2e:
	$(WEB) test:e2e

# The app lands in internal/webui/dist/app, which the Go binary embeds.
build-web:
	$(WEB) build

build: build-web
	go build -o bin/drawit ./cmd/drawit

run: build
	@echo "DrawIt starts at http://127.0.0.1:$(PORT)/ and opens in your browser. If it does not, open the full link printed below (it ends in #token)."
	./bin/drawit -addr 127.0.0.1:$(PORT)

check-web:
	$(MAKE) lint-web
	$(MAKE) typecheck
	$(MAKE) packs
	$(MAKE) contact-sheet
	$(MAKE) test-web
	$(MAKE) build-web
	$(MAKE) test-e2e

check-go:
	$(MAKE) lint-go
	$(MAKE) test-go

check:
	$(MAKE) check-web
	$(MAKE) check-go
