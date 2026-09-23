import 'server-only';
import type { Transaction } from 'firebase-admin/firestore';
import {
  AskError,
  answerPayee,
  isDocId,
  lowerAddress,
  railOf,
  readPayee,
  sealPayeeDoc,
  sealSolanaBindingDoc,
  solanaWalletBinding,
  type AnswerPayee,
  type SealCheck,
  type SealedAskState,
  type SolanaWalletBinding,
} from '../../utils/asks/askSealCore';
import {
  checkBindingChallenge,
  decodeBase58,
  mintBindingChallenge,
  verifySolanaMessageSignature,
  type BindingChallenge,
} from '../../utils/asks/solanaAskCore';
import { isSolanaAddress } from '../../basechat/Solana/replies/replyCore';
import {
  answerRef,
  askBundleFromSnapshots,
  askRef,
  payeeRef,
  payeesCol,
  readSolanaWalletBinding,
  solanaWalletRef,
  stateRef,
  usableView,
  type AskStore,
} from './askStore';

/**
 * ===========================================================================
 * PORTFELE SOLANY DLA ASKOW - powiazanie z kontem EVM i odbiorcy odpowiedzi
 * ===========================================================================
 *
 * Tozsamoscia w Askach jest sesja SIWE (konto EVM). Ask SOL potrzebuje dwoch
 * adresow Solany, ktore NIE moga pochodzic z ciala zadania:
 *   - platnik autora (zamrazany w stanie przy tworzeniu Aska),
 *   - odbiorca odpowiadajacego (zamrazany per odpowiedz w asks/{id}/payees).
 * Oba biora sie z JEDNEGO powiazania na konto EVM:
 *   askAnswerContent/_registry/solanaWallets/{evmLower}  (HMAC 'asksolbind:v1')
 * zakladanego dopiero po podpisie ed25519 wiadomosci, ktora serwer odtwarza
 * bajt w bajt z bezstanowego challenge'u (solanaAskCore.ts).
 *
 * API:
 *   readBinding(store, evm, tx?)            SealCheck<SolanaWalletBinding>
 *   mintChallenge(store, evm, solana, nowMs) BindingChallenge (rzuca invalid_address)
 *   linkSolanaWallet(store, input)          podpis -> zapieczetowane powiazanie
 *   readPayees(store, askId, tx?)           PayeeSet
 *   freezePayeeFromBinding(tx, store, in)   tx.create odbiorcy z powiazania
 *   freezeAnswerPayee(store, input)         trasa POST /api/asks/[id]/payee
 *
 * Adresy i podpisy Solany (base58) NIGDY nie przechodza przez lowerAddress /
 * toLowerCase - wielkosc liter jest czescia wartosci.
 */

/* ------------------------------------------------------------------ */
/*  BASE58 (kodowanie podpisu do zapisu)                               */
/* ------------------------------------------------------------------ */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Bajty -> base58 (alfabet Bitcoina). Odwrotnosc decodeBase58 z solanaAskCore. */
export function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = '';
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

/**
 * Podpis z ciala zadania -> 64 bajty albo null. Klient podaje `signature`
 * (base58, jak zwraca wiekszosc SDK) albo `signatureBase64` (btoa bajtow
 * z signMessage - bez biblioteki base58 w przegladarce).
 */
export function parseBindingSignature(body: { signature?: unknown; signatureBase64?: unknown }): Uint8Array | null {
  if (typeof body.signature === 'string' && body.signature !== '') {
    const bytes = decodeBase58(body.signature.trim(), 100);
    return bytes && bytes.length === 64 ? bytes : null;
  }
  if (typeof body.signatureBase64 === 'string' && body.signatureBase64 !== '') {
    const text = body.signatureBase64.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length > 100) return null;
    const bytes = Buffer.from(text, 'base64');
    return bytes.length === 64 ? new Uint8Array(bytes) : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  POWIAZANIE                                                         */
/* ------------------------------------------------------------------ */

/** Powiazanie konta EVM (z sesji). */
export function readBinding(store: AskStore, evm: string, tx?: Transaction): Promise<SealCheck<SolanaWalletBinding>> {
  return readSolanaWalletBinding(store, evm, tx);
}

/** Challenge do podpisania. Rzuca AskError('invalid_address', 400). */
export function mintChallenge(store: AskStore, evm: string, solana: string, nowMs: number): BindingChallenge {
  return mintBindingChallenge(store.key, { evm, solana, nowMs });
}

export type LinkedBinding = { binding: SolanaWalletBinding; created: boolean };

/**
 * Zapis powiazania po podpisie. Kolejnosc: adres -> ksztalt podpisu ->
 * challenge (MAC przed czasem) -> ed25519 na wiadomosci ODTWORZONEJ przez
 * serwer -> transakcja (wazny zapis z >= issuedAt -> binding_outdated;
 * ten sam challenge i podpis -> ponowienie, 200 bez zapisu).
 *
 * Kody (AskError): invalid_address 400, invalid_signature 400,
 * challenge_invalid 400, challenge_expired 400, solana_signature_invalid 400,
 * binding_outdated 409, seal_invalid 503.
 */
export async function linkSolanaWallet(
  store: AskStore,
  input: { evm: string; solana: unknown; challenge: unknown; signature: Uint8Array | null; nowMs: number }
): Promise<LinkedBinding> {
  const evm = lowerAddress(input.evm);
  if (!evm) throw new AskError('session_required', 401, 'Sign in with your wallet to link a Solana wallet.');
  if (!isSolanaAddress(input.solana)) throw new AskError('invalid_address', 400, 'That is not a Solana address.');
  const solana = input.solana;
  if (!input.signature || input.signature.length !== 64) {
    throw new AskError('invalid_signature', 400, 'Missing or malformed wallet signature.');
  }

  const check = checkBindingChallenge(store.keys, input.challenge, { evm, solana, nowMs: input.nowMs });
  if (!check.ok) {
    throw check.reason === 'challenge_expired'
      ? new AskError('challenge_expired', 400, 'This link request expired. Ask for a new one and sign again.')
      : new AskError('challenge_invalid', 400, 'This link request is not valid for this account and wallet.');
  }
  if (!verifySolanaMessageSignature(check.message, input.signature, solana)) {
    throw new AskError('solana_signature_invalid', 400, 'The signature does not match this Solana wallet and message.');
  }

  const binding = solanaWalletBinding({
    evm,
    solana,
    issuedAtMs: check.issuedAtMs,
    nonce: check.nonce,
    signature: encodeBase58(input.signature),
  });

  return store.db.runTransaction(async (tx): Promise<LinkedBinding> => {
    const existing = await readSolanaWalletBinding(store, evm, tx);
    if (existing.kind === 'invalid') {
      // Nigdy nie nadpisujemy niewaznej pieczeci automatycznie - to decyzja
      // wlasciciela (ALARM jest juz w logu).
      throw new AskError('seal_invalid', 503, 'Your linked Solana wallet cannot be verified right now. Nothing was changed.');
    }
    if (existing.kind === 'valid') {
      const old = existing.value;
      if (old.solana === binding.solana && old.issuedAtMs === binding.issuedAtMs && old.nonce === binding.nonce) {
        return { binding: old, created: false };
      }
      // Starszy (albo ten sam) challenge nie cofnie portfela: przechwycony
      // stary podpis nie przywroci poprzedniego adresu.
      if (binding.issuedAtMs <= old.issuedAtMs) {
        throw new AskError('binding_outdated', 409, 'A newer Solana wallet link already exists for this account. Ask for a new link request.');
      }
    }
    tx.set(solanaWalletRef(store, evm), {
      ...sealSolanaBindingDoc(store.key, binding),
      linkedAt: store.FieldValue.serverTimestamp(),
    });
    return { binding, created: true };
  });
}

/* ------------------------------------------------------------------ */
/*  ODBIORCY ODPOWIEDZI                                                */
/* ------------------------------------------------------------------ */

export type PayeeSet = {
  all: Map<string, SealCheck<AnswerPayee>>;
  valid: Map<string, AnswerPayee>;
  /** Id odpowiedzi z niewazna pieczecia odbiorcy. */
  invalid: string[];
};

/** Wszyscy odbiorcy Aska (podkolekcja bez indeksu - jak przyjecia). */
export async function readPayees(store: AskStore, askId: string, tx?: Transaction): Promise<PayeeSet> {
  const col = payeesCol(store, askId);
  const snap = tx ? await tx.get(col) : await col.get();
  const all = new Map<string, SealCheck<AnswerPayee>>();
  const valid = new Map<string, AnswerPayee>();
  const invalid: string[] = [];
  for (const doc of snap.docs) {
    const check = readPayee(store.keys, askId, doc.id, doc.data() as Record<string, unknown>);
    all.set(doc.id, check);
    if (check.kind === 'valid') valid.set(doc.id, check.value);
    else if (check.kind === 'invalid') invalid.push(doc.id);
  }
  if (invalid.length > 0) {
    console.error(`[asks/solanaWalletStore] ALARM: niewazne pieczecie odbiorcow w Asku ${askId}: ${invalid.join(', ')}.`);
  }
  return { all, valid, invalid };
}

export type FreezeResult = { ok: true; payee: AnswerPayee } | { ok: false; code: 'payee_is_author_wallet' };

/**
 * Zamrozenie odbiorcy odpowiedzi z WAZNEGO powiazania odpowiadajacego -
 * tx.create (drugi zapis wywroci commit, nigdy nie nadpisze). Wolaj po
 * wszystkich odczytach transakcji i tylko, gdy odczyt payeeRef dal 'absent'.
 *
 * Portfel odpowiadajacego rowny platnikowi autora -> 'payee_is_author_wallet'
 * i nic nie zapisujemy: taka "wyplata" bylaby przelewem autora do siebie
 * (verifySolanaAskPayout odrzucilby ja jako self-pay).
 */
export function freezePayeeFromBinding(
  tx: Transaction,
  store: AskStore,
  input: { state: SealedAskState; answerId: string; answerer: string; binding: SolanaWalletBinding; nowMs: number }
): FreezeResult {
  const { state, binding } = input;
  if (railOf(state) !== 'sol-solana' || !state.solana) {
    throw new AskError('wrong_rail', 409, 'This Ask does not pay in SOL.');
  }
  if (lowerAddress(input.answerer) !== binding.evm) {
    // Blad wolajacego: powiazanie innego konta niz autor odpowiedzi.
    throw new AskError('seal_write_malformed', 500, 'Refusing to freeze a payee from another account binding.');
  }
  if (binding.solana === state.solana.payer) return { ok: false, code: 'payee_is_author_wallet' };
  const payee = answerPayee({
    askId: state.askId,
    answerId: input.answerId,
    answerer: binding.evm,
    payee: binding.solana,
    frozenAtMs: input.nowMs,
  });
  tx.create(payeeRef(store, state.askId, input.answerId), {
    ...sealPayeeDoc(store.key, payee),
    frozenAt: store.FieldValue.serverTimestamp(),
  });
  return { ok: true, payee };
}

export type FrozenPayee = { payee: AnswerPayee; created: boolean };

/**
 * POST /api/asks/[id]/payee - odpowiadajacy, ktory powiazal portfel PO
 * odpowiedzi, zamraza odbiorce swojej odpowiedzi. Jedna transakcja: Ask,
 * stan, odpowiedz, odbiorca i powiazanie czytane razem.
 *
 * Kody (AskError): invalid_id 400, ask_not_found 404, seal_invalid 503,
 * wrong_rail 409, answer_not_found 404, not_answer_author 403,
 * ask_resolved 409, solana_wallet_required 409, payee_locked 409,
 * payee_is_author_wallet 409. Ten sam portfel drugi raz -> { created: false }.
 */
export async function freezeAnswerPayee(
  store: AskStore,
  input: { askId: string; answerId: string; viewer: string; nowMs: number }
): Promise<FrozenPayee> {
  const { askId, answerId } = input;
  if (!isDocId(askId) || !isDocId(answerId)) throw new AskError('invalid_id', 400, 'Invalid Ask or answer id.');
  const viewer = lowerAddress(input.viewer);
  if (!viewer) throw new AskError('session_required', 401, 'Sign in with your wallet.');

  return store.db.runTransaction(async (tx): Promise<FrozenPayee> => {
    const [askSnap, stateSnap, answerSnap, payeeSnap] = await tx.getAll(
      askRef(store, askId),
      stateRef(store, askId),
      answerRef(store, answerId),
      payeeRef(store, askId, answerId)
    );
    const binding = await readSolanaWalletBinding(store, viewer, tx);

    const bundle = askBundleFromSnapshots(store, askId, askSnap, stateSnap);
    usableView(bundle); // ask_not_found 404, seal_invalid 503
    const state = bundle.state;
    if (!state || railOf(state) !== 'sol-solana' || !state.solana) {
      throw new AskError('wrong_rail', 409, 'This Ask does not pay in SOL, so there is no Solana payout address to set.');
    }

    const answer = answerSnap.exists ? ((answerSnap.data() ?? {}) as Record<string, unknown>) : null;
    if (!answer || answer.askId !== askId) throw new AskError('answer_not_found', 404, 'Answer not found on this Ask');
    if (lowerAddress(answer.author) !== viewer) {
      throw new AskError('not_answer_author', 403, 'Only the author of this answer can set where it gets paid.');
    }
    if (state.status === 'resolved') throw new AskError('ask_resolved', 409, 'This Ask is already resolved.');

    if (binding.kind === 'invalid') {
      throw new AskError('seal_invalid', 503, 'Your linked Solana wallet cannot be verified right now. Nothing was changed.');
    }
    if (binding.kind === 'absent') {
      throw new AskError('solana_wallet_required', 409, 'Link a Solana wallet first, then set it as the payout address.');
    }

    const existing = readPayee(
      store.keys,
      askId,
      answerId,
      payeeSnap.exists ? ((payeeSnap.data() ?? {}) as Record<string, unknown>) : null
    );
    if (existing.kind === 'invalid') {
      console.error(`[asks/solanaWalletStore] ALARM: odbiorca ${askId}/${answerId} ma niewazna pieczec (${existing.reason}).`);
      throw new AskError('seal_invalid', 503, 'The payout address of this answer cannot be verified right now. Nothing was changed.');
    }
    if (existing.kind === 'valid') {
      if (existing.value.payee === binding.value.solana) return { payee: existing.value, created: false };
      // Odbiorca jest niezmienny: przejete konto EVM nie przekieruje wyplaty
      // za juz napisana odpowiedz. Nowy portfel dziala na nowe odpowiedzi.
      throw new AskError(
        'payee_locked',
        409,
        'This answer already has a payout address. A new wallet applies only to answers you write from now on.',
        { payoutAddress: existing.value.payee }
      );
    }

    const frozen = freezePayeeFromBinding(tx, store, {
      state,
      answerId,
      answerer: viewer,
      binding: binding.value,
      nowMs: input.nowMs,
    });
    if (!frozen.ok) {
      throw new AskError(
        'payee_is_author_wallet',
        409,
        'This Solana wallet is the one that pays for this Ask. Link a different wallet to get paid.'
      );
    }
    return { payee: frozen.payee, created: true };
  });
}
