/**
 * Vendored KYA (Know Your Agent) client types.
 * Reconstructed from docs/KYA.md — the original @registrai/kya package
 * was unpublished from npm.
 */

export interface KYAClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface ChainIdentity {
  chain: string;
  chainId?: number;
  agentId?: string;
  registeredAt?: string;
}

export interface UnifiedReputation {
  value: number;
  decimals?: number;
  totalFeedbackCount: number;
}

export interface ChainReputation {
  chain: string;
  chainId?: number;
  value: number;
  decimals?: number;
  feedbackCount?: number;
}

export interface AgentSummary {
  masterAgentId: string;
  ownerAddress: string;
  registeredAt?: string;
  chains?: string[];
  score?: number;
  feedbackCount?: number;
  reputation?: UnifiedReputation;
  identities?: ChainIdentity[];
  [key: string]: unknown;
}

export interface AgentProfile extends AgentSummary {
  identities: ChainIdentity[];
}

export interface TrustCheckResult {
  trusted: boolean;
  score: number;
  feedbackCount: number;
  reason: string;
}

export interface ReputationSnapshot {
  value?: number;
  score?: number;
  timestamp?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface FeedbackComment {
  id?: string;
  score?: number;
  value?: number;
  commenterAddress?: string;
  from?: string;
  comment?: string;
  text?: string;
  tag?: string;
  tag1?: string;
  createdAt?: string;
  timestamp?: string;
  txHash?: string;
  chainId?: number;
  [key: string]: unknown;
}

export interface BuildFeedbackTxParams {
  chainId: number;
  value: string;
  valueDecimals?: number;
  tag1?: string;
  tag2?: string;
  feedbackHash?: string;
}

export interface FeedbackTxData {
  to: string;
  data: string;
  chainId: number;
}

export interface SubmitFeedbackParams {
  chainId: number;
  commenterAddress: string;
  score: number;
  tag?: string;
  comment?: string;
  commentHash?: string;
  txHash?: string;
}

export interface ListAgentsOptions {
  page?: number;
  limit?: number;
  network?: "mainnet" | "testnet" | string;
  chain?: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface PlatformStats {
  totalAgents?: number;
  totalFeedback?: number;
  chains?: number;
  [key: string]: unknown;
}

export declare class KYAError extends Error {
  status?: number;
  constructor(message: string, status?: number);
}

export declare class KYAClient {
  baseUrl: string;
  apiKey?: string;
  constructor(options?: KYAClientOptions);
  getAgent(id: string): Promise<AgentProfile>;
  isAgentTrusted(
    id: string,
    opts?: { minScore?: number; minFeedback?: number }
  ): Promise<TrustCheckResult>;
  getReputation(
    id: string
  ): Promise<{ unified: UnifiedReputation; perChain: ChainReputation[] }>;
  getReputationHistory(
    id: string,
    opts?: PaginationOptions
  ): Promise<ReputationSnapshot[]>;
  buildFeedbackTx(id: string, params: BuildFeedbackTxParams): Promise<FeedbackTxData>;
  submitFeedback(id: string, params: SubmitFeedbackParams): Promise<unknown>;
  getFeedback(
    id: string,
    opts?: PaginationOptions
  ): Promise<FeedbackComment[] | { items: FeedbackComment[] }>;
  listAgents(
    opts?: ListAgentsOptions
  ): Promise<AgentSummary[] | { items?: AgentSummary[]; agents?: AgentSummary[] }>;
  getStats(opts?: { network?: string }): Promise<PlatformStats>;
}
