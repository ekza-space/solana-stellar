import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { SolanaStellar } from "../target/types/solana_stellar";

describe("solana-stellar", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.solanaStellar as Program<SolanaStellar>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const owner = provider.wallet as anchor.Wallet;
  const contributor = anchor.web3.Keypair.generate();

  const toLeBytes = (value: number) =>
    new anchor.BN(value).toArrayLike(Buffer, "le", 8);

  const universePda = (index: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("universe"), owner.publicKey.toBuffer(), toLeBytes(index)],
      program.programId
    )[0];

  const assetPda = (universe: anchor.web3.PublicKey, index: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("asset"), universe.toBuffer(), toLeBytes(index)],
      program.programId
    )[0];

  const linkPda = (
    child: anchor.web3.PublicKey,
    parent: anchor.web3.PublicKey
  ) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("link"), child.toBuffer(), parent.toBuffer()],
      program.programId
    )[0];

  const releasePda = (universe: anchor.web3.PublicKey, index: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("release"), universe.toBuffer(), toLeBytes(index)],
      program.programId
    )[0];

  const vaultPda = (release: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("release_vault"), release.toBuffer()],
      program.programId
    )[0];

  const sharePda = (
    release: anchor.web3.PublicKey,
    contributorPk: anchor.web3.PublicKey
  ) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("share"), release.toBuffer(), contributorPk.toBuffer()],
      program.programId
    )[0];

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      contributor.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    const latest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: sig,
      ...latest,
    });
  });

  it("creates a universe, asset graph, release vault, and revenue split", async () => {
    const universe = universePda(0);
    const parentAsset = assetPda(universe, 0);
    const childAsset = assetPda(universe, 1);
    const parentLink = linkPda(childAsset, parentAsset);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);
    const ownerShare = sharePda(release, owner.publicKey);
    const contributorShare = sharePda(release, contributor.publicKey);

    await program.methods
      .createUniverse(
        new anchor.BN(0),
        "QmUniverseMetadataHash",
        { model3D: {} } as any,
        { custom: {} } as any,
        true
      )
      .accountsStrict({
        universe,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(0),
        { image: {} } as any,
        { concept: {} } as any,
        "QmConceptMetadataHash",
        "QmConceptPreviewHash"
      )
      .accountsStrict({
        universe,
        asset: parentAsset,
        creator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .submitAsset()
      .accountsStrict({ asset: parentAsset, creator: owner.publicKey })
      .rpc();

    await program.methods
      .approveAsset()
      .accountsStrict({
        universe,
        asset: parentAsset,
        owner: owner.publicKey,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(1),
        { model3D: {} } as any,
        { final: {} } as any,
        "QmModelMetadataHash",
        "QmModelPreviewHash"
      )
      .accountsStrict({
        universe,
        asset: childAsset,
        creator: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();

    await program.methods
      .addAssetParent()
      .accountsStrict({
        childAsset,
        parentAsset,
        creator: contributor.publicKey,
        assetParent: parentLink,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();

    await program.methods
      .submitAsset()
      .accountsStrict({ asset: childAsset, creator: contributor.publicKey })
      .signers([contributor])
      .rpc();

    await program.methods
      .approveAsset()
      .accountsStrict({
        universe,
        asset: childAsset,
        owner: owner.publicKey,
      })
      .rpc();

    await program.methods
      .createRelease(new anchor.BN(0), "QmReleaseMetadataHash")
      .accountsStrict({
        universe,
        asset: childAsset,
        release,
        vault,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .addReleaseShare(4000)
      .accountsStrict({
        universe,
        release,
        share: ownerShare,
        contributor: owner.publicKey,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .addReleaseShare(6000)
      .accountsStrict({
        universe,
        release,
        share: contributorShare,
        contributor: contributor.publicKey,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .finalizeRelease()
      .accountsStrict({
        universe,
        release,
        asset: childAsset,
        owner: owner.publicKey,
      })
      .rpc();

    await program.methods
      .depositRevenue(new anchor.BN(1_000_000))
      .accountsStrict({
        release,
        vault,
        payer: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .claimRevenue()
      .accountsStrict({
        release,
        vault,
        share: contributorShare,
        contributor: contributor.publicKey,
      })
      .signers([contributor])
      .rpc();

    const fetchedUniverse = await program.account.universe.fetch(universe);
    const fetchedChild = await program.account.asset.fetch(childAsset);
    const fetchedLink = await program.account.assetParent.fetch(parentLink);
    const fetchedRelease = await program.account.release.fetch(release);
    const fetchedShare =
      await program.account.contributorShare.fetch(contributorShare);

    expect(fetchedUniverse.assetCount.toNumber()).to.equal(2);
    expect(fetchedUniverse.releaseCount.toNumber()).to.equal(1);
    expect(fetchedChild.parentCount).to.equal(1);
    expect(fetchedChild.status).to.deep.equal({ finalized: {} });
    expect(fetchedLink.parentAsset.toBase58()).to.equal(parentAsset.toBase58());
    expect(fetchedRelease.status).to.deep.equal({ finalized: {} });
    expect(fetchedRelease.totalShareBps).to.equal(10_000);
    expect(fetchedRelease.totalDepositedLamports.toNumber()).to.equal(
      1_000_000
    );
    expect(fetchedShare.claimedLamports.toNumber()).to.equal(600_000);
  });
});
