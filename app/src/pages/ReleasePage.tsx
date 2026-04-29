import { useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { ensureClient, logSignature, useAppState } from "../App";
import { Field, Panel } from "../components/Panel";
import { deriveAsset, deriveRelease, deriveShare, deriveVault, safePublicKey, systemProgram } from "../lib/stellar";

export function ReleasePage() {
  const state = useAppState();
  const [releaseIndex, setReleaseIndex] = useState("0");
  const [assetIndex, setAssetIndex] = useState("1");
  const [metadataHash, setMetadataHash] = useState("QmReleaseMetadataHash");
  const [contributor, setContributor] = useState("");
  const [shareBps, setShareBps] = useState("10000");
  const [avatarData, setAvatarData] = useState("");
  const [loading, setLoading] = useState(false);

  const universe = useMemo(
    () => (state.addresses.universe ? new PublicKey(state.addresses.universe) : null),
    [state.addresses.universe],
  );
  const release = universe ? deriveRelease(universe, Number(releaseIndex || "0")) : null;
  const asset = universe ? deriveAsset(universe, Number(assetIndex || "0")) : null;
  const vault = release ? deriveVault(release) : null;
  const contributorKey = contributor ? safePublicKey(contributor) : state.walletPublicKey;
  const share = release && contributorKey ? deriveShare(release, contributorKey) : null;

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

  async function fetchRelease() {
    const client = ensureClient(state);
    if (!client || !release) return;
    try {
      const account = await client.program.account.release.fetch(release);
      state.addLog("success", "Release fetched", JSON.stringify(account, null, 2));
    } catch (error) {
      state.addLog("error", "Fetch release failed", String(error));
    }
  }

  return (
    <Panel title="Release" description="Create an immutable release and configure contributor shares.">
      <div className="form-grid">
        <Field label="Release index">
          <input value={releaseIndex} onChange={(event) => setReleaseIndex(event.target.value)} />
        </Field>
        <Field label="Final asset index">
          <input value={assetIndex} onChange={(event) => setAssetIndex(event.target.value)} />
        </Field>
        <Field label="Release metadata hash">
          <input value={metadataHash} onChange={(event) => setMetadataHash(event.target.value)} />
        </Field>
        <Field label="Contributor wallet" hint="Leave empty to use the connected wallet.">
          <input value={contributor} onChange={(event) => setContributor(event.target.value)} />
        </Field>
        <Field label="Share BPS">
          <input value={shareBps} onChange={(event) => setShareBps(event.target.value)} />
        </Field>
        <Field label="Avatar data PDA" hint="Optional, after finalize.">
          <input value={avatarData} onChange={(event) => setAvatarData(event.target.value)} />
        </Field>
      </div>

      <div className="actions">
        <button disabled={loading || !release} onClick={createRelease}>Create Release</button>
        <button className="secondary" disabled={loading || !share} onClick={addShare}>Add Share</button>
        <button className="secondary" disabled={loading || !release} onClick={finalizeRelease}>Finalize</button>
        <button className="secondary" disabled={loading || !avatarData} onClick={linkAvatarData}>Link Avatar</button>
        <button className="secondary" disabled={!release} onClick={fetchRelease}>Fetch</button>
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
