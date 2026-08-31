import {
  MORPHO_CHAIN_ID,
  type VaultFacts,
  type VaultFactsResult,
  type VaultListResult,
} from './types';

/**
 * Klient publicznego GraphQL Morpho.
 *
 * === CO TU JEST ZMIERZONE, A NIE ZALOZONE ===
 * Kazda liczba i kazda nazwa pola nizej pochodzi z odpytania api.morpho.org,
 * nie z dokumentacji i nie z pamieci. Zapisuje to tutaj, bo nastepna osoba
 * inaczej powtorzy te same pomylki:
 *
 *  1. POLE NAZYWA SIE `netApyExcludingRewards`, NIE `netApyWithoutRewards`.
 *     Nasz typ trzyma druga nazwe (jest czytelniejsza i stoi w kontrakcie
 *     z UI), wiec mapowanie musi je przetlumaczyc. Zapytanie o nieistniejace
 *     pole nie zwraca `null` - wywraca CALE zapytanie bledem
 *     GRAPHQL_VALIDATION_FAILED z nazwa pola. Czyli literowka w zapytaniu
 *     kasuje odpowiedz w calosci, razem z polami, ktore byly poprawne.
 *
 *  2. KURATOR SIEDZI W `state.curators`, a NIE w `metadata`. `metadata` ma
 *     wylacznie `description` i `image` - zapytanie o `metadata { curators }`
 *     wywala sie walidacja. `state.curator` istnieje, ale to ADRES, nie nazwa.
 *
 *  3. `vaultByAddress` PRZYJMUJE TYLKO ADRES Z TEGO LANCUCHA. Adres skarbca
 *     z Ethereum zapytany z chainId 8453 daje NOT_FOUND, a nie pusty wynik.
 *
 * === DLACZEGO NIE MA TU BATCHOWANIA PRZEZ ALIASY ===
 * Naturalny odruch to zlaczyc kilka skarbcow w jedno zapytanie aliasami:
 *
 *     { a: vaultByAddress(address:"0xbeeF01...") { name }
 *       b: vaultByAddress(address:"0x000...01") { name } }
 *
 * Zmierzone: JEDEN zly adres ZERUJE CALA odpowiedz - wraca
 * `{"errors":[{"status":"NOT_FOUND"}],"data":null}`. Nie ma wynikow
 * czesciowych, wiec skarbiec `a`, ktory istnieje i mial sie wyswietlic,
 * przepada przez sasiada w zapytaniu.
 *
 * Dlatego wielokrotne pobranie idzie przez `vaults(where: { address_in: [...] })`.
 * To jest FILTR, a nie wyszukanie po kluczu: zly adres po prostu do niczego nie
 * pasuje i wypada z listy, a reszta wraca normalnie. Zmierzone na tej samej
 * parze adresow - wrocil sam Steakhouse USDC, bez bledu.
 *
 * Wniosek, ktory z tego bierzemy: `vaultByAddress` uzywamy WYLACZNIE do
 * jednego skarbca naraz. Wszedzie indziej `vaults(where:)`.
 */

const ENDPOINT = 'https://api.morpho.org/graphql';

/**
 * Bez klucza. Endpoint jest publiczny i nie wymaga naglowka autoryzacji -
 * zmierzone, dziala golym POST-em. Nie ma wiec sekretu do wycieku, ale to NIE
 * znaczy, ze wolno pytac z przegladarki: patrz uzasadnienie cache nizej.
 */

/**
 * Gorny limit czasu na odpowiedz.
 *
 * Feed renderuje sie z tych danych. Bez limitu wiszace polaczenie do Morpho
 * trzymaloby nasza wlasna odpowiedz tak dlugo, az przegladarka sama sie
 * podda - czyli awaria po ICH stronie zamienialaby sie w martwa strone po
 * NASZEJ. Szesc sekund to duzo dla API, ktore zwykle odpowiada ponizej sekundy.
 */
const TIMEOUT_MS = 6000;

/**
 * Ile skarbcow ciagniemy na liste.
 *
 * Notowanych na Base jest 24 (zmierzone: `pageInfo.countTotal` przy
 * `listed: true`). 50 daje zapas na wzrost, a i tak jest jednym zapytaniem.
 */
const LIST_LIMIT = 50;

/**
 * Wspolny zestaw pol. Jeden ciag znakow dla obu zapytan, bo rozjazd miedzy
 * "pola dla jednego skarbca" a "pola dla listy" konczylby sie tym, ze ten sam
 * skarbiec ma rozny rozklad oprocentowania zaleznie od tego, ktoredy przyszedl.
 */
const VAULT_FIELDS = `
  address
  name
  asset { symbol }
  state {
    totalAssetsUsd
    apy
    netApy
    netApyExcludingRewards
    fee
    curators { name }
  }
`;

const VAULT_BY_ADDRESS_QUERY = `
  query VaultFacts($address: String!, $chainId: Int!) {
    vaultByAddress(address: $address, chainId: $chainId) {
      ${VAULT_FIELDS}
    }
  }
`;

const LISTED_VAULTS_QUERY = `
  query ListedVaults($chainId: Int!, $first: Int!) {
    vaults(
      where: { chainId_in: [$chainId], listed: true }
      orderBy: TotalAssetsUsd
      orderDirection: Desc
      first: $first
    ) {
      items {
        ${VAULT_FIELDS}
      }
    }
  }
`;

/** Powod niepowodzenia - ten sam zestaw, ktorego uzywaja oba wyniki. */
type FailureReason = 'unavailable' | 'not-found' | 'malformed';

type TransportResult<T> = { ok: true; data: T } | { ok: false; reason: FailureReason };

/** Ksztalt, ktorego oczekujemy od API. `unknown` wszedzie, gdzie ufamy na slowo. */
type RawVault = {
  address?: unknown;
  name?: unknown;
  asset?: { symbol?: unknown } | null;
  state?: {
    totalAssetsUsd?: unknown;
    apy?: unknown;
    netApy?: unknown;
    netApyExcludingRewards?: unknown;
    fee?: unknown;
    curators?: Array<{ name?: unknown }> | null;
  } | null;
};

/**
 * Jedno wolanie do Morpho.
 *
 * === DLACZEGO KAZDA AWARIA MA WLASNA NAZWE ===
 * Trzy rzeczy, ktore wygladaja tak samo z gory, znacza co innego dla czytelnika:
 *   'unavailable' - nie udalo sie zapytac (siec, timeout, 5xx, blad GraphQL).
 *                   O skarbcu NIC nie wiemy. Moze byc swietny.
 *   'not-found'   - zapytalismy i API mowi, ze takiego skarbca nie ma.
 *                   To jest WIEDZA, nie brak wiedzy.
 *   'malformed'   - odpowiedz przyszla, ale nie da sie jej uzyc.
 *
 * Zwiniecie ich do jednego `null` kazaloby UI zgadywac, a zgadywanie skonczyloby
 * sie napisem "0%" pod skarbcem, ktorego akurat nie dalo sie odpytac.
 */
async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<TransportResult<T>> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Wylaczamy cache Next-a na tym wolaniu CELOWO. Warstwe cache trzymamy
      // wyzej (patrz `cache.ts`), gdzie mamy kontrole nad tym, co sie dzieje
      // przy awarii. Dwa niezalezne cache na tej samej sciezce to dwa rozne
      // wieki tej samej liczby.
      cache: 'no-store',
    });
  } catch (error) {
    // AbortError z timeoutu ladzie tutaj razem z bledami sieci - z punktu
    // widzenia czytelnika to ta sama sytuacja: nie udalo sie zapytac.
    console.error('[morpho] Zapytanie do api.morpho.org nie doszlo:', error);
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    console.error('[morpho] api.morpho.org odpowiedzialo statusem', response.status);
    return { ok: false, reason: 'unavailable' };
  }

  let payload: { data?: T | null; errors?: Array<{ message?: string; status?: string }> };
  try {
    payload = await response.json();
  } catch (error) {
    console.error('[morpho] Odpowiedz nie byla JSON-em:', error);
    return { ok: false, reason: 'malformed' };
  }

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    // NOT_FOUND to jedyny blad, ktory jest ODPOWIEDZIA, a nie awaria: API
    // zapytane poprawnie mowi, ze takiego skarbca nie zna. Reszta - w tym
    // GRAPHQL_VALIDATION_FAILED po naszej stronie - to niedostepnosc danych.
    const notFound = payload.errors.some((e) => e?.status === 'NOT_FOUND');
    if (notFound) return { ok: false, reason: 'not-found' };

    console.error('[morpho] GraphQL zwrocil bledy:', payload.errors);
    return { ok: false, reason: 'unavailable' };
  }

  if (payload.data === null || payload.data === undefined) {
    return { ok: false, reason: 'malformed' };
  }

  return { ok: true, data: payload.data };
}

/** Liczba albo `null`. NaN i Infinity traktujemy jak brak pomiaru. */
function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Prog, ponizej ktorego roznica dwoch APY jest SZUMEM ARYTMETYCZNYM, a nie doplata.
 *
 * Zmierzone na Steakhouse USDC (Base):
 *     netApy                 0.03283077078414464
 *     netApyExcludingRewards 0.032830770800430314
 *     roznica               -0.0000000000162857
 *
 * Ten skarbiec nie ma zadnych nagrod - obie liczby maja znaczyc dokladnie to
 * samo i policzone sa po prostu dwiema roznymi droga w liczbach zmiennoprzecinkowych.
 * Golo odjete daja wartosc UJEMNA, ktora bez tego progu wyladowalaby w UI jako
 * "-0.000000002% to czasowa doplata". Prog 1e-9 to 0.0000001 punktu procentowego,
 * czyli o rzedy wielkosci mniej, niz jakikolwiek program nagrod kiedykolwiek wyplaci.
 */
const APY_NOISE = 1e-9;

/**
 * ROZKLAD OPROCENTOWANIA - sedno tej warstwy.
 *
 * Skarbiec pokazuje jedna liczbe, np. 7%. Ta liczba jest sklejona z dwoch rzeczy
 * o zupelnie roznej trwalosci:
 *   - procent placony przez POZYCZKOBIORCOW - zyje tak dlugo, jak popyt na pozyczki,
 *   - CZASOWA DOPLATA w tokenach - finansuje ja ktos konkretny i moze ja wylaczyc.
 *
 * Prawie zaden interfejs tego nie rozdziela, bo wieksza liczba wyglada lepiej.
 * Skutek jest taki, ze czlowiek wklada pieniadze pod 7%, a po zakonczeniu programu
 * nagrod zostaje mu 4,2% i nikt go nie uprzedzil, ze tak bedzie.
 *
 * Zmierzone przyklady z Base, ktore pokazuja, ze to nie jest problem teoretyczny:
 *   Moonwell Flagship USDC  netApy 4,39%  bez nagrod 3,74%  -> 0,65% to doplata
 *   Moonwell Frontier cbBTC netApy 0,26%  bez nagrod 0,0016% -> PRAWIE CALOSC to doplata
 *
 * Drugi przypadek jest dokladnie tym, przed czym ta funkcja ma ostrzec: skarbiec
 * pokazujacy 0,26% w rzeczywistosci nie zarabia prawie nic na pozyczkach.
 *
 * === UCZCIWOSC: BRAK SKLADOWEJ DAJE `null`, NIGDY ZERO ===
 * Gdy ktorejkolwiek skladowej brakuje, zwracamy `null`. Zero znaczyloby
 * "sprawdzilismy i doplaty nie ma" - czyli twierdzenie o skarbcu, ktorego
 * NIE ZMIERZYLISMY. To jest ta sama zasada, przez ktora `payoutAmount`
 * w Askach jest nullowalne: "nie wiadomo ile" i "zero" to dwie rozne rzeczy.
 *
 * Zero zwracamy TYLKO wtedy, gdy obie skladowe SA i sa sobie rowne - wtedy
 * "doplaty nie ma" jest pomiarem, a nie domyslem.
 */
function computeIncentiveApy(netApy: number | null, withoutRewards: number | null): number | null {
  if (netApy === null || withoutRewards === null) return null;

  const difference = netApy - withoutRewards;

  // Szum zmiennoprzecinkowy w obie strony - patrz APY_NOISE.
  if (Math.abs(difference) <= APY_NOISE) return 0;

  // Istotnie ujemna roznica znaczylaby, ze nagrody ZABIERAJA oprocentowanie.
  // To nie ma sensu, wiec nie rozumiemy tej odpowiedzi - a czego nie rozumiemy,
  // tego nie rysujemy. `null`, nie zero i nie liczba ujemna.
  if (difference < 0) {
    console.error('[morpho] netApy ponizej netApyExcludingRewards:', netApy, withoutRewards);
    return null;
  }

  return difference;
}

/**
 * Surowy skarbiec -> `VaultFacts`. `null`, gdy nie da sie tego uznac za skarbiec.
 *
 * Wymagamy WYLACZNIE adresu i nazwy. Reszta pol jest nullowalna z zalozenia, bo
 * skarbiec bez ani jednej wplaty naprawde nie ma oprocentowania do pokazania -
 * a takich na Base jest wiekszosc (mediana TVL wynosi zero, 336 z 498 nie ma
 * zadnych aktywow). Odrzucanie ich jako "malformed" mylilo by puste z zepsutym.
 */
function mapVault(raw: RawVault | null | undefined, fetchedAt: number): VaultFacts | null {
  if (!raw || typeof raw.address !== 'string' || typeof raw.name !== 'string') return null;

  const state = raw.state ?? null;

  const netApy = finiteOrNull(state?.netApy);
  const netApyWithoutRewards = finiteOrNull(state?.netApyExcludingRewards);

  // `fee` przychodzi jako UŁAMEK, nie procent i nie punkty bazowe. Zmierzone na
  // Steakhouse USDC: `fee: 0.25` to 25% prowizji od zysku, czyli 2500 bps.
  const fee = finiteOrNull(state?.fee);

  // Kuratorow moze byc kilku. Bierzemy wszystkie nazwy, bo "kto tym zarzadza"
  // jest calym sensem tego pola - ucinanie do pierwszego gubiloby wspolkuratora.
  const curatorNames = (state?.curators ?? [])
    .map((c) => (typeof c?.name === 'string' ? c.name.trim() : ''))
    .filter((name) => name.length > 0);

  return {
    address: raw.address,
    chainId: MORPHO_CHAIN_ID,
    name: raw.name,
    curator: curatorNames.length > 0 ? curatorNames.join(', ') : null,
    feeBps: fee === null ? null : Math.round(fee * 10_000),
    totalAssetsUsd: finiteOrNull(state?.totalAssetsUsd),
    netApy,
    netApyWithoutRewards,
    incentiveApy: computeIncentiveApy(netApy, netApyWithoutRewards),
    fetchedAt,
    assetSymbol: typeof raw.asset?.symbol === 'string' ? raw.asset.symbol : null,
  };
}

/** Czy to w ogole wyglada na adres. Tania bramka przed wolaniem sieci. */
function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * Fakty o JEDNYM skarbcu, prosto z API - BEZ CACHE.
 *
 * Wolajacy prawie zawsze chce `getVaultFacts` z `cache.ts`, nie tego. Ta funkcja
 * istnieje osobno, zeby cache mial co opakowac i zeby dalo sie ja odpytac
 * w tescie bez podgrzewania pamieci procesu.
 */
export async function fetchVaultFacts(address: string): Promise<VaultFactsResult> {
  if (!isAddress(address)) {
    // Cos, co nie jest adresem, nie moze byc skarbcem. To jest WIEDZA
    // ("takiego skarbca nie ma"), a nie awaria - i nie warto za nia placic
    // wolaniem sieci.
    return { ok: false, reason: 'not-found' };
  }

  const result = await graphqlRequest<{ vaultByAddress: RawVault | null }>(
    VAULT_BY_ADDRESS_QUERY,
    { address, chainId: MORPHO_CHAIN_ID }
  );

  if (!result.ok) return { ok: false, reason: result.reason };

  // `data.vaultByAddress: null` bez bledu NOT_FOUND - API nie zna tego skarbca.
  if (!result.data.vaultByAddress) return { ok: false, reason: 'not-found' };

  const facts = mapVault(result.data.vaultByAddress, Date.now());
  if (!facts) return { ok: false, reason: 'malformed' };

  return { ok: true, facts };
}

/**
 * NOTOWANE skarbce Base, posortowane po TVL malejaco - BEZ CACHE.
 *
 * === DLACZEGO TYLKO `listed: true` ===
 * Na Base jest 498 skarbcow, ale MEDIANA ICH TVL WYNOSI ZERO: 336 z nich nie ma
 * zadnych aktywow. To nie jest lista, ktora wolno pokazac czlowiekowi do wyboru -
 * wiekszosc pozycji to puste sklepy, a kazdy moze zalozyc kolejny i nazwac go
 * dowolnie, wlacznie z podszyciem sie pod istniejacego kuratora.
 *
 * `listed: true` zawezal to do 24 (zmierzone). To jest lista, za ktora ktos
 * odpowiada.
 *
 * === DLACZEGO WYBOR Z LISTY, A NIE WOLNY TEKST ===
 * Gdyby kompozytor przyjmowal wklejony adres, pierwszym, co by sie stalo, byloby
 * wklejenie adresu skarbca-pulapki - a nasza karta uwiarygodnilaby go swoim
 * wygladem. Lista notowanych jest jedynym zrodlem, z ktorego wolno wybierac.
 */
export async function fetchEligibleVaults(): Promise<VaultListResult> {
  const result = await graphqlRequest<{ vaults: { items: RawVault[] | null } | null }>(
    LISTED_VAULTS_QUERY,
    { chainId: MORPHO_CHAIN_ID, first: LIST_LIMIT }
  );

  if (!result.ok) return { ok: false, reason: result.reason };

  const items = result.data.vaults?.items;
  if (!Array.isArray(items)) return { ok: false, reason: 'malformed' };

  const fetchedAt = Date.now();

  // Pojedynczy zepsuty wpis wypada, reszta zostaje. Odwrotnie niz przy jednym
  // skarbcu: tam brak danych znaczy "nie ma czego pokazac", tu znaczy "jedna
  // pozycja mniej na liscie" i wywracanie calej listy byloby za ostre.
  const vaults = items
    .map((item) => mapVault(item, fetchedAt))
    .filter((facts): facts is VaultFacts => facts !== null);

  // API sortuje po TVL malejaco (orderBy: TotalAssetsUsd, Desc), ale sortujemy
  // jeszcze raz u siebie. Kolejnosc decyduje o tym, co czlowiek zobaczy na
  // gorze listy, i nie ma powodu, zeby zalezala od tego, czy zdalne sortowanie
  // zachowa sie tak samo po nastepnej zmianie po ich stronie.
  vaults.sort((a, b) => (b.totalAssetsUsd ?? 0) - (a.totalAssetsUsd ?? 0));

  return { ok: true, vaults };
}
