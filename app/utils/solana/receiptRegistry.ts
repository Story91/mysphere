import 'server-only';

/**
 * Rejestr kwitow postow z Solany - JEDYNE zrodlo portfela, na ktory idza
 * pieniadze (napiwek z Blinka, platna odpowiedz) i czyje bagi pokazuje
 * odznaka Proof of Bags.
 *
 * ===========================================================================
 * JAK WPIS POWSTAJE (od drugiego przegladu przeciwnika, 2026-09-23)
 * ===========================================================================
 * WYLACZNIE w chwili zapisu posta, przez serwer (createSolanaPost ponizej,
 * wolane z POST /api/solana/post):
 *
 *   1. memo transakcji niesie ID posta (memo v2, patrz buildPostMemo), wiec
 *      jedna transakcja nalezy do jednego posta na zawsze,
 *   2. podpisujacy memo = platnik oplaty, a cialo memo = tresc posta,
 *   3. autor (adres EVM) pochodzi z podpisanej sesji SIWE, nie z zadania,
 *   4. post i wpis w rejestrze powstaja w JEDNEJ transakcji Firestore,
 *      a wpis przez `create` - istniejacego nigdy nie nadpisujemy.
 *
 * Pierwsza wersja rejestru (ten sam dzien) weryfikowala kwit leniwie, z pol
 * posta, przy pierwszym napiwku - i to byl blad: `posts` zapisuje kazda
 * przegladarka, a `createTime`, na ktorym stalo okno czasowe, resetuje sie
 * przy skasowaniu i ponownym zalozeniu dokumentu. Ktos mogl skasowac cudzy
 * post, zalozyc go od nowa z wlasna swieza transakcja i przejac napiwki.
 * Dlatego odczyt NIGDY juz niczego nie wyprowadza z posta.
 *
 * ===========================================================================
 * HMAC I CO SIE DZIEJE PRZY ZLYM PODPISIE
 * ===========================================================================
 * Dopoki wlasciciel nie wdrozy nowych regul Firestore, kolekcja rejestru jest
 * otwarta jak `posts`. Kazdy wpis niesie wiec HMAC liczony kluczem, ktory zna
 * tylko serwer, oraz `kid` - ktory klucz go podpisal. Wpis bez prawidlowego
 * HMAC to PODROBKA albo sabotaz: blokujemy platnosci (`tampered`) i glosno
 * logujemy. Nie weryfikujemy "od nowa" - to wlasnie ta sciezka byla dziura.
 * Najgorsze, co moze zrobic napastnik przed wdrozeniem regul, to wylaczyc
 * napiwki pod postem. Przekierowac ich nie moze.
 *
 * Klucz: SOLANA_RECEIPT_SECRET, a bez niego - klucz prywatny konta uslugowego
 * z GOOGLE_CREDENTIALS (po sparsowaniu, wiec zapis JSON czy base64 daje ten
 * sam klucz). Celowo NIE AUTH_SESSION_SECRET: rotacja sekretu sesji to
 * zwykla operacja i nie moze po cichu uniewazniac rejestru.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Connection } from '@solana/web3.js';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb, readServiceAccount } from '../auth/firebaseAdmin';
import { fetchPlainTransaction } from './postReceipt';
import { readBagsProof } from '../../basechat/Solana/bags/bagsCore';
import {
  SOLANA_CLUSTER,
  isReceiptTimely,
  memoMatchesPost,
  postMemoBody,
  type SolanaCluster,
} from '../../basechat/Solana/config/solanaChain';

export const RECEIPT_COLLECTION = 'solanaPostReceipts';

export interface RegisteredReceipt {
  postId: string;
  /** Portfel Solany, ktory podpisal i oplacil post. */
  signer: string;
  txHash: string;
  slot: number;
  blockTime: number | null;
  /**
   * Adres EVM autora z sesji SIWE w chwili zapisu. Pusty dla postow sprzed
   * memo v2 zarejestrowanych migracja - tam autora nikt nie zweryfikowal.
   */
  author: string;
  cluster: SolanaCluster;
}

export type ReceiptResolution =
  | { ok: true; receipt: RegisteredReceipt }
  | {
      ok: false;
      /**
       * unavailable   - serwer nie moze czytac rejestru (brak Firebase Admin albo
       *                 klucza HMAC): platnosci ZABLOKOWANE, nie otwarte,
       * unregistered  - post nie ma wpisu (stary post albo zapisany z pominieciem
       *                 serwera),
       * tampered      - wpis istnieje, ale jego HMAC sie nie zgadza,
       * wrong-cluster - kwit pochodzi z innego klastra niz ten, na ktorym dziala
       *                 aplikacja (devnet vs mainnet),
       * post-missing  - posta juz nie ma,
       * not-solana    - pod tym ID stoi dzis post z innej sieci.
       */
      reason: 'unavailable' | 'unregistered' | 'tampered' | 'wrong-cluster' | 'post-missing' | 'not-solana';
    };

// ---------------------------------------------------------------------------
// Klucz HMAC
// ---------------------------------------------------------------------------

interface RegistryKey {
  kid: string;
  key: Buffer;
}

const KEY_DOMAIN = 'mysphere:solana-receipt-registry:v2';

function envKey(): RegistryKey | null {
  const secret = process.env.SOLANA_RECEIPT_SECRET?.trim();
  if (!secret) return null;
  // Odcisk sekretu w `kid` (8 znakow sha256) mowi, KTORY sekret podpisal
  // wpis - po zmianie sekretu stare wpisy daja `unavailable`, a nie `tampered`.
  const fingerprint = createHash('sha256').update(secret).digest('hex').slice(0, 8);
  return { kid: `env:${fingerprint}`, key: createHmac('sha256', secret).update(KEY_DOMAIN).digest() };
}

function serviceAccountKey(): RegistryKey | null {
  // Ten sam parser co Firebase Admin: .env z podwojnymi cudzyslowami rozwija
  // `\n` w kluczu na prawdziwe nowe linie i zwykly JSON.parse wtedy pada.
  const account = readServiceAccount();
  if (!account || typeof account.private_key !== 'string' || typeof account.private_key_id !== 'string') return null;
  // Klucz PEM bywa zapisany z `\n` jako sekwencja albo jako nowa linia -
  // sprowadzamy do jednej postaci, zeby JSON i base64 dawaly ten sam klucz.
  const privateKey = account.private_key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return {
    kid: `sa:${account.private_key_id.slice(0, 12)}`,
    key: createHmac('sha256', privateKey).update(KEY_DOMAIN).digest(),
  };
}

/** Klucz, ktorym podpisujemy NOWE wpisy. */
function signingKey(): RegistryKey | null {
  return envKey() ?? serviceAccountKey();
}

/** Identyfikator klucza nowych wpisow (bez sekretu) - dla skryptu migracji. */
export function registryKeyId(): string | null {
  return signingKey()?.kid ?? null;
}

/** Klucz, ktorym sprawdzamy wpis podpisany kluczem `kid` - albo null. */
function keyForKid(kid: unknown): Buffer | null {
  if (typeof kid !== 'string') return null;
  for (const candidate of [envKey(), serviceAccountKey()]) {
    if (candidate && candidate.kid === kid) return candidate.key;
  }
  return null;
}

function macInput(r: RegisteredReceipt): string {
  return ['v2', r.cluster, r.postId, r.signer, r.txHash, r.author].join('|');
}

function macFor(key: Buffer, r: RegisteredReceipt): string {
  return createHmac('sha256', key).update(macInput(r)).digest('hex');
}

function macOk(key: Buffer, r: RegisteredReceipt, mac: unknown): boolean {
  if (typeof mac !== 'string' || !/^[0-9a-f]{64}$/.test(mac)) return false;
  const expected = Buffer.from(macFor(key, r), 'hex');
  const given = Buffer.from(mac, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function receiptFromDoc(postId: string, data: Record<string, unknown>): RegisteredReceipt {
  return {
    postId,
    signer: String(data.signer ?? ''),
    txHash: String(data.txHash ?? ''),
    slot: Number(data.slot ?? 0),
    blockTime: typeof data.blockTime === 'number' ? data.blockTime : null,
    author: typeof data.author === 'string' ? data.author : '',
    cluster: data.cluster === 'mainnet-beta' ? 'mainnet-beta' : 'devnet',
  };
}

type Sealed =
  | { ok: true; receipt: RegisteredReceipt }
  | { ok: false; reason: 'unavailable' | 'tampered' | 'unregistered' };

/** Sprawdza podpis wpisu. Nie wie nic o poscie. */
function unseal(postId: string, data: Record<string, unknown>): Sealed {
  if (data.kid === undefined) {
    // Wpis bez `kid` pochodzi z pierwszej wersji rejestru (leniwej, sprzed
    // memo v2) albo ktos go wpisal recznie. Tamten format nie jest juz
    // zaufany - traktujemy post jak niezarejestrowany, az przejdzie migracje.
    console.warn(`[receiptRegistry] Wpis ${postId} w starym formacie (bez kid) - wymaga migracji.`);
    return { ok: false, reason: 'unregistered' };
  }
  const key = keyForKid(data.kid);
  const receipt = receiptFromDoc(postId, data);
  if (!key) {
    // Nieznany `kid`: wpis podpisal klucz, ktorego ten serwer nie ma (zmiana
    // sekretu albo konta uslugowego) - albo ktos wpisal smieci. W obu
    // przypadkach nie wiemy, czyj to portfel, wiec blokujemy.
    console.error(`[receiptRegistry] Wpis ${postId}: nieznany klucz "${String(data.kid)}" - platnosci zablokowane.`);
    return { ok: false, reason: 'unavailable' };
  }
  if (!macOk(key, receipt, data.mac)) {
    console.error(`[receiptRegistry] ALARM: wpis ${postId} ma nieprawidlowy HMAC - podrobka albo sabotaz. Platnosci zablokowane.`);
    return { ok: false, reason: 'tampered' };
  }
  return { ok: true, receipt };
}

// ---------------------------------------------------------------------------
// Odczyt
// ---------------------------------------------------------------------------

/**
 * Zarejestrowany kwit posta. Tylko odczyt: brak wpisu to `unregistered`,
 * a nie powod, zeby cokolwiek weryfikowac z pol posta. Rzuca przy chwilowej
 * awarii Firestore, zeby wolajacy odpowiedzial "sprobuj pozniej".
 */
export async function resolveRegisteredReceipt(postId: string): Promise<ReceiptResolution> {
  const db = await getAdminDb();
  if (!db || !signingKey()) return { ok: false, reason: 'unavailable' };

  const [regSnap, postSnap] = await Promise.all([
    db.collection(RECEIPT_COLLECTION).doc(postId).get(),
    db.collection('posts').doc(postId).get(),
  ]);

  if (!regSnap.exists) return { ok: false, reason: 'unregistered' };
  const sealed = unseal(postId, regSnap.data() ?? {});
  if (!sealed.ok) return sealed;
  if (sealed.receipt.cluster !== SOLANA_CLUSTER) return { ok: false, reason: 'wrong-cluster' };

  // Post mogl zostac skasowany (wtedy nic nie placimy) albo zalozony od nowa
  // pod tym samym ID jako post z innej sieci. Portfel i tak bierzemy z wpisu.
  if (!postSnap.exists) return { ok: false, reason: 'post-missing' };
  if (postSnap.data()?.network !== 'solana') return { ok: false, reason: 'not-solana' };

  return { ok: true, receipt: sealed.receipt };
}

// ---------------------------------------------------------------------------
// Zapis posta razem z wpisem
// ---------------------------------------------------------------------------

/** Ile po potwierdzeniu transakcji mozna jeszcze zapisac do niej post. */
export const NEW_POST_MAX_AGE_MS = 30 * 60 * 1000;
/** Zegar walidatora bywa kilka sekund przed naszym. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

export interface NewSolanaPost {
  postId: string;
  signature: string;
  content: string;
  /** Adres EVM z sesji SIWE, w pisowni, pod ktora istnieje profil. */
  author: string;
  image: string | null;
  video: string | null;
  musicTrack: Record<string, unknown> | null;
}

export type CreateSolanaPostResult =
  | { ok: true; postId: string; signer: string; already: boolean }
  | {
      ok: false;
      /**
       * tx-missing  - RPC jeszcze nie zna transakcji (ponow),
       * failed-tx   - transakcja przeszla z bledem,
       * unverified  - memo nie niesie tego ID / tej tresci / tego platnika,
       * stale       - transakcja jest starsza niz NEW_POST_MAX_AGE_MS,
       * conflict    - ten post ma juz wpis z INNA transakcja,
       * unavailable - brak Firebase Admin albo klucza.
       */
      reason: 'tx-missing' | 'failed-tx' | 'unverified' | 'stale' | 'conflict' | 'unavailable';
    };

function tagsIn(content: string, marker: '#' | '@'): string[] {
  const pattern = marker === '#' ? /#(\w+)/g : /@(\w+)/g;
  return Array.from(new Set((content.match(pattern) || []).map(tag => tag.slice(1))));
}

export async function createSolanaPost(connection: Connection, input: NewSolanaPost): Promise<CreateSolanaPostResult> {
  const db = await getAdminDb();
  const key = signingKey();
  if (!db || !key) return { ok: false, reason: 'unavailable' };

  const fetched = await fetchPlainTransaction(connection, input.signature);
  if (!fetched) return { ok: false, reason: 'tx-missing' };
  if (fetched.failed) return { ok: false, reason: 'failed-tx' };

  const memo = readBagsProof(fetched.plain).postMemo;
  if (
    !memo ||
    memo.postId !== input.postId ||
    memo.author !== fetched.plain.feePayer ||
    memo.body !== postMemoBody(input.content)
  ) {
    return { ok: false, reason: 'unverified' };
  }

  const now = Date.now();
  const blockMs = fetched.blockTime === null ? NaN : fetched.blockTime * 1000;
  if (!Number.isFinite(blockMs) || blockMs < now - NEW_POST_MAX_AGE_MS || blockMs > now + CLOCK_SKEW_MS) {
    return { ok: false, reason: 'stale' };
  }

  const receipt: RegisteredReceipt = {
    postId: input.postId,
    signer: fetched.plain.feePayer,
    txHash: input.signature,
    slot: fetched.slot,
    blockTime: fetched.blockTime,
    author: input.author,
    cluster: SOLANA_CLUSTER,
  };

  const { FieldValue } = await import('firebase-admin/firestore');
  const regRef = db.collection(RECEIPT_COLLECTION).doc(input.postId);
  const postRef = db.collection('posts').doc(input.postId);

  return db.runTransaction(async t => {
    const [regSnap, usernameSnap, userSnap] = await Promise.all([
      t.get(regRef),
      t.get(db.collection('usernames').doc(input.author)),
      t.get(db.collection('users').doc(input.author)),
    ]);

    if (regSnap.exists) {
      // Ponowienie tego samego zapisu (klient nie dostal odpowiedzi) jest
      // w porzadku. Kazdy inny istniejacy wpis - prawdziwy czy nie - zostaje:
      // pierwszy zapis wygrywa, a podejrzany wpis rozstrzyga wlasciciel.
      const sealed = unseal(input.postId, regSnap.data() ?? {});
      if (sealed.ok && sealed.receipt.txHash === input.signature) {
        return { ok: true as const, postId: input.postId, signer: sealed.receipt.signer, already: true };
      }
      return { ok: false as const, reason: 'conflict' as const };
    }

    const content = input.content.trim();
    const postData = {
      author: input.author,
      content,
      timestamp: FieldValue.serverTimestamp(),
      likes: 0,
      likedBy: [],
      comments: [],
      commentsCount: 0,
      isPinned: false,
      image: input.image,
      video: input.video,
      tags: tagsIn(content, '#'),
      mentions: tagsIn(content, '@'),
      visibility: 'public',
      txHash: input.signature,
      zoraCoinAddress: null,
      network: 'solana',
      musicTrack: input.musicTrack,
    };

    // `set`, nie `create`: przy starych regulach ktos mogl zalozyc dokument
    // pod tym ID, widzac je w memo na lancuchu, zanim tu doszlismy. Rejestr
    // (`create` nizej) i tak rozstrzyga, kto byl pierwszy.
    t.set(postRef, postData);
    t.create(regRef, {
      ...receipt,
      kid: key.kid,
      mac: macFor(key.key, receipt),
      source: 'server',
      registeredAt: FieldValue.serverTimestamp(),
    });
    if (usernameSnap.exists && usernameSnap.data()?.isBaseName === true) {
      t.set(db.collection('baseNameFeed').doc(input.postId), postData);
    }
    // Tak jak createPost: licznik tylko na istniejacym profilu.
    if (userSnap.exists) {
      t.update(userSnap.ref, {
        postsCount: FieldValue.increment(1),
        'stats.posts': FieldValue.increment(1),
        lastActive: FieldValue.serverTimestamp(),
      });
    }
    return { ok: true as const, postId: input.postId, signer: receipt.signer, already: false };
  });
}

// ---------------------------------------------------------------------------
// Jednorazowa migracja postow sprzed memo v2
// ---------------------------------------------------------------------------

/**
 * Posty z Solany zapisane przez przegladarke przed ta zmiana nie maja wpisu.
 * Rejestruje je WYLACZNIE skrypt wlasciciela (scripts/solana-backfill-receipts.cjs),
 * nigdy zadna trasa.
 *
 * Okno czasowe wzgledem `createTime` jest tu bezpieczne tylko dlatego, ze
 * obejmuje posty utworzone PRZED ta granica. Kto dzis skasuje i zalozy post od
 * nowa, dostaje `createTime` po granicy - i taki post migracji nie podlega.
 */
export const LEGACY_POST_CUTOFF_MS = Date.parse('2026-09-23T00:40:00Z');

export type LegacyOutcome =
  | 'registered'
  | 'would-register'
  | 'already'
  | 'after-cutoff'
  | 'not-solana'
  | 'post-missing'
  | 'tx-missing'
  | 'failed-tx'
  | 'unverified'
  | 'untimely'
  | 'valid-entry-kept'
  | 'unavailable';

export async function registerLegacyReceipt(
  db: Firestore,
  connection: Connection,
  postId: string,
  apply: boolean
): Promise<{ outcome: LegacyOutcome; signer?: string }> {
  const key = signingKey();
  if (!key) return { outcome: 'unavailable' };

  const regRef = db.collection(RECEIPT_COLLECTION).doc(postId);
  const postRef = db.collection('posts').doc(postId);
  const [regSnap, postSnap] = await Promise.all([regRef.get(), postRef.get()]);

  if (regSnap.exists) {
    const sealed = unseal(postId, regSnap.data() ?? {});
    if (sealed.ok) return { outcome: 'already', signer: sealed.receipt.signer };
  }
  if (!postSnap.exists) return { outcome: 'post-missing' };
  const post = postSnap.data() ?? {};
  if (post.network !== 'solana' || typeof post.txHash !== 'string' || !post.txHash) return { outcome: 'not-solana' };
  const createdMs = postSnap.createTime ? postSnap.createTime.toMillis() : NaN;
  if (!(createdMs < LEGACY_POST_CUTOFF_MS)) return { outcome: 'after-cutoff' };

  const fetched = await fetchPlainTransaction(connection, post.txHash);
  if (!fetched) return { outcome: 'tx-missing' };
  if (fetched.failed) return { outcome: 'failed-tx' };
  const memo = readBagsProof(fetched.plain).postMemo;
  const content = typeof post.content === 'string' ? post.content : '';
  if (!memo || memo.author !== fetched.plain.feePayer || !memoMatchesPost(memo.body, content)) {
    return { outcome: 'unverified' };
  }
  if (memo.postId !== null && memo.postId !== postId) return { outcome: 'unverified' };
  if (!isReceiptTimely(fetched.blockTime, createdMs)) return { outcome: 'untimely' };

  const receipt: RegisteredReceipt = {
    postId,
    signer: fetched.plain.feePayer,
    txHash: post.txHash,
    slot: fetched.slot,
    blockTime: fetched.blockTime,
    // Autora sprzed SIWE nikt nie sprawdzil - karta Blinka pokaze portfel.
    author: '',
    cluster: SOLANA_CLUSTER,
  };
  if (!apply) return { outcome: 'would-register', signer: receipt.signer };

  const { FieldValue } = await import('firebase-admin/firestore');
  const outcome = await db.runTransaction(async t => {
    const fresh = await t.get(regRef);
    if (fresh.exists && unseal(postId, fresh.data() ?? {}).ok) return 'valid-entry-kept' as const;
    t.set(regRef, {
      ...receipt,
      kid: key.kid,
      mac: macFor(key.key, receipt),
      source: 'legacy-backfill',
      registeredAt: FieldValue.serverTimestamp(),
    });
    return 'registered' as const;
  });
  return { outcome, signer: receipt.signer };
}
