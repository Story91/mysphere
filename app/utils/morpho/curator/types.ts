/**
 * ZAPIS DZIALAN KURATORA - ksztalty danych.
 *
 * ===========================================================================
 * CO TO JEST I CZEGO TU CELOWO NIE MA
 * ===========================================================================
 * Osoba zarzadzajaca skarbcem moze podniesc sobie prowizje z 5% na 15% albo
 * oddac skarbiec komus innemu. Kazdy, kto trzyma tam pieniadze, dowiaduje sie
 * o tym wtedy, gdy sam zajrzy - czyli zwykle nigdy. W danych Morpho ta zmiana
 * jest widoczna, tylko nikt jej nie zapisuje w czasie.
 *
 * Ten modul zapisuje FAKT Z DATA: "ten skarbiec mial 5%, ma 15%, roznice
 * zobaczylismy miedzy tymi dwiema migawkami". Nic wiecej.
 *
 * NIE MA TU I NIE MOZE SIE POJAWIC:
 *   - zadnej oceny kuratora ("agresywny", "ryzykowny", "dobry"),
 *   - zadnej prognozy ("prawdopodobnie podniesie jeszcze raz"),
 *   - zadnej wiedzy o czyimkolwiek portfelu.
 * Wersja spersonalizowana ("kurator TWOJEGO skarbca podniosl prowizje")
 * wymagalaby sledzenia cudzych pozycji - to jest teren DeBanka i Zappera,
 * gdzie jestesmy slabsi, a produkt przestaje byc o platnosciach miedzy ludzmi.
 *
 * Zapis jest DANA doczepiana tam, gdzie jest potrzebna. NIE jest nadawca
 * w osi czasu: automatyczne posty robota to dokladnie to, co wlasciciel kazal
 * usunac ze wszystkich sieci, i etykieta "curator watch" nic by tu nie zmienila.
 *
 * ===========================================================================
 * CZEGO TEN ZAPIS NIE WIE - I MUSI TO MOWIC
 * ===========================================================================
 * Porownujemy DWIE MIGAWKI, wiec nie znamy CHWILI zmiany, tylko PRZEDZIAL
 * miedzy poprzednim a biezacym odczytem. Dlatego kazdy wpis niesie `windowStart`
 * i `observedAt`, a UI ma prawo napisac wylacznie "zobaczone miedzy X a Y".
 * Napisanie "podniosl prowizje 8 sierpnia o 6:00" byloby precyzja, ktorej ten
 * pomiar nie ma - a to jest zapis faktow, wiec falszywa precyzja psuje go
 * bardziej niz brak precyzji.
 *
 * Zmiany prowizji i kuratora sa ONCHAIN, wiec da sie je docelowo potwierdzic
 * z lancucha z dokladnoscia do bloku, zamiast z cudzego API. Do tego czasu
 * przedzial jest cala prawda, jaka mamy.
 *
 * ===========================================================================
 * DLACZEGO NIE MA TU DOPUSZCZENIA NOWEGO ZABEZPIECZENIA
 * ===========================================================================
 * Dopuszczenie nowego collateralu jest drugim dzialaniem kuratora, ktore zmienia
 * czyjas sytuacje. NIE zapisujemy go, bo `VaultFacts` (app/utils/morpho/types.ts)
 * nie niesie skladu zabezpieczen, a tamten plik nalezy do innej zmiany i nie
 * wolno go tu ruszac. Zapisujemy WYLACZNIE to, co naprawde widzimy w migawce:
 * prowizje, kuratora i obecnosc na liscie notowanych. Zapis, ktory udaje, ze
 * pilnuje wiecej, niz pilnuje, jest gorszy niz waski zapis, ktory mowi, czego
 * nie obejmuje.
 */

/**
 * Jeden skarbiec w migawce.
 *
 * To jest PODZBIOR `VaultFacts`, a nie ten sam ksztalt, i to jest celowe:
 * migawka trzyma wylacznie pola, ktorych ZMIANA ma znaczenie dla kogos, kto
 * trzyma tam pieniadze. `netApy` zmienia sie co godzine sam z siebie - to nie
 * jest DZIALANIE kuratora, tylko rynek, i wpisywanie go do zapisu dzialan
 * utopiloby trzy prawdziwe zdarzenia w tysiacu szumowych.
 *
 * `totalAssetsUsd` jest tu mimo tego, ze tez sam sie zmienia - ale nie po to,
 * zeby go PILNOWAC. Sluzy do jednego: powiedziec przy zmianie, ile pieniedzy
 * pod nia stalo. Nie generuje zadnego wpisu.
 */
export type VaultSnapshotEntry = {
  /** Zawsze male litery - klucz porownania miedzy migawkami. */
  address: string;
  name: string;
  assetSymbol: string | null;
  curator: string | null;
  feeBps: number | null;
  totalAssetsUsd: number | null;
};

/**
 * Stan z ostatniego sprawdzenia. JEDEN dokument, nadpisywany.
 *
 * Nie trzymamy historii migawek. Kolejna kopia stanu tych samych 24 skarbcow
 * codziennie to 24 zapisy dziennie za dane, ktore w 99% dni sa identyczne
 * z wczorajszymi. Historia, ktora ma wartosc, to lista ROZNIC - i tylko ona
 * jest zapisywana na stale.
 */
export type CuratorSnapshot = {
  /** Kiedy zrobiono te migawke. */
  observedAt: number;
  /**
   * Kiedy zrobiono PIERWSZA migawke w ogole. Bez tego strona nie umie
   * odpowiedziec na jedyne uczciwe pytanie pierwszego dnia: "od kiedy wy w
   * ogole patrzycie?". Pusta lista zmian znaczy co innego po jednym dniu,
   * a co innego po roku.
   */
  firstObservedAt: number;
  /** Ile razy sprawdzenie sie POWIODLO. Nieudane odczyty nie licza sie. */
  checkCount: number;
  entries: VaultSnapshotEntry[];
};

/** Skarbiec, ktorego dotyczy wpis - przepisany w chwili zapisu. */
export type CuratorChangeVault = {
  address: string;
  name: string;
  assetSymbol: string | null;
  /**
   * TVL w chwili zobaczenia zmiany. Kopiowany do wpisu CELOWO, a nie czytany
   * na zywo przy renderze: wpis ma mowic, ile pieniedzy stalo pod ta zmiana
   * WTEDY. Dzisiejsza wartosc odpowiadalaby na inne pytanie.
   */
  totalAssetsUsd: number | null;
};

/**
 * Jedna zmiana. `kind` jest dyskryminatorem - ten sam chwyt co w
 * `VaultFactsResult`, z tego samego powodu: trzy rzeczy, ktore znacza co
 * innego, nie moga miec jednego plaskiego ksztaltu z polami "czasem pustymi".
 */
export type CuratorChange = {
  /**
   * Deterministyczne: `${dzien}_${adres}_${rodzaj}`. Nie losowe.
   *
   * Dwa uruchomienia tego samego dnia zapisuja TEN SAM dokument zamiast dwoch
   * kopii tego samego zdarzenia. To jest jedyna ochrona przed duplikatem,
   * jaka mamy - `runTransaction` na tym projekcie ODMAWIA, wiec nie da sie
   * tego zalatwic transakcja.
   */
  id: string;
  vault: CuratorChangeVault;
  /**
   * Poczatek przedzialu: czas POPRZEDNIEJ migawki. Zmiana zaszla gdzies
   * miedzy `windowStart` a `observedAt` i nic wiecej o jej porze nie wiemy.
   */
  windowStart: number;
  observedAt: number;
} & (
  /**
   * `fromBps`, `toBps`, `fromCurator` i `toCurator` NIE SA nullowalne, mimo ze
   * pola zrodlowe w migawce sa. To jest reguła zapisana w typie, a nie
   * przeoczenie: wpis powstaje WYLACZNIE wtedy, gdy obie strony sa zmierzone
   * (patrz zasada naczelna w diff.ts). "Z nieznanej na 15%" nie jest zmiana
   * prowizji - jest zmiana naszej wiedzy, i takiego wpisu nie wolno zapisac.
   * Dzieki temu UI nie ma jak wyrenderowac "z ? na 15%", bo nie da sie tego
   * skonstruowac.
   */
  | {
      kind: 'fee';
      /** Kto zarzadzal w chwili zmiany. Do wpisu, nie do porownania. */
      curator: string | null;
      fromBps: number;
      toBps: number;
    }
  | {
      kind: 'curator';
      fromCurator: string;
      toCurator: string;
    }
  | {
      kind: 'listing';
      curator: string | null;
      /**
       * `appeared` - skarbiec wszedl na liste notowanych.
       * `removed`  - zszedl z niej. To NIE jest to samo co "skarbiec zniknal":
       *              on dalej istnieje, przestal byc notowany.
       */
      state: 'appeared' | 'removed';
    }
);

/** Rodzaj zmiany osobno - UI filtruje po tym, wiec nie chce grzebac w unii. */
export type CuratorChangeKind = CuratorChange['kind'];

/**
 * Co strona dostaje do narysowania.
 *
 * `watch: null` to NIE to samo co pusta lista zmian:
 *   watch === null            -> nigdy nie zrobiono ani jednej migawki.
 *                                Zapis jeszcze sie NIE ZACZAL.
 *   watch !== null, brak zmian -> patrzymy od `firstObservedAt` i przez ten
 *                                czas nic sie nie zmienilo. To jest WYNIK.
 * Zwiniecie ich do jednego "brak danych" kazaloby stronie chwalic sie
 * czujnoscia, ktorej pierwszego dnia nie ma.
 */
export type CuratorWatchState = {
  firstObservedAt: number;
  observedAt: number;
  checkCount: number;
  vaultCount: number;
};

export type CuratorRecord = {
  watch: CuratorWatchState | null;
  changes: CuratorChange[];
};

/**
 * Ten sam dyskryminator co wszedzie indziej w tym produkcie. AWARIA ODCZYTU
 * NIE MOZE WYGLADAC JAK PUSTY ZAPIS - pierwsze znaczy "nie wiemy, czy cos sie
 * zmienilo", drugie "sprawdzilismy i nic sie nie zmienilo".
 */
export type CuratorRecordResult =
  | { ok: true; record: CuratorRecord }
  | { ok: false; reason: 'unavailable' };

/** Nazwy kolekcji w jednym miejscu - uzywaja ich zapis serwerowy i odczyt strony. */
export const CURATOR_STATE_COLLECTION = 'curatorWatch';
export const CURATOR_STATE_DOC = 'base';
export const CURATOR_CHANGES_COLLECTION = 'curatorChanges';

/** Ile wpisow pokazuje strona. Zapis rosnie o kilka pozycji na miesiac. */
export const CURATOR_CHANGES_PAGE_LIMIT = 60;
