import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";

import { ensureClient, logSignature, useAppState } from "../App";
import { Field, Panel } from "../components/Panel";
import { deriveShare, deriveVault, lamportsFromSol, safePublicKey, systemProgram } from "../lib/stellar";

export function RevenuePage() {
  const state = useAppState();
  const [amountSol, setAmountSol] = useState("0.01");
  const [contributor, setContributor] = useState("");
  const [loading, setLoading] = useState(false);

  const release = useMemo(
    () => (state.addresses.release ? new PublicKey(state.addresses.release) : null),
    [state.addresses.release],
  );
  const vault = release ? deriveVault(release) : null;
  const contributorKey = contributor ? safePublicKey(contributor) : state.walletPublicKey;
  const share = release && contributorKey ? deriveShare(release, contributorKey) : null;

  async function depositRevenue() {
    const client = ensureClient(state);
    if (!client || !release || !vault) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .depositRevenue(lamportsFromSol(amountSol))
        .accountsStrict({
          release,
          vault,
          payer: state.walletPublicKey!,
          systemProgram,
        })
        .rpc();
      logSignature(state, "Revenue deposited", signature);
    } catch (error) {
      state.addLog("error", "Deposit revenue failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function claimRevenue() {
    const client = ensureClient(state);
    if (!client || !release || !vault || !share) return;
    setLoading(true);
    try {
      const signature = await client.program.methods
        .claimRevenue()
        .accountsStrict({
          release,
          vault,
          share,
          contributor: state.walletPublicKey!,
        })
        .rpc();
      logSignature(state, "Revenue claimed", signature);
    } catch (error) {
      state.addLog("error", "Claim revenue failed", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function fetchShare() {
    const client = ensureClient(state);
    if (!client || !share) return;
    try {
      const account = await client.program.account.contributorShare.fetch(share);
      state.addLog("success", "Contributor share fetched", JSON.stringify(account, null, 2));
    } catch (error) {
      state.addLog("error", "Fetch contributor share failed", String(error));
    }
  }

  return (
    <Panel title="Revenue" description="Deposit SOL into the release vault and claim according to BPS shares.">
      <div className="form-grid">
        <Field label="Deposit amount in SOL">
          <input value={amountSol} onChange={(event) => setAmountSol(event.target.value)} />
        </Field>
        <Field label="Contributor wallet" hint="Leave empty to claim with connected wallet.">
          <input value={contributor} onChange={(event) => setContributor(event.target.value)} />
        </Field>
      </div>

      <div className="actions">
        <button disabled={loading || !release} onClick={depositRevenue}>Deposit Revenue</button>
        <button className="secondary" disabled={loading || !share} onClick={claimRevenue}>Claim Revenue</button>
        <button className="secondary" disabled={!share} onClick={fetchShare}>Fetch Share</button>
      </div>

      {vault ? (
        <div className="derived">
          <span>Vault PDA</span>
          <code>{vault.toBase58()}</code>
        </div>
      ) : null}
    </Panel>
  );
}
