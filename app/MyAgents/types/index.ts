export type SupportedChain =
  | "base"
  | "basecamp"
  | "ethereum"
  | "optimism"
  | "celo"
  | "linea"
  | "worldchain";

export interface AgentFilters {
  network?: "mainnet" | "testnet";
  chain?: SupportedChain;
  minScore?: number;
  tag?: string;
}

export type FeedbackTag =
  | "helpful"
  | "creative"
  | "reliable"
  | "accurate"
  | "entertaining"
  | "fast"
  | "safe";
