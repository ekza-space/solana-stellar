SHELL := /bin/bash

CLUSTER ?= localnet
ALLOW_MAINNET ?= 0
ALLOW_REMOTE_SEED ?= 0
WALLET ?= $(HOME)/.config/solana/id.json
SOLANA_AVATARS_DIR ?= $(CURDIR)/../solana-avatars

LOCALNET_URL ?= http://127.0.0.1:8899
DEVNET_URL ?= https://api.devnet.solana.com
MAINNET_URL ?= https://api.mainnet-beta.solana.com
LOCALNET_LEDGER ?= test-ledger
LOCALNET_BIND_ADDRESS ?= 127.0.0.1
LOCALNET_RPC_PORT ?= 8899
LOCALNET_RPC_CORS ?= all
LOCALNET_CLONE_METAPLEX ?= 1
LOCALNET_RESET ?= 0
LOCALNET_EXTRA_ARGS ?=
AIRDROP_SOL ?= 20
METAPLEX_TOKEN_METADATA_PROGRAM ?= metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
METAPLEX_CLONE_URL ?= $(DEVNET_URL)

RPC_CORS_FLAG := $(shell \
	if solana-test-validator --help 2>/dev/null | rg -- "--rpc-cors" >/dev/null; then \
		echo "--rpc-cors \"$(LOCALNET_RPC_CORS)\""; \
	fi \
)

METAPLEX_METADATA_FLAG := $(shell \
	if [ "$(LOCALNET_CLONE_METAPLEX)" = "1" ]; then \
		if solana-test-validator --help 2>/dev/null | grep -q -- "--clone-upgradeable-program"; then \
			echo "--clone-upgradeable-program \"$(METAPLEX_TOKEN_METADATA_PROGRAM)\" --url \"$(METAPLEX_CLONE_URL)\""; \
		else \
			echo "--clone \"$(METAPLEX_TOKEN_METADATA_PROGRAM)\" --url \"$(METAPLEX_CLONE_URL)\""; \
		fi; \
	fi \
)

LOCALNET_RESET_FLAG := $(shell \
	if [ "$(LOCALNET_RESET)" = "1" ]; then \
		echo "--reset"; \
	fi \
)

EVERYTHING_DIR ?= $(CURDIR)/univerces/everything
WOTORI_DIR ?= $(CURDIR)/univerces/wotori
MODEL_COUNT ?= 10
MODEL_FORMAT ?= glb
METADATA_PORT ?= 8787
METADATA_BASE_URL ?= http://127.0.0.1:$(METADATA_PORT)
EKZA_STELLAR_URL ?= http://localhost:53328
APP_PORT ?= 53328
REACT_APP_IPFS_UPLOAD_MODE ?= ipfs
REACT_APP_IPFS_UPLOAD_API ?= http://127.0.0.1:5001/api/v0/add
SEED_SCRIPT ?= scripts/deploy-random-models-localnet.js
WOTORI_SEED_SCRIPT ?= scripts/deploy-wotori-universe-localnet.js
SEED_FLAGS ?=
WOTORI_SEED_FLAGS ?=

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
	localnet localnet-metaplex metadata-server metadata-server-wotori app-dev \
	seed-random-models seed-new-random-models seed-new-single seed-wotori seed-new-wotori \
	seed-everything-localnet seed-new-everything-localnet seed-new-single-localnet seed-wotori-localnet seed-new-wotori-localnet \
	setup-localnet setup-localnet-single capture-seed-previews deploy-everything-localnet \
	deploy-wotori-localnet deploy-local-avatar-programs

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
		"  make localnet                      Run solana-test-validator with Metaplex Token Metadata cloned" \
		"  make localnet-metaplex             Run localnet on a separate Metaplex-ready ledger" \
		"  make metadata-server               Serve EVERYTHING_DIR metadata/assets" \
		"  make metadata-server-wotori        Serve WOTORI_DIR metadata/assets" \
		"  make app-dev                       Run the React console on APP_PORT" \
		"  make setup-localnet MODEL_COUNT=10 Deploy + seed a fresh localnet universe" \
		"  make setup-localnet-single         Deploy + seed one model-backed project" \
		"  make deploy-wotori-localnet        Deploy program + seed a fresh Wotori Studio universe" \
		"  make deploy-local-avatar-programs   Deploy solana-avatars + avatar minter to localnet (requires sibling ../solana-avatars repo)" \
		"" \
		"Seeder:" \
		"  make seed-random-models            Append random models to manifest universe" \
		"  make seed-new-random-models        Create a fresh universe, then seed models" \
		"  make seed-new-single               Fresh universe with one model-backed project" \
		"  make seed-wotori-localnet          Map Wotori Studio dump into Solana Stellar" \
		"  make seed-new-wotori-localnet      Force a fresh Wotori Studio universe" \
		"" \
		"Variables:" \
		"  CLUSTER=localnet|devnet|mainnet    Default: $(CLUSTER)" \
		"  RPC_URL=<custom rpc>               Default for cluster: $(DEFAULT_RPC_URL)" \
		"  WALLET=<keypair>                   Default: $(WALLET)" \
		"  MODEL_COUNT=10 MODEL_FORMAT=glb    Seeder controls" \
		"  METADATA_BASE_URL=http://...       Seeder metadata URL" \
		"  LOCALNET_CLONE_METAPLEX=0          Disable local Metaplex Token Metadata clone" \
		"  LOCALNET_RESET=1                   Pass --reset to solana-test-validator" \
		"  LOCALNET_EXTRA_ARGS='...'          Extra solana-test-validator args"

print-config:
	@printf "CLUSTER=%s\nANCHOR_CLUSTER=%s\nRPC_URL=%s\nWALLET=%s\nEVERYTHING_DIR=%s\nWOTORI_DIR=%s\nMODEL_COUNT=%s\nMODEL_FORMAT=%s\nMETADATA_BASE_URL=%s\nLOCALNET_CLONE_METAPLEX=%s\nLOCALNET_RESET=%s\nMETAPLEX_TOKEN_METADATA_PROGRAM=%s\nMETAPLEX_CLONE_URL=%s\n" \
		"$(CLUSTER)" "$(ANCHOR_CLUSTER)" "$(RPC_URL)" "$(WALLET)" "$(EVERYTHING_DIR)" "$(WOTORI_DIR)" "$(MODEL_COUNT)" "$(MODEL_FORMAT)" "$(METADATA_BASE_URL)" "$(LOCALNET_CLONE_METAPLEX)" "$(LOCALNET_RESET)" "$(METAPLEX_TOKEN_METADATA_PROGRAM)" "$(METAPLEX_CLONE_URL)"

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
		echo "The seeder is intended for localnet and stores METADATA_BASE_URL=$(METADATA_BASE_URL)."; \
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
	solana-test-validator --ledger "$(LOCALNET_LEDGER)" --bind-address "$(LOCALNET_BIND_ADDRESS)" --rpc-port "$(LOCALNET_RPC_PORT)" $(RPC_CORS_FLAG) $(METAPLEX_METADATA_FLAG) $(LOCALNET_RESET_FLAG) $(LOCALNET_EXTRA_ARGS)

localnet-metaplex: LOCALNET_LEDGER = test-ledger-metaplex
localnet-metaplex: localnet

metadata-server:
	node scripts/serve-metadata.js --folder "$(EVERYTHING_DIR)" --port "$(METADATA_PORT)"

metadata-server-wotori:
	node scripts/serve-metadata.js --folder "$(WOTORI_DIR)" --port "$(METADATA_PORT)"

app-dev:
	REACT_APP_IPFS_UPLOAD_MODE="$(REACT_APP_IPFS_UPLOAD_MODE)" \
	REACT_APP_IPFS_UPLOAD_API="$(REACT_APP_IPFS_UPLOAD_API)" \
	npm run dev --prefix app -- --port "$(APP_PORT)"

seed-random-models: check-seed-cluster sdk-build
	node "$(SEED_SCRIPT)" --folder "$(EVERYTHING_DIR)" --count "$(MODEL_COUNT)" --endpoint "$(RPC_URL)" --metadata-base-url "$(METADATA_BASE_URL)" --model-format "$(MODEL_FORMAT)" $(SEED_FLAGS)

seed-new-random-models: SEED_FLAGS += --new-universe
seed-new-random-models: seed-random-models

seed-new-single: MODEL_COUNT = 1
seed-new-single: seed-new-random-models

seed-wotori: check-seed-cluster sdk-build
	node "$(WOTORI_SEED_SCRIPT)" --folder "$(WOTORI_DIR)" --endpoint "$(RPC_URL)" --metadata-base-url "$(METADATA_BASE_URL)" $(WOTORI_SEED_FLAGS)

seed-new-wotori: WOTORI_SEED_FLAGS += --new-universe
seed-new-wotori: seed-wotori

seed-everything-localnet: CLUSTER = localnet
seed-everything-localnet: seed-random-models

seed-new-everything-localnet: CLUSTER = localnet
seed-new-everything-localnet: seed-new-random-models

seed-new-single-localnet: CLUSTER = localnet
seed-new-single-localnet: MODEL_COUNT = 1
seed-new-single-localnet: seed-new-random-models

seed-wotori-localnet: CLUSTER = localnet
seed-wotori-localnet: seed-wotori

seed-new-wotori-localnet: CLUSTER = localnet
seed-new-wotori-localnet: seed-new-wotori

setup-localnet:
	$(MAKE) CLUSTER=localnet check-rpc
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-new-random-models

setup-localnet-single:
	$(MAKE) CLUSTER=localnet check-rpc
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-new-single

deploy-local-avatar-programs:
	@if [[ "$(ANCHOR_CLUSTER)" != "localnet" ]]; then \
		echo "deploy-local-avatar-programs is intended for localnet only (set CLUSTER=localnet)."; \
		exit 1; \
	fi
	@if [[ ! -d "$(SOLANA_AVATARS_DIR)" ]]; then \
		echo "Missing Solana Avatars repo at $(SOLANA_AVATARS_DIR)"; \
		exit 1; \
	fi
	cd "$(SOLANA_AVATARS_DIR)" && \
		anchor build && \
		anchor deploy --program-name minter --program-keypair target-deploy-keypair-minter.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)" && \
		anchor deploy --program-name avatars --program-keypair target-deploy-keypair.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"

capture-seed-previews:
	node scripts/capture-manifest-previews.js --folder "$(EVERYTHING_DIR)" --app-url "$(EKZA_STELLAR_URL)" --metadata-base-url "$(METADATA_BASE_URL)"

deploy-everything-localnet:
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-everything-localnet

deploy-wotori-localnet:
	$(MAKE) CLUSTER=localnet deploy-localnet
	$(MAKE) CLUSTER=localnet seed-new-wotori-localnet
