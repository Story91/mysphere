/**
 * Normalizacja czasu z Firestore do milisekund.
 *
 * PO CO TO ISTNIEJE. Kolekcja `posts` trzyma `timestamp` w DWOCH roznych
 * postaciach, zaleznie od tego, ktora sciezka zapisala dokument:
 *  - `serverTimestamp()` w createPost daje Firestore Timestamp,
 *  - starsze zapisy i optymistyczne aktualizacje daja zwykla liczbe (ms).
 *
 * Czytniki serwerowe sprawdzaly `typeof data.timestamp === 'number'` i przy
 * pierwszej postaci wstawialy zero. Skutek byl cichy i mylacy: profile
 * pokazywaly "1 stycznia 1970", sitemapa dawala crawlerom `lastModified`
 * sprzed pol wieku, a paragony gubily date. Nic nie wybuchalo, wiec nikt tego
 * nie zauwazal - dane po prostu byly nieprawdziwe.
 *
 * Klient tego nie odczuwal, bo SDK w przegladarce zwraca obiekt Timestamp z
 * metoda toMillis(), a feed formatuje go przez date-fns.
 *
 * Ta funkcja przyjmuje kazda z postaci, jakie moga wyjsc z Firestore, i zwraca
 * milisekundy albo 0, gdy wartosci nie da sie zinterpretowac.
 */

/** Ksztalt Firestore Timestamp bez ciagniecia typow z SDK. */
type TimestampLike =
  | { toMillis: () => number }
  | { seconds: number; nanoseconds?: number }
  | { _seconds: number; _nanoseconds?: number };

/**
 * Prog odrozniajacy sekundy od milisekund.
 *
 * 1e12 ms to rok 2001, a 1e12 s to rok 33658. Kazdy realny czas w tej
 * aplikacji zapisany w SEKUNDACH jest wiec mniejszy od progu, a zapisany
 * w MILISEKUNDACH - wiekszy. Bez tej korekty timestamp w sekundach wyladowalby
 * w styczniu 1970.
 */
const MILLISECONDS_THRESHOLD = 1e12;

export function toMillis(value: unknown): number {
  if (value == null) return 0;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value < MILLISECONDS_THRESHOLD ? Math.round(value * 1000) : value;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  if (typeof value === 'string') {
    // Zapis ISO (tak wyglada timestampValue w REST-owym API Firestore).
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    // Liczba zapisana jako tekst.
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? toMillis(numeric) : 0;
  }

  if (typeof value === 'object') {
    const candidate = value as TimestampLike;

    // Firestore Timestamp z klienckiego i administracyjnego SDK.
    if ('toMillis' in candidate && typeof candidate.toMillis === 'function') {
      try {
        const ms = candidate.toMillis();
        return Number.isFinite(ms) ? ms : 0;
      } catch {
        return 0;
      }
    }

    // Zdeserializowany Timestamp - traci metody, zostaja same pola.
    // `_seconds` to postac po przejsciu przez JSON w admin SDK.
    const seconds =
      'seconds' in candidate
        ? candidate.seconds
        : '_seconds' in candidate
          ? candidate._seconds
          : undefined;

    if (typeof seconds === 'number' && Number.isFinite(seconds)) {
      const nanos =
        ('nanoseconds' in candidate ? candidate.nanoseconds : undefined) ??
        ('_nanoseconds' in candidate ? candidate._nanoseconds : undefined) ??
        0;
      return Math.round(seconds * 1000 + (typeof nanos === 'number' ? nanos / 1e6 : 0));
    }
  }

  return 0;
}
