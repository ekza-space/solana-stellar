# Solana Stellar Test Console

Small Vite + React Router app for manually testing the Solana Stellar protocol
on localnet or devnet.

## Run

```sh
cd app
npm install
npm run dev
```

Open the printed Vite URL and connect a Solana wallet.

## Localnet Flow

In another terminal from the repository root:

```sh
anchor localnet
```

Or run your own local validator and deploy the program with `anchor deploy`.
In the app, select `Localnet`, connect the wallet, use the airdrop button, then
click through:

1. Create a universe.
2. Create and approve assets.
3. Create a release and add shares.
4. Finalize the release.
5. Deposit and claim revenue.

## Devnet Flow

Deploy the current program ID to devnet, switch the app network to `Devnet`,
connect a funded wallet, and use the same flow.
