import { NextRequest, NextResponse } from 'next/server';

// POST - Revoke spend permission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smartAccountAddress, permissionHash, networkId, paymasterUrl } = body;

    // Get API credentials from server environment
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (!apiKeySecret || !walletSecret) {
      throw new Error('Missing CDP API credentials on server');
    }

    const response = await fetch(
      `https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountAddress}/spend-permissions/revoke`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeySecret}`,
          'X-Wallet-Auth': `Bearer ${walletSecret}`,
        },
        body: JSON.stringify({
          network: networkId === 'base-mainnet' ? 'base' : 'base-sepolia',
          permissionHash,
          paymasterUrl,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to revoke spend permission: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Revoke spend permission error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to revoke spend permission' },
      { status: 500 }
    );
  }
}
