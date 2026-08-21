BINARY  := tags
DIST    := dist
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
NPROC   := $(shell nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

PLATFORMS := \
	darwin/amd64 \
	darwin/arm64 \
	linux/amd64 \
	linux/arm64 \
	windows/amd64 \
	windows/arm64

.PHONY: build release clean $(PLATFORMS)

build:
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BINARY) .

release:
	$(MAKE) -j$(NPROC) $(PLATFORMS)

$(PLATFORMS):
	$(eval GOOS   := $(word 1,$(subst /, ,$@)))
	$(eval GOARCH := $(word 2,$(subst /, ,$@)))
	$(eval EXT    := $(if $(filter windows,$(GOOS)),.exe,))
	CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) \
		go build -ldflags "$(LDFLAGS)" \
		-o $(DIST)/$(BINARY)-$(GOOS)-$(GOARCH)$(EXT) .

clean:
	rm -rf $(DIST) $(BINARY)
