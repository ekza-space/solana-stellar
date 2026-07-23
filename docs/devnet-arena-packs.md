# Ekza Arena packs on Solana devnet

- Deployed: 2026-07-23
- Cluster genesis: `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`
- Program: `3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA`
- Owner: `Ab5TgPbcB8QVuormXYXHzRVkV7okAbzkS2sU2neKoWvQ`

| Pack                | Universe                                       | Entities | Game entries | Universe metadata CID                            |
| ------------------- | ---------------------------------------------- | -------: | -----------: | ------------------------------------------------ |
| Aetherlings         | `3AKyTGQDKDEUcDDNz2YLdgS5oqyTCsXLQHvkLKh3eDYF` |       23 |           22 | `QmSEoF3g1LMJqvFMSSMwaxCRPuWwb7wLWQSyCF9zEG6RMX` |
| Glasswrights        | `9XkQrWBnz66qmA4gQq9YmgF6fEh7h97JEcsyQoBjUvpd` |       23 |           22 | `QmSkc8vMeY6tkkooPsdXaLfEokxdm52QGeKh3pzHqtnRnH` |
| Neko Samurai        | `G1sDcwxaQgpm5J9i6CQY9VegBcTkhigRjHws4SXNwHeN` |       23 |           22 | `QmSpjR6Vd1YMPcYuhzHSdmZGsQUs5iogwVz3pPWAwZ2Rms` |
| Wotori Starter Pack | `4h4x9NLxKJbtdfFAQGiPzkj9MsDbRhdL2KeUYwShaBP8` |       35 |           34 | `QmTjkba6f5RQiKh6fTMW4q4bP6zYTg9RB2YB8aK2qG4rGa` |

The complete entity addresses, metadata/media CIDs and create/submit/approve
transaction signatures are stored alongside each pack in the tracked
`univerces/<pack>/_/deployment-manifest.json` files. These records contain no
secret key bytes; every `ownerKeypair` value is the literal `external`.

## Validate

```sh
RPC_URL=https://api.devnet.solana.com yarn validate:devnet-arena-packs
```

The validator refuses non-devnet genesis, verifies the fixed program ID,
fetches all 104 entity accounts, checks program ownership and universe links,
requires `approved` status, and checks all 100 game entries for address + CID.

The source seeder now stores `genesisHash` and validates an existing universe
before changing a deployment manifest. Cross-cluster resume fails closed; use
`--new-universe` for the first deployment to another cluster.

## Export to arena-web

After the validator passes, run each pack's `export-arena-manifest.js`. The
tracked outputs are:

- `ekza-arena-web/public/aetherlings/manifest.json`;
- `ekza-arena-web/public/glasswrights/manifest.json`;
- `ekza-arena-web/public/neko-samurai/manifest.json`;
- `ekza-arena-web/public/starter-pack/manifest.json`.

All four outputs now omit `mock:true` and carry `stellarUniverse`, devnet
endpoint, Solana Stellar program ID, entity address and IPFS CID.

## IPFS durability

Initial content was added with Kubo `0.42.0` using a repo at
`ekza-controll/.state/ipfs-devnet`; both the local gateway and
`https://ipfs.io/ipfs/` returned HTTP 200 for a sampled CID. This is release
evidence, not a durability guarantee. Repin every CID to a managed or otherwise
long-lived node before production.
