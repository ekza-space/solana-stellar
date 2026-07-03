import { useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { ensureClient, logSignature, useAppState } from "../App";
import { Field, Panel } from "../components/Panel";
import {
  arenaEnum,
  type ArenaCardKind,
  publishArenaAssetFromStellar,
} from "../lib/arenaRegistry";
import {
  deriveAsset,
  deriveRelease,
  deriveShare,
  deriveVault,
  lamportsFromSol,
  safePublicKey,
  systemProgram,
} from "../lib/stellar";
import { publishOmobaAvatarFromStellar } from "../lib/omobaRegistry";

function parseNumberInput(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function normalizeArenaId(value: string, fallback: string, maxLength: number) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (normalized || fallback).slice(0, maxLength);
}

function parseArenaSkillIds(value: string) {
  return value
    .split(",")
    .map((skill) => normalizeArenaId(skill, "", 40))
    .filter(Boolean)
    .slice(0, 8);
}

export function ReleasePage() {
  const state = useAppState();
  const [releaseIndex, setReleaseIndex] = useState("0");
  const [assetIndex, setAssetIndex] = useState("1");
  const [metadataHash, setMetadataHash] = useState("QmReleaseMetadataHash");
  const [contributor, setContributor] = useState("");
  const [shareBps, setShareBps] = useState("10000");
  const [avatarData, setAvatarData] = useState("");
  const [arenaMetadataIpfsHash, setArenaMetadataIpfsHash] = useState(
    "QmArenaCardMetadataHash"
  );
  const [arenaCardKind, setArenaCardKind] = useState<ArenaCardKind>("avatar");
  const [arenaArchetypeId, setArenaArchetypeId] = useState("sprout_avatar");
  const [arenaSlotMask, setArenaSlotMask] = useState("3");
  const [arenaSkillIds, setArenaSkillIds] = useState("moss_skin");
  const [omobaUriIpfsHash, setOmobaUriIpfsHash] = useState(
    "QmOmobaAvatarMetadataHash"
  );
  const [omobaMaxSupply, setOmobaMaxSupply] = useState("1");
  const [omobaMintFee, setOmobaMintFee] = useState("0");
  const [loading, setLoading] = useState(false);

  const universe = useMemo(
    () =>
      state.addresses.universe ? new PublicKey(state.addresses.universe) : null,
    [state.addresses.universe]
  );
  const release = universe
    ? deriveRelease(universe, Number(releaseIndex || "0"))
    : null;
  const asset = universe
    ? deriveAsset(universe, Number(assetIndex || "0"))
    : null;
  const vault = release ? deriveVault(release) : null;
  const contributorKey = contributor
    ? safePublicKey(contributor)
    : state.walletPublicKey;
  const share =
    release && contributorKey ? deriveShare(release, contributorKey) : null;

  async function createRelease() {
    const client = ensureClient(state);
    if (!client || !universe || !asset || !release || !vault) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .createRelease(new anchor.BN(Number(releaseIndex || "0")), metadataHash)
        .accountsStrict({
          universe,
          asset,
          release,
          vault,
          owner: state.walletPublicKey!,
          systemProgram,
        })
        .rpc();
      state.setAddresses((current) => ({
        ...current,
        release: release.toBase58(),
        vault: vault.toBase58(),
      }));
      logSignature(state, "Release created", signature);
    } catch (error) {
      state.addLog("error", "Create release failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function addShare() {
    const client = ensureClient(state);
    if (!client || !universe || !release || !share || !contributorKey) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .addReleaseShare(Number(shareBps || "0"))
        .accountsStrict({
          universe,
          release,
          share,
          contributor: contributorKey,
          owner: state.walletPublicKey!,
          systemProgram,
        })
        .rpc();
      state.setAddresses((current) => ({
        ...current,
        [state.walletPublicKey && contributorKey.equals(state.walletPublicKey)
          ? "ownerShare"
          : "collaboratorShare"]: share.toBase58(),
      }));
      logSignature(state, "Release share added", signature);
    } catch (error) {
      state.addLog("error", "Add share failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function finalizeRelease() {
    const client = ensureClient(state);
    if (!client || !universe || !release || !asset) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .finalizeRelease()
        .accountsStrict({
          universe,
          release,
          asset,
          owner: state.walletPublicKey!,
        })
        .rpc();
      logSignature(state, "Release finalized", signature);
    } catch (error) {
      state.addLog("error", "Finalize release failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function linkAvatarData() {
    const client = ensureClient(state);
    if (!client || !universe || !release || !avatarData) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .linkAvatarData(new PublicKey(avatarData))
        .accountsStrict({
          universe,
          release,
          owner: state.walletPublicKey!,
        })
        .rpc();
      logSignature(state, "Avatar data linked", signature);
    } catch (error) {
      state.addLog("error", "Link avatar data failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function publishArenaAsset() {
    const client = ensureClient(state);
    if (!client || !universe || !release || !vault || !arenaMetadataIpfsHash)
      return;
    setLoading(true);
    try {
      const result = await publishArenaAssetFromStellar({
        provider: client.provider,
        universe,
        release,
        vault,
        asset: {
          metadataIpfsHash: arenaMetadataIpfsHash,
          cardKind: arenaEnum(arenaCardKind),
          archetypeId: normalizeArenaId(arenaArchetypeId, "arena_card", 64),
          slotMask: Math.max(1, parseNumberInput(arenaSlotMask, 3)),
          skillIds: parseArenaSkillIds(arenaSkillIds),
        },
      });
      state.setAddresses((current) => ({
        ...current,
        arenaAsset: result.arenaAsset.toBase58(),
        arenaStellarLink: result.stellarLink.toBase58(),
        arenaReleaseLink: result.stellarReleaseLink.toBase58(),
        arenaReleaseDeployment: result.stellarReleaseDeployment.toBase58(),
      }));
      logSignature(state, "Arena asset deployed", result.signature);
      state.addLog(
        "info",
        "Arena registry asset",
        JSON.stringify(
          {
            arenaAssetIndex: result.arenaAssetIndex,
            arenaAsset: result.arenaAsset.toBase58(),
            stellarLink: result.stellarLink.toBase58(),
            stellarReleaseLink: result.stellarReleaseLink.toBase58(),
            stellarReleaseDeployment:
              result.stellarReleaseDeployment.toBase58(),
          },
          null,
          2
        )
      );
    } catch (error) {
      state.addLog("error", "Deploy Arena asset failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function publishOmobaAvatar() {
    const client = ensureClient(state);
    if (!client || !universe || !release || !vault || !omobaUriIpfsHash) return;
    setLoading(true);
    try {
      const result = await publishOmobaAvatarFromStellar({
        provider: client.provider,
        universe,
        release,
        vault,
        uriIpfsHash: omobaUriIpfsHash,
        maxSupply: new anchor.BN(Number(omobaMaxSupply || "1")),
        mintingFeePerMint: lamportsFromSol(omobaMintFee),
      });
      state.setAddresses((current) => ({
        ...current,
        omobaAvatarData: result.avatarData.toBase58(),
        omobaStellarLink: result.stellarLink.toBase58(),
        omobaReleaseLink: result.stellarReleaseLink.toBase58(),
        omobaReleaseDeployment: result.stellarReleaseDeployment.toBase58(),
      }));
      logSignature(state, "Omoba avatar deployed", result.signature);
      state.addLog(
        "info",
        "Omoba registry avatar",
        JSON.stringify(
          {
            avatarIndex: result.avatarIndex,
            avatarData: result.avatarData.toBase58(),
            stellarLink: result.stellarLink.toBase58(),
            stellarReleaseLink: result.stellarReleaseLink.toBase58(),
            stellarReleaseDeployment:
              result.stellarReleaseDeployment.toBase58(),
          },
          null,
          2
        )
      );
    } catch (error) {
      state.addLog("error", "Deploy Omoba avatar failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function fetchRelease() {
    const client = ensureClient(state);
    if (!client || !release) return;
    try {
      const account = await client.program.account.release.fetch(release);
      state.addLog(
        "success",
        "Release fetched",
        JSON.stringify(account, null, 2)
      );
    } catch (error) {
      state.addLog("error", "Fetch release failed", String(error));
    }
  }

  return (
    <Panel
      title="Release"
      description="Create an immutable release and configure contributor shares."
    >
      <div className="form-grid">
        <Field label="Release index">
          <input
            value={releaseIndex}
            onChange={(event) => setReleaseIndex(event.target.value)}
          />
        </Field>
        <Field label="Final asset index">
          <input
            value={assetIndex}
            onChange={(event) => setAssetIndex(event.target.value)}
          />
        </Field>
        <Field label="Release metadata hash">
          <input
            value={metadataHash}
            onChange={(event) => setMetadataHash(event.target.value)}
          />
        </Field>
        <Field
          label="Contributor wallet"
          hint="Leave empty to use the connected wallet."
        >
          <input
            value={contributor}
            onChange={(event) => setContributor(event.target.value)}
          />
        </Field>
        <Field label="Share BPS">
          <input
            value={shareBps}
            onChange={(event) => setShareBps(event.target.value)}
          />
        </Field>
        <Field label="Avatar data PDA" hint="Optional, after finalize.">
          <input
            value={avatarData}
            onChange={(event) => setAvatarData(event.target.value)}
          />
        </Field>
        <Field
          label="Arena metadata hash"
          hint="Stored in solana-arena-registry for this Stellar release."
        >
          <input
            value={arenaMetadataIpfsHash}
            onChange={(event) => setArenaMetadataIpfsHash(event.target.value)}
          />
        </Field>
        <Field label="Arena card kind">
          <select
            value={arenaCardKind}
            onChange={(event) =>
              setArenaCardKind(event.target.value as ArenaCardKind)
            }
          >
            <option value="avatar">avatar</option>
            <option value="modifier">modifier</option>
          </select>
        </Field>
        <Field label="Arena archetype">
          <input
            value={arenaArchetypeId}
            onChange={(event) => setArenaArchetypeId(event.target.value)}
          />
        </Field>
        <Field
          label="Arena slot mask"
          hint="Gear slots the skin supports; stats are rolled later by the Arena mint."
        >
          <input
            value={arenaSlotMask}
            onChange={(event) => setArenaSlotMask(event.target.value)}
          />
        </Field>
        <Field label="Arena skills" hint="Comma-separated skill ids.">
          <input
            value={arenaSkillIds}
            onChange={(event) => setArenaSkillIds(event.target.value)}
          />
        </Field>
        <Field
          label="Omoba metadata hash"
          hint="Stored in solana-omoba-registry for this release."
        >
          <input
            value={omobaUriIpfsHash}
            onChange={(event) => setOmobaUriIpfsHash(event.target.value)}
          />
        </Field>
        <Field label="Omoba max supply">
          <input
            value={omobaMaxSupply}
            onChange={(event) => setOmobaMaxSupply(event.target.value)}
          />
        </Field>
        <Field
          label="Omoba mint fee SOL"
          hint="Kept in the registry record for future minting/indexing flows."
        >
          <input
            value={omobaMintFee}
            onChange={(event) => setOmobaMintFee(event.target.value)}
          />
        </Field>
      </div>

      <div className="actions">
        <button disabled={loading || !release} onClick={createRelease}>
          Create Release
        </button>
        <button
          className="secondary"
          disabled={loading || !share}
          onClick={addShare}
        >
          Add Share
        </button>
        <button
          className="secondary"
          disabled={loading || !release}
          onClick={finalizeRelease}
        >
          Finalize
        </button>
        <button
          className="secondary"
          disabled={loading || !avatarData}
          onClick={linkAvatarData}
        >
          Link Avatar
        </button>
        <button
          className="secondary"
          disabled={loading || !release || !vault || !arenaMetadataIpfsHash}
          onClick={publishArenaAsset}
        >
          Deploy Arena
        </button>
        <button
          className="secondary"
          disabled={loading || !release || !vault || !omobaUriIpfsHash}
          onClick={publishOmobaAvatar}
        >
          Deploy Omoba
        </button>
        <button
          className="secondary"
          disabled={!release}
          onClick={fetchRelease}
        >
          Fetch
        </button>
      </div>

      {release && vault ? (
        <div className="derived">
          <span>Release / vault PDAs</span>
          <code>{release.toBase58()}</code>
          <code>{vault.toBase58()}</code>
        </div>
      ) : null}
    </Panel>
  );
}
