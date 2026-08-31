import { fetchEligibleVaults, fetchVaultFacts } from './client';
import type { VaultFactsResult, VaultListResult } from './types';

/**
 * Cache faktow o skarbcach.
 *
 * =====================================================================
 * GDZIE STOI CACHE I DLACZEGO WLASNIE TAM - to jest decyzja, nie detal
 * =====================================================================
 * Stoi NA SERWERZE. Rozwazane bylo localStorage i zostalo odrzucone:
 *
 *  1. localStorage jest PER PRZEGLADARKA. Tysiac czytelnikow feedu to tysiac
 *     zimnych cache, czyli tysiac zapytan do Morpho - cache po stronie klienta
 *     nie zmniejsza ruchu do zrodla, tylko rozklada go na ludzi. Cache na
 *     serwerze jest WSPOLNY: tysiac czytelnikow to jedno zapytanie na okno TTL.
 *
 *  2. Feed jest najczesciej otwierana strona w tym produkcie. To wlasnie ta
 *     strona, na ktorej nie wolno pytac Morpho raz na render - a przy cache
 *     w przegladarce kazde pierwsze wejscie kazdej osoby JEST takim zapytaniem.
 *
 *  3. Endpoint Morpho jest bez klucza i bez ogloszonego limitu. Wlasnie dlatego
 *     wypada zachowac sie przyzwoicie i pytac raz na okno z jednego miejsca,
 *     zamiast wystawic ich na ruch proporcjonalny do naszej publicznosci.
 *
 *  4. Adres, ktory pytamy, i tak jest publiczny, ale zapytanie z przegladarki
 *     oznaczaloby, ze kazdy czytelnik feedu laczy sie z api.morpho.org
 *     bezposrednio - czyli oddajemy im wzorzec ruchu naszych czytelnikow
 *     za nic w zamian.
 *
 * === CO TO KOSZTUJE W FIRESTORE: NIC. CELOWO. ===
 * Ta warstwa NIE ZAPISUJE do Firestore ani jednego dokumentu i nie czyta ani
 * jednego. Dzienny limit odczytow na tym projekcie jest waski, a
 * `getCountFromServer` i `runTransaction` po prostu odmawiaja - wiec kazdy
 * odczyt trzeba wydac na cos, czego nie da sie odtworzyc. Fakty o skarbcach sa
 * PUBLICZNE, WSPOLNE dla wszystkich czytelnikow i w kazdej chwili do pobrania
 * na nowo. Trzymanie ich w Firestore wydawaloby zasob rzadki na dane obfite.
 * Pamiec procesu jest tu wlasciwym miejscem, bo utrata cache kosztuje jedno
 * zapytanie HTTP, a nie utrate informacji.
 *
 * === DWIE WARSTWY, BO KAZDA LAPIE CO INNEGO ===
 *  - TA warstwa (pamiec procesu) lapie ruch w obrebie jednej cieplej instancji.
 *  - Naglowek `Cache-Control` na trasie (patrz app/api/morpho/vaults/route.ts)
 *    lapie ruch PRZED instancjami, na CDN - i dziala takze wtedy, gdy funkcja
 *    wstala na zimno albo skalowala sie na kilka egzemplarzy.
 * Bez tej drugiej warstwy pamiec procesu byla by zludzeniem: na serverless
 * kazda zimna instancja zaczyna z pustym Map.
 */

/**
 * Jak dlugo wartosc jest uznawana za swieza.
 *
 * Oprocentowanie skarbca zmienia sie w GODZINACH - jest pochodna wykorzystania
 * puli pozyczkowej, a nie ceny na gieldzie. Piec minut to i tak o rzad wielkosci
 * ostrozniej, niz wymaga sama dana; wybrane dlatego, ze koszt trzymania krotszego
 * okna placi Morpho, a zysk z niego jest zerowy - nikt nie zauwazy roznicy
 * miedzy oprocentowaniem sprzed minuty a sprzed pieciu.
 */
const FRESH_MS = 5 * 60 * 1000;

/**
 * Jak dlugo wolno podac OSTATNIA DOBRA wartosc, gdy odswiezenie sie nie udalo.
 *
 * To jest ta sama zasada co `failed` w Askach, tylko od drugiej strony: skoro
 * awaria nie moze udawac pustki, to nie moze tez kasowac tego, co juz wiemy.
 * Godzinne oprocentowanie sprzed dwudziestu minut jest DUZO blizsze prawdy niz
 * komunikat o awarii, a `fetchedAt` w `VaultFacts` niesie prawdziwy czas pomiaru,
 * wiec UI moze uczciwie napisac, z kiedy jest liczba.
 *
 * Godzina, a nie dzien: to sa liczby, na podstawie ktorych ktos rusza pieniadze.
 * Po godzinie milczenia zrodla uczciwiej powiedziec "nie wiemy" niz podac liczbe,
 * ktora mogla juz nie obowiazywac.
 */
const STALE_GRACE_MS = 60 * 60 * 1000;

/**
 * Jak dlugo pamietamy AWARIE.
 *
 * Bez tego kazde wejscie na feed przy lezacym Morpho generowaloby wlasne
 * zapytanie z szescioma sekundami timeoutu - czyli ich awaria zamienialaby sie
 * w nasza wolna strone, tym gorsza, im wiecej mamy czytelnikow. Trzydziesci
 * sekund wystarczy, zeby przestac dobijac, i jest za krotkie, zeby przegapic
 * powrot zrodla.
 */
const FAILURE_MS = 30 * 1000;

type Cached<T> = {
  /** Ostatnia UDANA wartosc. Awaria jej NIE nadpisuje - to jest cel calego typu. */
  value: T | null;
  /** Kiedy zapisano `value`. Nie ruszamy tego przy nieudanym odswiezeniu. */
  storedAt: number;
  /** Kiedy ostatnio sie nie udalo - do przystopowania dobijania. */
  failedAt: number;
};

const store = new Map<string, Cached<unknown>>();

/**
 * Zapytania W LOCIE, po kluczu.
 *
 * === TO JEST TA CZESC, KTORA PILNUJE "NIE RAZ NA RENDER" ===
 * Sam TTL nie wystarczy. Gdy feed montuje sie z zimnym cache, dwadziescia kart
 * wola te sama funkcje w tym samym milisekundzie - kazda widzi pusty cache i
 * kazda rusza z wlasnym zapytaniem, bo pierwsze jeszcze nie wrocilo. TTL zadziala
 * dopiero na DRUGIM renderze, czyli o jeden sztorm za pozno.
 *
 * Mapa obietnic w locie zwija to do jednego zapytania: pierwszy wolajacy je
 * zaklada, kazdy nastepny dostaje TE SAMA obietnice.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Wspolny mechanizm dla obu rodzajow danych.
 *
 * `isOk` jest przekazywane, bo `VaultFactsResult` i `VaultListResult` maja rozne
 * pola przy sukcesie, a wspolny dyskryminator `ok`. Dzieki temu cala logika
 * swiezosci, laski dla starej wartosci i dobijania stoi RAZ.
 */
async function throughCache<T extends { ok: boolean }>(
  key: string,
  load: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as Cached<T> | undefined;

  // Swieze - oddajemy bez pytania kogokolwiek.
  if (entry?.value && now - entry.storedAt < FRESH_MS) {
    return entry.value;
  }

  // Niedawno sie nie udalo. Nie dobijamy, ale jesli mamy cos dobrego w zapasie,
  // to oddajemy TO, a nie awarie - awaria nie kasuje wiedzy, ktora juz mamy.
  if (entry && now - entry.failedAt < FAILURE_MS) {
    if (entry.value && now - entry.storedAt < STALE_GRACE_MS) return entry.value;
  }

  // Ktos juz po to poszedl - dolaczamy sie do jego zapytania.
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = (async (): Promise<T> => {
    try {
      const result = await load();

      if (result.ok) {
        store.set(key, { value: result, storedAt: Date.now(), failedAt: 0 });
        return result;
      }

      // NIEUDANE ODSWIEZENIE. `value` i `storedAt` zostaja nietkniete - to jest
      // dokladnie ten moment, w ktorym zle napisany cache traci dane i pokazuje
      // pustke tam, gdzie chwile temu byla liczba.
      const previous = store.get(key) as Cached<T> | undefined;
      store.set(key, {
        value: previous?.value ?? null,
        storedAt: previous?.storedAt ?? 0,
        failedAt: Date.now(),
      });

      const fresh = Date.now();
      if (previous?.value && fresh - previous.storedAt < STALE_GRACE_MS) {
        return previous.value;
      }

      // Nie mamy nic starego do podania - oddajemy uczciwa awarie z jej powodem.
      return result;
    } finally {
      // ZAWSZE, takze po wyjatku. Zostawiony wpis zablokowalby ten klucz
      // na zawsze: kazdy nastepny wolajacy czekalby na obietnice, ktora
      // juz nigdy sie nie rozstrzygnie.
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/**
 * Fakty o jednym skarbcu, przez cache. TO jest funkcja, ktorej uzywa reszta kodu.
 *
 * Klucz po malych literach, bo ten sam skarbiec zapisany z checksumem i bez
 * niego to jeden skarbiec, a dwa klucze w cache znaczylyby dwa zapytania
 * i dwie rozne liczby obok siebie na tej samej stronie.
 */
export function getVaultFacts(address: string): Promise<VaultFactsResult> {
  const key = `vault:${address.toLowerCase()}`;
  return throughCache<VaultFactsResult>(key, () => fetchVaultFacts(address));
}

/** Notowane skarbce Base, posortowane po TVL - przez cache. */
export function getEligibleVaults(): Promise<VaultListResult> {
  return throughCache<VaultListResult>('vaults:listed', () => fetchEligibleVaults());
}

/** Sekundy dla naglowka `Cache-Control` na trasie - zeby TTL stalo w jednym miejscu. */
export const CACHE_SECONDS = Math.floor(FRESH_MS / 1000);
export const STALE_SECONDS = Math.floor(STALE_GRACE_MS / 1000);
