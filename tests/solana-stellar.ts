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

  const registryPda = () =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("registry")],
      program.programId
    )[0];

  const universePda = (index: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("universe"), owner.publicKey.toBuffer(), toLeBytes(index)],
      program.programId
    )[0];

  const universeIndexPda = (globalIndex: number) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("universe_index"), toLeBytes(globalIndex)],
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
    const registry = registryPda();
    const universeLookup = universeIndexPda(0);
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
        registry,
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(0),
        { image: {} } as any,
        { concept: {} } as any,
        { ccBy4: {} } as any,
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
        { unknown: {} } as any,
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
    const fetchedRegistry = await program.account.registry.fetch(registry);
    const fetchedUniverseIndex = await program.account.universeIndex.fetch(
      universeLookup
    );
    const fetchedChild = await program.account.asset.fetch(childAsset);
    const fetchedLink = await program.account.assetParent.fetch(parentLink);
    const fetchedRelease = await program.account.release.fetch(release);
    const fetchedShare = await program.account.contributorShare.fetch(
      contributorShare
    );

    expect(fetchedUniverse.assetCount.toNumber()).to.equal(2);
    expect(fetchedUniverse.globalIndex.toNumber()).to.equal(0);
    expect(fetchedRegistry.universeCount.toNumber()).to.equal(1);
    expect(fetchedUniverseIndex.universe.toBase58()).to.equal(
      universe.toBase58()
    );
    expect(fetchedUniverseIndex.ownerIndex.toNumber()).to.equal(0);
    expect(fetchedUniverse.releaseCount.toNumber()).to.equal(1);
    expect(fetchedChild.parentCount).to.equal(1);
    expect(fetchedChild.licenseKind).to.deep.equal({ ccBy4: {} });
    expect(fetchedChild.status).to.deep.equal({ finalized: {} });
    expect(fetchedLink.parentAsset.toBase58()).to.equal(parentAsset.toBase58());
    expect(fetchedRelease.status).to.deep.equal({ finalized: {} });
    expect(fetchedRelease.totalShareBps).to.equal(10_000);
    expect(fetchedRelease.totalDepositedLamports.toNumber()).to.equal(
      1_000_000
    );
    expect(fetchedShare.claimedLamports.toNumber()).to.equal(600_000);
  });

  it("finalizes legacy equal policy as automatic equal lineage shares", async () => {
    const universe = universePda(1);
    const registry = registryPda();
    const universeLookup = universeIndexPda(1);
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
    const rogueContributor = anchor.web3.Keypair.generate();
    const rogueShare = sharePda(release, rogueContributor.publicKey);

    await program.methods
      .createUniverse(
        new anchor.BN(1),
        "QmUniverseMetadataHash2",
        { model3D: {} } as any,
        { equal: {} } as any,
        true
      )
      .accountsStrict({
        registry,
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(0),
        { image: {} } as any,
        { concept: {} } as any,
        { ccBy4: {} } as any,
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
        { ccBy4: {} } as any,
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
        { ccBy4: {} } as any,
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
        { ccBy4: {} } as any,
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

    try {
      await program.methods
        .addReleaseShare(1000)
        .accountsStrict({
          universe,
          release,
          share: rogueShare,
          contributor: rogueContributor.publicKey,
          owner: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("should reject manual shares on lineage-equal releases");
    } catch (e: any) {
      expect(e.message).to.include("InvalidDistributionModel");
    }

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
    const fetchedUniverse = await program.account.universe.fetch(universe);
    const fetchedUniverseIndex = await program.account.universeIndex.fetch(
      universeLookup
    );
    const shares = await Promise.all(
      shareAccounts.map((share) =>
        program.account.contributorShare.fetch(share)
      )
    );

    expect(fetchedUniverse.globalIndex.toNumber()).to.equal(1);
    expect(fetchedUniverseIndex.universe.toBase58()).to.equal(
      universe.toBase58()
    );
    expect(fetchedUniverseIndex.ownerIndex.toNumber()).to.equal(1);
    expect(fetchedRelease.status).to.deep.equal({ finalized: {} });
    expect(fetchedRelease.distributionModel).to.deep.equal({
      lineageEqual: {},
    });
    expect(shares.reduce((sum, share) => sum + share.bps, 0)).to.equal(10_000);
    expect(shares.map((share) => share.bps).sort()).to.deep.equal([
      3333, 3333, 3334,
    ]);
  });

  it("finalizes weighted lineage shares by contribution count", async () => {
    const universe = universePda(2);
    const registry = registryPda();
    const universeLookup = universeIndexPda(2);
    const baseAsset = assetPda(universe, 0);
    const textureAsset = assetPda(universe, 1);
    const rigAsset = assetPda(universe, 2);
    const finalAsset = assetPda(universe, 3);
    const textureBaseLink = linkPda(textureAsset, baseAsset);
    const rigBaseLink = linkPda(rigAsset, baseAsset);
    const finalTextureLink = linkPda(finalAsset, textureAsset);
    const finalRigLink = linkPda(finalAsset, rigAsset);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);
    const rogueContributor = anchor.web3.Keypair.generate();
    const rogueShare = sharePda(release, rogueContributor.publicKey);

    const send = (tx: any, signer?: anchor.web3.Keypair) =>
      signer ? tx.signers([signer]).rpc() : tx.rpc();

    const createAssetOnly = async (
      assetIndex: number,
      asset: anchor.web3.PublicKey,
      creatorPk: anchor.web3.PublicKey,
      signer: anchor.web3.Keypair | undefined,
      kind: any,
      subtype: any,
      metadataHash: string,
      previewHash: string
    ) => {
      await send(
        program.methods
          .createAsset(
            new anchor.BN(assetIndex),
            kind,
            subtype,
            { ccBy4: {} } as any,
            metadataHash,
            previewHash
          )
          .accountsStrict({
            universe,
            asset,
            creator: creatorPk,
            systemProgram: anchor.web3.SystemProgram.programId,
          }),
        signer
      );
    };

    const addParent = async (
      childAsset: anchor.web3.PublicKey,
      parentAsset: anchor.web3.PublicKey,
      assetParent: anchor.web3.PublicKey,
      creatorPk: anchor.web3.PublicKey,
      signer?: anchor.web3.Keypair
    ) => {
      await send(
        program.methods.addAssetParent().accountsStrict({
          childAsset,
          parentAsset,
          creator: creatorPk,
          assetParent,
          systemProgram: anchor.web3.SystemProgram.programId,
        }),
        signer
      );
    };

    const submitAndApprove = async (
      asset: anchor.web3.PublicKey,
      creatorPk: anchor.web3.PublicKey,
      signer?: anchor.web3.Keypair
    ) => {
      await send(
        program.methods.submitAsset().accountsStrict({
          asset,
          creator: creatorPk,
        }),
        signer
      );
      await program.methods
        .approveAsset()
        .accountsStrict({ universe, asset, owner: owner.publicKey })
        .rpc();
    };

    await program.methods
      .createUniverse(
        new anchor.BN(2),
        "QmWeightedUniverseMetadata",
        { model3D: {} } as any,
        { weighted: {} } as any,
        true
      )
      .accountsStrict({
        registry,
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await createAssetOnly(
      0,
      baseAsset,
      owner.publicKey,
      undefined,
      { image: {} } as any,
      { concept: {} } as any,
      "QmWeightedBaseMetadataHash",
      "QmWeightedBasePreviewHash"
    );
    await submitAndApprove(baseAsset, owner.publicKey);

    await createAssetOnly(
      1,
      textureAsset,
      contributor.publicKey,
      contributor,
      { model3D: {} } as any,
      { texture: {} } as any,
      "QmWeightedTextureMetadataHash",
      "QmWeightedTexturePreviewHash"
    );
    await addParent(
      textureAsset,
      baseAsset,
      textureBaseLink,
      contributor.publicKey,
      contributor
    );
    await submitAndApprove(textureAsset, contributor.publicKey, contributor);

    await createAssetOnly(
      2,
      rigAsset,
      branchContributor.publicKey,
      branchContributor,
      { model3D: {} } as any,
      { rig: {} } as any,
      "QmWeightedRigMetadataHash",
      "QmWeightedRigPreviewHash"
    );
    await addParent(
      rigAsset,
      baseAsset,
      rigBaseLink,
      branchContributor.publicKey,
      branchContributor
    );
    await submitAndApprove(
      rigAsset,
      branchContributor.publicKey,
      branchContributor
    );

    await createAssetOnly(
      3,
      finalAsset,
      owner.publicKey,
      undefined,
      { model3D: {} } as any,
      { final: {} } as any,
      "QmWeightedFinalMetadataHash",
      "QmWeightedFinalPreviewHash"
    );
    await addParent(
      finalAsset,
      textureAsset,
      finalTextureLink,
      owner.publicKey
    );
    await addParent(finalAsset, rigAsset, finalRigLink, owner.publicKey);
    await submitAndApprove(finalAsset, owner.publicKey);

    await program.methods
      .createRelease(new anchor.BN(0), "QmWeightedReleaseHash")
      .accountsStrict({
        universe,
        asset: finalAsset,
        release,
        vault,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    try {
      await program.methods
        .addReleaseShare(1000)
        .accountsStrict({
          universe,
          release,
          share: rogueShare,
          contributor: rogueContributor.publicKey,
          owner: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      expect.fail("should reject manual shares on weighted lineage releases");
    } catch (e: any) {
      expect(e.message).to.include("InvalidDistributionModel");
    }

    try {
      await program.methods
        .finalizeRelease()
        .accountsStrict({
          universe,
          release,
          asset: finalAsset,
          owner: owner.publicKey,
        })
        .rpc();
      expect.fail(
        "should reject generic finalize on weighted lineage releases"
      );
    } catch (e: any) {
      expect(e.message).to.include("InvalidDistributionModel");
    }

    const contributors = [
      owner.publicKey,
      contributor.publicKey,
      branchContributor.publicKey,
    ].sort((a, b) => Buffer.compare(a.toBuffer(), b.toBuffer()));
    const shareAccounts = contributors.map((pk) => sharePda(release, pk));

    await program.methods
      .finalizeWeightedRelease(4, 4)
      .accountsStrict({
        universe,
        release,
        asset: finalAsset,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: finalAsset, isWritable: false, isSigner: false },
        { pubkey: textureAsset, isWritable: false, isSigner: false },
        { pubkey: rigAsset, isWritable: false, isSigner: false },
        { pubkey: baseAsset, isWritable: false, isSigner: false },
        { pubkey: finalTextureLink, isWritable: false, isSigner: false },
        { pubkey: finalRigLink, isWritable: false, isSigner: false },
        { pubkey: textureBaseLink, isWritable: false, isSigner: false },
        { pubkey: rigBaseLink, isWritable: false, isSigner: false },
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
    const shareByContributor = new Map(
      shares.map((share) => [share.contributor.toBase58(), share.bps])
    );

    expect(fetchedRelease.status).to.deep.equal({ finalized: {} });
    expect(fetchedRelease.distributionModel).to.deep.equal({ weighted: {} });
    expect(shares.reduce((sum, share) => sum + share.bps, 0)).to.equal(10_000);
    expect(shareByContributor.get(owner.publicKey.toBase58())).to.equal(5000);
    expect(shareByContributor.get(contributor.publicKey.toBase58())).to.equal(
      2500
    );
    expect(
      shareByContributor.get(branchContributor.publicKey.toBase58())
    ).to.equal(2500);
  });

  it("distributes revenue proportionally and supports authority claim-on-behalf", async () => {
    const registry = registryPda();
    const registryAccount = await program.account.registry.fetch(registry);
    const universeLookup = universeIndexPda(
      registryAccount.universeCount.toNumber()
    );

    const universe = universePda(3);
    const asset = assetPda(universe, 0);
    const release = releasePda(universe, 0);
    const vault = vaultPda(release);
    const ownerShare = sharePda(release, owner.publicKey);
    const contributorShare = sharePda(release, contributor.publicKey);
    const branchShare = sharePda(release, branchContributor.publicKey);

    await program.methods
      .createUniverse(
        new anchor.BN(3),
        "QmUniverseRevenueMetadataHash",
        { model3D: {} } as any,
        { custom: {} } as any,
        true
      )
      .accountsStrict({
        registry,
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .createAsset(
        new anchor.BN(0),
        { image: {} } as any,
        { concept: {} } as any,
        { ccBy4: {} } as any,
        "QmRevenueMetadataHash",
        "QmRevenuePreviewHash"
      )
      .accountsStrict({
        universe,
        asset,
        creator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await program.methods
      .submitAsset()
      .accountsStrict({ asset, creator: owner.publicKey })
      .rpc();
    await program.methods
      .approveAsset()
      .accountsStrict({ universe, asset, owner: owner.publicKey })
      .rpc();

    await program.methods
      .createRelease(new anchor.BN(0), "QmReleaseRevenueMetadataHash")
      .accountsStrict({
        universe,
        asset,
        release,
        vault,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .addReleaseShare(3333)
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
      .addReleaseShare(3333)
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
      .addReleaseShare(3334)
      .accountsStrict({
        universe,
        release,
        share: branchShare,
        contributor: branchContributor.publicKey,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .finalizeRelease()
      .accountsStrict({
        universe,
        release,
        asset,
        owner: owner.publicKey,
      })
      .rpc();

    const vaultBalanceBeforeDeposit = await provider.connection.getBalance(vault);

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
      .claimRevenueFor()
      .accountsStrict({
        release,
        vault,
        share: contributorShare,
        beneficiary: contributor.publicKey,
        authority: owner.publicKey,
      })
      .rpc();
    await program.methods
      .claimRevenueFor()
      .accountsStrict({
        release,
        vault,
        share: branchShare,
        beneficiary: branchContributor.publicKey,
        authority: owner.publicKey,
      })
      .rpc();
    await program.methods
      .claimRevenueFor()
      .accountsStrict({
        release,
        vault,
        share: ownerShare,
        beneficiary: owner.publicKey,
        authority: owner.publicKey,
      })
      .rpc();

    const fetchedOwnerShare = await program.account.contributorShare.fetch(ownerShare);
    const fetchedContributorShare =
      await program.account.contributorShare.fetch(contributorShare);
    const fetchedBranchShare = await program.account.contributorShare.fetch(branchShare);

    expect(fetchedOwnerShare.claimedLamports.toNumber()).to.equal(333_300);
    expect(fetchedContributorShare.claimedLamports.toNumber()).to.equal(333_300);
    expect(fetchedBranchShare.claimedLamports.toNumber()).to.equal(333_400);

    const fetchedRelease = await program.account.release.fetch(release);
    expect(fetchedRelease.totalShareBps).to.equal(10_000);
    expect(fetchedRelease.totalDepositedLamports.toNumber()).to.equal(
      1_000_000
    );

    const vaultBalanceAfterClaims = await provider.connection.getBalance(vault);
    expect(vaultBalanceAfterClaims).to.equal(vaultBalanceBeforeDeposit);

    try {
      await program.methods
        .claimRevenueFor()
        .accountsStrict({
          release,
          vault,
          share: ownerShare,
          beneficiary: owner.publicKey,
          authority: contributor.publicKey,
        })
        .signers([contributor])
        .rpc();
      expect.fail("should reject claim on behalf from unauthorized authority");
    } catch (error: any) {
      expect(error.message).to.include("Unauthorized");
    }
  });

  it("keeps universe collaboration policy immutable after creation", async () => {
    const registry = registryPda();
    const registryDataBefore = (await program.account.registry.fetch(
      registry
    )) as any;
    const globalIndex = registryDataBefore.universeCount.toNumber();
    const ownerIndex = globalIndex;
    const universe = universePda(ownerIndex);
    const universeLookup = universeIndexPda(globalIndex);

    await program.methods
      .createUniverse(
        new anchor.BN(ownerIndex),
        "QmImmutablePolicyMetadata",
        { model3D: {} } as any,
        { equal: {} } as any,
        true
      )
      .accountsStrict({
        registry,
        universe,
        universeLookup,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .updateUniverse("QmImmutablePolicyMetadata2", false, { equal: {} } as any)
      .accountsStrict({
        universe,
        owner: owner.publicKey,
      })
      .rpc();

    try {
      await program.methods
        .updateUniverse("QmImmutablePolicyMetadata3", true, {
          custom: {},
        } as any)
        .accountsStrict({
          universe,
          owner: owner.publicKey,
        })
        .rpc();
      expect.fail("Expected collaboration policy change to be rejected");
    } catch (error: any) {
      expect(error.error?.errorCode?.code).to.equal(
        "ImmutableCollaborationPolicy"
      );
    }

    const fetchedUniverse = await program.account.universe.fetch(universe);
    expect(fetchedUniverse.collaborationPolicy).to.deep.equal({ equal: {} });
  });
});
