/**
 * GET /api/admin/ops - stan warstwy onchain produktu. TYLKO DLA ADMINA.
 *
 * === BRAMKA ===
 * Dwa warunki, oba konieczne:
 *   1. wazna, PODPISANA sesja SIWE (httpOnly cookie, HMAC),
 *   2. adres z tej sesji rowny ADMIN_ADDRESS z app/utils/firebase.ts.
 *
 * Adres NIE moze pochodzic z ciala zadania, z naglowka ani z query - tylko
 * z sesji, ktorej podpis serwer sam wystawil po weryfikacji podpisu portfela
 * (app/api/auth/verify). Reszta app/admin/** sprawdza admina PO STRONIE
 * KLIENTA (address z wagmi === ADMIN_ADDRESS), co wystarcza do chowania
 * przyciskow, ale nie jest zadna ochrona danych. Ta trasa wypuszcza adresy
 * portfeli infrastruktury i progi alarmow, wiec musi byc sprawdzana na serwerze.
 *
 * Ta sama odpowiedz dla nieadmina i dla niezalogowanego: 404, bez slowa o tym,
 * ze taka trasa istnieje. 403 potwierdzalby, ze pod tym adresem cos jest.
 *
 * === CZEGO TA TRASA NIE ROBI ===
 * Nie ma metody POST. Nie da sie nia niczego wyslac, podpisac ani odebrac.
 * Wszystkie odczyty w collect.ts to eth_call / eth_getBalance / eth_getCode.
 *
 * === ODSWIEZANIE ===
 * ?refresh=hot  - wymus swiezy odczyt gazu / escrow / prowizji / facilitatora
 * ?refresh=all  - dodatkowo inwentarz bajtkodu (8 lancuchow, drozsze)
 * bez parametru - z pamieci podrecznej, jesli jest swieza.
 * Nawet wymuszenie respektuje dolny odstep (patrz MIN_FORCE_INTERVAL_MS).
 */

import { NextRequest, NextResponse } from 'next/server';

import { ADMIN_ADDRESS } from '../../../utils/firebase';
import { getSessionFromCookies } from '../../../utils/auth/session';
import { OPS_TIMINGS, collectOpsReport, type RefreshScope } from '../../../utils/ops/collect';

// getSessionFromCookies uzywa node:crypto; collect.ts wola RPC.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Odpowiedz opisuje infrastrukture jednego konkretnego admina. Samo
 * `force-dynamic` mowi tylko tyle, ze Next nie zbuduje jej statycznie -
 * nie zabrania trzymac jej zadnemu posrednikowi po drodze.
 */
const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

function isAdminRequest(request: NextRequest): boolean {
  try {
    const session = getSessionFromCookies(request.cookies);
    if (!session) return false;
    return session.address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
  } catch {
    // Najczestszy powod: brak AUTH_SESSION_SECRET. Failujemy zamknieto -
    // blad konfiguracji ma znaczyc "nie admin", nigdy "admin".
    return false;
  }
}

function parseScope(request: NextRequest): RefreshScope {
  const raw = request.nextUrl.searchParams.get('refresh');
  if (raw === 'all') return 'all';
  if (raw === 'hot') return 'hot';
  return 'none';
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  try {
    const report = await collectOpsReport(parseScope(request));
    return NextResponse.json({ ...report, timings: OPS_TIMINGS }, { headers: NO_STORE });
  } catch (error) {
    // Tu wpada tylko awaria calego przebiegu (np. blad programisty), bo kazdy
    // pojedynczy odczyt ma juz wlasny stan "nie udalo sie sprawdzic". Zwracamy
    // 500 i zdanie - klient ma z czego zrobic przycisk ponowienia, a nie
    // udawac pusta konsole.
    console.error('[admin/ops] Przebieg zbierania stanu nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'The status run failed before it could report anything. Try again.' },
      { status: 500, headers: NO_STORE }
    );
  }
}
