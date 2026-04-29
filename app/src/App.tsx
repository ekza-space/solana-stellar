import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";

import { Shell } from "./components/Shell";
import { LogPanel } from "./components/LogPanel";
import { useCluster } from "./lib/cluster";
import type { KnownAddresses, LogEntry } from "./lib/types";
import { createClient, explorerUrl } from "./lib/stellar";
import { OverviewPage } from "./pages/OverviewPage";
import { UniversePage } from "./pages/UniversePage";
import { AssetsPage } from "./pages/AssetsPage";
import { ReleasePage } from "./pages/ReleasePage";
import { RevenuePage } from "./pages/RevenuePage";
import { SolanaWalletProvider } from "./lib/wallet";

export type AppState = {
  addresses: KnownAddresses;
  setAddresses: (next: KnownAddresses | ((current: KnownAddresses) => KnownAddresses)) => void;
  logs: LogEntry[];
  addLog: (level: LogEntry["level"], message: string, detail?: string) => void;
  client: ReturnType<typeof createClient> | null;
  walletPublicKey: PublicKey | null;
  endpoint: string;
};

export function App() {
  return (
    <SolanaWalletProvider>
      <AppFrame />
    </SolanaWalletProvider>
  );
}

function AppFrame() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const { endpoint } = useCluster();
  const [addresses, setAddresses] = useState<KnownAddresses>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const client = useMemo(() => {
    if (!wallet) return null;
    return createClient(connection, wallet);
  }, [connection, wallet]);

  const addLog = useCallback((level: LogEntry["level"], message: string, detail?: string) => {
    setLogs((current) => [
      {
        id: crypto.randomUUID(),
        level,
        message,
        detail,
        at: new Date().toLocaleTimeString(),
      },
      ...current,
    ]);
  }, []);

  const state: AppState = {
    addresses,
    setAddresses,
    logs,
    addLog,
    client,
    walletPublicKey: wallet?.publicKey ?? null,
    endpoint,
  };

  return (
    <AppStateContext.Provider value={state}>
      <Shell>
        <div className="content-grid">
          <Routes>
            <Route index element={<OverviewPage />} />
            <Route path="universe" element={<UniversePage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="release" element={<ReleasePage />} />
            <Route path="revenue" element={<RevenuePage />} />
          </Routes>
          <LogPanel logs={logs} />
        </div>
      </Shell>
    </AppStateContext.Provider>
  );
}

const AppStateContext = createContext<AppState | null>(null);

export function useAppState() {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error("useAppState must be used inside AppStateContext");
  }
  return value;
}

export function ensureClient(state: AppState) {
  if (!state.client || !state.walletPublicKey) {
    state.addLog("error", "Wallet is not connected", "Connect a wallet before sending transactions.");
    return null;
  }
  return state.client;
}

export function logSignature(state: AppState, message: string, signature: string) {
  state.addLog("success", message, explorerUrl(signature, state.endpoint));
}
