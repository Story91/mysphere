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
    // Jedna wartosc dla SDK i dla odpowiedzi. Wczesniej byly to dwie rozne
    // sciezki i odpowiedz potrafila deklarowac uprawnienia, ktorych nie wlaczono.
    const wantsSpendPermissions = Boolean(enableSpendPermissions);
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
      // DLACZEGO nie ma tu adresu fabryki: `CreateSmartAccountOptions`
      // w @coinbase/cdp-sdk 1.38 NIE MA pola `factoryAddress` - ma
      // `enableSpendPermissions: boolean`, a fabryke wlasciwa dla sieci
      // wybiera samo SDK. Stalo tu wpisane recznie 0x0222ffA0...b5B0c1 z
      // komentarzem "Base Sepolia address" i bylo zle na dwa sposoby naraz:
      // adres mial zla sume kontrolna EIP-55 (viem `isAddress` go odrzuca,
      // wiec nie zostal skopiowany z eksploratora tylko przepisany z bledem),
      // a pod jego kanoniczna postacia nie ma bajtkodu ANI na Base Sepolia
      // (84532), ANI na Base (8453) - sprawdzone eth_getCode przez
      // scripts/verifyOnchainInventory.js. Nie da sie ustalic, jaki adres
      // mial tam byc, ale nie trzeba: pole i tak szlo przez spread, wiec
      // TypeScript go nie lapal, a SDK cicho je ignorowalo. Efekt byl taki,
      // ze przy `enableSpendPermissions: true` uprawnien NIGDY nie wlaczano,
      // a odpowiedz i tak zwracala `supportsSpendPermissions: true`.
      const smartAccount = await cdpClient.evm.createSmartAccount({
        owner: ownerAccount,
        enableSpendPermissions: wantsSpendPermissions,
      });

      return NextResponse.json({
        success: true,
        type: 'smart',
        address: smartAccount.address,
        ownerAddress: ownerAccount.address,
        supportsSpendPermissions: wantsSpendPermissions,
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
