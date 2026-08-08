import type { VaultFacts } from '../morpho/types';

/**
 * Skarbiec doczepiony do Aska: liczby, ktore obie strony widza TAK SAMO.
 *
 * ===========================================================================
 * PO CO TO ISTNIEJE
 * ===========================================================================
 * "Przeanalizuj mi ten skarbiec" jest dzis golym zdaniem. Odpowiadajacy musi
 * sam znalezc liczby, pytajacy nie wie, na co tamten patrzy, a po tygodniu
 * nikt nie odtworzy, jaki byl stan w chwili pytania. Doczepiona migawka
 * zamyka wszystkie trzy dziury naraz i - co wazniejsze - sprawia, ze odpowiedz
 * DA SIE SPRAWDZIC wzgledem czegos.
 *
 * ===========================================================================
 * JEDNO "7%" TO SA DWIE ROZNE RZECZY
 * ===========================================================================
 * Skarbiec pokazuje jedna liczbe, ale sklada sie ona z procentu placonego przez
 * POZYCZKOBIORCOW (zyje tak dlugo, jak dlugo ktos pozycza) i z CZASOWEJ DOPLATY
 * w tokenach, ktora ktos finansuje i moze wylaczyc w kazdej chwili. Prawie zaden
 * interfejs tego nie rozdziela, bo jedna duza liczba lepiej wyglada. Tutaj
 * rozdzielamy - i to jest cala wartosc tego pliku.
 *
 * ===========================================================================
 * `null` ZNACZY "NIE ZMIERZYLISMY". NIGDY "ZERO"
 * ===========================================================================
 * Kazdy tekst budowany nizej pomija skladowa, ktorej nie znamy, albo nazywa ja
 * po imieniu. NIGDZIE nie wolno napisac "0% from incentives", gdy `incentiveApy`
 * jest `null`: to bylo by twierdzenie o skarbcu postawione dokladnie w chwili,
 * w ktorej nic o nim nie wiemy - i akurat ten blad jest w tym repo lamany
 * najczesciej.
 *
 * ===========================================================================
 * SKALA LICZB
 * ===========================================================================
 * APY jest ULAMKIEM: 0.0439 to 4.39%. Tak podaje Morpho i w takiej postaci
 * trzyma to `VaultFacts`. Prowizja idzie osobna jednostka (`feeBps`, punkty
 * bazowe), bo tak zapisuje ja kontrakt - 1500 bps to 15%.
 */

/* ------------------------------------------------------------------ */
/*  ROZKLAD OPROCENTOWANIA                                             */
/* ------------------------------------------------------------------ */

/**
 * Prog szumu: 0.005 punktu procentowego, czyli polowa ostatniego miejsca po
 * przecinku w tym, co pokazujemy.
 *
 * Potrzebny, bo `netApy` i `netApyWithoutRewards` bywaja policzone z tych samych
 * danych dwoma drogami i ich roznica wychodzi rzedu 1e-11 - raz na plus, raz na
 * minus. Bez progu skarbiec bez zadnej doplaty pokazywalby "0.00% from
 * incentives" albo, gorzej, "-0.00%".
 */
const APY_NOISE = 0.00005;

/**
 * Co wiemy o doplacie. Trzy stany, bo dwa by klamaly.
 *
 * - `some`    doplata jest i znamy jej wielkosc
 * - `none`    ZMIERZONA i rowna zeru - skarbiec placi dzis samym oprocentowaniem
 * - `unknown` NIE ZMIERZONA; nie wolno jej pokazac jako zera
 */
export type IncentiveState = 'some' | 'none' | 'unknown';

export function incentiveStateOf(incentiveApy: number | null): IncentiveState {
  if (incentiveApy === null || !Number.isFinite(incentiveApy)) return 'unknown';
  // Roznica ujemna ponad szum znaczy, ze skladowe pochodza z dwoch roznych
  // chwil. To nie jest "brak doplaty", tylko brak pomiaru - i tak to nazywamy.
  if (incentiveApy < -APY_NOISE) return 'unknown';
  return incentiveApy > APY_NOISE ? 'some' : 'none';
}

/* ------------------------------------------------------------------ */
/*  FORMATY                                                            */
/* ------------------------------------------------------------------ */

/** Ulamek na procent: 0.0439 -> "4.39%". */
export function formatApy(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

/** Punkty bazowe na procent bez ogona zer: 1500 -> "15%", 25 -> "0.25%". */
export function formatFeeBps(bps: number): string {
  if (!Number.isFinite(bps)) return '—';
  const percent = bps / 100;
  return `${Number(percent.toFixed(2))}%`;
}

/**
 * TVL w dolarach, skrocone. To JEDYNA kwota w tym kontekscie - i jedyna rzecz,
 * ktora ma prawo dostac pomaranczowy akcent. Procent kwota NIE JEST.
 */
export function formatVaultUsd(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/** Adres w postaci, ktora miesci sie na telefonie. Pelny leci do tresci Aska. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Kurator bywa adresem, bywa nazwa. Skracamy TYLKO adres. */
export function formatCurator(curator: string): string {
  return /^0x[0-9a-fA-F]{40}$/.test(curator) ? shortAddress(curator) : curator;
}

/**
 * Ile temu odczytano liczby. Bez sekund - migawka nie tyka.
 *
 * `null` znaczy "nie wiadomo kiedy" (znacznik nie jest liczba). NIE "przed
 * chwila": swiezosc jest tu twierdzeniem o danych i nie wolno go zmyslic.
 */
export function formatFactsAge(fetchedAt: number, now = Date.now()): string | null {
  const since = now - fetchedAt;
  if (!Number.isFinite(since)) return null;
  if (since < 90_000) return 'just now';
  const minutes = Math.floor(since / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

/**
 * Nazwa skarbca razem z aktywem - ale TYLKO wtedy, gdy nazwa go jeszcze nie
 * niesie. "Gauntlet USDC Prime · USDC" to ta sama informacja dwa razy w jednej
 * linii; "Moonwell Flagship ETH · WETH" mowi juz cos nowego.
 */
export function vaultLabel(facts: Pick<VaultFacts, 'name' | 'assetSymbol'>): string {
  const symbol = facts.assetSymbol;
  if (!symbol) return facts.name;
  return facts.name.toLowerCase().includes(symbol.toLowerCase())
    ? facts.name
    : `${facts.name} · ${symbol}`;
}

/* ------------------------------------------------------------------ */
/*  DOCZEPIANIE DO TRESCI ASKA                                         */
/* ------------------------------------------------------------------ */

/**
 * Zaczatki z `templates.ts` maja w sobie nawiasy ostre do dokonczenia recznie.
 * Skoro skarbiec zostal WYBRANY Z LISTY, to te akurat luki umiemy zalatac same
 * i to bez ryzyka literowki - a literowka w adresie jest tu najgrozniejszym
 * bledem, bo daje Aska o skarbcu, ktory nie istnieje.
 *
 * `<APY>` wypelniamy WYLACZNIE wtedy, gdy naprawde znamy te liczbe. Zaczatek
 * z niedokonczonym nawiasem jest lepszy niz zaczatek z wymyslonym procentem.
 */
function fillPlaceholders(question: string, facts: VaultFacts): string {
  let filled = question
    .split('<vault address>')
    .join(facts.address)
    .split('<market or vault>')
    .join(`${facts.name} (${facts.address})`);

  if (facts.netApy !== null) {
    filled = filled.split('<APY>').join(formatApy(facts.netApy));
  }
  return filled;
}

/**
 * Zdanie z liczbami, ktore idzie do tresci Aska. Buduje sie ze SKLADOWYCH,
 * ktore naprawde znamy - brakujaca skladowa po prostu w nim nie wystepuje.
 *
 * Zwraca `null`, gdy nie znamy ANI JEDNEJ liczby: sam naglowek "Read from
 * Morpho ...:" bez niczego za dwukropkiem czytalby sie jak awaria zapisu.
 */
function factsSentence(facts: VaultFacts): string | null {
  // Oprocentowanie osobno od reszty: to ono jest powodem, dla ktorego ktos
  // czyta te linijke, i nie ma tonac w wyliczance przecinkow.
  const yieldParts: string[] = [];
  const rest: string[] = [];

  if (facts.netApy !== null) yieldParts.push(`${formatApy(facts.netApy)} net APY`);

  const split: string[] = [];
  if (facts.netApyWithoutRewards !== null) {
    split.push(`${formatApy(facts.netApyWithoutRewards)} from borrowers`);
  }
  switch (incentiveStateOf(facts.incentiveApy)) {
    case 'some':
      split.push(`${formatApy(facts.incentiveApy as number)} from incentives`);
      break;
    case 'none':
      split.push('nothing from incentives right now');
      break;
    case 'unknown':
      // Nie "0% from incentives". Nie wiemy - i tak to zapisujemy.
      split.push('incentive share not measured');
      break;
  }
  if (split.length > 0) yieldParts.push(split.join(', '));

  if (facts.totalAssetsUsd !== null) rest.push(`${formatVaultUsd(facts.totalAssetsUsd)} deposited`);
  if (facts.feeBps !== null) rest.push(`${formatFeeBps(facts.feeBps)} vault fee`);

  // CZAS POMIARU, a nie "gdy to pisalem". Kompozytor potrafi stac otwarty
  // godzinami, a migawka jest z chwili odczytu - zdanie ma mowic dokladnie to,
  // co da sie sprawdzic.
  //
  // `new Date(NaN).toISOString()` RZUCA, a stad rzucic nie wolno: ta funkcja
  // stoi na sciezce wysylki Aska. Bez sensownego znacznika po prostu nie
  // podajemy godziny - liczby zostaja, data znika.
  const opening = Number.isFinite(facts.fetchedAt)
    ? `Read from Morpho ${new Date(facts.fetchedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
    : 'Read from Morpho';

  const sentences: string[] = [];
  if (yieldParts.length > 0) {
    sentences.push(`${opening}: ${yieldParts.join(' — ')}.`);
  }
  if (rest.length > 0) {
    sentences.push(
      yieldParts.length > 0 ? `${capitalize(rest.join(', '))}.` : `${opening}: ${rest.join(', ')}.`
    );
  }

  return sentences.length > 0 ? sentences.join(' ') : null;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Tresc Aska z doczepionym skarbcem.
 *
 * === DLACZEGO TO SIEDZI W TRESCI, A NIE W OSOBNYM POLU ===
 * Migawka ma dojechac wszedzie tam, gdzie dojezdza pytanie: do karty w feedzie,
 * do odpowiedzi, do kwitu, do kazdego odczytu, ktory powstanie pozniej. Osobne
 * pole na dokumencie widzialoby tylko to, co ktos pamietal podpiac - i milczalo
 * w kazdym starym miejscu. Tekst nie ma tego problemu i nie wymaga zmiany
 * niczego w sciezce pieniedzy.
 *
 * Adres jest dopisywany PELNY (nie skrocony): po to, zeby dalo sie go wkleic.
 */
export function attachVaultContext(question: string, facts: VaultFacts | null): string {
  if (!facts) return question;

  const filled = fillPlaceholders(question, facts);
  const blocks = [filled.trimEnd()];

  // Gdy adres wszedl juz w zdanie (przez nawias z zaczatka), nie powtarzamy go
  // drugi raz - to ta sama informacja dwa razy w czterech linijkach.
  if (!filled.includes(facts.address)) {
    blocks.push(`Vault: ${vaultLabel(facts)} — ${facts.address} (Base).`);
  }

  const numbers = factsSentence(facts);
  if (numbers) blocks.push(numbers);

  return blocks.join('\n\n');
}
