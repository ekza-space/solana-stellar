export type LogEntry = {
  id: string;
  level: "info" | "success" | "error";
  message: string;
  detail?: string;
  at: string;
};

export type KnownAddresses = {
  universe?: string;
  parentAsset?: string;
  childAsset?: string;
  parentLink?: string;
  release?: string;
  vault?: string;
  ownerShare?: string;
  collaboratorShare?: string;
};
