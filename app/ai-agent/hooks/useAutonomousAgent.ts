/**
 * Hook for managing AI agents with autonomous wallet support
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { createAutonomousWalletProvider } from '../providers/AutonomousWalletProvider';
import { AutonomousWalletConfig, SessionKey, AgentPolicy } from '../types/autonomous-wallet';

interface AutonomousAgentConfig {
  walletContractAddress: string;
  rpcUrl: string;
  chainId: number;
}

interface AutonomousAgentState {
  sessionKey: SessionKey | null;
  agentPolicy: AgentPolicy | null;
  walletProvider: any;
  isAutonomous: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAutonomousAgent() {
  const [state, setState] = useState<AutonomousAgentState>({
    sessionKey: null,
    agentPolicy: null,
    walletProvider: null,
    isAutonomous: false,
    isLoading: false,
    error: null
  });

  // Initialize autonomous wallet provider
  const initializeAutonomousWallet = useCallback(async (
    config: AutonomousAgentConfig,
    privyWallet: any // Privy embedded wallet
  ) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!privyWallet) {
        throw new Error('Privy wallet not connected. Please login with Privy first.');
      }

      // Get the signer from Privy wallet
      let signer: ethers.Signer;
      
      if (privyWallet.getEthersSigner) {
        // Modern Privy wallet - get ethers signer
        signer = await privyWallet.getEthersSigner();
      } else if (privyWallet.ethersProvider) {
        // Legacy Privy wallet
        signer = await privyWallet.ethersProvider.getSigner();
      } else {
        throw new Error('Unsupported Privy wallet format - missing getEthersSigner or ethersProvider');
      }

      if (!signer) {
        throw new Error('Failed to get signer from Privy wallet');
      }

      // Ensure signer has a provider
      if (!signer.provider) {
        throw new Error('Signer does not have a provider. Please ensure wallet is connected to the correct network.');
      }

      // Create autonomous wallet provider using the signer
      const autonomousProvider = createAutonomousWalletProvider(
        {
          walletContractAddress: config.walletContractAddress,
          rpcUrl: config.rpcUrl,
          chainId: config.chainId
        },
        signer
      );

      setState(prev => ({
        ...prev,
        walletProvider: autonomousProvider,
        isAutonomous: true,
        isLoading: false
      }));

      return autonomousProvider;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to initialize autonomous wallet',
        isLoading: false
      }));
      throw error;
    }
  }, []);

  // Create session key for AI agent
  const createSessionKey = useCallback(async (
    agentAddress: string,
    permissions: number,
    duration: number,
    dailyLimit: string
  ) => {
    if (!state.walletProvider) {
      throw new Error('Autonomous wallet not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const sessionId = await state.walletProvider.createSessionKey(
        agentAddress,
        permissions,
        duration,
        dailyLimit
      );

      // Get the created session key details
      const sessionKey = await state.walletProvider.getSessionKey(sessionId);

      setState(prev => ({
        ...prev,
        sessionKey,
        isLoading: false
      }));

      return sessionId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create session key',
        isLoading: false
      }));
      throw error;
    }
  }, [state.walletProvider]);

  // Execute transaction via autonomous wallet
  const executeAutonomousTransaction = useCallback(async (
    sessionId: string,
    target: string,
    value: string,
    data: string
  ) => {
    if (!state.walletProvider) {
      throw new Error('Autonomous wallet not initialized');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await state.walletProvider.executeAutonomousTransaction(
        sessionId,
        target,
        value,
        data
      );

      setState(prev => ({ ...prev, isLoading: false }));
      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to execute transaction',
        isLoading: false
      }));
      throw error;
    }
  }, [state.walletProvider]);

  // Send message to autonomous agent
  const sendAutonomousMessage = useCallback(async (
    message: string,
    userAddress: string,
    sessionId: string,
    config: AutonomousWalletConfig
  ) => {
    if (!state.isAutonomous) {
      throw new Error('Autonomous mode not enabled');
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch('/api/ai-agent/autonomous-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          message,
          walletType: 'autonomous',
          sessionId,
          autonomousWalletConfig: config
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to communicate with autonomous agent');
      }

      const data = await response.json();
      setState(prev => ({ ...prev, isLoading: false }));

      return data.response;
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to send message',
        isLoading: false
      }));
      throw error;
    }
  }, [state.isAutonomous]);

  // Revoke session key
  const revokeSessionKey = useCallback(async (sessionId: string) => {
    if (!state.walletProvider) return false;

    try {
      const success = await state.walletProvider.revokeSessionKey(sessionId);
      if (success && state.sessionKey?.sessionId === sessionId) {
        setState(prev => ({ ...prev, sessionKey: null }));
      }
      return success;
    } catch (error) {
      console.error('Failed to revoke session key:', error);
      return false;
    }
  }, [state.walletProvider, state.sessionKey]);

  // Emergency stop
  const emergencyStop = useCallback(async () => {
    if (!state.walletProvider) return false;

    try {
      const success = await state.walletProvider.emergencyStop();
      if (success) {
        setState(prev => ({ ...prev, sessionKey: null }));
      }
      return success;
    } catch (error) {
      console.error('Failed to activate emergency stop:', error);
      return false;
    }
  }, [state.walletProvider]);

  // Get user session keys
  const getUserSessionKeys = useCallback(async () => {
    if (!state.walletProvider) return [];

    try {
      return await state.walletProvider.getUserSessionKeys();
    } catch (error) {
      console.error('Failed to get user session keys:', error);
      return [];
    }
  }, [state.walletProvider]);

  // Get agent policy
  const getAgentPolicy = useCallback(async (agent: string) => {
    if (!state.walletProvider) return null;

    try {
      const policy = await state.walletProvider.getAgentPolicy(agent);
      setState(prev => ({ ...prev, agentPolicy: policy }));
      return policy;
    } catch (error) {
      console.error('Failed to get agent policy:', error);
      return null;
    }
  }, [state.walletProvider]);

  // Check if emergency stop is active
  const isEmergencyStopped = useCallback(async () => {
    if (!state.walletProvider) return false;

    try {
      return await state.walletProvider.isEmergencyStopped();
    } catch (error) {
      console.error('Failed to check emergency stop status:', error);
      return false;
    }
  }, [state.walletProvider]);

  // Switch back to Privy mode
  const switchToPrivyMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      isAutonomous: false,
      sessionKey: null,
      agentPolicy: null,
      walletProvider: null,
      error: null
    }));
  }, []);

  // Get wallet balance
  const getBalance = useCallback(async () => {
    if (!state.walletProvider) return '0';

    try {
      return await state.walletProvider.getBalance();
    } catch (error) {
      console.error('Failed to get balance:', error);
      return '0';
    }
  }, [state.walletProvider]);

  return {
    // State
    sessionKey: state.sessionKey,
    agentPolicy: state.agentPolicy,
    walletProvider: state.walletProvider,
    isAutonomous: state.isAutonomous,
    isLoading: state.isLoading,
    error: state.error,

    // Methods
    initializeAutonomousWallet,
    createSessionKey,
    executeAutonomousTransaction,
    sendAutonomousMessage,
    revokeSessionKey,
    emergencyStop,
    getUserSessionKeys,
    getAgentPolicy,
    isEmergencyStopped,
    switchToPrivyMode,
    getBalance,

    // Permission helpers
    permissions: state.walletProvider?.getPermissions() || null
  };
}
