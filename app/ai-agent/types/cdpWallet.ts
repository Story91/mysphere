import { Address } from 'viem';

// CDP Server Wallet Types
export interface CDPWalletConfig {
  apiKeyId?: string;
  apiKeySecret?: string;
  walletSecret?: string;
  networkId?: string;
  rpcUrl?: string;
  paymasterUrl?: string;
}

export interface SpendPermission {
  account: Address;
  spender: Address;
  token: Address;
  allowance: string;
  period: string;
  start: string;
  end: string;
  salt: string;
  extraData: string;
}

export interface SpendPermissionResponse {
  permission: SpendPermission;
  permissionHash: string;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
  network: string;
}

export interface CreateSpendPermissionParams {
  spender: Address;
  token: Address;
  allowance: string;
  period: string;
  start?: string;
  end?: string;
  salt?: string;
  extraData?: string;
}

export interface CDPWalletState {
  // Wallet info
  isLoading: boolean;
  error: string | null;
  
  // Regular EOA wallet
  eoaWallet: {
    address: Address | null;
    isConnected: boolean;
  };
  
  // Smart Account wallet
  smartAccount: {
    address: Address | null;
    ownerAddress: Address | null;
    isConnected: boolean;
    supportsSpendPermissions: boolean;
  };
  
  // Spend permissions
  spendPermissions: SpendPermissionResponse[];
  isLoadingPermissions: boolean;
  permissionsError: string | null;
}

export interface CDPWalletActions {
  // Wallet management
  createEOAWallet: () => Promise<{ address: Address }>;
  createSmartAccount: (enableSpendPermissions?: boolean) => Promise<{ address: Address; ownerAddress: Address }>;
  connectToExistingWallet: (address: Address) => Promise<void>;
  
  // Transaction methods
  sendTransaction: (to: Address, value: bigint, data?: string) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  
  // Spend permission methods
  createSpendPermission: (params: CreateSpendPermissionParams) => Promise<SpendPermissionResponse>;
  listSpendPermissions: () => Promise<SpendPermissionResponse[]>;
  revokeSpendPermission: (permissionHash: string) => Promise<void>;
  
  // Utility methods
  getBalance: () => Promise<bigint>;
  disconnect: () => void;
  exportWallet: () => Promise<{ address: Address; privateKey?: string }>;
}

export type CDPWalletHook = CDPWalletState & CDPWalletActions;
