/**
 * GET /api/auth/session
 *
 * PO CO: pozwala klientowi zapytac "kim jestem wedlug serwera?". Zwraca adres
 * z podpisanej sesji albo null. To jest endpoint informacyjny odpytywany przez
 * UI, a NIE bramka autoryzacyjna - dlatego zawsze odpowiada statusem 200.
 * Prawdziwa autoryzacja ma sie dziac w trasach, ktore cos zmieniaja, przez
 * getSessionFromCookies().
 *
 * ROLLOWANIE: sesja zyje 2 godziny i jest tu odnawiana, gdy zuzyla polowe
 * swojego zycia. Dzieki temu aktywny uzytkownik nie jest wylogowywany co dwie
 * godziny, a sesja porzucona (np. po odlaczeniu portfela na wspoldzielonym
 * komputerze) wygasa w godziny zamiast w tydzien. Sesja jest bezstanowa, wiec
 * krotki TTL jest jedynym mechanizmem jej wygaszania.
 *
 * TOKEN FIREBASE: trasa mintuje go razem z odpowiedzia, bo sesja Firebase NIE
 * przezywa przeladowania strony - `signInWithCustomToken` trzeba wywolac od
 * nowa przy kazdym montowaniu klienta. Bez tego `request.auth` w regulach
 * Firestore wracalo do `null` po kazdym F5 i cala reszta lancucha
 * (SIWE -> weryfikacja on-chain -> uid = adres portfela) nie mialaby zadnego
 * efektu poza pierwsza minuta po zalogowaniu.
 *
 * Mintujemy WYLACZNIE dla adresu, ktory juz jest w podpisanej sesji - czyli
 * dla kogos, czyj podpis serwer wczesniej zweryfikowal on-chain. Ta trasa nie
 * jest nowa droga uwierzytelnienia.
 *
 * CZEGO JESZCZE NIE ROBI:
 * - nikt tej trasy jeszcze nie wola z glownego przeplywu; klient nadal czyta
 *   adres z localStorage (app/basechat/page.tsx),
 * - nie zwraca zadnego profilu ani uprawnien - tylko adres.
 */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { mintFirebaseToken } from '../../../utils/auth/firebaseAdmin';
import {
  getSessionFromCookies,
  shouldRollSession,
  rollSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../../../utils/auth/session';

// getSessionFromCookies uzywa node:crypto
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getSessionFromCookies(cookies());
    if (!session) {
      return NextResponse.json({ address: null });
    }

    // Swiezy token logujacy do Firebase dla adresu z sesji. Zwraca null, gdy
    // konto uslugowe nie jest skonfigurowane - wtedy klient po prostu zostaje
    // anonimowy wobec Firestore, tak jak dotad.
    const firebaseToken = await mintFirebaseToken(session.address);

    // Sesja zuzyla polowe zycia - wystawiamy swiezy token. To NIE jest ponowne
    // uwierzytelnienie, tylko przesuniecie okna waznosci dla aktywnego klienta.
    if (shouldRollSession(session)) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const response = NextResponse.json({
        address: session.address,
        chainId: session.chainId,
        expiresAt: nowSeconds + SESSION_TTL_SECONDS,
        firebaseToken,
      });
      response.cookies.set(SESSION_COOKIE, rollSession(session, nowSeconds), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL_SECONDS,
        path: '/',
      });
      return response;
    }

    return NextResponse.json({
      address: session.address,
      chainId: session.chainId,
      expiresAt: session.expiresAt,
      firebaseToken,
    });
  } catch (error) {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Failujemy zamknieto -
    // brak konfiguracji ma oznaczac "brak sesji", nigdy "sesja wazna".
    console.error('[auth/session] Nie udalo sie odczytac sesji:', error);
    return NextResponse.json({ address: null });
  }
}
