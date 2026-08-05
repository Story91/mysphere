/**
 * Typy modulu agentow.
 *
 * Ksztalt DANYCH mieszka w `app/utils/agents/types.ts` razem z rejestrem, ktory
 * je produkuje - tutaj sa tylko typy WIDOKU (filtry, tagi) plus re-eksport, zeby
 * komponenty mialy jedno miejsce importu. Kierunek zaleznosci jest jednostronny:
 * UI zna rejestr, rejestr nie zna UI.
 */

export type {
  AgentChain,
  AgentChainIdentity,
  AgentChainReputation,
  AgentFeedbackRecord,
  AgentNetwork,
  AgentRecord,
  AgentRegistryStats,
  AgentReputation,
  AgentReputationSnapshot,
  AgentTrustCheck,
  AgentUnifiedReputation,
  ListAgentsOptions,
  ListAgentsResult,
} from "@/app/utils/agents/types";

export { SUPPORTED_AGENT_CHAINS } from "@/app/utils/agents/types";

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
