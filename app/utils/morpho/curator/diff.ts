import type { CuratorChange, CuratorSnapshot, VaultSnapshotEntry } from './types';

/**
 * Porownanie dwoch migawek. FUNKCJA CZYSTA - zadnej sieci, zadnej bazy, zadnego
 * zegara. Wszystko, czego potrzebuje, dostaje w argumentach.
 *
 * Dzieki temu regule "co uznajemy za zmiane" da sie przeczytac w jednym miejscu
 * i sprawdzic bez uruchamiania czegokolwiek. To jest jedyna czesc tego zapisu,
 * w ktorej mozna sie pomylic po cichu: zla regula nie wywala sie bledem, tylko
 * wpisuje do publicznego rejestru zdarzenie, ktorego nie bylo.
 */

/**
 * ===========================================================================
 * ZASADA NACZELNA: `null` NIE GENERUJE WPISU
 * ===========================================================================
 * `feeBps === null` znaczy "nie zmierzylismy prowizji", a nie "prowizja wynosi
 * zero" (patrz naglowek app/utils/morpho/types.ts). Zmiana z `null` na 1500 nie
 * jest wiec podwyzka - jest tym, ze WCZORAJ NIE WIEDZIELISMY, a dzis wiemy.
 *
 * Gdyby taki przypadek zapisywac, jedna gorsza odpowiedz z API produkowalaby
 * publiczny wpis "kurator podniosl prowizje z 0% na 15%" o skarbcu, ktory
 * niczego nie zmienil. To jest oskarzenie z naszej pomylki - dokladnie ta
 * kategoria bledu, ktorej ten zapis ma nie popelniac.
 *
 * Dlatego: wpis powstaje WYLACZNIE wtedy, gdy OBIE strony sa znane i rozne.
 * Cena tej zasady jest realna i warto ja nazwac: zmiana, ktora zdarzy sie
 * dokladnie wtedy, gdy jednej ze stron nie dalo sie odczytac, przepadnie
 * bezpowrotnie. Przegapiona zmiana jest tansza niz zmyslona.
 */

/**
 * Para "zmierzona po obu stronach i rozna", albo `null`.
 *
 * Zwracamy PARE, a nie `boolean`, celowo: dzieki temu wynik niesie juz
 * wartosci nienullowalne i wpis nie ma jak powstac z polowa danych. Typ
 * `CuratorChange` wymaga liczb, a nie `number | null`, wiec ta funkcja jest
 * jedynym miejscem, w ktorym `null` moze zniknac - i zamyka regule w kodzie,
 * zamiast zostawiac ja w komentarzu.
 */
function measuredChange(before: number | null, after: number | null): [number, number] | null {
  if (before === null || after === null) return null;
  return before === after ? null : [before, after];
}

/**
 * To samo dla nazwy kuratora, z jedna roznica: porownujemy BEZ WIELKOSCI LITER
 * i bez otaczajacych spacji.
 *
 * "Gauntlet" i "gauntlet" to ten sam kurator zapisany inaczej po ich stronie.
 * Wpis "skarbiec zmienil kuratora z Gauntlet na gauntlet" bylby smieciem
 * w rejestrze, ktory ma miec kilka pozycji na miesiac. Do wpisu trafia zawsze
 * ORYGINALNY zapis, nie znormalizowany - stad zwracana para, a nie boolean.
 */
function measuredCuratorChange(
  before: string | null,
  after: string | null
): [string, string] | null {
  if (before === null || after === null) return null;
  if (before.trim().toLowerCase() === after.trim().toLowerCase()) return null;
  return [before, after];
}

/**
 * Klucz dnia w UTC. Wchodzi do identyfikatora wpisu, wiec dwa uruchomienia
 * tego samego dnia nadpisuja ten sam dokument zamiast dopisywac drugi.
 *
 * UTC, a nie czas lokalny: harmonogram chodzi na serwerze, ktorego strefa nie
 * jest nasza, a identyfikator zalezny od strefy potrafilby rozdwoic jedno
 * zdarzenie na dwa dni.
 */
export function utcDayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function changeId(timestamp: number, address: string, kind: string): string {
  return `${utcDayKey(timestamp)}_${address}_${kind}`;
}

/** Opis skarbca przepisywany do wpisu. */
function vaultOf(entry: VaultSnapshotEntry) {
  return {
    address: entry.address,
    name: entry.name,
    assetSymbol: entry.assetSymbol,
    totalAssetsUsd: entry.totalAssetsUsd,
  };
}

/**
 * Prog, ponizej ktorego kurczaca sie lista notowanych jest AWARIA PO ICH
 * STRONIE, a nie masowym wyrejestrowaniem skarbcow.
 *
 * Notowanych na Base jest 24. Gdyby czesciowa awaria API zwrocila trzy z nich,
 * naiwne porownanie wyprodukowaloby 21 publicznych wpisow "skarbiec zszedl
 * z listy" - czyli 21 falszywych zdarzen z jednego zlego odczytu. Odwrotny
 * kierunek nie jest niebezpieczny: nowe skarbce naprawde wchodza na liste.
 *
 * Polowa jest progiem arbitralnym i tak ma byc. Nie da sie odroznic awarii od
 * prawdziwego exodusu z samych danych, wiec wybieramy stron, po ktorej blad
 * jest odwracalny: przy odmowie zapisu tracimy jeden dzien obserwacji, przy
 * zapisie - wpisujemy klamstwo do rejestru, ktory ma byc dowodem.
 */
export const SUSPECT_SHRINK_RATIO = 0.5;

export function isSuspectShrink(previousCount: number, nextCount: number): boolean {
  if (previousCount === 0) return false;
  if (nextCount === 0) return true;
  return nextCount < previousCount * SUSPECT_SHRINK_RATIO;
}

/**
 * Roznice miedzy migawkami.
 *
 * `previous === null` (pierwsze uruchomienie w zyciu) daje PUSTA LISTE, a nie
 * 24 wpisy "pojawil sie". Pierwsza migawka jest punktem odniesienia, nie
 * zdarzeniem - zapisanie jej jako 24 zmian oznaczaloby, ze rejestr startuje
 * z dwudziestoma czterema wpisami o niczym.
 *
 * === CZEGO NIE UZNAJEMY ZA ZMIANE ===
 * ZMIANA NAZWY skarbca. Nazwa jest polem marketingowym; jej zmiana nie rusza
 *   ani zlotowki niczyich pieniedzy, a generowalaby wpisy przy kazdym
 *   przebrandowaniu. Nowa nazwa i tak trafia do biezacej migawki.
 * ZMIANA OPROCENTOWANIA. `netApy` rusza sie sam co godzine - to rynek, nie
 *   dzialanie kuratora. Trzy prawdziwe zdarzenia utonelyby w tysiacu szumowych.
 * ZMIANA TVL. To samo, tylko szybciej.
 */
export function diffSnapshots(
  previous: CuratorSnapshot | null,
  next: CuratorSnapshot
): CuratorChange[] {
  if (!previous) return [];

  const windowStart = previous.observedAt;
  const observedAt = next.observedAt;

  const before = new Map(previous.entries.map((entry) => [entry.address, entry]));
  const after = new Map(next.entries.map((entry) => [entry.address, entry]));

  const changes: CuratorChange[] = [];

  for (const entry of next.entries) {
    const old = before.get(entry.address);

    if (!old) {
      changes.push({
        id: changeId(observedAt, entry.address, 'listing'),
        vault: vaultOf(entry),
        windowStart,
        observedAt,
        kind: 'listing',
        curator: entry.curator,
        state: 'appeared',
      });
      continue;
    }

    const fee = measuredChange(old.feeBps, entry.feeBps);
    if (fee) {
      changes.push({
        id: changeId(observedAt, entry.address, 'fee'),
        vault: vaultOf(entry),
        windowStart,
        observedAt,
        kind: 'fee',
        // Kurator BIEZACY. Gdyby tego samego dnia zmienil sie i kurator,
        // i prowizja, powstana dwa osobne wpisy - a ten mowi, kto prowadzi
        // skarbiec z nowa prowizja, bo to jest osoba, ktora ta prowizje bierze.
        curator: entry.curator,
        fromBps: fee[0],
        toBps: fee[1],
      });
    }

    const curator = measuredCuratorChange(old.curator, entry.curator);
    if (curator) {
      changes.push({
        id: changeId(observedAt, entry.address, 'curator'),
        vault: vaultOf(entry),
        windowStart,
        observedAt,
        kind: 'curator',
        fromCurator: curator[0],
        toCurator: curator[1],
      });
    }
  }

  for (const entry of previous.entries) {
    if (after.has(entry.address)) continue;
    changes.push({
      id: changeId(observedAt, entry.address, 'listing'),
      // Skarbca NIE MA w biezacej migawce, wiec opis przepisujemy ze STAREJ.
      // Inaczej wpis o zejsciu z listy nie mialby ani nazwy, ani kwoty.
      vault: vaultOf(entry),
      windowStart,
      observedAt,
      kind: 'listing',
      curator: entry.curator,
      state: 'removed',
    });
  }

  return changes;
}
