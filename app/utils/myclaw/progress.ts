/**
 * MyClaw Academy - trwaly magazyn postepow agenta (Firestore, kolekcja
 * `agentProgress`).
 *
 * KSZTALT: jeden dokument na pare (agentAddress, discipline), o
 * DETERMINISTYCZNYM ID `${agentAddress_lowercase}__${discipline}`. Ten sam
 * wzorzec co `app/utils/monetization/unlocks.ts`, i z tych samych powodow:
 *  - zapis jest idempotentny (setDoc z merge na tym samym ID),
 *  - odczyt idzie po kluczu, wiec NIE potrzeba indeksow zlozonych,
 *  - brak dokumentu = brak postepow, bez zadnego zapytania kolekcyjnego.
 *
 * CO ZAMYKA: cztery dziury z audytu Academy - brak limitu podejsc do egzaminu,
 * brak zapisu ukonczenia lekcji, brak historii wyzwan, brak wiedzy o tym, czy
 * agent juz sie certyfikowal.
 *
 * DOSTEPNOSC PONAD RESTRYKCYJNOSC: gdy odczyt Firestore padnie (kolekcja pusta
 * jest OK - to po prostu brak dokumentu - ale reguly niewdrozone albo chwilowa
 * awaria juz nie), canAttemptExam PRZEPUSZCZA probe i loguje ostrzezenie.
 * Zablokowanie placacego agenta przez awarie bazy jest gorsze niz wpuszczenie
 * jednej proby za duzo.
 */

import { doc, getDoc, setDoc, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import type { Discipline } from "./certificationExams";

export const AGENT_PROGRESS_COLLECTION = "agentProgress";

// ---------------------------------------------------------------------------
// LIMITY
// ---------------------------------------------------------------------------

/**
 * Cooldown miedzy podejsciami: 1 godzina.
 *
 * Uzasadnienie: egzamin to 8 pytan po 4 opcje, prog 70% (6/8). Czyste zgadywanie
 * daje ok. 0,4% szans na zdanie w jednej probie. Przy braku limitu i cenie $0.01
 * oczekiwany koszt "zdania przez powtarzanie" to okolo $2.5 - taniej niz nauka,
 * czyli certyfikat nic nie znaczy. Godzinny cooldown przesuwa ten koszt z pieniedzy
 * na CZAS: ~250 prob to ponad 80 dni przy 3 probach dziennie. Jednoczesnie godzina
 * jest na tyle krotka, ze agent, ktory faktycznie oblal i poszedl powtorzyc
 * material (reviewTopics wskazuja lekcje), nie jest realnie ukarany.
 *
 * Cooldown jest ROWNY oknu losowania pytan (EXAM_DRAW_WINDOW_MS), wiec kazde
 * dozwolone podejscie dostaje inny zestaw 8 pytan z banku 16.
 */
export const EXAM_ATTEMPT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Limit prob na dobe: 3.
 *
 * Sam cooldown pozwolilby na 24 proby dziennie - za duzo, zeby losowanie 8 z 16
 * cokolwiek dawalo. Trzy proby to kompromis: mieszcza sie w nich sensowne
 * scenariusze uczciwego agenta (oblal, powtorzyl, zdal, plus zapas na blad
 * formatu odpowiedzi), a jednoczesnie brute-force zjezdza do tempa, przy ktorym
 * nauka materialu jest po prostu szybsza.
 */
export const EXAM_MAX_ATTEMPTS_PER_DAY = 3;

/** Okno "doby" dla limitu dziennego - przesuwne 24 h, nie kalendarzowe. */
export const EXAM_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// KSZTALT DOKUMENTU
// ---------------------------------------------------------------------------

/** Wpis w logu podejsc do egzaminu. Log jest TYLKO dopisywalny. */
export type ExamAttemptLogEntry = {
  /** Timestamp ms podejscia. */
  attemptedAt: number;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  /** Ktore pytania zostaly wylosowane w tym podejsciu. */
  questionIds: string[];
};

/** Wpis w historii wyzwan. Rowniez tylko dopisywalny. */
export type ChallengeLogEntry = {
  challengeId: string;
  attemptedAt: number;
  score: number;
  total: number;
  passed: boolean;
};

export type AgentProgress = {
  agentAddress: string;
  discipline: Discipline;
  /** Id lekcji, ktore agent oplacil i pobral (arrayUnion - bez duplikatow). */
  completedLessons: string[];
  /** Id wyzwan zaliczonych w 100% (arrayUnion - bez duplikatow). */
  passedChallenges: string[];
  /** Pelna historia wyzwan, wraz z nieudanymi. */
  challengeLog: ChallengeLogEntry[];
  /** Log podejsc do egzaminu - podstawa limitow. */
  examAttempts: ExamAttemptLogEntry[];
  /** Timestamp ostatniej proby egzaminu (duplikat z logu, dla czytelnosci regul). */
  lastAttemptAt: number | null;
  certified: boolean;
  certifiedAt: number | null;
  updatedAt: number;
};

/** ID dokumentu postepu. Adres zawsze lowercase. */
export function progressDocId(agentAddress: string, discipline: Discipline): string {
  return `${agentAddress.toLowerCase()}__${discipline}`;
}

/** Pusty postep - uzywany jako baza, gdy dokumentu jeszcze nie ma. */
function emptyProgress(agentAddress: string, discipline: Discipline): AgentProgress {
  return {
    agentAddress: agentAddress.toLowerCase(),
    discipline,
    completedLessons: [],
    passedChallenges: [],
    challengeLog: [],
    examAttempts: [],
    lastAttemptAt: null,
    certified: false,
    certifiedAt: null,
    updatedAt: 0,
  };
}

/** Defensywna normalizacja - dokument moze byc starszy albo niekompletny. */
function normalizeProgress(agentAddress: string, discipline: Discipline, raw: unknown): AgentProgress {
  const base = emptyProgress(agentAddress, discipline);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<AgentProgress>;
  return {
    ...base,
    completedLessons: Array.isArray(data.completedLessons) ? data.completedLessons : [],
    passedChallenges: Array.isArray(data.passedChallenges) ? data.passedChallenges : [],
    challengeLog: Array.isArray(data.challengeLog) ? data.challengeLog : [],
    examAttempts: Array.isArray(data.examAttempts) ? data.examAttempts : [],
    lastAttemptAt: typeof data.lastAttemptAt === "number" ? data.lastAttemptAt : null,
    certified: data.certified === true,
    certifiedAt: typeof data.certifiedAt === "number" ? data.certifiedAt : null,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
  };
}

/**
 * Odczyt z rozroznieniem "brak dokumentu" od "nie udalo sie odczytac".
 * To rozroznienie jest kluczowe dla fail-open w canAttemptExam.
 */
async function readProgress(
  agentAddress: string,
  discipline: Discipline
): Promise<{ progress: AgentProgress; storeAvailable: boolean }> {
  try {
    const snapshot = await getDoc(doc(db, AGENT_PROGRESS_COLLECTION, progressDocId(agentAddress, discipline)));
    if (!snapshot.exists()) {
      return { progress: emptyProgress(agentAddress, discipline), storeAvailable: true };
    }
    return { progress: normalizeProgress(agentAddress, discipline, snapshot.data()), storeAvailable: true };
  } catch (error) {
    console.warn("[myclaw/progress] nie udalo sie odczytac postepu agenta:", error);
    return { progress: emptyProgress(agentAddress, discipline), storeAvailable: false };
  }
}

/** Publiczny odczyt postepu. Przy bledzie zwraca pusty postep. */
export async function getAgentProgress(
  agentAddress: string,
  discipline: Discipline
): Promise<AgentProgress> {
  const { progress } = await readProgress(agentAddress, discipline);
  return progress;
}

// ---------------------------------------------------------------------------
// ZAPISY
// ---------------------------------------------------------------------------

/**
 * Wspolny zapis: merge + arrayUnion, wiec dokument powstaje przy pierwszym
 * zapisie, a tablice tylko rosna. Blad zapisu NIGDY nie wywala trasy - postep
 * jest dodatkiem do odpowiedzi, nie jej warunkiem.
 */
async function mergeProgress(
  agentAddress: string,
  discipline: Discipline,
  patch: Record<string, unknown>,
  context: string
): Promise<boolean> {
  try {
    await setDoc(
      doc(db, AGENT_PROGRESS_COLLECTION, progressDocId(agentAddress, discipline)),
      {
        agentAddress: agentAddress.toLowerCase(),
        discipline,
        updatedAt: Date.now(),
        ...patch,
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.warn(`[myclaw/progress] nie udalo sie zapisac postepu (${context}):`, error);
    return false;
  }
}

/** Zapisuje ukonczenie lekcji (agent oplacil i pobral tresc). */
export async function recordLessonCompletion(
  agentAddress: string,
  discipline: Discipline,
  lessonId: string
): Promise<boolean> {
  if (!lessonId) return false;
  return mergeProgress(
    agentAddress,
    discipline,
    { completedLessons: arrayUnion(lessonId) },
    `lesson ${lessonId}`
  );
}

/** Zapisuje wynik wyzwania - i do historii, i (gdy zdane) do listy zaliczonych. */
export async function recordChallengeResult(
  agentAddress: string,
  discipline: Discipline,
  entry: ChallengeLogEntry
): Promise<boolean> {
  const patch: Record<string, unknown> = { challengeLog: arrayUnion(entry) };
  if (entry.passed) {
    patch.passedChallenges = arrayUnion(entry.challengeId);
  }
  return mergeProgress(agentAddress, discipline, patch, `challenge ${entry.challengeId}`);
}

/**
 * Dopisuje podejscie do egzaminu. Po zdaniu ustawia `certified`, co domyka
 * dyscypline - kolejnych podejsc juz nie bedzie.
 */
export async function recordExamAttempt(
  agentAddress: string,
  discipline: Discipline,
  attempt: ExamAttemptLogEntry
): Promise<boolean> {
  const patch: Record<string, unknown> = {
    examAttempts: arrayUnion(attempt),
    lastAttemptAt: attempt.attemptedAt,
  };
  if (attempt.passed) {
    patch.certified = true;
    patch.certifiedAt = attempt.attemptedAt;
  }
  return mergeProgress(agentAddress, discipline, patch, "exam attempt");
}

// ---------------------------------------------------------------------------
// LIMITY PODEJSC
// ---------------------------------------------------------------------------

export type ExamAttemptDecision = {
  allowed: boolean;
  /** Powod odmowy - stabilny kod, do obslugi po stronie agenta. */
  reason?: "already-certified" | "cooldown" | "daily-limit";
  /** Czytelny opis dla agenta. */
  message?: string;
  /** Timestamp ms, od kiedy wolno sprobowac ponownie (null = nigdy). */
  nextAttemptAt?: number | null;
  /** Ile prob w ostatnich 24 h. */
  attemptsLast24h: number;
  attemptsRemainingToday: number;
  totalAttempts: number;
  /** false = odczyt Firestore sie nie powiodl i limity NIE byly egzekwowane. */
  storeAvailable: boolean;
};

/**
 * Czy agent moze teraz podejsc do egzaminu z danej dyscypliny.
 *
 * Kolejnosc regul jest istotna:
 *  1. zdany egzamin -> koniec, zadnych kolejnych podejsc (nextAttemptAt = null),
 *  2. cooldown od ostatniej proby,
 *  3. limit prob w przesuwnym oknie 24 h.
 *
 * MUSI byc wolane PRZED ocena egzaminu i przed jakakolwiek praca w handlerze -
 * odmowa konczy sie statusem 429, a withX402 rozlicza platnosc wylacznie dla
 * odpowiedzi ze statusem < 400, wiec agent nie placi za odrzucona probe.
 */
export async function canAttemptExam(
  agentAddress: string,
  discipline: Discipline,
  now: number = Date.now()
): Promise<ExamAttemptDecision> {
  const { progress, storeAvailable } = await readProgress(agentAddress, discipline);

  const attempts = progress.examAttempts.filter(a => a && typeof a.attemptedAt === "number");
  const recent = attempts.filter(a => now - a.attemptedAt < EXAM_DAY_WINDOW_MS);
  const attemptsLast24h = recent.length;

  const base = {
    attemptsLast24h,
    attemptsRemainingToday: Math.max(0, EXAM_MAX_ATTEMPTS_PER_DAY - attemptsLast24h),
    totalAttempts: attempts.length,
    storeAvailable,
  };

  // FAIL-OPEN: bez dzialajacego odczytu nie mamy podstaw do odmowy. Lepiej
  // wpuscic jedna probe za duzo niz zablokowac placacego agenta na awarii bazy.
  if (!storeAvailable) {
    return {
      allowed: true,
      message: "Attempt limits could not be checked (progress store unavailable) - the attempt was allowed.",
      nextAttemptAt: null,
      ...base,
    };
  }

  if (progress.certified) {
    return {
      allowed: false,
      reason: "already-certified",
      message: `Already certified in "${discipline}". Further exam attempts are not accepted.`,
      nextAttemptAt: null,
      ...base,
    };
  }

  const lastAttemptAt = attempts.reduce((max, a) => Math.max(max, a.attemptedAt), 0);
  if (lastAttemptAt > 0) {
    const cooldownEndsAt = lastAttemptAt + EXAM_ATTEMPT_COOLDOWN_MS;
    if (now < cooldownEndsAt) {
      return {
        allowed: false,
        reason: "cooldown",
        message: `Cooldown active. The next attempt is accepted after ${new Date(cooldownEndsAt).toISOString()}.`,
        nextAttemptAt: cooldownEndsAt,
        ...base,
      };
    }
  }

  if (attemptsLast24h >= EXAM_MAX_ATTEMPTS_PER_DAY) {
    // Okno jest przesuwne, wiec kolejny slot zwalnia sie 24 h po NAJSTARSZEJ
    // probie mieszczacej sie jeszcze w oknie.
    const oldestInWindow = recent.reduce((min, a) => Math.min(min, a.attemptedAt), Number.POSITIVE_INFINITY);
    const nextAttemptAt = oldestInWindow + EXAM_DAY_WINDOW_MS;
    return {
      allowed: false,
      reason: "daily-limit",
      message: `Daily limit reached (${EXAM_MAX_ATTEMPTS_PER_DAY} attempts per 24h). The next attempt is accepted after ${new Date(nextAttemptAt).toISOString()}.`,
      nextAttemptAt,
      ...base,
    };
  }

  return { allowed: true, nextAttemptAt: now, ...base };
}
