SHELL := /bin/bash

LOCALNET_URL ?= http://127.0.0.1:8899
EVERYTHING_DIR ?= $(CURDIR)/univerces/everything
MODEL_COUNT ?= 10
MODEL_FORMAT ?= glb
METADATA_PORT ?= 8787
METADATA_BASE_URL ?= http://127.0.0.1:$(METADATA_PORT)
EKZA_STELLAR_URL ?= http://localhost:53328

.PHONY: sdk-build anchor-build sync-sdk-idl build-localnet airdrop-localnet deploy-localnet localnet metadata-server seed-everything-localnet seed-new-everything-localnet seed-new-single-localnet capture-seed-previews deploy-everything-localnet

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

build-localnet: sync-sdk-idl

airdrop-localnet:
	solana airdrop 20 --url $(LOCALNET_URL)

deploy-localnet: build-localnet airdrop-localnet
	anchor deploy --provider.cluster localnet

localnet:
	solana-test-validator --ledger test-ledger --bind-address 127.0.0.1 --rpc-port 8899

metadata-server:
	node scripts/serve-metadata.js --folder "$(EVERYTHING_DIR)" --port "$(METADATA_PORT)"

seed-everything-localnet: sdk-build
	node scripts/deploy-random-models-localnet.js --folder "$(EVERYTHING_DIR)" --count "$(MODEL_COUNT)" --endpoint "$(LOCALNET_URL)" --metadata-base-url "$(METADATA_BASE_URL)" --model-format "$(MODEL_FORMAT)"

seed-new-everything-localnet: sdk-build
	node scripts/deploy-random-models-localnet.js --folder "$(EVERYTHING_DIR)" --count "$(MODEL_COUNT)" --endpoint "$(LOCALNET_URL)" --metadata-base-url "$(METADATA_BASE_URL)" --model-format "$(MODEL_FORMAT)" --new-universe

seed-new-single-localnet: sdk-build
	node scripts/deploy-random-models-localnet.js --folder "$(EVERYTHING_DIR)" --count "1" --endpoint "$(LOCALNET_URL)" --metadata-base-url "$(METADATA_BASE_URL)" --model-format "$(MODEL_FORMAT)" --new-universe

capture-seed-previews:
	node scripts/capture-manifest-previews.js --folder "$(EVERYTHING_DIR)" --app-url "$(EKZA_STELLAR_URL)" --metadata-base-url "$(METADATA_BASE_URL)"

deploy-everything-localnet: deploy-localnet seed-everything-localnet
