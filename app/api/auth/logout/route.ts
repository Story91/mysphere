/**
 * POST /api/auth/logout
 *
 * PO CO: kasuje cookie sesji, czyli wylogowuje po stronie serwera.
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nikt tej trasy jeszcze nie wola; wylogowanie w UI to nadal czyszczenie
 *   localStorage i disconnect z wagmi,
 * - sesja jest bezstanowa, wiec to kasuje TYLKO cookie w tej przegladarce -
 *   token skopiowany wczesniej gdzie indziej pozostaje wazny do expiresAt.
 *   Prawdziwe uniewaznianie wymagaloby listy odwolan po stronie serwera.
 */

import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '../../../utils/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });

  // maxAge 0 kasuje cookie; path musi sie zgadzac z tym uzytym przy ustawianiu.
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  });

  return response;
}
