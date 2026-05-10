SHELL := /bin/bash

CLUSTER ?= localnet
ALLOW_MAINNET ?= 0
ALLOW_REMOTE_SEED ?= 0
WALLET ?= $(HOME)/.config/solana/id.json

LOCALNET_URL ?= http://127.0.0.1:8899
DEVNET_URL ?= https://api.devnet.solana.com
MAINNET_URL ?= https://api.mainnet-beta.solana.com
LOCALNET_LEDGER ?= test-ledger
LOCALNET_BIND_ADDRESS ?= 127.0.0.1
LOCALNET_RPC_PORT ?= 8899
AIRDROP_SOL ?= 20

EVERYTHING_DIR ?= $(CURDIR)/univerces/everything
MODEL_COUNT ?= 10
MODEL_FORMAT ?= glb
METADATA_PORT ?= 8787
METADATA_BASE_URL ?= http://127.0.0.1:$(METADATA_PORT)
EKZA_STELLAR_URL ?= http://localhost:53328
APP_PORT ?= 53328
SEED_SCRIPT ?= scripts/deploy-random-models-localnet.js
SEED_FLAGS ?=

ifeq ($(CLUSTER),localnet)
DEFAULT_RPC_URL := $(LOCALNET_URL)
ANCHOR_CLUSTER := localnet
else ifeq ($(CLUSTER),devnet)
DEFAULT_RPC_URL := $(DEVNET_URL)
ANCHOR_CLUSTER := devnet
else ifeq ($(CLUSTER),mainnet)
DEFAULT_RPC_URL := $(MAINNET_URL)
ANCHOR_CLUSTER := mainnet-beta
else ifeq ($(CLUSTER),mainnet-beta)
DEFAULT_RPC_URL := $(MAINNET_URL)
ANCHOR_CLUSTER := mainnet-beta
else
$(error CLUSTER must be localnet, devnet, mainnet, or mainnet-beta)
endif

RPC_URL ?= $(DEFAULT_RPC_URL)

.PHONY: help print-config check-mainnet check-airdrop check-seed-cluster check-rpc \
	sdk-build anchor-build sync-sdk-idl build build-localnet build-devnet build-mainnet \
	airdrop airdrop-localnet deploy deploy-localnet deploy-devnet deploy-mainnet \
	localnet metadata-server app-dev \
	seed-random-models seed-new-random-models seed-new-single \
	seed-everything-localnet seed-new-everything-localnet seed-new-single-localnet \
	setup-localnet setup-localnet-single capture-seed-previews deploy-everything-localnet

help:
	@printf "%s\n" \
		"Solana Stellar Make targets" \
		"" \
		"Core:" \
		"  make build                         Build Anchor program, sync IDL, build SDK" \
		"  make deploy CLUSTER=localnet       Deploy to CLUSTER via RPC_URL" \
		"  make deploy CLUSTER=devnet         Deploy to devnet" \
		"  make deploy CLUSTER=mainnet ALLOW_MAINNET=1" \
		"  make airdrop CLUSTER=localnet      Airdrop AIRDROP_SOL to WALLET" \
		"" \
		"Local testing:" \
		"  make localnet                      Run solana-test-validator" \
		"  make metadata-server               Serve EVERYTHING_DIR metadata/assets" \
		"  make app-dev                       Run the React console on APP_PORT" \
		"  make setup-localnet MODEL_COUNT=10 Deploy + seed a fresh localnet universe" \
		"  make setup-localnet-single         Deploy + seed one model-backed project" \
		"" \
		"Seeder:" \
		"  make seed-random-models            Append random models to manifest universe" \
		"  make seed-new-random-models        Create a fresh universe, then seed models" \
		"  make seed-new-single               Fresh universe with one model-backed project" \
		"" \
		"Variables:" \
		"  CLUSTER=localnet|devnet|mainnet    Default: $(CLUSTER)" \
		"  RPC_URL=<custom rpc>               Default for cluster: $(DEFAULT_RPC_URL)" \
		"  WALLET=<keypair>                   Default: $(WALLET)" \
		"  MODEL_COUNT=10 MODEL_FORMAT=glb    Seeder controls" \
		"  METADATA_BASE_URL=http://...       Seeder metadata URL"

print-config:
	@printf "CLUSTER=%s\nANCHOR_CLUSTER=%s\nRPC_URL=%s\nWALLET=%s\nEVERYTHING_DIR=%s\nMODEL_COUNT=%s\nMODEL_FORMAT=%s\nMETADATA_BASE_URL=%s\n" \
		"$(CLUSTER)" "$(ANCHOR_CLUSTER)" "$(RPC_URL)" "$(WALLET)" "$(EVERYTHING_DIR)" "$(MODEL_COUNT)" "$(MODEL_FORMAT)" "$(METADATA_BASE_URL)"

check-mainnet:
	@if [[ "$(ANCHOR_CLUSTER)" == "mainnet-beta" && "$(ALLOW_MAINNET)" != "1" ]]; then \
		echo "Refusing mainnet deploy. Re-run with CLUSTER=mainnet ALLOW_MAINNET=1 after checking WALLET and RPC_URL."; \
		exit 1; \
	fi

check-airdrop:
	@if [[ "$(ANCHOR_CLUSTER)" == "mainnet-beta" ]]; then \
		echo "Airdrop is not available on mainnet."; \
		exit 1; \
	fi

check-seed-cluster:
	@if [[ "$(ANCHOR_CLUSTER)" != "localnet" && "$(ALLOW_REMOTE_SEED)" != "1" ]]; then \
		echo "The random-model seeder is intended for localnet and stores METADATA_BASE_URL=$(METADATA_BASE_URL)."; \
		echo "Use CLUSTER=localnet, or set ALLOW_REMOTE_SEED=1 with a reachable METADATA_BASE_URL."; \
		exit 1; \
	fi
	@if [[ "$(ANCHOR_CLUSTER)" == "mainnet-beta" && "$(ALLOW_MAINNET)" != "1" ]]; then \
		echo "Refusing to run the seeder on mainnet. Re-run with CLUSTER=mainnet ALLOW_MAINNET=1 ALLOW_REMOTE_SEED=1 only if this is intentional."; \
		exit 1; \
	fi

check-rpc:
	solana cluster-version --url "$(RPC_URL)"

sdk-build:
	yarn --cwd sdk build

anchor-build:
	anchor build

sync-sdk-idl: anchor-build
	mkdir -p sdk/idl
	cp target/idl/solana_stellar.json sdk/idl/solana_stellar.json
	cp target/types/solana_stellar.ts sdk/idl/solana_stellar.ts
	node_modules/.bin/prettier --write sdk/idl/solana_stellar.json sdk/idl/solana_stellar.ts
	yarn --cwd sdk build

build: sync-sdk-idl

build-localnet: CLUSTER = localnet
build-localnet: build

build-devnet: CLUSTER = devnet
build-devnet: build

build-mainnet: CLUSTER = mainnet
build-mainnet: build

airdrop: check-airdrop
	solana --keypair "$(WALLET)" airdrop "$(AIRDROP_SOL)" --url "$(RPC_URL)"

airdrop-localnet: CLUSTER = localnet
airdrop-localnet: airdrop

deploy: check-mainnet build
	anchor deploy --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"

deploy-localnet:
	$(MAKE) CLUSTER=localnet build airdrop deploy

deploy-devnet:
	$(MAKE) CLUSTER=devnet deploy

deploy-mainnet:
	$(MAKE) CLUSTER=mainnet deploy

localnet:
	solana-test-validator --ledger "$(LOCALNET_LEDGER)" --bind-address "$(LOCALNET_BIND_ADDRESS)" --rpc-port "$(LOCALNET_RPC_PORT)"

metadata-server:
	node scripts/serve-metadata.js --folder "$(EVERYTHING_DIR)" --port "$(METADATA_PORT)"

app-dev:
	npm run dev --prefix app -- --port "$(APP_PORT)"

seed-random-models: check-seed-cluster sdk-build
	node "$(SEED_SCRIPT)" --folder "$(EVERYTHING_DIR)" --count "$(MODEL_COUNT)" --endpoint "$(RPC_URL)" --metadata-base-url "$(METADATA_BASE_URL)" --model-format "$(MODEL_FORMAT)" $(SEED_FLAGS)

seed-new-random-models: SEED_FLAGS += --new-universe
seed-new-random-models: seed-random-models

seed-new-single: MODEL_COUNT = 1
seed-new-single: seed-new-random-models

seed-everything-localnet: CLUSTER = localnet
seed-everything-localnet: seed-random-models

seed-new-everything-localnet: CLUSTER = localnet
seed-new-everything-localnet: seed-new-random-models

seed-new-single-localnet: CLUSTER = localnet
seed-new-single-localnet: MODEL_COUNT = 1
seed-new-single-localnet: seed-new-random-models

setup-localnet:
	$(MAKE) CLUSTER=localnet check-rpc
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-new-random-models

setup-localnet-single:
	$(MAKE) CLUSTER=localnet check-rpc
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-new-single

capture-seed-previews:
	node scripts/capture-manifest-previews.js --folder "$(EVERYTHING_DIR)" --app-url "$(EKZA_STELLAR_URL)" --metadata-base-url "$(METADATA_BASE_URL)"

deploy-everything-localnet:
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-everything-localnet
