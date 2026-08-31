/**
 * POST /api/asks/[id]/accept - autor przyjmuje JEDNA odpowiedz i zapisuje
 * przy niej DOWOD wyplaty.
 *
 * === PO CO TA TRASA ISTNIEJE ===
 * `acceptAnswer` w app/utils/asks/asks.ts nie mial ANI JEDNEGO wywolania w calym
 * repo. Ask dawal sie zalozyc i dawal sie odpowiedziec, a potem konczyl sie
 * slepym zaulkiem: odpowiedzi lezaly zapieczetowane i nic nie moglo ich przyjac.
 * To jest brakujace ogniwo, a nie nowa mechanika.
 *
 * === DLACZEGO HASH WYPLATY JEST WYMAGANY, I DLACZEGO SPRAWDZANY ===
 * Bez hasha "przyjeta" jest samym slowem. Ale sam hash to tez tylko 66 znakow,
 * ktore da sie wpisac z palca - dlatego serwer NIE WIERZY klientowi i sam patrzy
 * na lancuch przez `verifyBasePayment`: transakcja musi byc potwierdzona,
 * niecofnieta i musi zawierac transfer USDC o wartosci co najmniej `perAnswer`
 * NA ADRES ODPOWIADAJACEGO. Ta sama weryfikacja chroni juz tip-to-unlock
 * (app/api/unlock/**), wiec nie jest wymyslona tutaj.
 *
 * Kolejnosc jest jedyna mozliwa: NAJPIERW przelew, POTEM ta trasa. Escrow nie
 * istnieje (patrz app/utils/asks/types.ts), wiec platforma nie ma czym zaplacic
 * za autora - moze wylacznie sprawdzic, ze autor zaplacil sam.
 *
 * === CZEGO TA TRASA NIE ROBI ===
 * Nie rozstrzyga Aska. Przyjecie odpowiedzi i zamkniecie Aska to dwie rozne
 * decyzje - autor moze przyjac trzy odpowiedzi z pieciu miejsc i zamknac dopiero
 * potem (POST /api/asks/[id]/resolve).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAddress } from 'viem';
import { acceptAnswer, getAnswer, getAsk } from '../../../../utils/asks/asks';
import { notifyAskPayout } from '../../../../utils/friends/notifications';
import { isValidTxHash, normalizeAddress } from '../../../../utils/monetization/types';
import { verifyBasePayment } from '../../../../utils/monetization/verifyPayment';
import { sessionAddress } from '../../identity';

// getSessionFromCookies uzywa node:crypto, viem i firebase nie dzialaja na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Odpowiedz mowi o pieniadzach konkretnego czlowieka - nigdzie jej nie cache'ujemy. */
const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

interface AcceptBody {
  answerId?: unknown;
  payoutTxHash?: unknown;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = params.id?.trim();
  if (!askId) {
    return NextResponse.json({ error: 'Missing Ask id' }, { status: 400, headers: NO_STORE_PRIVATE });
  }

  // Adres z ciala zadania NIE JEST tozsamoscia. Tylko podpisana sesja SIWE mowi,
  // kto to jest - inaczej kazdy przyjmowalby odpowiedzi na cudzym Asku i psul
  // cudzy `resolve rate`.
  const viewer = sessionAddress(request);
  if (!viewer) {
    return NextResponse.json(
      { error: 'Sign in with your wallet to accept an answer.', code: 'session_required' },
      { status: 401, headers: NO_STORE_PRIVATE }
    );
  }

  let body: AcceptBody;
  try {
    body = (await request.json()) as AcceptBody;
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  const answerId = typeof body.answerId === 'string' ? body.answerId.trim() : '';
  if (!answerId) {
    return NextResponse.json(
      { error: 'Missing answerId' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  const payoutTxHash = typeof body.payoutTxHash === 'string' ? body.payoutTxHash.trim() : '';
  if (!isValidTxHash(payoutTxHash)) {
    return NextResponse.json(
      {
        error: 'A payout transaction hash is required to accept an answer.',
        code: 'payout_hash_required',
      },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  let ask;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[api/asks/accept] Odczyt Aska nie powiodl sie:', error);
    // Nieudany odczyt to NIE "nie ma takiego Aska". 404 bylby oswiadczeniem
    // o nieistnieniu zasobu wydanym w chwili niewiedzy.
    return NextResponse.json(
      { error: 'Failed to read Ask', code: 'ask_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (!ask) {
    return NextResponse.json({ error: 'Ask not found' }, { status: 404, headers: NO_STORE_PRIVATE });
  }

  if (normalizeAddress(ask.author) !== normalizeAddress(viewer)) {
    return NextResponse.json(
      { error: 'Only the author of this Ask can accept an answer.', code: 'not_ask_author' },
      { status: 403, headers: NO_STORE_PRIVATE }
    );
  }

  // Rozstrzygniecie jest jednokierunkowe i zamyka rozliczenie. Po nim nie
  // dopisujemy juz nikogo do miejsc, ktore ogloszono jako rozdane.
  if (ask.status === 'resolved') {
    return NextResponse.json(
      { error: 'This Ask is already resolved.', code: 'ask_resolved' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  // UWAGA: po terminie przyjmowac WOLNO. `expired` znaczy "termin minal bez
  // rozstrzygniecia", a zaplacenie z opoznieniem jest lepsze niz niezaplacenie
  // wcale. Nowych odpowiedzi juz wtedy nie przyjmujemy (POST /api/asks/answers
  // odrzuca je z 409) - zamkniety jest naplyw, nie wyplata.

  if (ask.acceptedCount >= ask.seats) {
    return NextResponse.json(
      {
        error: `All ${ask.seats} seats on this Ask are taken.`,
        code: 'no_seats_left',
        acceptedCount: ask.acceptedCount,
        seats: ask.seats,
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  let answer;
  try {
    answer = await getAnswer(answerId);
  } catch (error) {
    console.error('[api/asks/accept] Odczyt odpowiedzi nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'Failed to read the answer', code: 'answer_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  if (!answer || answer.askId !== askId) {
    // Odpowiedz spod innego Aska jest dla tego Aska nieistniejaca - i tak samo
    // ma sie czytac, zeby nie dalo sie zgadywac cudzych identyfikatorow.
    return NextResponse.json(
      { error: 'Answer not found on this Ask', code: 'answer_not_found' },
      { status: 404, headers: NO_STORE_PRIVATE }
    );
  }

  if (answer.accepted) {
    return NextResponse.json(
      { error: 'This answer is already accepted.', code: 'already_accepted' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const payee = normalizeAddress(answer.author);
  if (!payee || payee === normalizeAddress(ask.author)) {
    // Nie da sie zaplacic samemu sobie za wlasny Ask - to byloby przelanie
    // pieniedzy z reki do reki po to, zeby podniesc sobie `resolve rate`.
    return NextResponse.json(
      { error: 'This answer has no payable author.', code: 'invalid_payee' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const perAnswer = ask.perAnswer;
  // `NaN <= 0` to `false`, wiec sam warunek "kwota nie jest dodatnia" wpuscilby
  // tu smiec. Najpierw pytamy, czy to w ogole jest liczba.
  if (!Number.isFinite(perAnswer) || perAnswer <= 0) {
    return NextResponse.json(
      { error: 'This Ask has no payable amount per answer.', code: 'invalid_per_answer' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOWOD WYPLATY - sprawdzany na lancuchu, nie przyjmowany na slowo   */
  /* ---------------------------------------------------------------- */

  // Weryfikator patrzy na Base mainnet. Ask w innej sieci albo w innym tokenie
  // ODRZUCAMY zamiast zapisac hash, ktorego nikt nie sprawdzil - "przyjeta bez
  // dowodu" jest dokladnie tym stanem, ktorego ten produkt nie moze produkowac
  // (patrz `acceptedWithoutProof` w types.ts). Dzis kazdy Ask powstaje jako
  // USDC na Base (createAsk), wiec ten warunek niczego zywego nie blokuje.
  if (ask.network !== 'base' || ask.token !== 'USDC') {
    return NextResponse.json(
      {
        error: `Payouts can only be verified for USDC on Base. This Ask is ${ask.token} on ${ask.network}.`,
        code: 'unverifiable_network',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const verification = await verifyBasePayment({
    txHash: payoutTxHash,
    expectedTo: payee,
    // Stawka jest zapisana z dokladnoscia do centa (perAnswerFor dzieli w dol),
    // wiec dwa miejsca po przecinku oddaja ja bez straty.
    expectedAmount: perAnswer.toFixed(2),
    token: 'USDC',
  });

  if (!verification.ok) {
    // Transakcja cofnieta, nieznaleziona albo bez transferu do odpowiadajacego.
    // 409, a nie 400: cialo zadania jest poprawne, to STAN LANCUCHA nie zgadza
    // sie z tym, co zadanie twierdzi. Autor moze ponowic z tym samym hashem, gdy
    // blok sie zamknie - nic nie zostalo zapisane i nic nie przepadlo.
    return NextResponse.json(
      { error: verification.error, code: 'payout_unverified' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  // Transfer ERC-20 zawsze zostawia log `Transfer`, wiec przy USDC 'strict' jest
  // jedynym wynikiem, ktory ma prawo tu dojsc. Cokolwiek slabszego znaczyloby,
  // ze odbiorcy i kwoty NIE potwierdzono - a wtedy hash nie jest dowodem.
  if (verification.level !== 'strict') {
    return NextResponse.json(
      {
        error:
          'The payout could not be matched to this answer author and amount, so it is not proof of payment.',
        code: 'payout_unverified',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  try {
    await acceptAnswer(askId, answerId, payoutTxHash, {
      // Kwota, token i siec zapisane W CHWILI przyjecia - podane wprost, zeby
      // nie kosztowaly drugiego odczytu Aska (patrz acceptAnswer).
      amount: perAnswer,
      token: ask.token,
      network: ask.network,
    });
  } catch (error) {
    console.error('[api/asks/accept] Zapis przyjecia nie powiodl sie:', error);
    // PIENIADZE JUZ POSZLY. Mowimy to wprost i mowimy, ze ponowienie jest
    // bezpieczne - inaczej autor zaplaciby drugi raz za te sama odpowiedz.
    return NextResponse.json(
      {
        error:
          'The payout is confirmed on-chain but recording it failed. Retry with the same transaction hash - you will not be charged again.',
        code: 'accept_write_failed',
        payoutTxHash,
      },
      { status: 500, headers: NO_STORE_PRIVATE }
    );
  }

  /* ---------------------------------------------------------------- */
  /* ODPOWIADAJACY DOWIADUJE SIE, ZE MU ZAPLACONO                      */
  /* ---------------------------------------------------------------- */

  /**
   * Przyjecie odpowiedzi bylo dotad nieme: autor placil, a odpowiadajacy nie
   * mial jak sie o tym dowiedziec inaczej niz zagladajac do wlasnego portfela
   * albo na /money. Ta sama luka co przy escrow, tylko tu pieniadze SA juz na
   * miejscu - transfer zostal potwierdzony na lancuchu kilka linii wyzej,
   * wiec zdanie brzmi inaczej niz przy escrow i nie kaze nic klikac.
   *
   * Powiadomienie NIE MOZE cofnac przyjecia: przelew jest na lancuchu, zapis
   * w bazie zrobiony. Blad idzie do logu, a odpowiedz i tak jest sukcesem.
   */
  try {
    await notifyAskPayout({
      // Sesja SIWE trzyma adresy malymi literami, a powiadomienia czyta
      // przegladarka adresem z wagmi (EIP-55). Bez checksumy dokument
      // wyladowalby pod kluczem, do ktorego nikt nie zaglada.
      recipientId: getAddress(answer.author),
      askAuthorId: getAddress(ask.author),
      askId,
      answerId,
      amount: perAnswer.toFixed(2),
      token: ask.token,
      // Bezposredni przelew: pieniadze sa juz w portfelu, nic nie trzeba odbierac.
      delivery: 'wallet',
      txHash: payoutTxHash,
    });
  } catch (error) {
    console.error('[api/asks/accept] Powiadomienie o wyplacie nie powiodlo sie:', error);
  }

  return NextResponse.json(
    {
      askId,
      answerId,
      accepted: true,
      payoutTxHash,
      payoutAmount: perAnswer,
      payoutToken: ask.token,
      payoutNetwork: ask.network,
      // Poziom weryfikacji jest jawny: 'strict' znaczy sprawdzonego odbiorce
      // i kwote, 'receipt-only' - tylko to, ze transakcja sie powiodla.
      verification: verification.level,
      acceptedCount: ask.acceptedCount + 1,
      seats: ask.seats,
    },
    { headers: NO_STORE_PRIVATE }
  );
}
