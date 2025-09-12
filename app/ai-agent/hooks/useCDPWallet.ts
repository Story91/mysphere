import { useState, useCallback, useEffect } from 'react';
import { Address, createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { CdpClient, EvmServerAccount, EvmSmartAccount } from '@coinbase/cdp-sdk';
import { 
  CDPWalletHook, 
  CDPWalletState, 
  CreateSpendPermissionParams, 
  SpendPermissionResponse 
} from '../types/cdpWallet';

// Constants
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;
const SPEND_PERMISSION_MANAGER_ADDRESS = '0x0222ffA046596B3Abf7818cCBfef1cb6b3b5B0c1' as const; // Base Sepolia address

export const useCDPWallet = (config?: {
  networkId?: string;
  rpcUrl?: string;
  paymasterUrl?: string;
}): CDPWalletHook => {
  // State management
  const [state, setState] = useState<CDPWalletState>({
    isLoading: false,
    error: null,
    eoaWallet: {
      address: null,
      isConnected: false,
    },
    smartAccount: {
      address: null,
      ownerAddress: null,
      isConnected: false,
      supportsSpendPermissions: false,
    },
    spendPermissions: [],
    isLoadingPermissions: false,
    permissionsError: null,
  });

  // CDP client instance
  const [cdpClient, setCdpClient] = useState<CdpClient | null>(null);
  const [eoaAccount, setEoaAccount] = useState<EvmServerAccount | null>(null);
  const [smartAccountInstance, setSmartAccountInstance] = useState<EvmSmartAccount | null>(null);

  // Network configuration
  const networkId = config?.networkId || process.env.NEXT_PUBLIC_NETWORK_ID || 'base-sepolia';
  const chain = networkId === 'base-mainnet' ? base : baseSepolia;
  
  const publicClient = createPublicClient({
    chain,
    transport: http(config?.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL),
  });

  // Initialize CDP client
  useEffect(() => {
    const initializeCDP = async () => {
      try {
        const apiKeyId = process.env.NEXT_PUBLIC_CDP_API_KEY_ID;
        const apiKeySecret = process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET;
        const walletSecret = process.env.NEXT_PUBLIC_CDP_WALLET_SECRET;

        if (!apiKeyId || !apiKeySecret || !walletSecret) {
          throw new Error('Missing CDP credentials. Please set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET.');
        }

        const client = new CdpClient({
          apiKeyId,
          apiKeySecret,
          walletSecret,
        });

        setCdpClient(client);
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to initialize CDP client',
        }));
      }
    };

    initializeCDP();
  }, []);

  // Create EOA wallet
  const createEOAWallet = useCallback(async () => {
    if (!cdpClient) {
      throw new Error('CDP client not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const account = await cdpClient.evm.createAccount();
      setEoaAccount(account);

      setState(prev => ({
        ...prev,
        isLoading: false,
        eoaWallet: {
          address: account.address as Address,
          isConnected: true,
        },
      }));

      return { address: account.address as Address };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create EOA wallet';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, [cdpClient]);

  // Create Smart Account with optional spend permissions
  const createSmartAccount = useCallback(async (enableSpendPermissions = true) => {
    if (!cdpClient) {
      throw new Error('CDP client not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Create or use existing owner account
      let ownerAccount = eoaAccount;
      if (!ownerAccount) {
        ownerAccount = await cdpClient.evm.createAccount();
        setEoaAccount(ownerAccount);
      }

      // Create smart account with spend permissions support
      const smartAccount = await cdpClient.evm.createSmartAccount({
        owner: ownerAccount,
        // Enable spend permissions at creation time
        ...(enableSpendPermissions && {
          factoryAddress: SPEND_PERMISSION_MANAGER_ADDRESS,
        }),
      });

      setSmartAccountInstance(smartAccount);

      setState(prev => ({
        ...prev,
        isLoading: false,
        eoaWallet: {
          address: ownerAccount.address as Address,
          isConnected: true,
        },
        smartAccount: {
          address: smartAccount.address as Address,
          ownerAddress: ownerAccount.address as Address,
          isConnected: true,
          supportsSpendPermissions: enableSpendPermissions,
        },
      }));

      return {
        address: smartAccount.address as Address,
        ownerAddress: ownerAccount.address as Address,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create smart account';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, [cdpClient, eoaAccount]);

  // Connect to existing wallet
  const connectToExistingWallet = useCallback(async (address: Address) => {
    if (!cdpClient) {
      throw new Error('CDP client not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const account = await cdpClient.evm.getAccount({ address });
      setEoaAccount(account);

      setState(prev => ({
        ...prev,
        isLoading: false,
        eoaWallet: {
          address: account.address as Address,
          isConnected: true,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to wallet';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, [cdpClient]);

  // Send transaction
  const sendTransaction = useCallback(async (to: Address, value: bigint, data?: string) => {
    if (!cdpClient) {
      throw new Error('CDP client not initialized');
    }

    const activeAccount = smartAccountInstance || eoaAccount;
    if (!activeAccount) {
      throw new Error('No active wallet connected');
    }

    try {
      if (smartAccountInstance) {
        // Use smart account for transaction
        const userOp = await cdpClient.evm.sendUserOperation({
          smartAccount: smartAccountInstance,
          network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
          calls: [{
            to,
            value,
            data: (data || '0x') as `0x${string}`,
          }],
          paymasterUrl: config?.paymasterUrl,
        });

        return userOp.userOpHash;
      } else if (eoaAccount) {
        // Use EOA for transaction
        const result = await cdpClient.evm.sendTransaction({
          address: eoaAccount.address,
          transaction: {
            to,
            value,
            data: data || '0x',
          },
          network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
        });

        return result.transactionHash;
      }

      throw new Error('No active wallet');
    } catch (error) {
      throw error instanceof Error ? error : new Error('Transaction failed');
    }
  }, [cdpClient, smartAccountInstance, eoaAccount, networkId, config?.paymasterUrl]);

  // Sign message
  const signMessage = useCallback(async (message: string) => {
    const activeAccount = eoaAccount;
    if (!activeAccount) {
      throw new Error('No active EOA wallet connected');
    }

    try {
      return await activeAccount.signMessage({ message });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to sign message');
    }
  }, [eoaAccount]);

  // Create spend permission
  const createSpendPermission = useCallback(async (params: CreateSpendPermissionParams): Promise<SpendPermissionResponse> => {
    if (!cdpClient || !smartAccountInstance) {
      throw new Error('Smart account required for spend permissions');
    }

    if (!state.smartAccount.supportsSpendPermissions) {
      throw new Error('Smart account does not support spend permissions');
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch(`https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountInstance.address}/spend-permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET}`,
          'X-Wallet-Auth': `Bearer ${process.env.NEXT_PUBLIC_CDP_WALLET_SECRET}`,
        },
        body: JSON.stringify({
          network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
          spender: params.spender,
          token: params.token || NATIVE_TOKEN_ADDRESS,
          allowance: params.allowance,
          period: params.period || '86400', // 24 hours default
          start: params.start || '0',
          end: params.end || '281474976710655', // max uint48
          salt: params.salt || Math.floor(Math.random() * 1000000).toString(),
          extraData: params.extraData || '0x',
          paymasterUrl: config?.paymasterUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create spend permission: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Refresh permissions list
      await listSpendPermissions();

      setState(prev => ({ ...prev, isLoadingPermissions: false }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create spend permission';
      setState(prev => ({ ...prev, isLoadingPermissions: false, permissionsError: message }));
      throw error;
    }
  }, [cdpClient, smartAccountInstance, state.smartAccount.supportsSpendPermissions, networkId, config?.paymasterUrl]);

  // List spend permissions
  const listSpendPermissions = useCallback(async (): Promise<SpendPermissionResponse[]> => {
    if (!smartAccountInstance) {
      return [];
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch(`https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountInstance.address}/spend-permissions/list`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to list spend permissions: ${response.statusText}`);
      }

      const result = await response.json();
      const permissions = result.spendPermissions || [];

      setState(prev => ({
        ...prev,
        spendPermissions: permissions,
        isLoadingPermissions: false,
      }));

      return permissions;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list spend permissions';
      setState(prev => ({ ...prev, isLoadingPermissions: false, permissionsError: message }));
      return [];
    }
  }, [smartAccountInstance]);

  // Revoke spend permission
  const revokeSpendPermission = useCallback(async (permissionHash: string) => {
    if (!cdpClient || !smartAccountInstance) {
      throw new Error('Smart account required to revoke permissions');
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch(`https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountInstance.address}/spend-permissions/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_CDP_API_KEY_SECRET}`,
          'X-Wallet-Auth': `Bearer ${process.env.NEXT_PUBLIC_CDP_WALLET_SECRET}`,
        },
        body: JSON.stringify({
          network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
          permissionHash,
          paymasterUrl: config?.paymasterUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to revoke spend permission: ${response.statusText}`);
      }

      // Refresh permissions list
      await listSpendPermissions();

      setState(prev => ({ ...prev, isLoadingPermissions: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke spend permission';
      setState(prev => ({ ...prev, isLoadingPermissions: false, permissionsError: message }));
      throw error;
    }
  }, [cdpClient, smartAccountInstance, networkId, config?.paymasterUrl, listSpendPermissions]);

  // Get balance
  const getBalance = useCallback(async () => {
    const address = state.smartAccount.address || state.eoaWallet.address;
    if (!address) {
      throw new Error('No active wallet');
    }

    try {
      return await publicClient.getBalance({ address });
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to get balance');
    }
  }, [state.smartAccount.address, state.eoaWallet.address, publicClient]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setEoaAccount(null);
    setSmartAccountInstance(null);
    setState({
      isLoading: false,
      error: null,
      eoaWallet: {
        address: null,
        isConnected: false,
      },
      smartAccount: {
        address: null,
        ownerAddress: null,
        isConnected: false,
        supportsSpendPermissions: false,
      },
      spendPermissions: [],
      isLoadingPermissions: false,
      permissionsError: null,
    });
  }, []);

  // Export wallet
  const exportWallet = useCallback(async () => {
    const address = state.smartAccount.address || state.eoaWallet.address;
    if (!address) {
      throw new Error('No active wallet');
    }

    // Note: Private keys cannot be exported from CDP Server Wallets for security
    return {
      address,
    };
  }, [state.smartAccount.address, state.eoaWallet.address]);

  // Auto-refresh permissions when smart account is connected
  useEffect(() => {
    if (state.smartAccount.isConnected && state.smartAccount.supportsSpendPermissions) {
      listSpendPermissions();
    }
  }, [state.smartAccount.isConnected, state.smartAccount.supportsSpendPermissions, listSpendPermissions]);

  return {
    ...state,
    createEOAWallet,
    createSmartAccount,
    connectToExistingWallet,
    sendTransaction,
    signMessage,
    createSpendPermission,
    listSpendPermissions,
    revokeSpendPermission,
    getBalance,
    disconnect,
    exportWallet,
  };
};
