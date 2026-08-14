/**
 * TWARDY TERMIN NA ODPOWIEDZ BAZY.
 *
 * ===========================================================================
 * SKAD SIE WZIAL
 * ===========================================================================
 * 14 sierpnia 2026 Firestore wyczerpal dzienny limit odczytow i zaczal oddawac
 * `8 RESOURCE_EXHAUSTED: Quota exceeded`. Samo w sobie bylo to do przezycia -
 * mamy `catch` przy kazdym odczycie i schodzimy wtedy na skan lancucha. Ale
 * SDK Firebase PONAWIA ten blad z narastajacym odstepem, wiec do naszego
 * `catch` nie docieralo w rozsadnym czasie: trasa historii tokena odpowiadala
 * po 120, a przy drugim wejsciu po 372 SEKUNDACH.
 *
 * Na ekranie wygladalo to jak wykres, ktory buduje sie w nieskonczonosc, a
 * przegladarka nie miala jak z tego wyjsc: awaryjny skan z lancucha wlacza sie
 * po BLEDZIE trasy, a trasa nie zwracala bledu - po prostu milczala.
 *
 * ===========================================================================
 * ZASADA
 * ===========================================================================
 * Cache jest PRZYSPIESZENIEM, nie zrodlem prawdy. Baza, ktora nie odpowiada w
 * sekunde, jest dla nas tym samym, co baza, ktorej nie ma: schodzimy na
 * lancuch. Lepiej policzyc to jeszcze raz z logow niz czekac szesc minut na
 * odpowiedz, ktora i tak bedzie odmowa.
 */

/**
 * Zwraca wynik obietnicy albo `fallback`, gdy nie zdazyla w `ms`.
 *
 * Spozniona obietnica dostaje wlasny `catch`: bez niego jej pozniejsze
 * odrzucenie byloby `unhandledRejection` - a to jest dokladnie ta sciezka,
 * ktora zdarza sie przy wyczerpanym limicie.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  if (!(ms > 0)) {
    promise.catch(() => {});
    return Promise.resolve(fallback);
  }

  return new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(fallback), ms);
    promise.then(finish, () => finish(fallback));
  });
}

/**
 * Ile czekamy na Firestore. Odczyt cache'u ma byc SZYBSZY niz policzenie tego
 * samego z lancucha - jesli nie jest, przestaje mieć sens.
 */
export const DB_DEADLINE_MS = 1500;
