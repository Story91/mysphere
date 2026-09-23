/**
 * POST /api/asks/[id]/escrow-expire - zapisuje, ze budzet escrow Aska wrocil
 * do autora przez settleExpired().
 *
 * === CO ZASTEPUJE ===
 * Do tej pory /money (RecoverButton) wolalo expireAsk() - zapis klienckim SDK
 * prosto do asks/{id} z hashem, ktorego nikt nie sprawdzal. Regula pilnowala
 * tylko dlugosci hasha, wiec KAZDA przegladarka mogla oznaczyc dowolnego
 * otwartego Aska jako 'expired': jednokierunkowo, przed terminem, bez grosza
 * na lancuchu. To zamykalo Aska na odpowiedzi, liczylo sie jako porzucenie
 * w resolve rate i chowalo go z /asks.
 *
 * Teraz 'expired' powstaje WYLACZNIE z logu AskExpired tego kontraktu
 * z kluczem keccak(autor, askId) - i trafia do zapieczetowanego stanu
 * (asks/{id}/sealed/state), ktorego przegladarka nie dotknie. Dokument
 * asks/{id} dostaje tylko lustro.
 *
 * === DLACZEGO BEZ SESJI ===
 * settleExpired() jest na kontrakcie bez uprawnien: wolac moze kazdy, a adres
 * docelowy siedzi w kluczu, wiec wolajacy placi gaz i nie dostaje nic. Ta
 * trasa jest tak samo otwarta z tego samego powodu: zapisuje wylacznie to, co
 * udowodnil lancuch, wiec nie ma tu komu podszyc sie pod nikogo. Wymaganie
 * sesji autora zostawiloby dokument w stanie 'open' za kazdym razem, gdy
 * zwrot odpali ktos inny (albo autor bez podpisanej sesji).
 *
 * === KOLEJNOSC ===
 * settleExpired NAJPIERW, ta trasa POTEM. Nieudany zapis tutaj nie cofa
 * zwrotu - pieniadze juz wrocily na lancuchu - wiec klient loguje blad
 * i nie pokazuje go jako porazki zwrotu. Ponowienie z tym samym hashem
 * zwraca 200 i niczego nie zmienia.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { escrowKeyFor, unitsToAmount } from '../../../../utils/asks/escrow';
import { lowerAddress, lowerTxHash, type SealedAskState, type SealedEscrow } from '../../../../utils/asks/askSealCore';
import { findAskExpired } from '../../../../utils/asks/escrowProofCore';
import {
  AskError,
  adoptLegacyState,
  askBundleFromSnapshots,
  askRef,
  isDocId,
  mirrorAsk,
  openAskStore,
  putState,
  readAskBundle,
  stateRef,
  usableView,
  type AskBundle,
  type AskView,
} from '../../askStore';
import { ESCROW_CHAIN_ID, proveLegacyEscrow, readEscrowReceipt } from '../../escrowProof';

// viem i firebase-admin nie dzialaja na Edge.
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

/** To samo porownanie co w escrow-resolve - patrz komentarz tam. */
function sameEscrowTerms(a: SealedEscrow | null, b: SealedEscrow): boolean {
  return a !== null && a.chainId === b.chainId && a.contract === b.contract && a.perAnswerUnits === b.perAnswerUnits;
}

type Outcome = { state: SealedAskState; alreadyRecorded: boolean };

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const askId = typeof params?.id === 'string' ? params.id.trim() : '';
  // Id trafia do admin doc() - 'X/sealed/state' adresowaloby cudzy stan.
  if (!isDocId(askId)) {
    return reply({ error: 'Invalid Ask id', code: 'invalid_id' }, 400);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return reply({ error: 'Invalid JSON body' }, 400);
  }

  const txHash = lowerTxHash(body?.txHash);
  if (!txHash) {
    return reply({ error: 'A settleExpired transaction hash is required.', code: 'tx_hash_required' }, 400);
  }

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
    console.error('[api/asks/escrow-expire] Odczyt Aska nie powiodl sie:', error);
    return reply({ error: 'Failed to read Ask', code: 'ask_unavailable' }, 503);
  }

  if (view.funding !== 'escrowed') {
    // Ask 'on-resolve' nie ma czego zwracac z kontraktu - jego 'expired'
    // wynika z terminu, nie z transakcji.
    return reply({ error: 'This Ask is not escrowed, so there is no escrow refund to record.', code: 'not_escrowed' }, 409);
  }

  // Autor ze stanu albo z pola zamrozonego regula - to on jest w kluczu.
  const author = lowerAddress(view.author);
  if (!author) {
    return reply({ error: 'This Ask has no valid author address.', code: 'ask_malformed' }, 409);
  }

  let escrow: SealedEscrow;
  if (bundle.state) {
    if (!bundle.state.escrow) {
      console.error(`[api/asks/escrow-expire] ALARM: stan Aska ${askId} jest 'escrowed' bez warunkow escrow.`);
      return reply({ error: 'This Ask cannot be verified right now. Nothing was changed.', code: 'seal_invalid' }, 503);
    }
    escrow = bundle.state.escrow;
  } else {
    // Ask sprzed pieczeci: warunki z escrowFor, nie z escrowTxHash/escrowChainId
    // dokumentu, ktore przegladarka moze dzis podmienic.
    let proof;
    try {
      proof = await proveLegacyEscrow(bundle.pub ?? {}, author, askId);
    } catch (error) {
      console.error('[api/asks/escrow-expire] Odczyt escrowFor nie powiodl sie:', error);
      return reply(
        { error: 'Could not read the escrow contract on Base. Retry in a moment.', code: 'escrow_unavailable', retryable: true },
        503
      );
    }
    if (!proof.funded) {
      return reply(
        {
          error: 'This Ask says its budget is escrowed, but the escrow contract has no deposit for it.',
          code: 'escrow_unverified',
        },
        409
      );
    }
    if (proof.anomalies.length > 0) {
      console.warn(`[api/asks/escrow-expire] Ask ${askId}: dokument rozni sie od escrowFor:`, proof.anomalies);
    }
    escrow = proof.escrow;
  }

  if (escrow.chainId !== ESCROW_CHAIN_ID) {
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
    return reply({ error: 'That transaction reverted on-chain. No budget was returned.', code: 'tx_reverted' }, 409);
  }

  // Log AskExpired z TEGO kontraktu i z kluczem keccak(autor, askId). Klucz
  // wiaze autora, wiec zwrot cudzego Aska z tym samym askId tu nie przejdzie.
  const expired = findAskExpired(receipt.logs, { contract: escrow.contract, key: escrowKeyFor(author, askId) });
  if (!expired || expired.author !== author) {
    return reply(
      { error: 'That transaction does not return the budget of this Ask. Nothing was recorded.', code: 'not_an_expiry' },
      409
    );
  }

  /* ---------------------------------------------------------------- */
  /* ZAPIS - JEDNA TRANSAKCJA                                          */
  /* ---------------------------------------------------------------- */

  let outcome: Outcome;
  try {
    outcome = await store.db.runTransaction(async (tx): Promise<Outcome> => {
      const [askSnap, stateSnap] = await tx.getAll(askRef(store, askId), stateRef(store, askId));
      const fresh = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
      const freshView = usableView(fresh);
      if (freshView.funding !== 'escrowed') {
        throw new AskError('not_escrowed', 409, 'This Ask is not escrowed, so there is no escrow refund to record.');
      }

      let base: SealedAskState;
      if (fresh.state) {
        if (!sameEscrowTerms(fresh.state.escrow, escrow) || fresh.state.author !== author) {
          throw new AskError('escrow_changed', 409, 'This Ask changed while the refund was being recorded. Retry with the same hash.', {
            retryable: true,
          });
        }
        base = fresh.state;
      } else {
        // Adopcja z pol zamrozonych regula - status 'open' niezaleznie od
        // tego, co pisze lustro. 'expired' dopisujemy nizej, z dowodu.
        base = adoptLegacyState(askId, fresh.pub ?? {}, 'adopted', escrow);
      }

      // Lustro dla przegladarki: status i hash ze stanu, a nie z zadania.
      // Szyna lustra ze stanu (escrow jest zawsze USDC na Base).
      const mirror = (state: SealedAskState, stampExpiredAt: boolean) =>
        mirrorAsk(
          tx,
          store,
          askId,
          {
            status: state.status,
            expiredTxHash: state.expiredTxHash ?? undefined,
            expiredAt: stampExpiredAt ? store.FieldValue.serverTimestamp() : undefined,
            funding: 'escrowed',
            escrowChainId: escrow.chainId,
            escrowTxHash: escrow.fundTxHash ?? undefined,
          },
          state
        );

      if (base.status === 'resolved') {
        // resolve() i settleExpired() zamykaja ten sam klucz i kontrakt
        // pozwala tylko na jedno z nich. Rozstrzygniety stan + AskExpired to
        // anomalia do zbadania, nie cos, co ta trasa ma rozsadzac.
        console.error(
          `[api/asks/escrow-expire] ALARM: Ask ${askId} ma zapieczetowane 'resolved' (${base.resolveTxHash ?? 'bez hasha'}), ` +
            `a ${txHash} niesie AskExpired dla jego klucza.`
        );
        throw new AskError('already_resolved', 409, 'This Ask was already resolved, so its budget cannot have expired.');
      }

      if (base.status === 'expired') {
        if (base.expiredTxHash === txHash) {
          // Ponowienie: stan juz to mowi. Naprawiamy tylko lustro.
          mirror(base, false);
          return { state: base, alreadyRecorded: true };
        }
        if (base.expiredTxHash !== null) {
          console.error(
            `[api/asks/escrow-expire] ALARM: Ask ${askId} wygasl w ${base.expiredTxHash}, a AskExpired przyszlo tez w ${txHash}.`
          );
          throw new AskError('already_expired', 409, 'This Ask is already recorded as expired with another transaction.', {
            expiredTxHash: base.expiredTxHash,
          });
        }
        // 'expired' bez hasha (stary zapis): lancuch wlasnie go dostarczyl.
      }

      const next: SealedAskState = {
        ...base,
        status: 'expired',
        expiredTxHash: txHash,
        expiredLogIndex: expired.logIndex,
      };
      putState(tx, store, next);
      mirror(next, true);
      return { state: next, alreadyRecorded: false };
    });
  } catch (error) {
    if (error instanceof AskError) return askErrorReply(error);
    console.error('[api/asks/escrow-expire] Transakcja zapisu nie powiodla sie:', error);
    return reply(
      {
        error:
          'The refund is on-chain and the budget is already back with the author, but we could not record it here. Retry with the same transaction hash.',
        code: 'record_incomplete',
        txHash,
      },
      500
    );
  }

  return reply({
    askId,
    status: 'expired',
    txHash,
    logIndex: outcome.state.expiredLogIndex,
    alreadyRecorded: outcome.alreadyRecorded,
    // Kwoty ze zdarzenia - to one naprawde czekaja na claim() autora
    // i odbiorcy oplaty.
    refundToAuthor: unitsToAmount(expired.refundToAuthor).toFixed(2),
    fee: unitsToAmount(expired.fee).toFixed(2),
    token: 'USDC',
  });
}
