import { useState, useCallback, useEffect } from 'react';
import { Address, createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { 
  CDPWalletHook, 
  CDPWalletState, 
  CreateSpendPermissionParams, 
  SpendPermissionResponse 
} from '../types/cdpWallet';

// Constants
const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const;

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

  // Network configuration
  const networkId = config?.networkId || process.env.NEXT_PUBLIC_NETWORK_ID || 'base-sepolia';
  const chain = networkId === 'base-mainnet' ? base : baseSepolia;
  
  const publicClient = createPublicClient({
    chain,
    transport: http(config?.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL),
  });

  // Check if CDP is configured on server
  useEffect(() => {
    const checkCdpConfig = async () => {
      try {
        const response = await fetch('/api/cdp/wallet');
        const data = await response.json();
        
        if (!data.configured) {
          setState(prev => ({
            ...prev,
            error: data.error || 'CDP not configured on server',
          }));
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          error: 'Failed to check CDP configuration',
        }));
      }
    };

    checkCdpConfig();
  }, []);

  // Create EOA wallet
  const createEOAWallet = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/cdp/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'eoa' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create EOA wallet');
      }

      const data = await response.json();

      setState(prev => ({
        ...prev,
        isLoading: false,
        eoaWallet: {
          address: data.address as Address,
          isConnected: true,
        },
      }));

      return { address: data.address as Address };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create EOA wallet';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, []);

  // Create Smart Account with optional spend permissions
  const createSmartAccount = useCallback(async (enableSpendPermissions = true) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/cdp/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'smart',
          enableSpendPermissions 
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create smart account');
      }

      const data = await response.json();

      setState(prev => ({
        ...prev,
        isLoading: false,
        eoaWallet: {
          address: data.ownerAddress as Address,
          isConnected: true,
        },
        smartAccount: {
          address: data.address as Address,
          ownerAddress: data.ownerAddress as Address,
          isConnected: true,
          supportsSpendPermissions: data.supportsSpendPermissions || false,
        },
      }));

      return {
        address: data.address as Address,
        ownerAddress: data.ownerAddress as Address,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create smart account';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      throw error;
    }
  }, []);

  // Connect to existing wallet (not implemented for CDP server wallets)
  const connectToExistingWallet = useCallback(async (address: Address) => {
    throw new Error('Connecting to existing CDP server wallets is not supported from client side');
  }, []);

  // Send transaction
  const sendTransaction = useCallback(async (to: Address, value: bigint, data?: string) => {
    const activeAddress = state.smartAccount.address || state.eoaWallet.address;
    if (!activeAddress) {
      throw new Error('No active wallet connected');
    }

    try {
      const response = await fetch('/api/cdp/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: activeAddress,
          to,
          value: value.toString(),
          data: data || '0x',
          isSmartAccount: !!state.smartAccount.address,
          ownerAddress: state.smartAccount.ownerAddress || state.eoaWallet.address,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Transaction failed');
      }

      const result = await response.json();
      return result.hash;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Transaction failed');
    }
  }, [state.smartAccount.address, state.smartAccount.ownerAddress, state.eoaWallet.address]);

  // Sign message (not supported for CDP server wallets from client)
  const signMessage = useCallback(async (message: string) => {
    throw new Error('Message signing is not supported for CDP server wallets from client side');
  }, []);

  // Create spend permission
  const createSpendPermission = useCallback(async (params: CreateSpendPermissionParams): Promise<SpendPermissionResponse> => {
    if (!state.smartAccount.address) {
      throw new Error('Smart account required for spend permissions');
    }

    if (!state.smartAccount.supportsSpendPermissions) {
      throw new Error('Smart account does not support spend permissions');
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch('/api/cdp/spend-permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smartAccountAddress: state.smartAccount.address,
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to create spend permission');
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
  }, [state.smartAccount.address, state.smartAccount.supportsSpendPermissions, networkId, config?.paymasterUrl]);

  // List spend permissions
  const listSpendPermissions = useCallback(async (): Promise<SpendPermissionResponse[]> => {
    if (!state.smartAccount.address) {
      return [];
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch(`/api/cdp/spend-permissions?address=${state.smartAccount.address}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to list spend permissions');
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
  }, [state.smartAccount.address]);

  // Revoke spend permission
  const revokeSpendPermission = useCallback(async (permissionHash: string) => {
    if (!state.smartAccount.address) {
      throw new Error('Smart account required to revoke permissions');
    }

    setState(prev => ({ ...prev, isLoadingPermissions: true, permissionsError: null }));

    try {
      const response = await fetch('/api/cdp/spend-permissions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          smartAccountAddress: state.smartAccount.address,
          networkId,
          permissionHash,
          paymasterUrl: config?.paymasterUrl,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to revoke spend permission');
      }

      // Refresh permissions list
      await listSpendPermissions();

      setState(prev => ({ ...prev, isLoadingPermissions: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to revoke spend permission';
      setState(prev => ({ ...prev, isLoadingPermissions: false, permissionsError: message }));
      throw error;
    }
  }, [state.smartAccount.address, networkId, config?.paymasterUrl, listSpendPermissions]);

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
