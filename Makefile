PREFIX ?= $(HOME)/.local

.PHONY: build install uninstall install-hooks clean

build:
	go build -o claude-tg ./cmd/claude-tg/

install: build
	mkdir -p $(PREFIX)/bin
	rm -f $(PREFIX)/bin/claude-tg
	cp claude-tg $(PREFIX)/bin/claude-tg
	chmod 755 $(PREFIX)/bin/claude-tg
	@echo ""
	@echo "Installed to $(PREFIX)/bin/claude-tg"
	@echo "Make sure $(PREFIX)/bin is in your PATH."

uninstall:
	rm -f $(PREFIX)/bin/claude-tg

install-hooks: build
	./claude-tg install-hooks

clean:
	rm -f claude-tg
