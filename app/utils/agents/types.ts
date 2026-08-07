/**
 * Typy wlasnego rejestru agentow MySphere.
 *
 * DLACZEGO WLASNE TYPY, A NIE `@registrai/kya`:
 * pakiet `@registrai/kya` zostal wycofany z npm, a `kya-api.registr.ai` nie ma
 * juz rekordu DNS. To, co lezy w `vendor/kya`, jest REKONSTRUKCJA ksztaltu API
 * z `docs/KYA.md` napisana po to, zeby build przechodzil - nie jest zrodlem
 * danych. Tutaj opisujemy dane, ktore MySphere naprawde posiada w Firestore.
 *
 * ZGODNOSC Z ISTNIEJACYM UI:
 * kazdy typ jest ALIASEM (`type`, nie `interface`) i ma pola o tych samych
 * nazwach, co `AgentSummary` / `FeedbackComment` z vendora. Aliasy dostaja od
 * TypeScriptu domniemana sygnature indeksowa, wiec sa przypisywalne do
 * vendorowych typow z `[key: string]: unknown` - dzieki temu komponenty w
 * `app/MyAgents/components/` dzialaja bez jednej przerobki.
 */

export type AgentNetwork = 'mainnet' | 'testnet';

/** Lancuchy, ktore rejestr rozpoznaje po nazwie. */
export const SUPPORTED_AGENT_CHAINS = [
  'base',
  'basecamp',
  'ethereum',
  'optimism',
  'celo',
  'linea',
  'worldchain',
] as const;

export type AgentChain = (typeof SUPPORTED_AGENT_CHAINS)[number];

/** Odpowiednik `ChainIdentity` z vendora - tozsamosc agenta na jednym lancuchu. */
export type AgentChainIdentity = {
  chain: string;
  chainId?: number;
  agentId?: string;
  registeredAt?: string;
};

/** Odpowiednik `UnifiedReputation` z vendora. */
export type AgentUnifiedReputation = {
  value: number;
  decimals?: number;
  totalFeedbackCount: number;
};

/** Odpowiednik `ChainReputation` z vendora - reputacja w rozbiciu na lancuchy. */
export type AgentChainReputation = {
  chain: string;
  chainId?: number;
  value: number;
  decimals?: number;
  feedbackCount?: number;
};

export type AgentReputation = {
  unified: AgentUnifiedReputation;
  perChain: AgentChainReputation[];
};

/** Punkt na wykresie historii reputacji (odpowiednik `ReputationSnapshot`). */
export type AgentReputationSnapshot = {
  value: number;
  timestamp: string;
  feedbackCount: number;
};

/**
 * Agent tak, jak widzi go aplikacja. Dokument w kolekcji `agents` jest
 * kluczowany ADRESEM W LOWERCASE, wiec `address === id dokumentu`.
 *
 * `masterAgentId` jest zostawione dla zgodnosci z UI (linki, klucze list) i w
 * naszym rejestrze rowna sie po prostu adresowi - nie ma tu zewnetrznego
 * indeksera, ktory nadawalby osobne identyfikatory.
 */
export type AgentRecord = {
  masterAgentId: string;
  ownerAddress: string;
  /** Lowercase, rowne ID dokumentu. Klucz dopasowania adresow z feedu. */
  address: string;
  name?: string;
  description?: string;
  chains?: string[];
  network?: AgentNetwork;
  tags?: string[];
  /** ISO 8601, wyliczone z `registeredAtMs`. */
  registeredAt?: string;
  registeredBy?: string;
  /** Wynik 0..100 albo undefined, gdy agent nie ma jeszcze zadnej oceny. */
  score?: number;
  feedbackCount?: number;
  /** Czy agent przekracza progi zaufania (patrz TRUST_MIN_*). */
  trusted?: boolean;
  identities?: AgentChainIdentity[];
  reputation?: AgentUnifiedReputation;
};

/** Pojedyncza opinia. Kolekcja `agentFeedback`, ID generowane przez Firestore. */
export type AgentFeedbackRecord = {
  id: string;
  /** Adres agenta w lowercase - laczy opinie z dokumentem w `agents`. */
  agentAddress: string;
  commenterAddress: string;
  /** Ocena SUROWA w skali suwaka UI: -100..100. */
  score: number;
  tag?: string;
  comment?: string;
  commentHash?: string;
  txHash?: string;
  chainId?: number;
  /** ISO 8601, wyliczone z `createdAtMs`. */
  createdAt?: string;
};

export type ListAgentsOptions = {
  limit?: number;
  /** Kursor z poprzedniej strony (`nextCursor`). Znacznik czasu rejestracji. */
  cursor?: number | null;
  network?: AgentNetwork;
  chain?: string;
};

export type ListAgentsResult = {
  items: AgentRecord[];
  nextCursor: number | null;
  hasMore: boolean;
};

/**
 * Statystyki rejestru agentow.
 *
 * `null` znaczy NIE ZMIERZONO - nigdy "zero". To nie jest ozdoba typu:
 * `getRegistryStats` przy awarii agregacji zwracalo same zera, wiec panel
 * napisalby "0 agents, 0 feedback" w chwili, gdy agentow sa setki. Odczyt,
 * ktory padl, i pusty rejestr to dwie rozne wiadomosci dla czlowieka i musza
 * byc dwiema roznymi wartosciami w kodzie.
 *
 * `totalChains` zostaje zwyklym `number`, bo bierze sie z dlugosci tablicy
 * w konfiguracji, a nie z bazy - nie ma jak sie nie zmierzyc.
 *
 * Ten sam wzorzec co `globalStats` w app/utils/stats/globalStats.ts.
 */
export type AgentRegistryStats = {
  totalAgents: number | null;
  totalFeedback: number | null;
  totalChains: number;
  trustedAgents: number | null;
  trustedPercent: number | null;
};

export type AgentTrustCheck = {
  trusted: boolean;
  score: number;
  feedbackCount: number;
  reason: string;
};
