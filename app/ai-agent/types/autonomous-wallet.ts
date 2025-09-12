/**
 * Types for Autonomous Agent Wallet System
 */

export interface SessionKey {
  sessionId: string;
  agentAddress: string;
  permissions: number;
  expiresAt: number;
  dailyLimit: string;
  spentToday: string;
  lastActivityDay: number;
  isActive: boolean;
}

export interface AgentPolicy {
  agentAddress: string;
  name: string;
  description: string;
  maxTransactionValue: string;
  dailyTransactionLimit: string;
  allowedContracts: string[];
  allowedFunctions: string[];
  canTransferNative: boolean;
  canTransferERC20: boolean;
  canTransferNFT: boolean;
  canSwap: boolean;
  canBridge: boolean;
  isActive: boolean;
}

export interface AutonomousTransaction {
  sessionId: string;
  target: string;
  value: string;
  data: string;
  description?: string;
}

export interface AutonomousWalletConfig {
  walletContractAddress: string;
  rpcUrl: string;
  chainId: number;
}

export interface PermissionFlags {
  NATIVE_TRANSFER: number;    // 1
  ERC20_TRANSFER: number;     // 2
  NFT_TRANSFER: number;       // 4
  CONTRACT_CALL: number;      // 8
  SWAP: number;               // 16
  BRIDGE: number;             // 32
  DEFI: number;               // 64
  LIMITED: number;            // 128
}

export interface AutonomousWalletProvider {
  // Core functionality
  createSessionKey(
    agentAddress: string,
    permissions: number,
    duration: number,
    dailyLimit: string
  ): Promise<string>;

  executeAutonomousTransaction(
    sessionId: string,
    target: string,
    value: string,
    data: string
  ): Promise<{ success: boolean; txHash: string; result: any }>;

  revokeSessionKey(sessionId: string): Promise<boolean>;
  emergencyStop(): Promise<boolean>;
  updateAgentPolicy(agent: string, policy: AgentPolicy): Promise<boolean>;

  // View functions
  getSessionKey(sessionId: string): Promise<SessionKey>;
  getUserSessionKeys(): Promise<string[]>;
  getAgentPolicy(agent: string): Promise<AgentPolicy>;
  isEmergencyStopped(): Promise<boolean>;
  canExecuteTransaction(
    sessionId: string,
    target: string,
    value: string,
    data: string
  ): Promise<boolean>;

  // Utility functions
  getWalletAddress(): string;
  getBalance(): Promise<string>;
  getPermissions(): PermissionFlags;
}
