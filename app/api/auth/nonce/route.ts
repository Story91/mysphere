/**
 * GET /api/auth/nonce
 *
 * PO CO: wydaje jednorazowy nonce, ktory klient ma wkleic do wiadomosci SIWE
 * przed podpisaniem. Nonce jest zapisywany w httpOnly cookie, wiec serwer moze
 * pozniej (w /api/auth/verify) sprawdzic, ze podpisana wiadomosc dotyczy TEGO
 * wyzwania, a nie jest odtworzeniem starego podpisu.
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nikt tej trasy jeszcze nie wola; UI (SignInWithBaseButton w
 *   app/basechat/prelogin/MockFeed.tsx) nadal tylko loguje adres do konsoli,
 * - nonce zyje wylacznie w cookie - nie ma serwerowego rejestru wydanych nonce,
 *   wiec pojedyncza przegladarka ma naraz jedno aktywne wyzwanie,
 * - brak rate limitingu.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { NONCE_COOKIE } from '../../../utils/auth/session';

// node:crypto nie dziala na edge
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Czas zycia nonce w sekundach (10 minut) - tyle uzytkownik ma na podpisanie. */
const NONCE_TTL_SECONDS = 60 * 10;

export async function GET() {
  const nonce = crypto.randomBytes(16).toString('hex');

  const response = NextResponse.json({ nonce });

  response.cookies.set({
    name: NONCE_COOKIE,
    value: nonce,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: NONCE_TTL_SECONDS,
    path: '/',
  });

  return response;
}
