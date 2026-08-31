import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ADMIN_ADDRESS } from '../../utils/firebase';
import { getSessionFromCookies } from '../../utils/auth/session';
import OpsConsole from './OpsConsole';
import OpsSignInGate from './OpsSignInGate';

/**
 * KONSOLA OPERATORA - /admin/ops
 *
 * === PO CO ===
 * Produkt ma jedenascie kontraktow na siedmiu lancuchach, dwa gorace klucze
 * i zewnetrznego facilitatora platnosci, i nikt tego nie oglada. Awarie tej
 * warstwy wygladaja identycznie jak wszystko inne: dziala, dopoki nagle nie.
 *
 * === BRAMKA JEST TU, NIE W KOMPONENCIE KLIENCKIM ===
 * Reszta app/admin/** decyduje o dostepie po stronie klienta (`address` z wagmi
 * porownany z ADMIN_ADDRESS). To chowa przyciski, ale nie chroni danych -
 * dane i tak przyjechalyby do przegladarki. Ta strona jest komponentem
 * SERWEROWYM i nie renderuje ANI JEDNEJ liczby, dopoki nie sprawdzi:
 *   1. czy jest wazna, podpisana sesja SIWE (httpOnly cookie, HMAC),
 *   2. czy adres z tej sesji to ADMIN_ADDRESS.
 * Sama konsola i tak pobiera dane z /api/admin/ops, ktore sprawdza to samo
 * jeszcze raz - bramka na stronie nie jest jedynym zamkiem.
 *
 * === DLACZEGO DWIE ROZNE ODMOWY ===
 * Sesja WAZNA, ale nie admina -> notFound(). Ktos zalogowany i tak dostaje
 * odpowiedz nie do odroznienia od nieistniejacej strony; 403 potwierdzalby,
 * ze cos tu jest.
 * BRAK sesji -> ekran z prosba o podpis. Adres w wagmi to nie to samo co sesja
 * serwerowa, wiec admin, ktory ma podlaczony portfel, ale nie podpisal jeszcze
 * SIWE, musi dostac droge dalej, a nie 404, ktorego nie umie sobie wytlumaczyc.
 * Ten ekran nie pokazuje zadnej danej operacyjnej - tylko przycisk podpisu.
 */

export const runtime = 'nodejs';
// Strona czyta cookie sesji. Bez tego Next probowalby ja prerenderowac.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator console',
  // Konsola nie ma prawa trafic do zadnego indeksu ani do podgladu linku.
  robots: { index: false, follow: false, nocache: true },
};

export default function OpsPage() {
  let sessionAddress: string | null = null;
  try {
    sessionAddress = getSessionFromCookies(cookies())?.address ?? null;
  } catch {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Blad konfiguracji ma
    // znaczyc "brak sesji", nigdy "sesja wazna".
    sessionAddress = null;
  }

  if (!sessionAddress) {
    return <OpsSignInGate />;
  }

  if (sessionAddress.toLowerCase() !== ADMIN_ADDRESS.toLowerCase()) {
    notFound();
  }

  return <OpsConsole />;
}
