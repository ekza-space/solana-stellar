# The Stellar Gate — integration contract for consumer apps

How a game/app (Ekza Arena, Solana Avatars, Omoba, your next project) lifts a
finalized Stellar release into its own registry. This is the standard bridge
("gate") API — follow it and your app stays compatible with every other
consumer and with the Stellar console UI.

Reference implementation: `solana-ekza-arena` (`register_arena_asset_from_stellar`).

## Golden rules

1. **Never hand-code Stellar layout.** On-chain consumers depend on the
   program crate; layout/instruction changes then break your build loudly
   instead of corrupting reads silently:

   ```toml
   # programs/<your-program>/Cargo.toml
   solana-stellar = { path = "../../../solana-stellar/programs/solana-stellar", features = ["cpi"] }
   ```

   This gives you `solana_stellar::ID`, typed `state::{Release, Universe,
   ReleaseStatus, …}` and generated `cpi::{link_avatar_data,
   record_release_deployment, deposit_revenue, …}` clients. Requires the same
   `anchor-lang` major/minor as this repo (currently **0.32.1**).

   TS/off-chain consumers use `solana-stellar-sdk`
   (`file:../solana-stellar/sdk`): `createClient`, PDA helpers
   (`deriveRelease`, `deriveReleaseDeployment`, …), filters, IDL.

2. **Skin/identity only — never balance.** A Stellar release brings art +
   identity into your app. Gameplay stats/rarity/economy must be produced by
   YOUR program (e.g. Arena rolls stats on-chain at mint). Do not accept
   caller-supplied stats on the bridge path.

3. **Only `Finalized` or `Linked` releases pass the gate.** Check via typed
   status, not magic numbers:

   ```rust
   matches!(release.status, ReleaseStatus::Finalized | ReleaseStatus::Linked)
   ```

## Consumer checklist (on-chain program)

Your "register from Stellar" instruction should:

1. **Validate the release** — supplied program account is `solana_stellar::ID`
   and executable; release account is owned by it; `Release::try_deserialize`
   succeeds (discriminator enforced); stored `vault` matches the supplied
   vault; status is Finalized/Linked. See
   `solana-ekza-arena/programs/solana-ekza-arena/src/utils.rs::validate_stellar_release`.
2. **Authorize the publisher** — deserialize the `Universe`, require
   `universe.owner == signer` (only the universe owner publishes).
3. **Write your local record** — your app-side entity referencing the Stellar
   `asset` pubkey as the skin/identity source, plus link PDAs both ways
   (arena uses `StellarArenaAssetLink` + `StellarReleaseLink`; avatars uses
   `StellarAvatarLink` + `StellarReleaseLink`).
4. **CPI `link_avatar_data(your_record)`** when status is `Finalized` — flips
   the release to `Linked`. Signer must be the universe owner. Skip when
   already `Linked`.
5. **CPI `record_release_deployment(slug, your_program_id, your_record)`** —
   REQUIRED. This writes the per-project `ReleaseDeployment` PDA
   (`[b"release_deployment", release, slug]`) that lets wallets/consoles
   discover where a release was published. Slug: lowercase `[a-z0-9_-]`,
   ≤32 bytes, one per app (`"arena"`, `"avatar"`, `"omoba"`, …). Signer must
   be the release authority. Idempotent per (release, slug).
6. **(Optional) CPI `deposit_revenue`** on your monetized actions so fees flow
   into the release vault and contributors can claim their split (see
   `solana-avatars` minter `mint_nft`).

## Consumer checklist (frontend/console)

- Get the Stellar client + PDAs from `solana-stellar-sdk`; do not copy seeds.
- Your own program's client uses your program's IDL with the id read from the
  IDL `address` field; copy the IDL from `<your-program>/target/idl/` after
  `anchor build`.
- Guard publish actions: release must be `finalized|linked`, wallet must be
  the universe owner, target program must exist on the selected cluster
  (see `ekza-stellar/src/contracts/entities/actions.ts` `execPublishArenaAsset`).

## Known consumers

| App | Program | Slug | Revenue CPI | Notes |
|---|---|---|---|---|
| Ekza Arena | `D3a99Wj…M8iZ` | `arena` | no | reference implementation |
| Solana Avatars (minter) | `29KLLA…4TKz` | — (debt: does not record deployment yet) | `deposit_revenue` per mint | |
| Omoba registry | `solana-omoba-registry` | `omoba` | — | |

## Compatibility policy

- `Release` / `Universe` / `ReleaseDeployment` field ORDER and the
  `ReleaseStatus` enum order are a public ABI. Append-only; never reorder.
  Any breaking change requires bumping all consumers in the same PR (they
  depend on this crate, so the compiler will find them).
- Instruction signatures of `link_avatar_data`, `record_release_deployment`,
  `deposit_revenue` are frozen the same way.
