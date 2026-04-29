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
  const branchContributor = anchor.web3.Keypair.generate();

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

    const branchSig = await provider.connection.requestAirdrop(
      branchContributor.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    const branchLatest = await provider.connection.getLatestBlockhash();
    await provider.connection.confirmTransaction({
      signature: branchSig,
      ...branchLatest,
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
    const fetchedShare = await program.account.contributorShare.fetch(
      contributorShare
    );

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

  it("finalizes equal lineage shares across merged branches", async () => {
    const universe = universePda(1);
    const baseAsset = assetPda(universe, 0);
    const uvAsset = assetPda(universe, 1);
    const animationAsset = assetPda(universe, 2);
    const finalAsset = assetPda(universe, 3);
    const uvBaseLink = linkPda(uvAsset, baseAsset);
    const animationBaseLink = linkPda(animationAsset, baseAsset);
    const finalUvLink = linkPda(finalAsset, uvAsset);
    const finalAnimationLink = linkPda(finalAsset, animationAsset);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);

    await program.methods
      .createUniverse(
        new anchor.BN(1),
        "QmUniverseMetadataHash2",
        { model3D: {} } as any,
        { lineageEqual: {} } as any,
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
        "QmBaseMetadataHash",
        "QmBasePreviewHash"
      )
      .accountsStrict({
        universe,
        asset: baseAsset,
        creator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await program.methods
      .submitAsset()
      .accountsStrict({ asset: baseAsset, creator: owner.publicKey })
      .rpc();
    await program.methods
      .approveAsset()
      .accountsStrict({ universe, asset: baseAsset, owner: owner.publicKey })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(1),
        { model3D: {} } as any,
        { texture: {} } as any,
        "QmUvMetadataHash",
        "QmUvPreviewHash"
      )
      .accountsStrict({
        universe,
        asset: uvAsset,
        creator: contributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    await program.methods
      .addAssetParent()
      .accountsStrict({
        childAsset: uvAsset,
        parentAsset: baseAsset,
        creator: contributor.publicKey,
        assetParent: uvBaseLink,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([contributor])
      .rpc();
    await program.methods
      .submitAsset()
      .accountsStrict({ asset: uvAsset, creator: contributor.publicKey })
      .signers([contributor])
      .rpc();
    await program.methods
      .approveAsset()
      .accountsStrict({ universe, asset: uvAsset, owner: owner.publicKey })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(2),
        { animation: {} } as any,
        { motion: {} } as any,
        "QmAnimMetadataHash",
        "QmAnimPreviewHash"
      )
      .accountsStrict({
        universe,
        asset: animationAsset,
        creator: branchContributor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([branchContributor])
      .rpc();
    await program.methods
      .addAssetParent()
      .accountsStrict({
        childAsset: animationAsset,
        parentAsset: baseAsset,
        creator: branchContributor.publicKey,
        assetParent: animationBaseLink,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([branchContributor])
      .rpc();
    await program.methods
      .submitAsset()
      .accountsStrict({
        asset: animationAsset,
        creator: branchContributor.publicKey,
      })
      .signers([branchContributor])
      .rpc();
    await program.methods
      .approveAsset()
      .accountsStrict({
        universe,
        asset: animationAsset,
        owner: owner.publicKey,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(3),
        { model3D: {} } as any,
        { final: {} } as any,
        "QmFinalMetadataHash",
        "QmFinalPreviewHash"
      )
      .accountsStrict({
        universe,
        asset: finalAsset,
        creator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await program.methods
      .addAssetParent()
      .accountsStrict({
        childAsset: finalAsset,
        parentAsset: uvAsset,
        creator: owner.publicKey,
        assetParent: finalUvLink,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await program.methods
      .addAssetParent()
      .accountsStrict({
        childAsset: finalAsset,
        parentAsset: animationAsset,
        creator: owner.publicKey,
        assetParent: finalAnimationLink,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await program.methods
      .submitAsset()
      .accountsStrict({ asset: finalAsset, creator: owner.publicKey })
      .rpc();
    await program.methods
      .approveAsset()
      .accountsStrict({ universe, asset: finalAsset, owner: owner.publicKey })
      .rpc();

    await program.methods
      .createRelease(new anchor.BN(0), "QmLineageReleaseHash")
      .accountsStrict({
        universe,
        asset: finalAsset,
        release,
        vault,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const contributors = [
      owner.publicKey,
      contributor.publicKey,
      branchContributor.publicKey,
    ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
    const shareAccounts = contributors.map((pk) => sharePda(release, pk));

    const incompleteContributors = [
      owner.publicKey,
      contributor.publicKey,
    ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
    const incompleteShares = incompleteContributors.map((pk) =>
      sharePda(release, pk)
    );
    try {
      await program.methods
        .finalizeLineageEqualRelease(3, 2)
        .accountsStrict({
          universe,
          release,
          asset: finalAsset,
          owner: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .remainingAccounts([
          { pubkey: finalAsset, isWritable: false, isSigner: false },
          { pubkey: uvAsset, isWritable: false, isSigner: false },
          { pubkey: baseAsset, isWritable: false, isSigner: false },
          { pubkey: finalUvLink, isWritable: false, isSigner: false },
          { pubkey: uvBaseLink, isWritable: false, isSigner: false },
          ...incompleteShares.map((pubkey) => ({
            pubkey,
            isWritable: true,
            isSigner: false,
          })),
        ])
        .rpc();
      expect.fail("should reject incomplete lineage proof");
    } catch (e: any) {
      expect(e.message).to.include("InvalidLineageProof");
    }

    await program.methods
      .finalizeLineageEqualRelease(4, 4)
      .accountsStrict({
        universe,
        release,
        asset: finalAsset,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: finalAsset, isWritable: false, isSigner: false },
        { pubkey: uvAsset, isWritable: false, isSigner: false },
        { pubkey: animationAsset, isWritable: false, isSigner: false },
        { pubkey: baseAsset, isWritable: false, isSigner: false },
        { pubkey: finalUvLink, isWritable: false, isSigner: false },
        { pubkey: finalAnimationLink, isWritable: false, isSigner: false },
        { pubkey: uvBaseLink, isWritable: false, isSigner: false },
        { pubkey: animationBaseLink, isWritable: false, isSigner: false },
        ...shareAccounts.map((pubkey) => ({
          pubkey,
          isWritable: true,
          isSigner: false,
        })),
      ])
      .rpc();

    const fetchedRelease = await program.account.release.fetch(release);
    const shares = await Promise.all(
      shareAccounts.map((share) =>
        program.account.contributorShare.fetch(share)
      )
    );

    expect(fetchedRelease.status).to.deep.equal({ finalized: {} });
    expect(fetchedRelease.distributionModel).to.deep.equal({
      lineageEqual: {},
    });
    expect(shares.reduce((sum, share) => sum + share.bps, 0)).to.equal(10_000);
    expect(shares.map((share) => share.bps).sort()).to.deep.equal([
      3333, 3333, 3334,
    ]);
  });
});
