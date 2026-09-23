/**
 * POST /api/asks/[id]/escrow-resolve - zapisuje rozstrzygniecie Aska, ktory ma
 * budzet na kontrakcie AskEscrow.
 *
 * === PO CO OSOBNA TRASA OBOK ./accept ===
 * ./accept sprawdza DOWOD PRZELEWU: szuka logu Transfer USDC na adres
 * odpowiadajacego. Przy escrow taki log NIE POWSTAJE. resolve() nie wysyla
 * tokenow - przypisuje salda (uzasadnienie przy `claimable` w
 * contracts/AskEscrow.sol), a tokeny wychodza dopiero przy claim(), ktore moze
 * zdarzyc sie za tydzien albo nigdy. Puszczenie tego przez ./accept konczyloby
 * sie odmowa "no USDC transfer found" przy calkowicie poprawnym rozstrzygnieciu.
 *
 * Dlatego dowodem jest tutaj co innego: zdarzenia SeatAwarded i AskResolved
 * z JEDNEJ transakcji. SeatAwarded niesie klucz escrow, odbiorce, skrot
 * identyfikatora odpowiedzi i kwote - dokladnie to, co trzeba, zeby przypisac
 * wyplate do konkretnej odpowiedzi. AskResolved mowi, ze kontrakt ZAMKNAL tego
 * Aska - i to on (nie liczba dopasowanych miejsc) jest warunkiem zamkniecia
 * po stronie aplikacji.
 *
 * === CZEGO TA TRASA NIE PRZYJMUJE OD KLIENTA ===
 * WYLACZNIE hash transakcji. Lista zwyciezcow jest ODTWARZANA z lancucha:
 * serwer bierze odpowiedzi tego Aska, liczy dla nich answerRef tym samym
 * odwzorowaniem co klient (answerIdToBytes32) i dopasowuje do zdarzen.
 *
 * === CZEMU NIE WIERZYMY DOKUMENTOWI asks/{id} ===
 * Obecna regula update nie zamraza escrowTxHash, escrowChainId, status ani
 * acceptedCount, a askAnswers.accepted da sie przestawic z devtools. Dlatego:
 * - warunki escrow biora sie z zapieczetowanego stanu, a dla Aska bez stanu
 *   z escrowFor(author, askId) na lancuchu (nagrobek zostaje na zawsze) -
 *   podmieniony escrowTxHash czy escrowChainId niczego tu nie zmienia,
 * - status Aska bez stanu wynika z lancucha (AskResolved w tej transakcji),
 *   nie z pola `status` - podrobione 'expired' nie blokuje zapisu,
 * - "czy odpowiedz jest juz przyjeta" to WYLACZNIE zapieczetowany rekord
 *   w asks/{id}/acceptances/{answerId}, nigdy flaga `accepted` z lustra.
 * Wszystkie zapisy ida jedna transakcja admin SDK do sciezek, ktorych
 * przegladarka nie dotyka (patrz naglowek app/api/asks/askStore.ts).
 *
 * === KOLEJNOSC ===
 * Transakcja na lancuchu NAJPIERW, ta trasa POTEM. Rozstrzygniecie jest
 * terminalne na lancuchu i to lancuch jest zrodlem prawdy. Ponowienie z tym
 * samym hashem jest bezpieczne: rekordy juz zapisane wracaja w
 * `alreadyAccepted`, a nic nie jest placone ani ogloszone drugi raz.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getAddress } from 'viem';
import { notifyAskPayout } from '../../../../utils/friends/notifications';
import { answerIdToBytes32, escrowKeyFor, unitsToAmount } from '../../../../utils/asks/escrow';
import {
  escrowSeatAcceptance,
  lowerAddress,
  lowerTxHash,
  payoutRegistryId,
  readRegistry,
  type SealedAskState,
  type SealedEscrow,
} from '../../../../utils/asks/askSealCore';
import { findAskResolved, findSeatAwards, type SeatAward } from '../../../../utils/asks/escrowProofCore';
import { hasPaidAnswer } from '../../../../utils/asks/askPublicView';
import { sessionAddress } from '../../identity';
import {
  AskError,
  adoptLegacyState,
  askBundleFromSnapshots,
  askRef,
  isDocId,
  mirrorAsk,
  openAskStore,
  payoutRef,
  putState,
  readAcceptances,
  readAnswerRows,
  readAskBundle,
  recordAcceptance,
  stateRef,
  usableView,
  type AnswerRow,
  type AskBundle,
  type AskView,
} from '../../askStore';
import { ESCROW_CHAIN_ID, proveLegacyEscrow, readEscrowReceipt } from '../../escrowProof';

// getSessionFromCookies uzywa node:crypto, viem i firebase-admin nie dzialaja na Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_PRIVATE = { 'Cache-Control': 'no-store, private' } as const;

interface Body {
  txHash?: unknown;
}

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_PRIVATE });
}

function askErrorReply(error: AskError) {
  return reply({ error: error.message, code: error.code, ...(error.details ?? {}) }, error.status);
}

/**
 * Czy warunki escrow w transakcji to te same, z ktorymi szukalismy logow.
 * Rozjazd znaczy, ze ktos zapieczetowal Aska miedzy odczytem a transakcja -
 * wtedy klient ponawia, a nie zapisujemy wyplat liczonych innymi warunkami.
 */
function sameEscrowTerms(a: SealedEscrow | null, b: SealedEscrow): boolean {
  return a !== null && a.chainId === b.chainId && a.contract === b.contract && a.perAnswerUnits === b.perAnswerUnits;
}

/** Nagroda z lancucha dopasowana do odpowiedzi tego Aska. */
type PlannedAward = { award: SeatAward; row: AnswerRow; regId: string };

type Conflict = { answerId: string; reason: 'answer_already_paid' | 'payout_already_used'; payoutTxHash?: string };

type Outcome = {
  state: SealedAskState;
  recorded: Array<{ answerId: string; payee: string; units: bigint }>;
  alreadyAccepted: string[];
  conflicts: Conflict[];
  acceptedCount: number;
  /** Jest wazny rekord wyplaty dla kogos innego niz autor (hasPaidAnswer). */
  paidAnswer: boolean;
};

/**
 * Warunki escrow tego Aska - ze stanu albo z lancucha, nigdy z dokumentu.
 * Zwraca odpowiedz HTTP, gdy nie da sie ich ustalic.
 */
async function escrowTermsFor(
  askId: string,
  author: string,
  bundle: AskBundle
): Promise<{ escrow: SealedEscrow } | { response: NextResponse }> {
  if (bundle.state) {
    if (!bundle.state.escrow) {
      // Wazna pieczec 'escrowed' bez warunkow nie powstaje z naszego kodu
      // (sealStateDoc odmawia) - to znaczy, ze cos jest nie tak z kluczem.
      console.error(`[api/asks/escrow-resolve] ALARM: stan Aska ${askId} jest 'escrowed' bez warunkow escrow.`);
      return {
        response: reply(
          { error: 'This Ask cannot be verified right now. Nothing was changed.', code: 'seal_invalid' },
          503
        ),
      };
    }
    return { escrow: bundle.state.escrow };
  }

  // Ask sprzed pieczeci: escrowFor(author, askId) + ewentualnie zweryfikowany
  // log AskFunded. Autor jest polem zamrozonym regula, wiec klucz jest pewny.
  let proof;
  try {
    proof = await proveLegacyEscrow(bundle.pub ?? {}, author, askId);
  } catch (error) {
    console.error('[api/asks/escrow-resolve] Odczyt escrowFor nie powiodl sie:', error);
    // Awaria RPC to "nie wiem", nie "nie sfinansowano" - nic nie zapisujemy.
    return {
      response: reply(
        { error: 'Could not read the escrow contract on Base. Retry in a moment.', code: 'escrow_unavailable', retryable: true },
        503
      ),
    };
  }
  if (!proof.funded) {
    return {
      response: reply(
        {
          error: 'This Ask says its budget is escrowed, but the escrow contract has no deposit for it.',
          code: 'escrow_unverified',
        },
        409
      ),
    };
  }
  if (proof.anomalies.length > 0) {
    // Rozjazdy dokumentu z lancuchem to slad do resealu, nie odmowa: prawda
    // o pieniadzach jest na lancuchu i z niej bierzemy warunki.
    console.warn(`[api/asks/escrow-resolve] Ask ${askId}: dokument rozni sie od escrowFor:`, proof.anomalies);
  }
  return { escrow: proof.escrow };
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = typeof params?.id === 'string' ? params.id.trim() : '';
  // Id trafia do admin doc() - 'X/sealed/state' adresowaloby cudzy stan.
  if (!isDocId(askId)) {
    return reply({ error: 'Invalid Ask id', code: 'invalid_id' }, 400);
  }

  const viewer = lowerAddress(sessionAddress(request));
  if (!viewer) {
    return reply({ error: 'Sign in with your wallet to record a resolve.', code: 'session_required' }, 401);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const txHash = lowerTxHash(body?.txHash);
  if (!txHash) {
    return reply({ error: 'A resolve transaction hash is required.', code: 'tx_hash_required' }, 400);
  }

  // Bez admin SDK i klucza pieczeci nie ma gdzie zapisac prawdy - zamykamy,
  // zamiast pisac do lustra, ktore kazdy moze przestawic.
  const store = await openAskStore();
  if (!store) {
    return reply(
      { error: 'Ask storage is not configured on this deployment.', code: 'store_unavailable' },
      503
    );
  }

  /* ---------------------------------------------------------------- */
  /* ASK I WARUNKI ESCROW                                              */
  /* ---------------------------------------------------------------- */

  let bundle: AskBundle;
  let view: AskView;
  try {
    bundle = await readAskBundle(store, askId);
    view = usableView(bundle);
  } catch (error) {
    if (error instanceof AskError) return askErrorReply(error);
    console.error('[api/asks/escrow-resolve] Odczyt Aska nie powiodl sie:', error);
    // Nieudany odczyt to NIE "nie ma takiego Aska".
    return reply({ error: 'Failed to read Ask', code: 'ask_unavailable' }, 503);
  }

  const author = lowerAddress(view.author);
  if (!author || author !== viewer) {
    return reply({ error: 'Only the author of this Ask can resolve it.', code: 'not_ask_author' }, 403);
  }

  if (view.funding !== 'escrowed') {
    // Ask bez escrow rozliczany jest przelewami - kazdy ma wlasny dowod
    // i wlasna trase (./accept). Wpuszczenie go tutaj oznaczaloby odpowiedzi
    // jako oplacone bez ani jednego przelewu.
    return reply(
      {
        error:
          'This Ask is not escrowed. Its answers are paid one by one from your own wallet, so each accept needs its own payout.',
        code: 'not_escrowed',
      },
      409
    );
  }

  if (bundle.state?.status === 'expired') {
    // Zapieczetowane 'expired' powstaje wylacznie z logu AskExpired, a po
    // settleExpired kontrakt nie przyjmie resolve() dla tego klucza.
    return reply({ error: 'This Ask has already expired and its budget went back to the author.', code: 'ask_expired' }, 409);
  }

  const terms = await escrowTermsFor(askId, author, bundle);
  if ('response' in terms) return terms.response;
  const escrow = terms.escrow;

  if (escrow.chainId !== ESCROW_CHAIN_ID) {
    // Paragony czytamy wylacznie z Base mainnet.
    return reply(
      { error: 'This Ask points at a network where we cannot read the escrow contract.', code: 'escrow_network_unsupported' },
      409
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOWOD Z LANCUCHA                                                  */
  /* ---------------------------------------------------------------- */

  const receipt = await readEscrowReceipt(txHash);
  if (!receipt.ok) {
    if (receipt.code === 'rpc_error') {
      return reply({ error: receipt.error, code: 'rpc_error', retryable: true }, 503);
    }
    if (receipt.code === 'tx_not_found') {
      return reply(
        { error: 'That transaction is not on Base yet. Wait for it to confirm and try again.', code: 'tx_not_found', retryable: true },
        409
      );
    }
    // Ta sama zasada, ktora naprawiono kiedys w TipButton: cofnieta
    // transakcja nikogo nie oplacila.
    return reply({ error: 'That transaction reverted on-chain. Nobody was awarded anything.', code: 'tx_reverted' }, 409);
  }

  // Tylko logi TEGO kontraktu (adres z pieczeci albo z wdrozenia) i z kluczem
  // keccak(autor, askId). Klucz wiaze autora: resolve() odtwarza go
  // z msg.sender, wiec cudzy portfel nie wyprodukuje zdarzen dla tego Aska.
  const target = { contract: escrow.contract, key: escrowKeyFor(author, askId) };
  const awards = findSeatAwards(receipt.logs, target);
  const resolvedEvent = findAskResolved(receipt.logs, target);
  // Chwila rozstrzygniecia z BLOKU, nie z zegara serwera: ponowienie po dniach
  // albo pozna adopcja starego Aska nie przesuwa daty zamkniecia.
  const resolvedAtMs =
    Number.isFinite(receipt.blockTimeSec) && receipt.blockTimeSec > 0 ? receipt.blockTimeSec * 1000 : Date.now();

  if (awards.length === 0 && !resolvedEvent) {
    return reply(
      {
        error:
          'That transaction does not award any seat on this Ask. Nothing was recorded - check that you sent the resolve from the wallet that funded it.',
        code: 'no_seats_awarded',
      },
      409
    );
  }

  /* ---------------------------------------------------------------- */
  /* DOPASOWANIE ZDARZEN DO ODPOWIEDZI                                 */
  /* ---------------------------------------------------------------- */

  let rows: AnswerRow[];
  try {
    rows = await readAnswerRows(store, askId);
  } catch (error) {
    console.error('[api/asks/escrow-resolve] Odczyt odpowiedzi nie powiodl sie:', error);
    return reply({ error: 'Failed to read the answers on this Ask', code: 'answers_unavailable' }, 503);
  }

  // answerRef -> odpowiedz. Skrot liczymy TYM SAMYM helperem, ktorego uzywa
  // klient przy skladaniu transakcji - jedno odwzorowanie, jedno zrodlo prawdy.
  const byRef = new Map(rows.map((row) => [answerIdToBytes32(row.id).toLowerCase(), row]));
  const minUnits = BigInt(escrow.perAnswerUnits);

  const planned: PlannedAward[] = [];
  const plannedIds = new Set<string>();
  // Zdarzenia, ktorych nie dalo sie przypisac do zadnej odpowiedzi tego Aska.
  // Puste w kazdym poprawnym rozstrzygnieciu; niepuste znaczy, ze ktos
  // rozstrzygnal poza aplikacja albo ze cos sie rozjechalo.
  const unmatched: string[] = [];
  for (const award of awards) {
    const row = byRef.get(award.answerRef);
    if (
      !row ||
      plannedIds.has(row.id) ||
      // Kontrakt zaplacil komu innemu niz autor tej odpowiedzi - to nie jest
      // jej wyplata.
      lowerAddress(row.raw.author) !== award.recipient ||
      award.amount < minUnits
    ) {
      unmatched.push(award.answerRef);
      continue;
    }
    plannedIds.add(row.id);
    planned.push({ award, row, regId: payoutRegistryId(escrow.chainId, txHash, award.logIndex) });
  }

  /* ---------------------------------------------------------------- */
  /* ZAPIS - JEDNA TRANSAKCJA                                          */
  /* ---------------------------------------------------------------- */

  let outcome: Outcome;
  try {
    outcome = await store.db.runTransaction(async (tx): Promise<Outcome> => {
      // Wszystkie odczyty przed pierwszym zapisem (wymog transakcji Firestore).
      const [askSnap, stateSnap, ...payoutSnaps] = await tx.getAll(
        askRef(store, askId),
        stateRef(store, askId),
        ...planned.map((item) => payoutRef(store, item.regId))
      );
      const acceptances = await readAcceptances(store, askId, tx);

      const fresh = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
      const freshView = usableView(fresh);
      if (lowerAddress(freshView.author) !== author) {
        throw new AskError('not_ask_author', 403, 'Only the author of this Ask can resolve it.');
      }
      if (freshView.funding !== 'escrowed') {
        throw new AskError('not_escrowed', 409, 'This Ask is not escrowed.');
      }
      if (acceptances.invalid.length > 0) {
        // ALARM jest juz w logu (readAcceptances). Niewazny rekord to decyzja
        // wlasciciela, nie tej trasy.
        throw new AskError('seal_invalid', 503, 'This Ask cannot be verified right now. Nothing was changed.');
      }

      let base: SealedAskState;
      if (fresh.state) {
        if (!sameEscrowTerms(fresh.state.escrow, escrow)) {
          throw new AskError('escrow_changed', 409, 'This Ask changed while the resolve was being recorded. Retry with the same hash.', {
            retryable: true,
          });
        }
        base = fresh.state;
      } else {
        // Adopcja: pola zamrozone regula + warunki escrow z lancucha. Status
        // zawsze 'open' - podrobione 'expired' w lustrze nie ma tu wstepu.
        base = adoptLegacyState(askId, fresh.pub ?? {}, 'adopted', escrow);
      }

      if (base.status === 'expired') {
        console.error(
          `[api/asks/escrow-resolve] ALARM: Ask ${askId} ma zapieczetowane 'expired', a transakcja ${txHash} niesie rozstrzygniecie escrow.`
        );
        throw new AskError('ask_expired', 409, 'This Ask has already expired and its budget went back to the author.');
      }

      const recorded: Outcome['recorded'] = [];
      const alreadyAccepted: string[] = [];
      const conflicts: Conflict[] = [];

      planned.forEach((item, index) => {
        const answerId = item.row.id;
        const regSnap = payoutSnaps[index];
        const registry = readRegistry(store.keys, item.regId, regSnap.exists ? (regSnap.data() as Record<string, unknown>) : null);
        if (registry.kind === 'invalid') {
          console.error(`[api/asks/escrow-resolve] ALARM: wpis rejestru ${item.regId} ma niewazna pieczec (${registry.reason}).`);
          throw new AskError('seal_invalid', 503, 'This payout cannot be verified right now. Nothing was changed.');
        }

        // Prawda o przyjeciu to rekord, nie lustro: podrobione `accepted: true`
        // przy odpowiedzi nie blokuje zapisu prawdziwej nagrody.
        const existing = acceptances.valid.get(answerId);
        if (existing) {
          if (existing.txHash === txHash && existing.logIndex === item.award.logIndex) {
            alreadyAccepted.push(answerId);
          } else {
            // Odpowiedz ma juz inna wyplate. Nie nadpisujemy zapieczetowanego
            // rekordu - to decyzja wlasciciela, a nagroda z lancucha zostaje
            // w odpowiedzi jako konflikt.
            conflicts.push({ answerId, reason: 'answer_already_paid', payoutTxHash: existing.txHash });
          }
          return;
        }
        if (registry.kind === 'valid' && (registry.value.askId !== askId || registry.value.answerId !== answerId)) {
          conflicts.push({ answerId, reason: 'payout_already_used' });
          return;
        }

        const record = escrowSeatAcceptance({
          askId,
          answerId,
          payee: item.award.recipient,
          contract: escrow.contract,
          chainId: escrow.chainId,
          txHash,
          logIndex: item.award.logIndex,
          units: item.award.amount,
        });
        // Wpis rejestru przez tx.create tylko, gdy go nie ma. Wazny wpis dla
        // tej samej odpowiedzi znaczy ponowienie po zapisie rejestru.
        recordAcceptance(tx, store, record, unitsToAmount(item.award.amount), { createPayout: registry.kind === 'absent' });
        recorded.push({ answerId, payee: item.award.recipient, units: item.award.amount });
      });

      let next = base;
      let stateChanged = !fresh.state;
      if (resolvedEvent) {
        if (base.status === 'open') {
          next = { ...base, status: 'resolved', resolvedAt: resolvedAtMs, resolveKind: 'escrow', resolveTxHash: txHash };
          stateChanged = true;
        } else if (base.resolveTxHash !== txHash) {
          // Kontrakt pozwala na jedno resolve() na klucz, wiec drugi hash
          // z AskResolved to anomalia. Zapieczetowanego rozstrzygniecia nie
          // ruszamy; nagrody z tej transakcji i tak sa prawdziwe.
          console.error(
            `[api/asks/escrow-resolve] ALARM: Ask ${askId} jest juz rozstrzygniety (${base.resolveTxHash ?? 'bez hasha'}), ` +
              `a AskResolved przyszlo w ${txHash}.`
          );
        }
      }
      if (stateChanged) putState(tx, store, next);

      const acceptedCount = acceptances.valid.size + recorded.length;
      // Lustro dla przegladarki - wartosci wylacznie ze stanu i rekordow,
      // wiec kazde wywolanie naprawia pola podmienione z devtools.
      mirrorAsk(tx, store, askId, {
        status: next.status,
        resolvedAt: next.status === 'resolved' && next.resolvedAt !== null ? next.resolvedAt : undefined,
        escrowResolveTxHash: next.resolveKind === 'escrow' && next.resolveTxHash ? next.resolveTxHash : undefined,
        acceptedCount,
        funding: 'escrowed',
        escrowChainId: escrow.chainId,
        escrowTxHash: escrow.fundTxHash ?? undefined,
      });

      // Odslona wszystkich odpowiedzi wymaga wyplaty (revealsAllAnswers) - samo
      // AskResolved z nagrodami dla portfeli autora niczego nie odslania.
      const paidAnswer = hasPaidAnswer(
        [...acceptances.valid.values(), ...recorded],
        author
      );
      return { state: next, recorded, alreadyAccepted, conflicts, acceptedCount, paidAnswer };
    });
  } catch (error) {
    if (error instanceof AskError) return askErrorReply(error);
    console.error('[api/asks/escrow-resolve] Transakcja zapisu nie powiodla sie:', error);
    // Pieniadze SA JUZ PRZYPISANE NA LANCUCHU. Transakcja jest atomowa, wiec
    // nic nie zostalo zapisane polowicznie, a ponowienie z tym samym hashem
    // jest bezpieczne.
    return reply(
      {
        error:
          'The escrow resolve is on-chain and the money is already assigned, but we could not finish recording it here. Retry with the same transaction hash - nothing will be paid twice.',
        code: 'record_incomplete',
        txHash,
      },
      500
    );
  }

  /* ---------------------------------------------------------------- */
  /* WYGRANI DOWIADUJA SIE, ZE MAJA PIENIADZE                          */
  /* ---------------------------------------------------------------- */

  /**
   * Bez tego kroku rozstrzygniecie bylo nieme: kontrakt zapisywal salda, a
   * odpowiadajacy mial sie o nich dowiedziec, samemu wracajac na /money.
   *
   * Tylko rekordy zapisane W TYM wywolaniu - ponowienie z tym samym hashem
   * trafia w `alreadyAccepted` i nie wysyla drugiego powiadomienia o tych
   * samych pieniadzach. Kwota ze ZDARZENIA (to ona czeka na claim()), token
   * zawsze USDC - lustro `token` moze byc podmienione.
   *
   * NIC TU NIE MOZE WYWROCIC ROZSTRZYGNIECIA: transakcja juz sie odbyla,
   * rekordy sa zapisane. Kazde powiadomienie ma wlasne `catch`, a caly blok
   * jest `await`-owany przed odpowiedzia - praca puszczona luzem po `return`
   * ginie razem z instancja funkcji.
   */
  const askAuthorId = getAddress(author);
  for (const winner of outcome.recorded) {
    try {
      await notifyAskPayout({
        // Forma EIP-55 - tej uzywa przegladarka, czytajac users/{adres}/notifications.
        recipientId: getAddress(winner.payee),
        askAuthorId,
        askId,
        answerId: winner.answerId,
        amount: unitsToAmount(winner.units).toFixed(2),
        token: 'USDC',
        // Escrow: pieniadze SA PRZYPISANE, ale wciaz w kontrakcie. claim()
        // to osobna transakcja i osobny gaz - zdanie musi to mowic.
        delivery: 'escrow',
        txHash,
      });
    } catch (error) {
      console.error('[api/asks/escrow-resolve] Powiadomienie zwyciezcy nie powiodlo sie:', error);
    }
  }

  const resolved = outcome.state.status === 'resolved';
  const unsealed = resolved && outcome.paidAnswer;
  return reply({
    askId,
    status: outcome.state.status,
    txHash,
    seatsAwarded: awards.length,
    recorded: outcome.recorded.map((winner) => winner.answerId),
    alreadyAccepted: outcome.alreadyAccepted,
    unmatched,
    // Nagrody z lancucha, ktorych nie zapisalismy, bo odpowiedz ma juz inny
    // zapieczetowany rekord albo log jest zuzyty gdzie indziej. Decyzja
    // nalezy do wlasciciela; pieniadze na lancuchu to nie zmienia.
    conflicts: outcome.conflicts,
    acceptedCount: outcome.acceptedCount,
    seats: outcome.state.seats,
    unsealed,
    note: unsealed
      ? 'Every answer on this Ask is now readable by anyone. Winners collect their USDC from the escrow contract.'
      : resolved
        ? 'The Ask is closed on the escrow contract, but no award went to an answer here, so the answers stay sealed.'
        : 'The awards are recorded, but this transaction did not close the Ask on the escrow contract.',
  });
}
