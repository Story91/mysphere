import 'server-only';
import { getAdminDb } from '../../utils/auth/firebaseAdmin';

/**
 * Profile tokenow launchpada - kolekcja `launchpadTokens`.
 *
 * === CO TU JEST, A CZEGO TU NIE MA ===
 * Lancuch zna nazwe, symbol, tworce, rezerwy i stan. NIE zna logo, opisu ani
 * linkow - `metadataURI` jest jednym stringiem ustawianym RAZ przy starcie i
 * nie da sie go potem poprawic. Ta kolekcja jest warstwa edytowalna: logo,
 * opis i linki, ktore tworca moze zmienic po starcie.
 *
 * Zadna liczba, od ktorej zalezy czyjs pieniadz, tu NIE TRAFIA. Cena, rezerwa,
 * stan i oplaty czytane sa wylacznie z lancucha. Gdyby ktos podmienil ten
 * dokument, najgorsze co osiagnie to zle logo - nie zla wycena.
 *
 * === DLACZEGO ZAPIS IDZIE PRZEZ SERWER, A NIE Z PRZEGLADARKI ===
 * Aplikacja nie loguje sie do Firebase Auth, wiec `request.auth` w regulach
 * jest zawsze null i regula "tylko wlasciciel edytuje swoj dokument" jest
 * niewykonalna po stronie Firestore (patrz naglowek firestore.rules). Bez
 * bramki serwerowej kazdy podmienialby logo cudzego tokena.
 *
 * Bramka jest w `token/route.ts` i sprawdza tworce ODCZYTEM Z LANCUCHA, a nie
 * polem z JSON-a.
 *
 * === UWAGA O REGULACH, KTORA MUSI TU STAC ===
 * `firestore.rules` konczy sie regula `match /{document=**} { allow read,
 * write: if true; }`. Dopoki tam stoi, `allow write: if false` przy tej
 * kolekcji NIE zamyka jej przed przegladarka - Firestore przyznaje dostep,
 * gdy pozwala JAKAKOLWIEK pasujaca regula. Ta sama uwaga stoi przy
 * `askAnswerContent` i `premiumContent`; zamkniecie wymaga usuniecia tamtej
 * reguly, co jest osobna robota.
 */

export const LAUNCHPAD_TOKENS_COLLECTION = 'launchpadTokens';

/** Ile znakow wolno na opis. Tyle, co tweet - to jest podpis, nie whitepaper. */
export const MAX_DESCRIPTION_LENGTH = 280;
const MAX_URL_LENGTH = 512;
const MAX_NAME_LENGTH = 64;

export type TokenProfile = {
  address: string;
  chainId: number;
  creator: string;
  logoUrl: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  updatedAt: number;
};

export async function isProfileStoreAvailable(): Promise<boolean> {
  return (await getAdminDb()) !== null;
}

/**
 * Adres w jednej, przewidywalnej postaci. ID dokumentu MUSI byc deterministyczne
 * i male literami - inaczej ten sam token dostaje dwa dokumenty, zaleznie od
 * tego, czy adres przyszedl w checksumie, czy nie.
 */
export function tokenDocId(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Przycina i sprawdza URL. Wpuszczamy WYLACZNIE https oraz ipfs.
 *
 * `javascript:` i `data:` sa tu zakazane nie teoretycznie: ten string trafia
 * do `src` obrazka i do `href` linku w interfejsie. Sprawdzenie po stronie
 * zapisu jest tansze i pewniejsze niz pamietanie o nim w kazdym miejscu, ktore
 * to potem wyswietla.
 */
function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > MAX_URL_LENGTH) return null;
  if (trimmed.startsWith('ipfs://')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? trimmed : null;
  } catch {
    return null;
  }
}

/**
 * LOGO z uploadu: przychodzi jako data URL po przeskalowaniu w przegladarce
 * i zyje wylacznie w naszym interfejsie (tokenlista dalej dostaje tylko
 * https/ipfs). Wpuszczamy WYLACZNIE rastrowe typy z base64 - SVG odpada,
 * bo to XML ze skryptami. Limit dlugosci trzyma dokument z dala od sufitu
 * 1 MB Firestore i tnie wektor "wgram 5 MB smiecia".
 */
const DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_DATA_IMAGE_LENGTH = 200_000;

function cleanLogo(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(trimmed)) return trimmed;
  }
  return cleanUrl(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, max);
}

export type ProfileInput = {
  logoUrl?: unknown;
  description?: unknown;
  website?: unknown;
  twitter?: unknown;
  telegram?: unknown;
};

/**
 * Zapisuje profil. NIE sprawdza uprawnien - wolajacy musi wczesniej potwierdzic
 * z lancucha, ze ten adres jest tworca tego tokena.
 */
export async function saveProfile(input: {
  address: string;
  chainId: number;
  creator: string;
  profile: ProfileInput;
}): Promise<TokenProfile | null> {
  const db = await getAdminDb();
  if (!db) return null;

  const now = Date.now();
  const record: TokenProfile = {
    address: tokenDocId(input.address),
    chainId: input.chainId,
    creator: tokenDocId(input.creator),
    logoUrl: cleanLogo(input.profile.logoUrl),
    description: cleanText(input.profile.description, MAX_DESCRIPTION_LENGTH),
    website: cleanUrl(input.profile.website),
    twitter: cleanText(input.profile.twitter, MAX_NAME_LENGTH),
    telegram: cleanText(input.profile.telegram, MAX_NAME_LENGTH),
    updatedAt: now,
  };

  try {
    // `merge` z jawnie wypisanymi polami: pole pominiete w zadaniu ma zostac
    // WYCZYSZCZONE, a nie zachowane po cichu. Inaczej "usun logo" byloby
    // nierobialne przez ten interfejs.
    await db.collection(LAUNCHPAD_TOKENS_COLLECTION).doc(record.address).set(record, { merge: true });
    return record;
  } catch {
    return null;
  }
}

/**
 * Profile tej sieci, najswiezsze pierwsze - zrodlo token listy.
 *
 * WYMAGA INDEKSU ZLOZONEGO (chainId ASC, updatedAt DESC), dopisanego w
 * `firestore.indexes.json`. Bez niego `where(...) + orderBy(...)` konczy sie
 * `FAILED_PRECONDITION`, czyli PUSTA lista zamiast bledu - stad `catch`, ktory
 * oddaje pustke, i stad ta uwaga tutaj.
 */
export async function listProfiles(chainId: number, limit: number): Promise<TokenProfile[]> {
  const db = await getAdminDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection(LAUNCHPAD_TOKENS_COLLECTION)
      .where('chainId', '==', chainId)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => doc.data() as TokenProfile);
  } catch {
    return [];
  }
}

/**
 * Profile dla listy adresow, jednym zapytaniem po kluczu.
 *
 * Bez indeksu i bez skanowania kolekcji: `getAll` czyta po ID dokumentu.
 * Limit 200 adresow na wywolanie jest po to, zeby tablica z tysiacem wierszy
 * nie zamienila sie w jedno zadanie na tysiac odczytow.
 */
export async function getProfiles(addresses: string[]): Promise<Record<string, TokenProfile>> {
  const db = await getAdminDb();
  if (!db) return {};

  const ids = Array.from(new Set(addresses.map(tokenDocId).filter((id) => /^0x[0-9a-f]{40}$/.test(id)))).slice(0, 200);
  if (ids.length === 0) return {};

  try {
    const refs = ids.map((id) => db.collection(LAUNCHPAD_TOKENS_COLLECTION).doc(id));
    const snapshots = await db.getAll(...refs);
    const result: Record<string, TokenProfile> = {};
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      result[snapshot.id] = snapshot.data() as TokenProfile;
    }
    return result;
  } catch {
    return {};
  }
}
