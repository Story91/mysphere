/**
 * POST /api/asks/[id]/escrow-resolve - zapisuje rozstrzygniecie Aska, ktory ma
 * budzet na kontrakcie AskEscrow.
 *
 * === PO CO OSOBNA TRASA OBOK ./accept ===
 * ./accept sprawdza DOWOD PRZELEWU: `verifyBasePayment` szuka logu Transfer
 * USDC na adres odpowiadajacego. Przy escrow taki log NIE POWSTAJE. resolve()
 * nie wysyla tokenow - przypisuje salda (uzasadnienie przy `claimable`
 * w contracts/AskEscrow.sol), a tokeny wychodza dopiero przy claim(), ktore
 * moze zdarzyc sie za tydzien albo nigdy. Puszczenie tego przez ./accept
 * konczyloby sie odmowa "no USDC transfer found" przy calkowicie poprawnym
 * rozstrzygnieciu.
 *
 * Dlatego dowodem jest tutaj co innego: zdarzenia SeatAwarded z JEDNEJ
 * transakcji. Kazde niesie klucz escrow, adres odbiorcy, skrot identyfikatora
 * odpowiedzi i kwote - czyli dokladnie to, co trzeba, zeby przypisac wyplate do
 * konkretnej odpowiedzi. To jest ten sam poziom pewnosci co przy przelewie,
 * tylko czytany z innego logu.
 *
 * === CZEGO TA TRASA NIE PRZYJMUJE OD KLIENTA ===
 * WYLACZNIE hash transakcji. Lista zwyciezcow jest ODTWARZANA z lancucha:
 * serwer bierze wszystkie odpowiedzi tego Aska, liczy dla nich answerRef tym
 * samym odwzorowaniem co klient (askIdToBytes32 / answerIdToBytes32) i dopasowuje
 * do zdarzen. Gdyby lista przychodzila w ciele zadania, autor moglby oznaczyc
 * jako oplacona odpowiedz, ktorej kontrakt nic nie przyznal.
 *
 * === KOLEJNOSC ===
 * Transakcja NAJPIERW, ta trasa POTEM. Odwrotnie nie ma sensu: rozstrzygniecie
 * jest terminalne na lancuchu i to lancuch jest zrodlem prawdy.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createPublicClient, getAddress, http, parseEventLogs, type Hash } from 'viem';
import { base } from 'viem/chains';
import { acceptAnswer, getAnswerMeta, getAsk, resolveAsk } from '../../../../utils/asks/asks';
import { notifyAskPayout } from '../../../../utils/friends/notifications';
import {
  ASK_ESCROW_ABI,
  answerIdToBytes32,
  escrowDeployment,
  escrowKeyFor,
  perAnswerToUnits,
  unitsToAmount,
} from '../../../../utils/asks/escrow';
import { isValidTxHash, normalizeAddress } from '../../../../utils/monetization/types';
import { sessionAddress } from '../../identity';

// getSessionFromCookies uzywa node:crypto, viem i firebase nie dzialaja na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

/**
 * Escrow stoi na Base mainnet i tylko tam wagmi ma skonfigurowany lancuch, wiec
 * przegladarka nie ma jak wyslac resolve gdzie indziej. Klient RPC jest wlasny
 * (ten sam wzorzec co verifyPayment.ts) - tamten modul nie eksportuje swojego.
 */
const ESCROW_CHAIN_ID = base.id;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || process.env.CDP_RPC_URL),
});

interface Body {
  txHash?: unknown;
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = params.id?.trim();
  if (!askId) {
    return NextResponse.json({ error: 'Missing Ask id' }, { status: 400, headers: NO_STORE_PRIVATE });
  }

  const viewer = sessionAddress(request);
  if (!viewer) {
    return NextResponse.json(
      { error: 'Sign in with your wallet to record a resolve.', code: 'session_required' },
      { status: 401, headers: NO_STORE_PRIVATE }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE_PRIVATE });
  }

  const txHash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
  if (!isValidTxHash(txHash)) {
    return NextResponse.json(
      { error: 'A resolve transaction hash is required.', code: 'tx_hash_required' },
      { status: 400, headers: NO_STORE_PRIVATE }
    );
  }

  let ask;
  try {
    ask = await getAsk(askId);
  } catch (error) {
    console.error('[api/asks/escrow-resolve] Odczyt Aska nie powiodl sie:', error);
    // Nieudany odczyt to NIE "nie ma takiego Aska".
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
      { error: 'Only the author of this Ask can resolve it.', code: 'not_ask_author' },
      { status: 403, headers: NO_STORE_PRIVATE }
    );
  }

  if (ask.funding !== 'escrowed') {
    // Ask bez escrow rozliczany jest przelewami - kazdy ma wlasny dowod
    // i wlasna trase (./accept). Wpuszczenie go tutaj oznaczaloby odpowiedzi
    // jako oplacone bez ani jednego przelewu.
    return NextResponse.json(
      {
        error:
          'This Ask is not escrowed. Its answers are paid one by one from your own wallet, so each accept needs its own payout.',
        code: 'not_escrowed',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const deployment = escrowDeployment(ask.escrowChainId ?? ESCROW_CHAIN_ID);
  if (!deployment || deployment.chainId !== ESCROW_CHAIN_ID) {
    return NextResponse.json(
      {
        error: 'This Ask points at a network where we cannot read the escrow contract.',
        code: 'escrow_network_unsupported',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOWOD Z LANCUCHA                                                  */
  /* ---------------------------------------------------------------- */

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hash });
  } catch {
    return NextResponse.json(
      {
        error: 'That transaction is not on Base yet. Wait for it to confirm and try again.',
        code: 'tx_not_found',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  // Ta sama zasada, ktora naprawiono kiedys w TipButton: transakcja moze wejsc
  // na lancuch i sie cofnac. Cofnieta nikogo nie oplacila.
  if (receipt.status !== 'success') {
    return NextResponse.json(
      { error: 'That transaction reverted on-chain. Nobody was awarded anything.', code: 'tx_reverted' },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  const expectedKey = escrowKeyFor(ask.author, askId).toLowerCase();
  const seatEvents = parseEventLogs({
    abi: ASK_ESCROW_ABI,
    eventName: 'SeatAwarded',
    // Tylko logi SAMEGO kontraktu escrow. Bez tego filtra dowolny kontrakt
    // mogl by wyemitowac zdarzenie o tym samym ksztalcie.
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === deployment.address.toLowerCase()
    ),
  }).filter((event) => event.args.key.toLowerCase() === expectedKey);

  if (seatEvents.length === 0) {
    return NextResponse.json(
      {
        error:
          'That transaction does not award any seat on this Ask. Nothing was recorded - check that you sent the resolve from the wallet that funded it.',
        code: 'no_seats_awarded',
      },
      { status: 409, headers: NO_STORE_PRIVATE }
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOPASOWANIE ZDARZEN DO ODPOWIEDZI                                 */
  /* ---------------------------------------------------------------- */

  let answers;
  try {
    answers = await getAnswerMeta(askId);
  } catch (error) {
    console.error('[api/asks/escrow-resolve] Odczyt odpowiedzi nie powiodl sie:', error);
    return NextResponse.json(
      { error: 'Failed to read the answers on this Ask', code: 'answers_unavailable' },
      { status: 503, headers: NO_STORE_PRIVATE }
    );
  }

  // answerRef -> odpowiedz. Skrot liczymy TYM SAMYM helperem, ktorego uzywa
  // klient przy skladaniu transakcji - jedno odwzorowanie, jedno zrodlo prawdy.
  const byRef = new Map(answers.map((answer) => [answerIdToBytes32(answer.id).toLowerCase(), answer]));
  const expectedPerAnswer = perAnswerToUnits(ask.perAnswer);

  const recorded: string[] = [];
  const alreadyAccepted: string[] = [];
  const unmatched: string[] = [];
  const failed: string[] = [];

  /**
   * Kogo trzeba zawiadomic, ze ma pieniadze do odebrania.
   *
   * Zbieramy TYLKO odpowiedzi zapisane w tym przebiegu. Ponowienie z tym samym
   * hashem (trasa jest na to odporna) trafia w `alreadyAccepted` i NIE wysyla
   * drugiego powiadomienia o tych samych pieniadzach.
   *
   * Kwota bierze sie ze ZDARZENIA, nie z `ask.perAnswer`: kontrakt mogl
   * przyznac wiecej niz stawka (warunek wyzej odrzuca tylko mniej), a
   * powiadomienie ma mowic te kwote, ktora naprawde czeka na claim().
   */
  const toNotify: Array<{ recipient: string; answerId: string; amount: string }> = [];

  for (const event of seatEvents) {
    const answer = byRef.get(event.args.answerRef.toLowerCase());
    if (!answer) {
      // Zdarzenie wskazuje odpowiedz, ktorej w tym Asku nie ma. Nie jest to
      // powod do odrzucenia calosci - reszta zdarzen jest poprawna - ale musi
      // byc widoczne w odpowiedzi, a nie przemilczane.
      unmatched.push(event.args.answerRef);
      continue;
    }
    if (normalizeAddress(answer.author) !== normalizeAddress(event.args.recipient)) {
      // Kontrakt zaplacil komu innemu niz autor tej odpowiedzi. Nie oznaczamy
      // jej jako przyjetej - to nie jest jej wyplata.
      unmatched.push(event.args.answerRef);
      continue;
    }
    if (event.args.amount < expectedPerAnswer) {
      unmatched.push(event.args.answerRef);
      continue;
    }
    if (answer.accepted) {
      alreadyAccepted.push(answer.id);
      continue;
    }

    try {
      await acceptAnswer(askId, answer.id, txHash, {
        amount: ask.perAnswer,
        token: ask.token,
        network: ask.network,
      });
      recorded.push(answer.id);
      toNotify.push({
        // Adres ze zdarzenia - viem oddaje go w formie EIP-55, a wlasnie tej
        // formy uzywa przegladarka, czytajac users/{adres}/notifications.
        recipient: getAddress(event.args.recipient),
        answerId: answer.id,
        amount: unitsToAmount(event.args.amount).toFixed(2),
      });
    } catch (error) {
      console.error('[api/asks/escrow-resolve] Zapis przyjecia nie powiodl sie:', error);
      // Pieniadze SA JUZ PRZYPISANE NA LANCUCHU. Nieudany zapis nie odbiera
      // ich nikomu, a ponowienie z tym samym hashem jest bezpieczne.
      failed.push(answer.id);
    }
  }

  let closed = false;
  try {
    await resolveAsk(askId, txHash);
    closed = true;
  } catch (error) {
    console.error('[api/asks/escrow-resolve] Zamkniecie Aska nie powiodlo sie:', error);
  }

  /* ---------------------------------------------------------------- */
  /* WYGRANI DOWIADUJA SIE, ZE MAJA PIENIADZE                          */
  /* ---------------------------------------------------------------- */

  /**
   * Bez tego kroku rozstrzygniecie bylo nieme: kontrakt zapisywal salda, a
   * odpowiadajacy mial sie o nich dowiedziec, samemu wracajac na /money albo
   * /asks. Escrow trzyma wtedy pieniadze, po ktore nikt nie przychodzi.
   *
   * Robimy to TUTAJ, a nie po stronie klienta, bo tutaj adresy i kwoty sa
   * potwierdzone przez lancuch, a nie zadeklarowane przez przegladarke autora.
   *
   * NIC TU NIE MOZE WYWROCIC ROZSTRZYGNIECIA. Transakcja juz sie odbyla,
   * przyjecia sa zapisane - nieudane powiadomienie jest do zalogowania, nie do
   * zwrocenia bledem. Dlatego kazde ma wlasne `catch`, a caly blok jest
   * `await`-owany przed odpowiedzia: praca puszczona luzem po `return` ginie
   * razem z instancja funkcji.
   */
  if (toNotify.length > 0) {
    let askAuthor: string | null = null;
    try {
      askAuthor = getAddress(ask.author);
    } catch {
      // Autor zapisany w Asku nie jest adresem - powiadomienie nie ma od kogo
      // przyjsc, ale wyplaty juz sa zapisane i to one sie licza.
      console.warn('[api/asks/escrow-resolve] Autor Aska nie jest adresem, pomijam powiadomienia:', askId);
    }

    if (askAuthor) {
      for (const winner of toNotify) {
        try {
          await notifyAskPayout({
            recipientId: winner.recipient,
            askAuthorId: askAuthor,
            askId,
            answerId: winner.answerId,
            amount: winner.amount,
            token: ask.token,
            // Escrow: pieniadze SA PRZYPISANE, ale wciaz w kontrakcie. claim()
            // to osobna transakcja i osobny gaz - zdanie musi to mowic.
            delivery: 'escrow',
            txHash,
          });
        } catch (error) {
          console.error('[api/asks/escrow-resolve] Powiadomienie zwyciezcy nie powiodlo sie:', error);
        }
      }
    }
  }

  if (!closed || failed.length > 0) {
    return NextResponse.json(
      {
        error:
          'The escrow resolve is on-chain and the money is already assigned, but we could not finish recording it here. Retry with the same transaction hash - nothing will be paid twice.',
        code: 'record_incomplete',
        txHash,
        recorded,
        failed,
        closed,
      },
      { status: 500, headers: NO_STORE_PRIVATE }
    );
  }

  return NextResponse.json(
    {
      askId,
      status: 'resolved',
      txHash,
      seatsAwarded: seatEvents.length,
      recorded,
      alreadyAccepted,
      // Zdarzenia, ktorych nie dalo sie przypisac do zadnej odpowiedzi tego
      // Aska. Puste w kazdym poprawnym rozstrzygnieciu; niepuste znaczy, ze
      // ktos rozstrzygnal poza aplikacja albo ze cos sie rozjechalo.
      unmatched,
      acceptedCount: ask.acceptedCount + recorded.length,
      seats: ask.seats,
      unsealed: true,
      note: 'Every answer on this Ask is now readable by anyone. Winners collect their USDC from the escrow contract.',
    },
    { headers: NO_STORE_PRIVATE }
  );
}
