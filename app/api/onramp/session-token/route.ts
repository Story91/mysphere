import { NextRequest, NextResponse } from 'next/server';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

/**
 * Mintuje session token dla Coinbase Onramp.
 *
 * Po co: OnchainKit wylacza <WalletDropdownFundLink> (pointer-events-none),
 * kiedy portfel NIE jest Coinbase Smart Walletem i nie podano sessionTokena -
 * dla zwyklego EOA link "Add funds" byl wiec martwy z definicji, nie przez blad
 * w naszym kodzie. Session token trzeba wygenerowac po stronie serwera, bo
 * wymaga sekretu CDP, ktory nie moze trafic do bundle'a.
 *
 * Wymaga w env: CDP_API_KEY_ID, CDP_API_KEY_SECRET (oba juz sa uzywane przez
 * trasy /api/cdp/*). Dodatkowo w CDP Portal musi byc wlaczony Onramp
 * i dodana domena aplikacji do allowlisty - inaczej Coinbase odrzuci request.
 */

const CDP_HOST = 'api.developer.coinbase.com';
const CDP_PATH = '/onramp/v1/token';

export async function POST(request: NextRequest) {
  try {
    const { address, blockchain = 'base' } = await request.json();

    if (typeof address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Podaj poprawny adres portfela.' }, { status: 400 });
    }

    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      // Brak kluczy to konfiguracja, nie awaria - klient ma po prostu ukryc opcje.
      return NextResponse.json({ error: 'Onramp nie jest skonfigurowany.' }, { status: 501 });
    }

    const jwt = await generateJwt({
      apiKeyId,
      apiKeySecret,
      requestMethod: 'POST',
      requestHost: CDP_HOST,
      requestPath: CDP_PATH,
      expiresIn: 120,
    });

    const response = await fetch(`https://${CDP_HOST}${CDP_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        addresses: [{ address, blockchains: [blockchain] }],
        assets: ['ETH', 'USDC'],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Onramp session token rejected:', response.status, detail);
      return NextResponse.json(
        { error: 'Coinbase odrzucil zadanie o session token.' },
        { status: 502 }
      );
    }

    const data = await response.json();
    const token = data?.token ?? data?.data?.token;

    if (!token) {
      console.error('Onramp response without token:', data);
      return NextResponse.json({ error: 'Brak tokenu w odpowiedzi Coinbase.' }, { status: 502 });
    }

    return NextResponse.json({ token });
  } catch (error) {
    console.error('Onramp session token error:', error);
    return NextResponse.json({ error: 'Nie udalo sie utworzyc sesji Onramp.' }, { status: 500 });
  }
}
