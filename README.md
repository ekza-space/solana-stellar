# Solana Stellar

Solana Stellar is an Anchor-based protocol for collaborative asset universes on
Solana. It is based on the original CosmWasm project at
[github.com/wotori-studio/cw-stellar](https://github.com/wotori-studio/cw-stellar)
and reworks its business logic for Solana's account model.

The protocol lets creators open a universe, add typed assets, connect assets
into a lineage graph, approve production-ready work, and finalize an asset as a
release. Each release owns a vault and a contributor share snapshot, so revenue
can be split across many collaborators without depending on Metaplex creator
limits.

## Core Concepts

- **Universe**: a collaborative workspace owned by a creator or studio.
- **Asset**: an on-chain record for an IPFS/Arweave-backed artifact such as
  concept art, 3D models, rigs, animations, scripts, or metadata.
- **Lineage**: directed asset links that form a DAG, allowing a final asset to
  reference all upstream work.
- **Release**: an immutable production snapshot of an approved asset.
- **Release Vault**: a PDA-controlled revenue vault for mint fees, royalties, or
  downstream app revenue.
- **Contributor Share**: basis-point revenue allocation stored independently
  from NFT metadata creator fields.

## Current Scope

This repository currently implements the Solana protocol core:

- universe creation and updates;
- rent-aware asset creation by the contributor;
- asset lifecycle states from draft to finalized;
- asset parent links for lineage tracking;
- release creation and finalization;
- contributor shares in basis points;
- vault deposits and contributor revenue claims.

NFT minting and user-facing avatar identity remain separate concerns. The
intended downstream consumer is `solana-avatars`, which can mint avatar NFTs
from finalized Stellar releases while keeping collaboration accounting inside
this protocol.

## Development

```sh
yarn --cwd sdk build
anchor test
```

Localnet universe seeding:

```sh
make metadata-server
make seed-new-single-localnet
```

If your browser app shows `NetworkError when attempting to fetch resource` or RPC
fetch errors during local testing, make sure the UI uses the local Vite proxy:

```sh
make localnet
```

The app points localnet RPC through `http://localhost:<app-port>/rpc` and the
Vite dev server proxies this path to `127.0.0.1:8899`, so RPC calls stay same-origin.

`seed-new-single-localnet` creates a fresh universe and guarantees at least one
top-level project plus one child 3D model asset inside it. Seeding uses `.glb`
files by default so each model is a single portable artifact with embedded
textures. Use
`make seed-new-everything-localnet MODEL_COUNT=10` for a fresh universe with
more model-backed projects, or `make seed-everything-localnet MODEL_COUNT=10`
to append to the current manifest universe. For local OBJ loader diagnostics
only, pass `MODEL_FORMAT=obj` or `MODEL_FORMAT=all`.

## TypeScript SDK

The local `solana-stellar-sdk` package in `sdk/` is the frontend-facing source
of truth for the Solana Stellar IDL, typed Anchor client, PDA helpers, account
filters, and low-level instruction helpers. Downstream apps can consume it with
a local file dependency such as `file:../solana-stellar/sdk`.
