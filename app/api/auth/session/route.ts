/**
 * GET /api/auth/session
 *
 * PO CO: pozwala klientowi zapytac "kim jestem wedlug serwera?". Zwraca adres
 * z podpisanej sesji albo null. To jest endpoint informacyjny odpytywany przez
 * UI, a NIE bramka autoryzacyjna - dlatego zawsze odpowiada statusem 200.
 * Prawdziwa autoryzacja ma sie dziac w trasach, ktore cos zmieniaja, przez
 * getSessionFromCookies().
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nikt tej trasy jeszcze nie wola; klient nadal czyta adres z localStorage
 *   (app/basechat/page.tsx),
 * - nie odswieza (nie rolluje) sesji, ktora zaraz wygasa,
 * - nie zwraca zadnego profilu ani uprawnien - tylko adres.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionFromCookies } from '../../../utils/auth/session';

// getSessionFromCookies uzywa node:crypto
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getSessionFromCookies(cookies());
    if (!session) {
      return NextResponse.json({ address: null });
    }
    return NextResponse.json({
      address: session.address,
      chainId: session.chainId,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Failujemy zamknieto -
    // brak konfiguracji ma oznaczac "brak sesji", nigdy "sesja wazna".
    console.error('[auth/session] Nie udalo sie odczytac sesji:', error);
    return NextResponse.json({ address: null });
  }
}
