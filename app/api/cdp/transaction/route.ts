import { NextRequest, NextResponse } from 'next/server';
import { CdpClient } from '@coinbase/cdp-sdk';
import { Address } from 'viem';

// Get CDP client with credentials
const getCdpClient = () => {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error('Missing CDP credentials');
  }

  return new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  });
};

// POST - Send transaction
export async function POST(request: NextRequest) {
  try {
    const { from, to, value, data, isSmartAccount, ownerAddress } = await request.json();
    const cdpClient = getCdpClient();
    const networkId = process.env.NEXT_PUBLIC_NETWORK_ID || 'base-sepolia';

    if (isSmartAccount) {
      // For smart accounts, we need the owner address to get the account
      if (!ownerAddress) {
        throw new Error('Owner address is required for smart account transactions');
      }

      // Get the owner account first
      const owner = await cdpClient.evm.getAccount({ address: ownerAddress });
      
      // Get smart account with owner
      const smartAccount = await cdpClient.evm.getSmartAccount({ 
        address: from,
        owner 
      });
      
      // Send user operation
      const userOp = await cdpClient.evm.sendUserOperation({
        smartAccount,
        network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
        calls: [{
          to: to as Address,
          value: BigInt(value),
          data: (data || '0x') as `0x${string}`,
        }],
        paymasterUrl: process.env.PAYMASTER_URL,
      });

      return NextResponse.json({
        success: true,
        hash: userOp.userOpHash,
        type: 'userOperation',
      });
    } else {
      // Regular EOA transaction
      const result = await cdpClient.evm.sendTransaction({
        address: from,
        transaction: {
          to,
          value: value.toString(),
          data: data || '0x',
        },
        network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
      });

      return NextResponse.json({
        success: true,
        hash: result.transactionHash,
        type: 'transaction',
      });
    }
  } catch (error) {
    console.error('CDP transaction error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send transaction' },
      { status: 500 }
    );
  }
}
