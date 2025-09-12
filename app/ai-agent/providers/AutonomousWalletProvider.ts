/**
 * Autonomous Wallet Provider for AI Agents
 * Enables AI agents to autonomously control self-custodial wallets
 */

import { ethers } from 'ethers';
import {
  AutonomousWalletProvider,
  AutonomousWalletConfig,
  SessionKey,
  AgentPolicy,
  PermissionFlags
} from '../types/autonomous-wallet';

// ABI for the AutonomousAgentWallet contract
const AUTONOMOUS_WALLET_ABI = [
  // Session Key functions
  "function createSessionKey(address agentAddress, uint256 permissions, uint256 duration, uint256 dailyLimit) external returns (uint256)",
  "function executeAutonomousTransaction(uint256 sessionId, address target, uint256 value, bytes data) external returns (bool, bytes)",
  "function revokeSessionKey(uint256 sessionId) external",
  "function emergencyStop() external",
  "function deactivateEmergencyStop() external",
  "function updateAgentPolicy(address agent, tuple(address agentAddress, string name, string description, uint256 maxTransactionValue, uint256 dailyTransactionLimit, address[] allowedContracts, bytes4[] allowedFunctions, bool canTransferNative, bool canTransferERC20, bool canTransferNFT, bool canSwap, bool canBridge, bool isActive) policy) external",
  "function updateDailyLimit(uint256 sessionId, uint256 newLimit) external",

  // View functions
  "function getSessionKey(address user, uint256 sessionId) external view returns (tuple(address agentAddress, uint256 permissions, uint256 expiresAt, uint256 dailyLimit, uint256 spentToday, uint256 lastActivityDay, bool isActive))",
  "function getUserSessionKeys(address user) external view returns (uint256[])",
  "function getAgentPolicy(address user, address agent) external view returns (tuple(address agentAddress, string name, string description, uint256 maxTransactionValue, uint256 dailyTransactionLimit, address[] allowedContracts, bytes4[] allowedFunctions, bool canTransferNative, bool canTransferERC20, bool canTransferNFT, bool canSwap, bool canBridge, bool isActive))",
  "function isEmergencyStopped(address user) external view returns (bool)",
  "function canExecuteTransaction(address user, uint256 sessionId, address target, uint256 value, bytes data) external view returns (bool)",

  // Permission constants
  "function PERMISSION_NATIVE_TRANSFER() external pure returns (uint256)",
  "function PERMISSION_ERC20_TRANSFER() external pure returns (uint256)",
  "function PERMISSION_NFT_TRANSFER() external pure returns (uint256)",
  "function PERMISSION_CONTRACT_CALL() external pure returns (uint256)",
  "function PERMISSION_SWAP() external pure returns (uint256)",
  "function PERMISSION_BRIDGE() external pure returns (uint256)",
  "function PERMISSION_DEFI() external pure returns (uint256)",
  "function PERMISSION_LIMITED() external pure returns (uint256)",
];

export class AutonomousWalletProviderImpl implements AutonomousWalletProvider {
  private contract: ethers.Contract;
  private signer: ethers.Signer;
  private userAddress!: string; // Will be initialized asynchronously

  // Permission flags (same as contract)
  private readonly PERMISSIONS: PermissionFlags = {
    NATIVE_TRANSFER: 1 << 0,    // 1
    ERC20_TRANSFER: 1 << 1,     // 2
    NFT_TRANSFER: 1 << 2,       // 4
    CONTRACT_CALL: 1 << 3,      // 8
    SWAP: 1 << 4,               // 16
    BRIDGE: 1 << 5,             // 32
    DEFI: 1 << 6,               // 64
    LIMITED: 1 << 7,            // 128
  };

  constructor(
    private config: AutonomousWalletConfig,
    signer: ethers.Signer
  ) {
    this.signer = signer;
    this.contract = new ethers.Contract(
      config.walletContractAddress,
      AUTONOMOUS_WALLET_ABI,
      signer
    );
    // Initialize userAddress asynchronously
    this.initializeUserAddress();
  }

  private async initializeUserAddress() {
    this.userAddress = await this.signer.getAddress();
  }

  /**
   * Get permission flags
   */
  getPermissions(): PermissionFlags {
    return this.PERMISSIONS;
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string {
    return this.userAddress;
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<string> {
    const provider = this.signer.provider;
    if (!provider) throw new Error('No provider available');
    const balance = await provider.getBalance(this.userAddress);
    return ethers.formatEther(balance);
  }

  /**
   * Create a new session key for an AI agent
   */
  async createSessionKey(
    agentAddress: string,
    permissions: number,
    duration: number,
    dailyLimit: string
  ): Promise<string> {
    try {
      const dailyLimitWei = ethers.parseEther(dailyLimit);
      const tx = await this.contract.createSessionKey(
        agentAddress,
        permissions,
        duration,
        dailyLimitWei
      );
      const receipt = await tx.wait();

      // Extract session ID from event
      const event = receipt.events?.find((e: any) => e.event === 'SessionKeyCreated');
      if (!event) throw new Error('Session key creation event not found');

      return event.args.sessionId.toString();
    } catch (error) {
      console.error('Failed to create session key:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Session key creation failed: ${errorMessage}`);
    }
  }

  /**
   * Execute an autonomous transaction
   */
  async executeAutonomousTransaction(
    sessionId: string,
    target: string,
    value: string,
    data: string
  ): Promise<{ success: boolean; txHash: string; result: any }> {
    try {
      // Check if transaction can be executed
      const canExecute = await this.canExecuteTransaction(sessionId, target, value, data);
      if (!canExecute) {
        throw new Error('Transaction not allowed by current permissions or policies');
      }

      const valueWei = ethers.parseEther(value);
      const tx = await this.contract.executeAutonomousTransaction(
        sessionId,
        target,
        valueWei,
        data
      );

      const receipt = await tx.wait();

      return {
        success: true,
        txHash: tx.hash,
        result: receipt
      };
    } catch (error) {
      console.error('Failed to execute autonomous transaction:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        txHash: '',
        result: errorMessage
      };
    }
  }

  /**
   * Revoke a session key
   */
  async revokeSessionKey(sessionId: string): Promise<boolean> {
    try {
      const tx = await this.contract.revokeSessionKey(sessionId);
      await tx.wait();
      return true;
    } catch (error) {
      console.error('Failed to revoke session key:', error);
      return false;
    }
  }

  /**
   * Emergency stop all autonomous operations
   */
  async emergencyStop(): Promise<boolean> {
    try {
      const tx = await this.contract.emergencyStop();
      await tx.wait();
      return true;
    } catch (error) {
      console.error('Failed to activate emergency stop:', error);
      return false;
    }
  }

  /**
   * Update agent policy
   */
  async updateAgentPolicy(agent: string, policy: AgentPolicy): Promise<boolean> {
    try {
      // Convert string values to wei
      const maxTransactionValueWei = ethers.parseEther(policy.maxTransactionValue);
      const dailyTransactionLimitWei = ethers.parseEther(policy.dailyTransactionLimit);

      // Convert function signatures from hex strings to bytes4
      const allowedFunctionsBytes4 = policy.allowedFunctions.map(
        (sig: string) => ethers.dataSlice(sig, 0, 4)
      );

      const policyTuple = [
        policy.agentAddress,
        policy.name,
        policy.description,
        maxTransactionValueWei,
        dailyTransactionLimitWei,
        policy.allowedContracts,
        allowedFunctionsBytes4,
        policy.canTransferNative,
        policy.canTransferERC20,
        policy.canTransferNFT,
        policy.canSwap,
        policy.canBridge,
        policy.isActive
      ];

      const tx = await this.contract.updateAgentPolicy(agent, policyTuple);
      await tx.wait();
      return true;
    } catch (error) {
      console.error('Failed to update agent policy:', error);
      return false;
    }
  }

  /**
   * Get session key details
   */
  async getSessionKey(sessionId: string): Promise<SessionKey> {
    try {
      const [agentAddress, permissions, expiresAt, dailyLimit, spentToday, lastActivityDay, isActive] =
        await this.contract.getSessionKey(this.userAddress, sessionId);

      return {
        sessionId,
        agentAddress,
        permissions: permissions.toNumber(),
        expiresAt: expiresAt.toNumber(),
        dailyLimit: ethers.formatEther(dailyLimit),
        spentToday: ethers.formatEther(spentToday),
        lastActivityDay: lastActivityDay.toNumber(),
        isActive
      };
    } catch (error) {
      console.error('Failed to get session key:', error);
      throw error;
    }
  }

  /**
   * Get all user session keys
   */
  async getUserSessionKeys(): Promise<string[]> {
    try {
      const sessionIds = await this.contract.getUserSessionKeys(this.userAddress);
      return sessionIds.map((id: bigint) => id.toString());
    } catch (error) {
      console.error('Failed to get user session keys:', error);
      return [];
    }
  }

  /**
   * Get agent policy
   */
  async getAgentPolicy(agent: string): Promise<AgentPolicy> {
    try {
      const policy = await this.contract.getAgentPolicy(this.userAddress, agent);

      return {
        agentAddress: policy.agentAddress,
        name: policy.name,
        description: policy.description,
        maxTransactionValue: ethers.formatEther(policy.maxTransactionValue),
        dailyTransactionLimit: ethers.formatEther(policy.dailyTransactionLimit),
        allowedContracts: policy.allowedContracts,
        allowedFunctions: policy.allowedFunctions.map((sig: string) => sig),
        canTransferNative: policy.canTransferNative,
        canTransferERC20: policy.canTransferERC20,
        canTransferNFT: policy.canTransferNFT,
        canSwap: policy.canSwap,
        canBridge: policy.canBridge,
        isActive: policy.isActive
      };
    } catch (error) {
      console.error('Failed to get agent policy:', error);
      throw error;
    }
  }

  /**
   * Check if emergency stop is activated
   */
  async isEmergencyStopped(): Promise<boolean> {
    try {
      return await this.contract.isEmergencyStopped(this.userAddress);
    } catch (error) {
      console.error('Failed to check emergency stop status:', error);
      return false;
    }
  }

  /**
   * Check if a transaction can be executed
   */
  async canExecuteTransaction(
    sessionId: string,
    target: string,
    value: string,
    data: string
  ): Promise<boolean> {
    try {
      const valueWei = ethers.parseEther(value);
      return await this.contract.canExecuteTransaction(
        this.userAddress,
        sessionId,
        target,
        valueWei,
        data
      );
    } catch (error) {
      console.error('Failed to check transaction execution:', error);
      return false;
    }
  }

  /**
   * Deactivate emergency stop
   */
  async deactivateEmergencyStop(): Promise<boolean> {
    try {
      const tx = await this.contract.deactivateEmergencyStop();
      await tx.wait();
      return true;
    } catch (error) {
      console.error('Failed to deactivate emergency stop:', error);
      return false;
    }
  }

  /**
   * Update daily limit for a session key
   */
  async updateDailyLimit(sessionId: string, newLimit: string): Promise<boolean> {
    try {
      const newLimitWei = ethers.parseEther(newLimit);
      const tx = await this.contract.updateDailyLimit(sessionId, newLimitWei);
      await tx.wait();
      return true;
    } catch (error) {
      console.error('Failed to update daily limit:', error);
      return false;
    }
  }
}

/**
 * Factory function to create an AutonomousWalletProvider
 */
export function createAutonomousWalletProvider(
  config: AutonomousWalletConfig,
  signer: ethers.Signer
): AutonomousWalletProvider {
  return new AutonomousWalletProviderImpl(config, signer);
}
