import { NextRequest, NextResponse } from 'next/server';

// POST - Create spend permission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { smartAccountAddress, ...permissionData } = body;

    // Get API credentials from server environment
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (!apiKeySecret || !walletSecret) {
      throw new Error('Missing CDP API credentials on server');
    }

    const response = await fetch(
      `https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountAddress}/spend-permissions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKeySecret}`,
          'X-Wallet-Auth': `Bearer ${walletSecret}`,
        },
        body: JSON.stringify(permissionData),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create spend permission: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Create spend permission error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create spend permission' },
      { status: 500 }
    );
  }
}

// GET - List spend permissions
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const smartAccountAddress = searchParams.get('address');

    if (!smartAccountAddress) {
      return NextResponse.json(
        { error: 'Smart account address is required' },
        { status: 400 }
      );
    }

    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeySecret) {
      throw new Error('Missing CDP API credentials on server');
    }

    const response = await fetch(
      `https://api.cdp.coinbase.com/platform/v2/evm/smart-accounts/${smartAccountAddress}/spend-permissions/list`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKeySecret}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to list spend permissions: ${response.statusText} - ${error}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('List spend permissions error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list spend permissions' },
      { status: 500 }
    );
  }
}
