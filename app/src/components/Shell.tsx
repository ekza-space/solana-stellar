import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useCluster, type ClusterKey } from "../lib/cluster";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/universe", label: "Universe" },
  { to: "/assets", label: "Assets" },
  { to: "/release", label: "Release" },
  { to: "/revenue", label: "Revenue" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { cluster, endpoint, customEndpoint, setCluster, setCustomEndpoint } = useCluster();
  const { connection } = useConnection();
  const wallet = useWallet();

  async function requestAirdrop() {
    if (!wallet.publicKey) return;
    const signature = await connection.requestAirdrop(wallet.publicKey, 2 * LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Solana Stellar</p>
          <h1>Protocol Test Console</h1>
        </div>
        <div className="wallet-row">
          <select
            aria-label="Network"
            value={cluster}
            onChange={(event) => setCluster(event.target.value as ClusterKey)}
          >
            <option value="localnet">Localnet</option>
            <option value="devnet">Devnet</option>
            <option value="custom">Custom RPC</option>
          </select>
          <WalletMultiButton />
        </div>
      </header>

      {cluster === "custom" ? (
        <label className="custom-rpc">
          <span>Custom RPC endpoint</span>
          <input
            value={customEndpoint}
            onChange={(event) => setCustomEndpoint(event.target.value)}
            placeholder="https://api.devnet.solana.com"
          />
        </label>
      ) : null}

      <section className="status-strip" aria-label="Connection status">
        <div>
          <span>Endpoint</span>
          <strong>{endpoint}</strong>
        </div>
        <div>
          <span>Wallet</span>
          <strong>{wallet.publicKey ? shortKey(wallet.publicKey.toBase58()) : "Not connected"}</strong>
        </div>
        <button disabled={!wallet.publicKey || cluster !== "localnet"} onClick={requestAirdrop}>
          Airdrop 2 SOL
        </button>
      </section>

      <div className="layout">
        <nav className="sidebar" aria-label="Protocol steps">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}
              end={item.to === "/"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main>
          {children}
        </main>
      </div>
    </div>
  );
}

function shortKey(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
