import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { clusterApiUrl } from "@solana/web3.js";

export type ClusterKey = "localnet" | "devnet" | "custom";

type ClusterState = {
  cluster: ClusterKey;
  endpoint: string;
  customEndpoint: string;
  setCluster: (cluster: ClusterKey) => void;
  setCustomEndpoint: (endpoint: string) => void;
};

const LOCALNET = "http://127.0.0.1:8899";
const DEFAULT_CUSTOM = clusterApiUrl("devnet");

const ClusterContext = createContext<ClusterState | null>(null);

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [cluster, setCluster] = useState<ClusterKey>("localnet");
  const [customEndpoint, setCustomEndpoint] = useState(DEFAULT_CUSTOM);

  const endpoint = useMemo(() => {
    if (cluster === "localnet") return LOCALNET;
    if (cluster === "devnet") return clusterApiUrl("devnet");
    return customEndpoint || DEFAULT_CUSTOM;
  }, [cluster, customEndpoint]);

  const value = useMemo(
    () => ({ cluster, endpoint, customEndpoint, setCluster, setCustomEndpoint }),
    [cluster, customEndpoint, endpoint],
  );

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>;
}

export function useCluster() {
  const value = useContext(ClusterContext);
  if (!value) {
    throw new Error("useCluster must be used inside ClusterProvider");
  }
  return value;
}
