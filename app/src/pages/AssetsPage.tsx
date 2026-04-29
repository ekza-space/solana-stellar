import { useMemo, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import { ensureClient, logSignature, useAppState } from "../App";
import { Field, Panel } from "../components/Panel";
import { deriveAsset, deriveAssetParent, enumValue, systemProgram } from "../lib/stellar";

export function AssetsPage() {
  const state = useAppState();
  const [assetIndex, setAssetIndex] = useState("0");
  const [parentIndex, setParentIndex] = useState("0");
  const [metadataHash, setMetadataHash] = useState("QmAssetMetadataHash");
  const [previewHash, setPreviewHash] = useState("QmAssetPreviewHash");
  const [kind, setKind] = useState("Image");
  const [subtype, setSubtype] = useState("Concept");
  const [loading, setLoading] = useState(false);

  const universe = useMemo(
    () => (state.addresses.universe ? new PublicKey(state.addresses.universe) : null),
    [state.addresses.universe],
  );
  const asset = universe ? deriveAsset(universe, Number(assetIndex || "0")) : null;
  const parentAsset = universe ? deriveAsset(universe, Number(parentIndex || "0")) : null;
  const link = asset && parentAsset ? deriveAssetParent(asset, parentAsset) : null;

  async function createAsset() {
    const client = ensureClient(state);
    if (!client || !universe || !asset) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .createAsset(
          new anchor.BN(Number(assetIndex || "0")),
          enumValue(kind) as any,
          enumValue(subtype) as any,
          metadataHash,
          previewHash,
        )
        .accountsStrict({
          universe,
          asset,
          creator: state.walletPublicKey!,
          systemProgram,
        })
        .rpc();

      state.setAddresses((current) => ({
        ...current,
        [Number(assetIndex) === 0 ? "parentAsset" : "childAsset"]: asset.toBase58(),
      }));
      logSignature(state, "Asset created", signature);
    } catch (error) {
      state.addLog("error", "Create asset failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function addParent() {
    const client = ensureClient(state);
    if (!client || !asset || !parentAsset || !link) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .addAssetParent()
        .accountsStrict({
          childAsset: asset,
          parentAsset,
          creator: state.walletPublicKey!,
          assetParent: link,
          systemProgram,
        })
        .rpc();

      state.setAddresses((current) => ({ ...current, parentLink: link.toBase58() }));
      logSignature(state, "Asset parent linked", signature);
    } catch (error) {
      state.addLog("error", "Add parent failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function submitAsset() {
    const client = ensureClient(state);
    if (!client || !asset) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .submitAsset()
        .accountsStrict({ asset, creator: state.walletPublicKey! })
        .rpc();
      logSignature(state, "Asset submitted", signature);
    } catch (error) {
      state.addLog("error", "Submit asset failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function approveAsset() {
    const client = ensureClient(state);
    if (!client || !universe || !asset) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .approveAsset()
        .accountsStrict({ universe, asset, owner: state.walletPublicKey! })
        .rpc();
      logSignature(state, "Asset approved", signature);
    } catch (error) {
      state.addLog("error", "Approve asset failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function fetchAsset() {
    const client = ensureClient(state);
    if (!client || !asset) return;
    try {
      const account = await client.program.account.asset.fetch(asset);
      state.addLog("success", "Asset fetched", JSON.stringify(account, null, 2));
    } catch (error) {
      state.addLog("error", "Fetch asset failed", String(error));
    }
  }

  return (
    <Panel title="Assets" description="Create, link, submit, and approve protocol assets.">
      <div className="form-grid">
        <Field label="Asset index">
          <input value={assetIndex} onChange={(event) => setAssetIndex(event.target.value)} />
        </Field>
        <Field label="Parent index">
          <input value={parentIndex} onChange={(event) => setParentIndex(event.target.value)} />
        </Field>
        <Field label="Kind">
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {["Image", "Model3d", "Animation", "Audio", "Script", "Metadata", "Other"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Subtype">
          <select value={subtype} onChange={(event) => setSubtype(event.target.value)}>
            {["Concept", "Sketch", "Texture", "Mesh", "Rig", "Motion", "Preview", "Final", "Other"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Metadata hash">
          <input value={metadataHash} onChange={(event) => setMetadataHash(event.target.value)} />
        </Field>
        <Field label="Preview hash">
          <input value={previewHash} onChange={(event) => setPreviewHash(event.target.value)} />
        </Field>
      </div>

      <div className="actions">
        <button disabled={loading || !universe} onClick={createAsset}>Create Asset</button>
        <button className="secondary" disabled={loading || !asset} onClick={addParent}>Add Parent Link</button>
        <button className="secondary" disabled={loading || !asset} onClick={submitAsset}>Submit</button>
        <button className="secondary" disabled={loading || !asset} onClick={approveAsset}>Approve</button>
        <button className="secondary" disabled={!asset} onClick={fetchAsset}>Fetch</button>
      </div>

      {asset ? (
        <div className="derived">
          <span>Derived asset PDA</span>
          <code>{asset.toBase58()}</code>
        </div>
      ) : null}
    </Panel>
  );
}
