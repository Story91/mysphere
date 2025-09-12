import { usePrivy, useSessionSigners } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

export interface PrivyEmbeddedWallet {
  id: string;
  address: string;
  isConnected: boolean;
  getEthersProvider?: () => Promise<any>;
  getEthersSigner?: () => Promise<any>;
  ethersProvider?: any;
}

export function usePrivyEmbedded() {
  const { 
    user, 
    login, 
    logout, 
    authenticated, 
    ready
  } = usePrivy();
  
  const { addSessionSigners } = useSessionSigners();

  const [embeddedWallet, setEmbeddedWallet] = useState<PrivyEmbeddedWallet | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Automatically find embedded wallet when user is authenticated
  useEffect(() => {
    // Prevent multiple executions
    if (!ready || !authenticated || !user) return;
    
    const findEmbeddedWallet = async () => {
      // Look for embedded wallet in user's linked accounts
      const embeddedAccount: any = user.linkedAccounts?.find((account: any) => {
        return account.type === 'wallet';
      });
      
      if (embeddedAccount) {
        console.log('✅ Found embedded wallet:', embeddedAccount.address);
        
        // Create a wrapper that provides ethers methods
        const walletWrapper = {
          id: user.id || 'default',
          address: embeddedAccount.address || '',
          isConnected: true,
          // Add ethers provider methods
          getEthersProvider: async () => {
            // Try to access provider directly
            if (embeddedAccount.provider) return embeddedAccount.provider;
            if (embeddedAccount.ethersProvider) return embeddedAccount.ethersProvider;
            
            // Fallback: create provider from RPC
            const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
            return new ethers.JsonRpcProvider(rpcUrl);
          },
          getEthersSigner: async () => {
            // Try to access signer directly
            if (embeddedAccount.signer) return embeddedAccount.signer;
            if (embeddedAccount.ethersProvider) return embeddedAccount.ethersProvider.getSigner();
            if (embeddedAccount.provider) return embeddedAccount.provider.getSigner();
            
            // Fallback: create signer from private key (if available)
            if (embeddedAccount.privateKey) {
              const provider = await walletWrapper.getEthersProvider();
              return new ethers.Wallet(embeddedAccount.privateKey, provider);
            }
            
            // Final fallback: create a real signer using Privy API
            const provider = await walletWrapper.getEthersProvider();
            
            // Create a real signer that uses Privy's API
            const privySigner = {
              provider,
              getAddress: async () => embeddedAccount.address,
              signMessage: async (message: string) => {
                try {
                  const response = await fetch('/api/privy/sign-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      message,
                      address: embeddedAccount.address,
                      authorizationKeyId: process.env.NEXT_PUBLIC_PRIVY_AUTHORIZATION_KEY_ID
                    })
                  });
                  const data = await response.json();
                  return data.signature;
                } catch (error) {
                  console.error('Failed to sign message via Privy API:', error);
                  throw error;
                }
              },
              signTransaction: async (transaction: any) => {
                try {
                  const response = await fetch('/api/privy/sign-transaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transaction,
                      address: embeddedAccount.address,
                      authorizationKeyId: process.env.NEXT_PUBLIC_PRIVY_AUTHORIZATION_KEY_ID
                    })
                  });
                  const data = await response.json();
                  return data.signature;
                } catch (error) {
                  console.error('Failed to sign transaction via Privy API:', error);
                  throw error;
                }
              },
              // CRITICAL: Add sendTransaction method that ethers.js needs
              sendTransaction: async (transaction: any) => {
                try {
                  const response = await fetch('/api/privy/send-transaction', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      transaction,
                      address: embeddedAccount.address,
                      authorizationKeyId: process.env.NEXT_PUBLIC_PRIVY_AUTHORIZATION_KEY_ID
                    })
                  });
                  const data = await response.json();
                  
                  // Return a mock transaction response that ethers.js expects
                  return {
                    hash: data.txHash || '0x' + '0'.repeat(64),
                    wait: async () => ({ 
                      hash: data.txHash || '0x' + '0'.repeat(64),
                      status: 1 
                    })
                  };
                } catch (error) {
                  console.error('Failed to send transaction via Privy API:', error);
                  throw error;
                }
              },
              connect: (provider: any) => privySigner,
              // Add other required signer methods
              _isSigner: true
            };
            
            return privySigner;
          }
        };
        
        setEmbeddedWallet(walletWrapper);
        
        // Skip session signer for on-device execution (will be handled by autonomous wallet)
        console.log('ℹ️ On-device execution mode - session signer will be handled by autonomous wallet');
        console.log('📖 To enable full autonomous features, migrate to TEE in Privy Dashboard');
      } else {
        console.log('No embedded wallet found in linked accounts');
        setEmbeddedWallet(null);
      }
    };
    
    findEmbeddedWallet();
  }, [ready, authenticated, user]);

  // Create embedded wallet manually when needed
  const createEmbeddedWallet = async () => {
    if (!authenticated) {
      throw new Error('User must be authenticated to create embedded wallet');
    }
    
    setIsLoading(true);
    try {
      // For now, we'll need to implement this based on Privy's API
      // This is a placeholder - you might need to call Privy's API directly
      console.log('Creating embedded wallet...');
      
      // TODO: Implement actual embedded wallet creation
      // This might require calling Privy's API or using their SDK
      
    } catch (error) {
      console.error('Failed to create embedded wallet:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Handle login with proper error handling
  const handleLogin = async () => {
    if (authenticated) {
      console.log('User already authenticated');
      return;
    }
    
    setIsLoading(true);
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await logout();
      setEmbeddedWallet(null);
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    // State
    embeddedWallet,
    isLoading,
    isAuthenticated: authenticated,
    isReady: ready,
    
    // Actions
    login: handleLogin,
    logout: handleLogout,
    createEmbeddedWallet,
    
    // User info
    user
  };
}
