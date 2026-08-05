import { NextRequest, NextResponse } from 'next/server';
import { CdpClient } from '@coinbase/cdp-sdk';
import { Address } from 'viem';

// Initialize CDP client on the server side
const getCdpClient = () => {
  const apiKeyId = process.env.CDP_API_KEY_ID;
  const apiKeySecret = process.env.CDP_API_KEY_SECRET;
  const walletSecret = process.env.CDP_WALLET_SECRET;

  if (!apiKeyId || !apiKeySecret || !walletSecret) {
    throw new Error('Missing CDP credentials on server. Please set CDP_API_KEY_ID, CDP_API_KEY_SECRET, and CDP_WALLET_SECRET in your .env.local file (without NEXT_PUBLIC_ prefix)');
  }

  return new CdpClient({
    apiKeyId,
    apiKeySecret,
    walletSecret,
  });
};

// GET - Check if CDP is configured
export async function GET() {
  try {
    // Just check if we can initialize the client
    getCdpClient();
    return NextResponse.json({ configured: true });
  } catch (error) {
    return NextResponse.json(
      { configured: false, error: error instanceof Error ? error.message : 'CDP not configured' },
      { status: 500 }
    );
  }
}

// POST - Create wallet (EOA or Smart Account)
export async function POST(request: NextRequest) {
  try {
    const { type, enableSpendPermissions } = await request.json();
    const cdpClient = getCdpClient();
    // Trasa serwerowa - prefiks NEXT_PUBLIC_ nie jest tu potrzebny.
    // W env istnieje NETWORK_ID, dlatego sprawdzamy go jako pierwszy;
    // NEXT_PUBLIC_NETWORK_ID zostaje tylko jako zgodnosc wsteczna.
    const networkId = process.env.NETWORK_ID || process.env.NEXT_PUBLIC_NETWORK_ID || 'base-sepolia';

    if (type === 'eoa') {
      // Create EOA wallet
      const account = await cdpClient.evm.createAccount();
      
      return NextResponse.json({
        success: true,
        type: 'eoa',
        address: account.address,
      });
    } else if (type === 'smart') {
      // Create Smart Account
      // First create owner account
      const ownerAccount = await cdpClient.evm.createAccount();
      
      // Then create smart account
      const smartAccount = await cdpClient.evm.createSmartAccount({
        owner: ownerAccount,
        // Enable spend permissions if requested
        ...(enableSpendPermissions && {
          factoryAddress: '0x0222ffA046596B3Abf7818cCBfef1cb6b3b5B0c1', // Base Sepolia address
        }),
      });

      return NextResponse.json({
        success: true,
        type: 'smart',
        address: smartAccount.address,
        ownerAddress: ownerAccount.address,
        supportsSpendPermissions: enableSpendPermissions || false,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid wallet type. Use "eoa" or "smart"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('CDP wallet creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create wallet' },
      { status: 500 }
    );
  }
}
