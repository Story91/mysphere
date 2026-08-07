/**
 * REJESTR AGENTOW MYSPHERE - kolekcje `agents` i `agentFeedback` w Firestore.
 *
 * DLACZEGO TO ISTNIEJE:
 * teza produktu (REDEFINICJA.md) opiera sie na KYA - "Know Your Agent". Ta
 * usluga NIE ISTNIEJE: `kya-api.registr.ai` nie ma rekordu DNS, `registr.ai`
 * nie odpowiada, `@registrai/kya` zostal wycofany z npm, a Registrai
 * spivotowalo na oracle/atestacje. `vendor/kya/index.js` sam pisze w naglowku,
 * ze jest rekonstrukcja API z dokumentacji, zeby build przechodzil. Modul
 * agentow prezentowal wiec dane z nieistniejacego zrodla.
 * MySphere nie moze WYNAJMOWAC warstwy zaufania, wiec musi ja MIEC. To jest ta
 * warstwa - dane, ktore naprawde nalezą do aplikacji.
 *
 * KSZTALT DANYCH:
 *  - `agents/{lowercase-address}` - jeden dokument na agenta. ID dokumentu to
 *    ADRES W LOWERCASE. Deterministyczne ID daje dwie rzeczy naraz:
 *      * dopasowanie autora posta z feedu do agenta jest zwyklym odczytem po
 *        kluczu (bez indeksu, bez skanu),
 *      * rejestracja jest idempotentna - setDoc na tym samym ID nie tworzy
 *        duplikatow.
 *  - `agentFeedback/{auto-id}` - jedna opinia. Pola `scoreSum` i
 *    `feedbackCount` sa ZDENORMALIZOWANE na dokumencie agenta i aktualizowane
 *    w transakcji, dzieki czemu odznaka w feedzie NIE musi czytac opinii.
 *
 * WYDAJNOSC (to jest miara sukcesu tego modulu):
 * feed pyta zbiorczo `getAgentsByAddresses()`, chunkami po 30 przez
 * `where(documentId(), 'in', chunk)` - dokladnie ten sam wzorzec, co
 * `getBulkPostTipStats()` i `getBulkUnlockedPostIds()`. 150 unikalnych autorow
 * = 5 zapytan, niezaleznie od liczby postow. Zaden odczyt nie wymaga indeksu
 * zlozonego - wszystkie zapytania ida po kluczu albo po jednym polu.
 *
 * PUSTA KOLEKCJA:
 * kazda funkcja odczytu zwraca pusty wynik i NIE rzuca. Brak agentow oznacza
 * brak odznak - feed wyglada dokladnie tak, jak przed ta zmiana.
 */

import {
  collection,
  doc,
  documentId,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  setDoc,
  writeBatch,
  startAfter,
  where,
  limit as firestoreLimit,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  SUPPORTED_AGENT_CHAINS,
  type AgentChainReputation,
  type AgentFeedbackRecord,
  type AgentNetwork,
  type AgentRecord,
  type AgentRegistryStats,
  type AgentReputation,
  type AgentReputationSnapshot,
  type AgentTrustCheck,
  type ListAgentsOptions,
  type ListAgentsResult,
} from './types';

export const AGENTS_COLLECTION = 'agents';
export const AGENT_FEEDBACK_COLLECTION = 'agentFeedback';

/**
 * Progi zaufania. Te same liczby, co w
 * `app/MyAgents/components/KYATrustBadge.tsx` - odznaka w feedzie i odznaka w
 * rejestrze musza znaczyc to samo.
 */
export const TRUST_MIN_SCORE = 50;
export const TRUST_MIN_FEEDBACK = 3;

/** Limit Firestore na liczbe wartosci w operatorze `in`. */
const IN_CHUNK_SIZE = 30;

/** Ile opinii najwyzej czytamy na raz dla jednego agenta. */
const FEEDBACK_FETCH_CAP = 300;

/** Skala suwaka w formularzu opinii. */
const RAW_SCORE_MIN = -100;
const RAW_SCORE_MAX = 100;

const COMMENT_MAX_LENGTH = 280;

/* ------------------------------------------------------------------ */
/* Pomocnicze                                                          */
/* ------------------------------------------------------------------ */

/** Adres zawsze w lowercase - to klucz dokumentu, wiec musi byc deterministyczny. */
export function normalizeAgentAddress(address?: string | null): string {
  return (address || '').trim().toLowerCase();
}

export function isAgentAddress(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/**
 * Ostrzezenie o problemie z odczytem pokazujemy RAZ na sesje. Feed wola
 * rejestr przy kazdym renderze listy - 150 identycznych bledow w konsoli nie
 * niesie zadnej dodatkowej informacji, a zaglusza reszte.
 */
const warnedKeys = new Set<string>();
function warnOnce(key: string, error: unknown): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(`[agents] ${key}:`, error);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toIso(ms: unknown): string | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/* ------------------------------------------------------------------ */
/* Reputacja - czyste funkcje, bez I/O                                 */
/* ------------------------------------------------------------------ */

/**
 * JAK LICZYMY WYNIK.
 * Opinia ma skale suwaka -100..100 (negatywna / neutralna / pozytywna).
 * Odznaki, filtry ("50+", "70+", "90+") i progi zaufania operuja na skali
 * 0..100, wiec srednia z ocen jest liniowo przeskalowana: `(raw + 100) / 2`.
 * Neutralna opinia (0) daje 50, skrajnie negatywna 0, skrajnie pozytywna 100.
 * Wynik to ZAOKRAGLONA srednia znormalizowanych ocen; przy zerze opinii nie ma
 * wyniku (null), bo srednia z pustego zbioru nie istnieje - i wlasnie dlatego
 * `TRUST_MIN_FEEDBACK` jest osobnym progiem, a nie czescia wyniku.
 */
export function normalizeRawScore(raw: number): number {
  const clamped = Math.max(RAW_SCORE_MIN, Math.min(RAW_SCORE_MAX, raw));
  return (clamped + 100) / 2;
}

/** `scoreSum` to suma ocen SUROWYCH; dzielimy i dopiero potem skalujemy. */
export function computeScore(scoreSum: number, feedbackCount: number): number | null {
  if (!feedbackCount || feedbackCount <= 0) return null;
  return Math.round(normalizeRawScore(scoreSum / feedbackCount));
}

export function isTrusted(
  score: number | null | undefined,
  feedbackCount: number,
  opts: { minScore?: number; minFeedback?: number } = {}
): boolean {
  const minScore = opts.minScore ?? TRUST_MIN_SCORE;
  const minFeedback = opts.minFeedback ?? TRUST_MIN_FEEDBACK;
  return typeof score === 'number' && score >= minScore && feedbackCount >= minFeedback;
}

/** Reputacja w rozbiciu na lancuchy - liczona z opinii, ktore mamy juz w pamieci. */
export function computePerChainReputation(feedback: AgentFeedbackRecord[]): AgentChainReputation[] {
  const byChain = new Map<number, { sum: number; count: number }>();

  for (const item of feedback) {
    const chainId = typeof item.chainId === 'number' ? item.chainId : 0;
    const entry = byChain.get(chainId) || { sum: 0, count: 0 };
    entry.sum += item.score;
    entry.count += 1;
    byChain.set(chainId, entry);
  }

  return Array.from(byChain.entries())
    .map(([chainId, entry]) => ({
      chain: chainNameForId(chainId),
      chainId: chainId || undefined,
      value: computeScore(entry.sum, entry.count) ?? 0,
      decimals: 0,
      feedbackCount: entry.count,
    }))
    .sort((a, b) => (b.feedbackCount || 0) - (a.feedbackCount || 0));
}

/**
 * Historia reputacji = srednia kroczaca po kolejnych opiniach. Nie trzymamy
 * osobnych migawek, bo dalyby dokladnie te sama informacje kosztem drugiej
 * kolekcji - wykres da sie odtworzyc z opinii, ktore i tak czytamy.
 */
export function computeReputationHistory(
  feedback: AgentFeedbackRecord[],
  maxPoints = 30
): AgentReputationSnapshot[] {
  const chronological = [...feedback].sort(
    (a, b) => Date.parse(a.createdAt || '0') - Date.parse(b.createdAt || '0')
  );

  const points: AgentReputationSnapshot[] = [];
  let sum = 0;
  chronological.forEach((item, index) => {
    sum += item.score;
    points.push({
      value: computeScore(sum, index + 1) ?? 0,
      timestamp: item.createdAt || new Date().toISOString(),
      feedbackCount: index + 1,
    });
  });

  // Wykres pokazuje ostatnie N punktow - starsze i tak sa juz zawarte w sredniej.
  return points.slice(-maxPoints);
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  10: 'optimism',
  480: 'worldchain',
  8453: 'base',
  42220: 'celo',
  59144: 'linea',
  123420111: 'basecamp',
};

function chainNameForId(chainId: number): string {
  return CHAIN_NAMES[chainId] || (chainId ? String(chainId) : 'base');
}

/* ------------------------------------------------------------------ */
/* Mapowanie dokumentow                                                */
/* ------------------------------------------------------------------ */

function mapAgentDoc(id: string, data: DocumentData): AgentRecord {
  const address = normalizeAgentAddress((data.address as string) || id);
  const feedbackCount = Number(data.feedbackCount) || 0;
  const scoreSum = Number(data.scoreSum) || 0;
  const score = computeScore(scoreSum, feedbackCount);
  const chains: string[] = Array.isArray(data.chains) && data.chains.length ? data.chains : ['base'];

  return {
    masterAgentId: (data.masterAgentId as string) || address,
    ownerAddress: normalizeAgentAddress((data.ownerAddress as string) || address),
    address,
    name: (data.name as string) || undefined,
    description: (data.description as string) || undefined,
    chains,
    network: (data.network as AgentNetwork) || 'mainnet',
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    registeredAt: toIso(data.registeredAtMs),
    registeredBy: (data.registeredBy as string) || undefined,
    // `undefined` zamiast 0, gdy nie ma jeszcze zadnej oceny - UI odroznia
    // "brak reputacji" od "reputacja rowna zeru".
    score: score ?? undefined,
    feedbackCount,
    trusted: isTrusted(score, feedbackCount),
    identities: chains.map((chain) => ({ chain, agentId: address, registeredAt: toIso(data.registeredAtMs) })),
    reputation: { value: score ?? 0, decimals: 0, totalFeedbackCount: feedbackCount },
  };
}

function mapFeedbackDoc(id: string, data: DocumentData): AgentFeedbackRecord {
  return {
    id,
    agentAddress: normalizeAgentAddress(data.agentAddress as string),
    commenterAddress: normalizeAgentAddress(data.commenterAddress as string),
    score: Number(data.score) || 0,
    tag: (data.tag as string) || undefined,
    comment: (data.comment as string) || undefined,
    commentHash: (data.commentHash as string) || undefined,
    txHash: (data.txHash as string) || undefined,
    chainId: typeof data.chainId === 'number' ? data.chainId : undefined,
    createdAt: toIso(data.createdAtMs),
  };
}

/* ------------------------------------------------------------------ */
/* Rejestracja                                                         */
/* ------------------------------------------------------------------ */

export interface RegisterAgentInput {
  /** Adres agenta. Po znormalizowaniu staje sie ID dokumentu. */
  address: string;
  /** Wlasciciel; domyslnie ten sam adres. */
  ownerAddress?: string;
  name?: string;
  description?: string;
  chains?: string[];
  network?: AgentNetwork;
  tags?: string[];
  /** Adres portfela, ktory dokonal rejestracji. */
  registeredBy?: string;
}

/**
 * Rejestruje agenta. IDEMPOTENTNE - `merge: true` plus brak pol reputacji w
 * zapisie sprawiaja, ze ponowna rejestracja aktualizuje metadane, a NIE kasuje
 * zebranych ocen.
 */
export async function registerAgent(input: RegisterAgentInput): Promise<AgentRecord> {
  const address = normalizeAgentAddress(input.address);
  if (!isAgentAddress(address)) {
    throw new Error('Agent address must be a valid 0x address');
  }

  const ref = doc(db, AGENTS_COLLECTION, address);
  const existing = await getDoc(ref);
  const now = Date.now();

  const payload: DocumentData = {
    address,
    masterAgentId: address,
    ownerAddress: normalizeAgentAddress(input.ownerAddress || address),
    chains: input.chains?.length ? input.chains : ['base'],
    network: input.network || 'mainnet',
    updatedAtMs: now,
  };
  if (input.name) payload.name = input.name;
  if (input.description) payload.description = input.description;
  if (input.tags?.length) payload.tags = input.tags;
  if (input.registeredBy) payload.registeredBy = normalizeAgentAddress(input.registeredBy);

  if (!existing.exists()) {
    payload.registeredAtMs = now;
    // Liczniki reputacji zakladamy TYLKO przy tworzeniu, zeby ponowna
    // rejestracja nie wyzerowala historii ocen.
    payload.feedbackCount = 0;
    payload.scoreSum = 0;
  }

  await setDoc(ref, payload, { merge: true });

  const saved = await getDoc(ref);
  return mapAgentDoc(address, saved.data() || payload);
}

/* ------------------------------------------------------------------ */
/* Odczyt                                                              */
/* ------------------------------------------------------------------ */

/** Pojedynczy agent po adresie. Zwraca null, gdy nie ma go w rejestrze. */
export async function getAgent(address: string): Promise<AgentRecord | null> {
  const id = normalizeAgentAddress(address);
  if (!id) return null;

  try {
    const snapshot = await getDoc(doc(db, AGENTS_COLLECTION, id));
    return snapshot.exists() ? mapAgentDoc(snapshot.id, snapshot.data()) : null;
  } catch (error) {
    warnOnce('nie udalo sie pobrac agenta', error);
    return null;
  }
}

/**
 * ZBIORCZY odczyt agentow po adresach - to jest funkcja, dla ktorej powstal
 * caly modul.
 *
 * Chunkujemy po 30 (limit Firestore na `in`) i pytamy po `documentId()`, wiec:
 *  - 150 unikalnych autorow w feedzie = 5 zapytan, ZAWSZE tyle samo,
 *  - liczba zapytan zalezy od liczby unikalnych adresow, nie od liczby postow,
 *  - zaden indeks zlozony nie jest potrzebny (zapytanie idzie po kluczu).
 *
 * Zwraca mape adres(lowercase) -> agent. Adresy spoza rejestru po prostu nie
 * maja wpisu; blad odczytu daje wynik czesciowy, nigdy wyjatek.
 */
export async function getAgentsByAddresses(addresses: string[]): Promise<Record<string, AgentRecord>> {
  const result: Record<string, AgentRecord> = {};

  const unique = Array.from(
    new Set(addresses.map(normalizeAgentAddress).filter((a) => isAgentAddress(a)))
  );
  if (unique.length === 0) return result;

  try {
    for (const ids of chunk(unique, IN_CHUNK_SIZE)) {
      const snapshot = await getDocs(
        query(collection(db, AGENTS_COLLECTION), where(documentId(), 'in', ids))
      );
      snapshot.docs.forEach((d) => {
        result[normalizeAgentAddress(d.id)] = mapAgentDoc(d.id, d.data());
      });
    }
  } catch (error) {
    warnOnce('nie udalo sie pobrac agentow zbiorczo', error);
  }

  return result;
}

/**
 * Strona rejestru. Sortowanie po `registeredAtMs` malejaco, kursorem jest
 * wartosc tego pola z ostatniego elementu poprzedniej strony.
 *
 * Filtry `network`/`chain` sa nakladane W PAMIECI, a nie w zapytaniu. To
 * swiadome: `where(...) + orderBy(...)` wymagaloby indeksu zlozonego, a
 * brakujacy indeks w Firestore to blad w konsoli i pusty widok az do momentu,
 * w ktorym ktos go recznie zalozy. Rejestr jest maly, wiec filtrowanie po
 * stronie klienta jest tansze niz ten koszt operacyjny.
 */
export async function listAgents(options: ListAgentsOptions = {}): Promise<ListAgentsResult> {
  const pageSize = Math.max(1, Math.min(options.limit ?? 24, 100));

  try {
    const constraints: QueryConstraint[] = [orderBy('registeredAtMs', 'desc')];
    if (typeof options.cursor === 'number') constraints.push(startAfter(options.cursor));
    constraints.push(firestoreLimit(pageSize));

    const snapshot = await getDocs(query(collection(db, AGENTS_COLLECTION), ...constraints));

    const raw = snapshot.docs.map((d) => ({ record: mapAgentDoc(d.id, d.data()), data: d.data() }));

    const items = raw
      .map((entry) => entry.record)
      .filter((agent) => {
        if (options.network && agent.network !== options.network) return false;
        if (options.chain && !(agent.chains || []).includes(options.chain)) return false;
        return true;
      });

    const last = raw[raw.length - 1];
    const nextCursor = last && typeof last.data.registeredAtMs === 'number' ? last.data.registeredAtMs : null;

    return {
      items,
      nextCursor,
      // Krotsza strona niz limit oznacza koniec kolekcji. Liczymy na surowej
      // stronie, bo filtr dziala juz po odczycie.
      hasMore: raw.length === pageSize && nextCursor !== null,
    };
  } catch (error) {
    warnOnce('nie udalo sie pobrac listy agentow', error);
    return { items: [], nextCursor: null, hasMore: false };
  }
}

/**
 * Opinie o jednym agencie. Zapytanie po JEDNYM polu (`agentAddress`), bez
 * `orderBy` - sortowanie robimy w pamieci, zeby nie wymagac indeksu zlozonego.
 * Liczba opinii na agenta jest mala, wiec to nic nie kosztuje.
 */
export async function getAgentFeedback(
  address: string,
  options: { limit?: number } = {}
): Promise<AgentFeedbackRecord[]> {
  const agentAddress = normalizeAgentAddress(address);
  if (!agentAddress) return [];

  try {
    const snapshot = await getDocs(
      query(
        collection(db, AGENT_FEEDBACK_COLLECTION),
        where('agentAddress', '==', agentAddress),
        firestoreLimit(Math.min(options.limit ?? FEEDBACK_FETCH_CAP, FEEDBACK_FETCH_CAP))
      )
    );

    return snapshot.docs
      .map((d) => mapFeedbackDoc(d.id, d.data()))
      .sort((a, b) => Date.parse(b.createdAt || '0') - Date.parse(a.createdAt || '0'));
  } catch (error) {
    warnOnce('nie udalo sie pobrac opinii', error);
    return [];
  }
}

/**
 * Reputacja agenta. `unified` bierzemy z ZDENORMALIZOWANYCH licznikow na
 * dokumencie agenta (jeden odczyt po kluczu), `perChain` z opinii.
 */
export async function getReputation(address: string): Promise<AgentReputation> {
  const [agent, feedback] = await Promise.all([getAgent(address), getAgentFeedback(address)]);

  return {
    unified: agent?.reputation ?? { value: 0, decimals: 0, totalFeedbackCount: 0 },
    perChain: computePerChainReputation(feedback),
  };
}

/** Szybkie sprawdzenie zaufania - jeden odczyt po kluczu. */
export async function isAgentTrusted(
  address: string,
  opts: { minScore?: number; minFeedback?: number } = {}
): Promise<AgentTrustCheck> {
  const minScore = opts.minScore ?? TRUST_MIN_SCORE;
  const minFeedback = opts.minFeedback ?? TRUST_MIN_FEEDBACK;

  const agent = await getAgent(address);
  if (!agent) {
    return { trusted: false, score: 0, feedbackCount: 0, reason: 'Agent is not in the MySphere registry' };
  }

  const score = agent.score ?? null;
  const feedbackCount = agent.feedbackCount ?? 0;
  const trusted = isTrusted(score, feedbackCount, { minScore, minFeedback });

  let reason = 'Meets the trust thresholds';
  if (!trusted) {
    if (feedbackCount < minFeedback) reason = `Needs at least ${minFeedback} reviews (has ${feedbackCount})`;
    else reason = `Score ${score ?? 0} is below the ${minScore} threshold`;
  }

  return { trusted, score: score ?? 0, feedbackCount, reason };
}

/** Statystyki rejestru. Liczniki serwerowe - nie sciagaja dokumentow. */
export async function getRegistryStats(): Promise<AgentRegistryStats> {
  const empty: AgentRegistryStats = {
    totalAgents: 0,
    totalFeedback: 0,
    totalChains: SUPPORTED_AGENT_CHAINS.length,
    trustedAgents: 0,
    trustedPercent: 0,
  };

  try {
    const [agentsCount, feedbackCount] = await Promise.all([
      getCountFromServer(collection(db, AGENTS_COLLECTION)),
      getCountFromServer(collection(db, AGENT_FEEDBACK_COLLECTION)),
    ]);

    const totalAgents = agentsCount.data().count;
    if (totalAgents === 0) return empty;

    // Zaufanie jest zdenormalizowane na dokumencie agenta, wiec da sie je
    // policzyc jednym zapytaniem po jednym polu (indeks automatyczny).
    const trustedCount = await getCountFromServer(
      query(collection(db, AGENTS_COLLECTION), where('trusted', '==', true))
    );
    const trustedAgents = trustedCount.data().count;

    return {
      totalAgents,
      totalFeedback: feedbackCount.data().count,
      totalChains: SUPPORTED_AGENT_CHAINS.length,
      trustedAgents,
      trustedPercent: Math.round((trustedAgents / totalAgents) * 100),
    };
  } catch (error) {
    warnOnce('nie udalo sie pobrac statystyk rejestru', error);
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/* Zapis opinii                                                        */
/* ------------------------------------------------------------------ */

export interface SubmitAgentFeedbackInput {
  agentAddress: string;
  commenterAddress: string;
  /** Ocena surowa w skali -100..100 (suwak w FeedbackForm). */
  score: number;
  tag?: string;
  comment?: string;
  commentHash?: string;
  txHash?: string;
  chainId?: number;
}

/**
 * Zapisuje opinie i AKTUALIZUJE liczniki na dokumencie agenta w jednej
 * transakcji. Denormalizacja jest tu celowa: dzieki niej odznaka w feedzie
 * czyta tylko `agents`, a nigdy `agentFeedback`.
 *
 * Blad "agent nie jest zarejestrowany" jest swiadomy - rejestr ocenia agentow,
 * ktorych zna, a nie dowolne adresy.
 */
export async function submitFeedback(input: SubmitAgentFeedbackInput): Promise<AgentFeedbackRecord> {
  const agentAddress = normalizeAgentAddress(input.agentAddress);
  const commenterAddress = normalizeAgentAddress(input.commenterAddress);

  if (!isAgentAddress(agentAddress)) throw new Error('Agent address must be a valid 0x address');
  if (!isAgentAddress(commenterAddress)) throw new Error('Reviewer address must be a valid 0x address');

  const rawScore = Math.max(RAW_SCORE_MIN, Math.min(RAW_SCORE_MAX, Math.round(Number(input.score) || 0)));
  const createdAtMs = Date.now();

  const agentRef = doc(db, AGENTS_COLLECTION, agentAddress);
  const feedbackRef = doc(collection(db, AGENT_FEEDBACK_COLLECTION));

  const payload: DocumentData = {
    agentAddress,
    commenterAddress,
    score: rawScore,
    createdAtMs,
  };
  if (input.tag) payload.tag = input.tag;
  if (input.comment) payload.comment = input.comment.slice(0, COMMENT_MAX_LENGTH);
  if (input.commentHash) payload.commentHash = input.commentHash;
  if (input.txHash) payload.txHash = input.txHash;
  if (typeof input.chainId === 'number') payload.chainId = input.chainId;

  // === DLACZEGO TO NIE JEST TRANSAKCJA ===
  // Transakcje sa na tej bazie odrzucane (RESOURCE_EXHAUSTED nawet dla
  // transakcji, ktora nic nie zapisuje) - ten sam limit, przez ktory nie
  // dzialaly lajki. Pelna diagnoza w app/utils/firebase.ts przy `toggleLike`.
  // Ocena agenta po prostu nie przechodzila.
  //
  // LICZNIKI SA DALEJ DOKLADNE, bo `increment` jest atomowy po stronie
  // serwera - dwie rownoczesne oceny daja +2, nie +1, bez zadnego zamka.
  // Odczyt zostaje wylacznie po to, zeby (a) sprawdzic, czy agent w ogole
  // istnieje, i (b) policzyc pochodna flage `trusted`.
  //
  // JEDYNA CENA: `trusted` liczymy z sumy sprzed naszego zapisu powiekszonej
  // o wlasna ocene. Przy dwoch ocenach w tej samej chwili flaga moze byc
  // o jedna opinie do tylu - i sama sie poprawia przy nastepnej. Same liczby,
  // po ktorych sie filtruje i sortuje, nie rozjezdzaja sie nigdy.
  const agentSnapshot = await getDoc(agentRef);
  if (!agentSnapshot.exists()) {
    throw new Error('Agent is not registered in the MySphere registry');
  }

  const data = agentSnapshot.data();
  const feedbackCount = (Number(data.feedbackCount) || 0) + 1;
  const scoreSum = (Number(data.scoreSum) || 0) + rawScore;
  const score = computeScore(scoreSum, feedbackCount);

  const batch = writeBatch(db);
  batch.set(feedbackRef, payload);
  batch.update(agentRef, {
    feedbackCount: increment(1),
    scoreSum: increment(rawScore),
    // `trusted` trzymamy na dokumencie, zeby dalo sie po nim filtrowac i
    // liczyc bez czytania opinii.
    trusted: isTrusted(score, feedbackCount),
    updatedAtMs: createdAtMs,
  });
  await batch.commit();

  return mapFeedbackDoc(feedbackRef.id, payload);
}
