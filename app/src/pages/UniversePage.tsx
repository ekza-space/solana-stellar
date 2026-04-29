import { useState } from "react";
import * as anchor from "@coral-xyz/anchor";

import { ensureClient, logSignature, useAppState } from "../App";
import { Field, Panel } from "../components/Panel";
import { deriveUniverse, enumValue, systemProgram } from "../lib/stellar";

export function UniversePage() {
  const state = useAppState();
  const [index, setIndex] = useState("0");
  const [metadataHash, setMetadataHash] = useState("QmUniverseMetadataHash");
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);

  const universeIndex = Number(index || "0");
  const universe =
    state.walletPublicKey && Number.isFinite(universeIndex)
      ? deriveUniverse(state.walletPublicKey, universeIndex)
      : null;

  async function createUniverse() {
    const client = ensureClient(state);
    if (!client || !universe) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .createUniverse(
          new anchor.BN(universeIndex),
          metadataHash,
          enumValue("Model3d") as any,
          enumValue("Custom") as any,
          open,
        )
        .accountsStrict({
          universe,
          owner: state.walletPublicKey!,
          systemProgram,
        })
        .rpc();

      state.setAddresses((current) => ({ ...current, universe: universe.toBase58() }));
      logSignature(state, "Universe created", signature);
    } catch (error) {
      state.addLog("error", "Create universe failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function fetchUniverse() {
    const client = ensureClient(state);
    if (!client || !universe) return;
    setLoading(true);
    try {
      const account = await client.program.account.universe.fetch(universe);
      state.setAddresses((current) => ({ ...current, universe: universe.toBase58() }));
      state.addLog("success", "Universe fetched", JSON.stringify(account, null, 2));
    } catch (error) {
      state.addLog("error", "Fetch universe failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel
      title="Universe"
      description="Create the collaborative workspace that owns assets and releases."
    >
      <div className="form-grid">
        <Field label="Universe index">
          <input value={index} onChange={(event) => setIndex(event.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Metadata hash">
          <input value={metadataHash} onChange={(event) => setMetadataHash(event.target.value)} />
        </Field>
        <label className="toggle">
          <input checked={open} type="checkbox" onChange={(event) => setOpen(event.target.checked)} />
          Open collaboration
        </label>
      </div>

      <div className="actions">
        <button disabled={loading || !state.walletPublicKey} onClick={createUniverse}>
          Create Universe
        </button>
        <button className="secondary" disabled={loading || !state.walletPublicKey} onClick={fetchUniverse}>
          Fetch Universe
        </button>
      </div>

      {universe ? (
        <div className="derived">
          <span>Derived universe PDA</span>
          <code>{universe.toBase58()}</code>
        </div>
      ) : null}
    </Panel>
  );
}
