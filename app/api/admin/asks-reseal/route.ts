/**
 * POST /api/admin/asks-reseal - pieczetowanie Askow sprzed pieczeci. TYLKO DLA ADMINA.
 *
 * === PO CO ===
 * Aski zalozone przed wdrozeniem pieczeci nie maja asks/{id}/sealed/state,
 * a ich lustro (status, accepted, acceptedCount...) mogla zapisac kazda
 * przegladarka. Ta trasa ustala prawde z DOWODOW i zapisuje ja w sciezkach
 * zamknietych dla przegladarki (stan, rekordy przyjec, rejestr wyplat):
 *   - escrow: escrowFor(author, askId) (nagrobek, nie hash z dokumentu),
 *     zamkniecie z logu AskResolved/AskExpired z kluczem Aska,
 *   - przyjecia: przelew USDC od autora do odpowiadajacego po czasie
 *     odpowiedzi albo SeatAwarded; slabe i brakujace dowody NIE sa
 *     resetowane automatycznie - czekaja na decyzje wlasciciela.
 * Logika decyzji: app/utils/asks/resealCore.ts. I/O: ./resealEngine.ts.
 *
 * === BRAMKA ===
 * Sesja SIWE rowna ADMIN_ADDRESS (../isAdmin.ts), inaczej 403. Cialo musi
 * byc JSON-em (415 inaczej) - formularz z obcej strony nie przejdzie, a
 * cookie sesji i tak ma SameSite=Lax.
 *
 * === UZYCIE (konsola przegladarki, zalogowany jako admin) ===
 *   suchy bieg:  await (await fetch('/api/admin/asks-reseal', {method: 'POST',
 *                  credentials: 'include', headers: {'Content-Type': 'application/json'},
 *                  body: '{}'})).json()
 *   kolejna strona: body {"cursor": "<nextCursor>"}
 *   zapis:       body {"apply": true, "trustWeak": [...], "resetForged": [...],
 *                  "resolveHashes": {"askId": "0x..."}, "deleteUnverified": [...],
 *                  "repairInvalid": [...]}
 * Pola: apply (domyslnie false = nic nie zapisuje), cursor, limit (1-25,
 * domyslnie 10). trustWeak/resetForged to id ODPOWIEDZI, reszta to id ASKOW.
 *
 * === ZAPISY ===
 * Jedna transakcja na Aska; przed zapisem transakcja czyta wszystko jeszcze
 * raz i porownuje z tym, na czym oparto plan (odciski). Ponowny przebieg po
 * zapisie nie ma nic do zrobienia (idempotencja). Aski z nierozstrzygnietymi
 * slabymi/brakujacymi dowodami zostaja BEZ pieczeci (needsDecision).
 *
 * UWAGA: dev i preview pisza do PRODUKCYJNEGO Firestore (jeden projekt
 * basebook-e0ae6). "apply" z localhost zapisuje na produkcji.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { openAskStore } from '../../asks/askStore';
import { parseResealRequest } from '../../../utils/asks/resealCore';
import { isAdminRequest } from '../isAdmin';
import { defaultResealDeps, runReseal } from './resealEngine';

// Sesja (node:crypto), firebase-admin i RPC - tylko Node.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Kazdy Ask to kilka odczytow RPC; strona konczy sie przed limitem funkcji.
export const maxDuration = 60;

/** Po tylu ms nie zaczynamy kolejnego Aska - reszta idzie w nextCursor. */
const TIME_BUDGET_MS = 40_000;

const NO_STORE = { 'Cache-Control': 'no-store, private' } as const;

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json(
      { error: 'Only the admin can run the Ask reseal.', code: 'forbidden' },
      { status: 403, headers: NO_STORE }
    );
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return NextResponse.json(
      { error: 'Send the request body as application/json.', code: 'unsupported_media_type' },
      { status: 415, headers: NO_STORE }
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim() !== '') body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'The body is not valid JSON.', code: 'invalid_request' }, { status: 400, headers: NO_STORE });
  }

  const parsed = parseResealRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error, code: 'invalid_request' }, { status: 400, headers: NO_STORE });
  }

  // Brak Firebase Admin albo klucza pieczeci: nic nie da sie ani sprawdzic,
  // ani zapisac - zamknieto.
  const store = await openAskStore();
  if (!store) {
    return NextResponse.json(
      { error: 'The Ask store is unavailable (Firebase Admin or the seal key is missing).', code: 'store_unavailable' },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const report = await runReseal(store, parsed.request, defaultResealDeps(TIME_BUDGET_MS));
    console.info(
      `[admin/asks-reseal] ${report.dryRun ? 'Suchy bieg' : 'ZAPIS'}: askow=${report.processed}, ` +
        `stanow=${report.sealed.length}, przyjec=${report.acceptances.length}, ` +
        `decyzji=${report.needsDecision.length}, anomalii=${report.anomalies.length}, kursor=${report.nextCursor ?? '-'}`
    );
    return NextResponse.json({ ...report, signingKid: store.key.kid }, { headers: NO_STORE });
  } catch (error) {
    // Tu wpada tylko awaria calego przebiegu (np. listing Askow). Bledy
    // pojedynczych Askow sa w raporcie jako anomalie.
    console.error('[admin/asks-reseal] Przebieg nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'The reseal run failed before it could report anything. Try again; a re-run is safe.', code: 'reseal_failed' },
      { status: 500, headers: NO_STORE }
    );
  }
}
