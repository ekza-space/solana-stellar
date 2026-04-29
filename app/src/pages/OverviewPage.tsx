import { AddressList, Panel } from "../components/Panel";
import { PROGRAM_ID } from "../lib/stellar";
import { useAppState } from "../App";

export function OverviewPage() {
  const { addresses, walletPublicKey } = useAppState();

  return (
    <div className="stack">
      <Panel
        title="Protocol Smoke Test"
        description="Use this console to click through the Solana Stellar lifecycle on localnet or devnet."
      >
        <div className="hero-grid">
          <div>
            <span className="label">Program ID</span>
            <code>{PROGRAM_ID.toBase58()}</code>
          </div>
          <div>
            <span className="label">Wallet</span>
            <code>{walletPublicKey?.toBase58() ?? "Connect a wallet"}</code>
          </div>
        </div>
      </Panel>

      <Panel title="Recommended Flow">
        <ol className="flow-list">
          <li>Create or fetch a universe.</li>
          <li>Create a concept asset, submit it, and approve it.</li>
          <li>Create a final asset, link it to the concept parent, submit it, and approve it.</li>
          <li>Create a release, add contributor shares that total 10,000 BPS, and finalize.</li>
          <li>Deposit revenue into the vault and claim a contributor share.</li>
        </ol>
      </Panel>

      <Panel title="Known Addresses">
        <AddressList addresses={addresses} />
      </Panel>
    </div>
  );
}
