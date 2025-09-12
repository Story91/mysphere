/**
 * Simplified ZeroDev Smart Wallet Hook
 * Basic integration with Privy embedded wallets
 */

import { useState, useCallback, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

export interface ZeroDevSmartWallet {
  address: string;
  isConnected: boolean;
  publicClient: any; // Simplified type to avoid conflicts
}

export function useZeroDevSmartWallet() {
  const { wallets } = useWallets();
  const [smartWallet, setSmartWallet] = useState<ZeroDevSmartWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find embedded wallet from Privy
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  // Initialize basic smart wallet
  const initializeSmartWallet = useCallback(async () => {
    if (!embeddedWallet) {
      setError('No embedded wallet found');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🔧 Initializing basic smart wallet...');

      // Get EIP1193 provider from Privy embedded wallet
      const provider = await embeddedWallet.getEthereumProvider();
      console.log('✅ Got EIP1193 provider from Privy');

      // Get the wallet address
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const walletAddress = accounts[0];
      console.log('✅ Wallet address:', walletAddress);

      // Initialize viem public client for Base network
      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org')
      });
      console.log('✅ Created viem public client');

      // Create basic smart wallet object
      const smartWalletObj: ZeroDevSmartWallet = {
        address: walletAddress,
        isConnected: true,
        publicClient
      };

      setSmartWallet(smartWalletObj);
      console.log('🎉 Basic smart wallet initialized successfully!');
      
      return smartWalletObj;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize smart wallet';
      console.error('❌ Failed to initialize smart wallet:', err);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [embeddedWallet]);

  // Send transaction using the embedded wallet directly
  const sendTransaction = useCallback(async (
    to: string,
    value: bigint | string | number = 0n,
    data: string = '0x'
  ) => {
    if (!embeddedWallet) {
      throw new Error('No embedded wallet available');
    }

    try {
      console.log('🚀 Sending transaction from embedded wallet...');
      console.log('To:', to);
      console.log('Value (input):', value);
      console.log('Data:', data);

      const provider = await embeddedWallet.getEthereumProvider();
      
      // Ensure value is properly formatted as hex string
      let valueHex: string;
      
      if (typeof value === 'bigint') {
        // Value is already in wei (bigint)
        valueHex = '0x' + value.toString(16);
      } else if (typeof value === 'string') {
        // If value is already a hex string, use it directly
        if (value.startsWith('0x')) {
          valueHex = value;
        } else {
          // If it's a decimal string, convert to wei first
          const valueInWei = BigInt(Math.floor(parseFloat(value) * 10 ** 18));
          valueHex = '0x' + valueInWei.toString(16);
        }
      } else if (typeof value === 'number') {
        // If value is a number, convert to wei
        const valueInWei = BigInt(Math.floor(value * 10 ** 18));
        valueHex = '0x' + valueInWei.toString(16);
      } else {
        throw new Error('Invalid value type for transaction');
      }

      console.log('Value (hex):', valueHex);
      
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          to,
          value: valueHex,
          data
        }]
      });

      console.log('✅ Transaction sent successfully:', txHash);
      return txHash;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send transaction';
      console.error('❌ Failed to send transaction:', err);
      throw new Error(errorMessage);
    }
  }, [embeddedWallet]);

  // Get wallet balance
  const getBalance = useCallback(async () => {
    if (!smartWallet?.publicClient || !smartWallet?.address) {
      return 0n;
    }

    try {
      const balance = await smartWallet.publicClient.getBalance({
        address: smartWallet.address as `0x${string}`
      });
      return balance;
    } catch (err) {
      console.error('Failed to get balance:', err);
      return 0n;
    }
  }, [smartWallet]);

  // Auto-initialize when embedded wallet is available
  useEffect(() => {
    if (embeddedWallet && !smartWallet && !isLoading) {
      initializeSmartWallet();
    }
  }, [embeddedWallet, smartWallet, isLoading, initializeSmartWallet]);

  return {
    // State
    smartWallet,
    isLoading,
    error,
    isConnected: !!smartWallet?.isConnected,
    
    // Actions
    initializeSmartWallet,
    sendTransaction,
    getBalance,
    
    // Wallet info
    address: smartWallet?.address || embeddedWallet?.address || null,
    client: null // Simplified version doesn't use complex client
  };
}
