/**
 * POST /api/auth/verify
 *
 * PO CO: to jest brakujacy krok calego logowania. Dzis podpis z
 * SignInWithBaseButton nie jest nigdzie sprawdzany (handler w
 * app/basechat/prelogin/MockFeed.tsx tylko loguje adres), wiec kazdy moze
 * podac dowolny adres. Ta trasa bierze wiadomosc SIWE + podpis, sprawdza
 * nonce, weryfikuje podpis onchain i dopiero wtedy wystawia podpisane
 * cookie sesji.
 *
 * KLUCZOWE: podpis weryfikujemy przez publicClient.verifyMessage z viem,
 * a nie przez czyste verifyMessage z 'viem/utils'. Wersja na publicClient
 * obsluguje ERC-1271 i ERC-6492, czyli podpisy smart walletow
 * (Coinbase Smart Wallet / Base Account) - a to jest tutaj GLOWNY przypadek
 * uzycia. Wersja offline odrzucalaby te podpisy jako niepoprawne.
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nikt tej trasy jeszcze nie wola - UI nie jest podpiete,
 * - nie parsuje i nie waliduje pozostalych pol SIWE (domain, uri, version,
 *   "Issued At", "Expiration Time", "Not Before") - sprawdzamy tylko nonce
 *   i Chain ID; pelna walidacja domeny to nastepny krok,
 * - brak rate limitingu i brak logowania prob logowania.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  createSession,
  type SessionPayload,
} from '../../../utils/auth/session';

// createSession uzywa node:crypto
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Klient tylko do odczytu - potrzebny, bo weryfikacja ERC-1271/6492 wymaga
// wolania kontraktu portfela. http() bez argumentu bierze domyslny RPC lancucha.
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.CDP_RPC_URL),
});

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HEX_REGEX = /^0x[a-fA-F0-9]+$/;

interface VerifyRequestBody {
  message?: unknown;
  signature?: unknown;
  address?: unknown;
}

/**
 * Wyciaga "Chain ID" z wiadomosci SIWE. Zwraca null, gdy pola nie ma.
 * Potrzebne, bo podpis weryfikujemy wylacznie na Base - gdyby wiadomosc
 * deklarowala inny lancuch, wynik weryfikacji nie znaczylby tego, co mysli klient.
 */
function parseChainId(message: string): number | null {
  const match = message.match(/^Chain ID:\s*(\d+)\s*$/m);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Sprawdza, ze wiadomosc naprawde niesie nasz nonce.
 * Gdy wiadomosc ma pole "Nonce:", wymagamy dokladnej zgodnosci; w przeciwnym
 * razie wystarczy, ze nonce w wiadomosci wystepuje.
 */
function messageCarriesNonce(message: string, nonce: string): boolean {
  const match = message.match(/^Nonce:\s*(\S+)\s*$/m);
  if (match) return match[1] === nonce;
  return message.includes(nonce);
}

export async function POST(request: NextRequest) {
  try {
    let body: VerifyRequestBody;
    try {
      body = (await request.json()) as VerifyRequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { message, signature, address } = body;

    if (typeof message !== 'string' || message.length === 0) {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 });
    }
    if (typeof signature !== 'string' || !HEX_REGEX.test(signature)) {
      return NextResponse.json({ error: 'Missing or malformed signature' }, { status: 400 });
    }
    if (typeof address !== 'string' || !ADDRESS_REGEX.test(address)) {
      return NextResponse.json({ error: 'Missing or malformed address' }, { status: 400 });
    }

    // Nonce musi pochodzic z naszego wczesniejszego GET /api/auth/nonce.
    const nonce = request.cookies.get(NONCE_COOKIE)?.value;
    if (!nonce) {
      return NextResponse.json({ error: 'Missing or expired nonce' }, { status: 400 });
    }

    if (!messageCarriesNonce(message, nonce)) {
      return NextResponse.json({ error: 'Nonce mismatch' }, { status: 401 });
    }

    // Weryfikujemy na Base, wiec wiadomosc deklarujaca inny lancuch odrzucamy.
    const declaredChainId = parseChainId(message);
    if (declaredChainId !== null && declaredChainId !== base.id) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 401 });
    }

    // publicClient.verifyMessage - ERC-6492 / ERC-1271, czyli smart wallety.
    let isValid = false;
    try {
      isValid = await publicClient.verifyMessage({
        address: address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });
    } catch (verificationError) {
      // Szczegoly kryptograficzne / RPC zostaja na serwerze.
      console.error('[auth/verify] Weryfikacja podpisu rzucila wyjatkiem:', verificationError);
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + SESSION_TTL_SECONDS;

    const payload: SessionPayload = {
      // Normalizacja do malych liter, zeby porownania adresow byly przewidywalne.
      address: address.toLowerCase() as `0x${string}`,
      chainId: base.id,
      issuedAt,
      expiresAt,
    };

    const token = createSession(payload);

    const response = NextResponse.json({ address: payload.address, expiresAt });

    // Nonce jest jednorazowy - po udanym uzyciu znika.
    response.cookies.set({
      name: NONCE_COOKIE,
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0,
      path: '/',
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
      path: '/',
    });

    return response;
  } catch (error) {
    // Tu wpada m.in. brak AUTH_SESSION_SECRET - klient nie musi wiedziec, co dokladnie.
    console.error('[auth/verify] Nieoczekiwany blad:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
