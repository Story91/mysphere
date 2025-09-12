import { Address } from 'viem';
import { CDPWalletHook } from '../types/cdpWallet';

interface CDPWalletAction {
  type: 'transfer' | 'approve' | 'swap' | 'checkBalance';
  params: Record<string, any>;
}

export class CDPWalletActionProvider {
  private cdpWallet: CDPWalletHook;
  private spenderAddress: Address | null = null;

  constructor(cdpWallet: CDPWalletHook) {
    this.cdpWallet = cdpWallet;
  }

  /**
   * Set the AI agent as a spender
   * @param agentAddress The address of the AI agent
   */
  async setAgentAsSpender(agentAddress: Address) {
    if (!this.cdpWallet.smartAccount.isConnected) {
      throw new Error('Smart account required for spend permissions');
    }

    if (!this.cdpWallet.smartAccount.supportsSpendPermissions) {
      throw new Error('Smart account does not support spend permissions');
    }

    this.spenderAddress = agentAddress;
  }

  /**
   * Grant spend permission to the AI agent
   * @param params Permission parameters
   */
  async grantSpendPermission(params: {
    token?: Address;
    allowance: string;
    period?: string;
  }) {
    if (!this.spenderAddress) {
      throw new Error('Agent address not set. Call setAgentAsSpender first.');
    }

    const permission = await this.cdpWallet.createSpendPermission({
      spender: this.spenderAddress,
      token: params.token || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address, // Default to ETH
      allowance: params.allowance,
      period: params.period || '86400', // Default to 24 hours
    });

    return permission;
  }

  /**
   * Check if agent has active spend permission
   */
  async hasActivePermission(): Promise<boolean> {
    if (!this.spenderAddress) return false;

    const permissions = await this.cdpWallet.listSpendPermissions();
    return permissions.some(
      p => p.permission.spender === this.spenderAddress && !p.revoked
    );
  }

  /**
   * Execute an action on behalf of the user
   * @param action The action to execute
   */
  async executeAction(action: CDPWalletAction) {
    // Ensure wallet is connected
    const isConnected = this.cdpWallet.smartAccount.isConnected || this.cdpWallet.eoaWallet.isConnected;
    if (!isConnected) {
      throw new Error('No CDP wallet connected');
    }

    switch (action.type) {
      case 'checkBalance':
        return await this.checkBalance();

      case 'transfer':
        return await this.transfer(
          action.params.to,
          action.params.amount,
          action.params.token
        );

      case 'approve':
        return await this.approveToken(
          action.params.spender,
          action.params.amount,
          action.params.token
        );

      case 'swap':
        return await this.swap(action.params);

      default:
        throw new Error(`Unsupported action type: ${action.type}`);
    }
  }

  /**
   * Check wallet balance
   */
  private async checkBalance() {
    const balance = await this.cdpWallet.getBalance();
    return {
      success: true,
      balance: balance.toString(),
      formatted: (Number(balance) / 1e18).toFixed(6) + ' ETH'
    };
  }

  /**
   * Transfer tokens
   */
  private async transfer(to: Address, amount: string, token?: Address) {
    if (token && token !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
      // ERC20 transfer
      const transferData = this.encodeERC20Transfer(to, amount);
      const txHash = await this.cdpWallet.sendTransaction(
        token,
        BigInt(0),
        transferData
      );
      return {
        success: true,
        txHash,
        message: `Transferred ${amount} tokens to ${to}`
      };
    } else {
      // Native ETH transfer
      const value = BigInt(amount);
      const txHash = await this.cdpWallet.sendTransaction(to, value);
      return {
        success: true,
        txHash,
        message: `Transferred ${amount} ETH to ${to}`
      };
    }
  }

  /**
   * Approve token spending
   */
  private async approveToken(spender: Address, amount: string, token: Address) {
    if (!token || token === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
      throw new Error('Cannot approve native ETH');
    }

    const approveData = this.encodeERC20Approve(spender, amount);
    const txHash = await this.cdpWallet.sendTransaction(
      token,
      BigInt(0),
      approveData
    );

    return {
      success: true,
      txHash,
      message: `Approved ${spender} to spend ${amount} tokens`
    };
  }

  /**
   * Swap tokens (placeholder - would integrate with DEX)
   */
  private async swap(params: any) {
    // This would integrate with a DEX aggregator or specific DEX
    throw new Error('Swap functionality not yet implemented');
  }

  /**
   * Encode ERC20 transfer function call
   */
  private encodeERC20Transfer(to: Address, amount: string): string {
    // ERC20 transfer(address to, uint256 amount)
    const functionSignature = '0xa9059cbb';
    const paddedTo = to.slice(2).padStart(64, '0');
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    return functionSignature + paddedTo + paddedAmount;
  }

  /**
   * Encode ERC20 approve function call
   */
  private encodeERC20Approve(spender: Address, amount: string): string {
    // ERC20 approve(address spender, uint256 amount)
    const functionSignature = '0x095ea7b3';
    const paddedSpender = spender.slice(2).padStart(64, '0');
    const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
    return functionSignature + paddedSpender + paddedAmount;
  }

  /**
   * Parse agent request and execute appropriate action
   */
  async processAgentRequest(request: string): Promise<any> {
    const lowerRequest = request.toLowerCase();

    // Check balance
    if (lowerRequest.includes('balance') || lowerRequest.includes('how much')) {
      return await this.executeAction({ type: 'checkBalance', params: {} });
    }

    // Transfer ETH
    const transferMatch = request.match(/transfer\s+([\d.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
    if (transferMatch) {
      const amount = (parseFloat(transferMatch[1]) * 1e18).toString();
      return await this.executeAction({
        type: 'transfer',
        params: {
          to: transferMatch[2] as Address,
          amount
        }
      });
    }

    // Send ETH (alias for transfer)
    const sendMatch = request.match(/send\s+([\d.]+)\s+eth\s+to\s+(0x[a-fA-F0-9]{40})/i);
    if (sendMatch) {
      const amount = (parseFloat(sendMatch[1]) * 1e18).toString();
      return await this.executeAction({
        type: 'transfer',
        params: {
          to: sendMatch[2] as Address,
          amount
        }
      });
    }

    throw new Error('Unable to parse request. Supported commands: check balance, transfer X ETH to 0x...');
  }
}
