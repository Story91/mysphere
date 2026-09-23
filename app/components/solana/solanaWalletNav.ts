/**
 * Czysta logika portfela Solany w nawigacji: parowanie portfela EVM z jego
 * kontem Solany, tryb sieci zapamietany miedzy przeladowaniami i decyzja,
 * co pokazuje przelacznik sieci.
 *
 * ===========================================================================
 * SKAD TO SIE WZIELO
 * ===========================================================================
 * Zgloszenie wlasciciela: "podlaczenie phantoma w glownej nawigacji laczy sie
 * z eth zamiast z solana" oraz "nie da sie przelaczyc na solane w metamasku,
 * ktory tez ma adres solany". Oba bledy mialy jedno zrodlo: nawigacja znala
 * WYLACZNIE wagmi, czyli strone EVM portfela. Phantom i MetaMask sa dzis
 * portfelami wielolancuchowymi - to samo rozszerzenie oglasza sie raz przez
 * EIP-6963 (Ethereum) i drugi raz przez Wallet Standard (Solana). Lista
 * portfeli bez tego rozroznienia zawsze trafiala w strone Ethereum.
 *
 * ===========================================================================
 * DLACZEGO OSOBNY PLIK BEZ REACTA I BEZ @solana/*
 * ===========================================================================
 * Ten modul czyta nawigacja, modal portfela i przelacznik sieci, a one siedza
 * w GLOWNYM bundlu kazdej trasy. Jeden import z @solana/web3.js przeciagnalby
 * tam caly stos Solany. Do tego czysta logika da sie przetestowac mocha bez
 * przegladarki (test/solanaWalletNav.test.ts).
 */

/** Klucz localStorage z wybranym trybem sieci w nawigacji. */
export const ACTIVE_NETWORK_STORAGE_KEY = 'mysphere:activeNetwork';

/**
 * Klucz, pod ktorym @solana/wallet-adapter-react pamieta ostatni portfel
 * (domyslny `localStorageKey` WalletProvidera). Wartosc to JSON.stringify
 * nazwy, a przy rozlaczeniu wpis znika.
 */
export const SOLANA_WALLET_NAME_STORAGE_KEY = 'walletName';

/** Trasa, na ktorej Solana faktycznie dziala: zakladka Solany w basechacie. */
export const SOLANA_ROUTE = '/basechat?network=solana';

/** Tryb nawigacji: portfel EVM (wagmi) albo konto Solany. */
export type NavMode = 'evm' | 'solana';

/** Minimum z interfejsu Storage, zeby testy mogly podac wlasna atrape. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Portfel Solany wykryty przez wallet-adapter albo przez Wallet Standard. */
export interface DetectedSolanaWallet {
  name: string;
  /** WalletReadyState z wallet-adapter-base: 'Installed' | 'Loadable' | 'NotDetected' | 'Unsupported'. */
  readyState: string;
  icon?: string | null;
}

/**
 * Stare albo rownolegle nazwy tego samego portfela. BitKeep zmienil nazwe na
 * Bitget, a czesc portfeli oglasza sie pod skrotem w jednym standardzie i pod
 * pelna nazwa w drugim.
 */
const WALLET_ALIASES: Record<string, string> = {
  bitkeep: 'bitget',
  coinbasesmart: 'coinbase',
  okex: 'okx',
};

/** Slowa, ktore portfele doklejaja do nazwy zupelnie dowolnie ("OKX Wallet" vs "OKX"). */
const NOISE_WORDS = new Set(['wallet', 'extension', 'app', 'browser']);

/**
 * Nazwa portfela sprowadzona do klucza porownania: male litery, same litery
 * i cyfry, bez slow-szumow. "OKX Wallet" i "OKX" daja ten sam klucz, a
 * "MetaMask" z EIP-6963 i "MetaMask" z Wallet Standard - oczywiscie tez.
 */
export function normalizeWalletName(name: string | null | undefined): string {
  if (!name) return '';
  const tokens = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token && !NOISE_WORDS.has(token));
  const joined = tokens.join('');
  return WALLET_ALIASES[joined] ?? joined;
}

/** Krotszy klucz musi miec tyle znakow, zeby dopasowanie po prefiksie nie lapalo przypadkow. */
const MIN_PREFIX_MATCH = 3;

/**
 * Jedyne dopiski, ktore wolno potraktowac jako "ten sam portfel, inny
 * lancuch". Sam prefiks nie wystarczal: "Safe" (multisig, konektor wagmi
 * zawsze obecny w app/providers.tsx) byl prefiksem "SafePal", wiec wiersz
 * Safe dostawal etykiete "Ethereum & Base", a wybor SafePal w sekcji Solany
 * probowal laczyc multisig Safe. Tak samo "MetaMask" i "MetaMask Flask" to
 * dwa rozne rozszerzenia.
 */
const CHAIN_SUFFIXES = new Set(['solana', 'sol', 'evm', 'ethereum', 'eth']);

/**
 * Czy dwie nazwy oznaczaja ten sam portfel. Najpierw rownosc kluczy, potem
 * prefiks z dopiskiem lancucha - na wypadek, gdyby portfel dopisal lancuch do
 * nazwy w jednym ze standardow ("MetaMask" wobec "MetaMask Solana").
 */
export function isSameWallet(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeWalletName(a);
  const right = normalizeWalletName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length < MIN_PREFIX_MATCH || !longer.startsWith(shorter)) return false;
  return CHAIN_SUFFIXES.has(longer.slice(shorter.length));
}

/**
 * Ktore konto Solany podlaczyc, skoro strona EVM stoi na portfelu `evmConnectorName`.
 *
 * Bierzemy WYLACZNIE portfele z readyState 'Installed' - tylko one maja konto
 * do podpiecia bez wychodzenia ze strony. Dokladne dopasowanie wygrywa z
 * prefiksowym. `null` znaczy "nie ma pary" i wolajacy otwiera wtedy wybor
 * portfela zamiast zgadywac: podpiecie cudzego portfela (np. Solflare, gdy
 * uzytkownik siedzi w MetaMasku) byloby gorsze niz pytanie.
 */
export function pickSolanaWalletFor(
  evmConnectorName: string | null | undefined,
  detectedSolanaWallets: readonly DetectedSolanaWallet[]
): string | null {
  const key = normalizeWalletName(evmConnectorName);
  if (!key) return null;
  const installed = detectedSolanaWallets.filter((wallet) => wallet.readyState === 'Installed');
  const exact = installed.find((wallet) => normalizeWalletName(wallet.name) === key);
  if (exact) return exact.name;
  const loose = installed.find((wallet) => isSameWallet(wallet.name, evmConnectorName));
  return loose ? loose.name : null;
}

/**
 * Konektor wagmi tego samego portfela co wybrany portfel Solany - po to, zeby
 * wybor "Phantom" w sekcji Solany podpial tez strone EVM, na ktorej stoi
 * profil i sesja SIWE. Przy kilku kandydatach wygrywa konektor 'injected'
 * (wykryte rozszerzenie), bo to on otwiera okno tego samego rozszerzenia.
 */
export function findEvmTwin<T extends { name: string; type?: string }>(
  connectors: readonly T[],
  solanaWalletName: string | null | undefined
): T | null {
  const matches = connectors.filter((connector) => isSameWallet(connector.name, solanaWalletName));
  if (matches.length === 0) return null;
  return matches.find((connector) => connector.type === 'injected') ?? matches[0];
}

/**
 * Etykieta wiersza EVM w modalu portfela. Portfel, ktory ma tez konto Solany,
 * dostaje dopisek "Ethereum & Base" - inaczej "Phantom" w sekcji EVM i
 * "Phantom" w sekcji Solany wygladaja identycznie, a to wlasnie ta dwuznacznosc
 * wysylala ludzi na Ethereum.
 */
export function evmRowLabel(
  connectorName: string,
  solanaWalletNames: readonly string[]
): string {
  const hasSolanaTwin = solanaWalletNames.some((name) => isSameWallet(name, connectorName));
  return hasSolanaTwin ? `${connectorName} · Ethereum & Base` : connectorName;
}

/** Odczyt trybu. Wszystko poza doslownym 'solana' (w tym awaria storage) to EVM. */
export function readNavMode(storage: StorageLike | null | undefined): NavMode {
  if (!storage) return 'evm';
  try {
    return storage.getItem(ACTIVE_NETWORK_STORAGE_KEY) === 'solana' ? 'solana' : 'evm';
  } catch {
    return 'evm';
  }
}

/** Zapis trybu. Tryb prywatny albo zablokowane dane strony nie moga wywalic klikniecia. */
export function writeNavMode(storage: StorageLike | null | undefined, mode: NavMode): void {
  if (!storage) return;
  try {
    storage.setItem(ACTIVE_NETWORK_STORAGE_KEY, mode);
  } catch {
    // Tryb i tak zyje w stanie Reacta do konca sesji - traci sie tylko pamiec po przeladowaniu.
  }
}

/**
 * Nazwa portfela Solany, ktory byl podlaczony ostatnio (zapis wallet-adaptera).
 * Na tej podstawie decydujemy, czy stos Solany ma wstac od razu po starcie.
 */
export function readStoredSolanaWalletName(storage: StorageLike | null | undefined): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SOLANA_WALLET_NAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Czy ladowac stos Solany ZARAZ po starcie, bez klikniecia.
 *
 * Tylko gdy uzytkownik mial juz podlaczony portfel Solany (wtedy autoConnect
 * przywraca go po cichu, tak jak wagmi przywraca portfel EVM). Kazdy inny
 * uzytkownik nie pobiera ani bajta tego stosu.
 *
 * Strony /blink/* maja WLASNY provider Solany (samodzielne strony napiwku i
 * odpowiedzi) - drugi, rownolegly provider na starcie dublowalby autoConnect.
 * `available` rozni sie od `true` takze w trakcie wykrywania miniappa.
 */
export function shouldBootSolanaHost(input: {
  available: boolean | null;
  storedWalletName: string | null;
  pathname: string | null | undefined;
}): boolean {
  if (input.available !== true) return false;
  if (!input.storedWalletName) return false;
  if (input.pathname && /^\/blink(\/|$)/.test(input.pathname)) return false;
  return true;
}

/**
 * Czy "wracamy" do portfela Solany, ZANIM stos Solany sie wczytal.
 *
 * Wczesniej warunek zalezal od `available`, a to staje sie true dopiero po
 * asynchronicznym sdk.isInMiniApp() - pierwsze klatki pokazywaly wiec siec
 * EVM, a potem SOL. Tu wystarczy, ze NIE wiadomo jeszcze, ze to miniapp
 * (null tez przechodzi), tryb to Solana i stos faktycznie wstanie sam
 * (shouldBootSolanaHost). Bez tego ostatniego warunku pastylka wisialaby na
 * SOL na zawsze tam, gdzie stos nie startuje (np. /blink) albo po awarii
 * ladowania (`bootBlocked`).
 */
export function restoringBeforeRuntime(input: {
  isMiniApp: boolean | null;
  mode: NavMode;
  storedWalletName: string | null;
  pathname: string | null | undefined;
  bootBlocked: boolean;
}): boolean {
  if (input.isMiniApp === true || input.bootBlocked || input.mode !== 'solana') return false;
  return shouldBootSolanaHost({
    available: true,
    storedWalletName: input.storedWalletName,
    pathname: input.pathname,
  });
}

/**
 * Co pokazuje przelacznik sieci.
 *
 * Solana tylko wtedy, gdy uzytkownik ja wybral (tryb) I konto Solany jest
 * podlaczone albo wlasnie wraca po przeladowaniu. Sam tryb nie wystarczy:
 * pastylka "SOL" bez podlaczonego konta obiecywalaby cos, czego nie ma.
 */
export function resolveNavSelection(input: {
  mode: NavMode;
  solanaConnected: boolean;
  solanaRestoring: boolean;
}): NavMode {
  if (input.mode !== 'solana') return 'evm';
  return input.solanaConnected || input.solanaRestoring ? 'solana' : 'evm';
}

/** Skrot adresu base58 do etykiet: 4 znaki, wielokropek, 4 znaki. */
export function shortSolanaAddress(address: string | null | undefined): string {
  if (!address) return '';
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/**
 * Dokad przejsc po wyborze sieci EVM, gdy composer stoi na zakladce Solany.
 *
 * Bez tego przelacznik pokazywalby Base, a formularz pod nim dalej Solane.
 * Zwraca null, gdy nie ma czego zmieniac (inna trasa albo inna zakladka) -
 * wtedy wybor sieci EVM dziala jak dotad, czyli tylko w portfelu.
 * Projekt ma `trailingSlash: true`, stad tolerancja koncowego ukosnika.
 */
export function evmExitRoute(
  pathname: string | null | undefined,
  search: string | null | undefined,
  postingKey: string | null | undefined
): string | null {
  if (!postingKey) return null;
  return isOnSolanaTab(pathname, search) ? `/basechat?network=${postingKey}` : null;
}

/** Czy adres to zakladka Solany w basechacie (/basechat?network=solana). */
export function isOnSolanaTab(
  pathname: string | null | undefined,
  search: string | null | undefined
): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path !== '/basechat') return false;
  try {
    return new URLSearchParams(search ?? '').get('network') === 'solana';
  } catch {
    return false;
  }
}

/**
 * Stan wiersza w przelaczniku sieci: czy jest biezacy (kropka, aria-current)
 * i czy da sie go kliknac.
 *
 * Dwie pulapki, ktore ta funkcja zamyka:
 *  - wiersz z `href` (Solana) nigdy nie jest wylaczony. Kiedy Solana byla
 *    biezaca, jej wiersz robil sie `disabled` - a to byla jedyna droga z
 *    innej strony (np. /startpad po przeladowaniu) z powrotem do composera
 *    Solany. Klikniecie przy podlaczonym koncie tylko przenosi.
 *  - na zakladce Solany biezacy lancuch EVM tez jest klikalny. Po odmowie w
 *    portfelu Solany pastylka pokazuje np. Base, a composer stoi na Solanie;
 *    wylaczony wiersz Base nie dawal wtedy zadnej drogi wyjscia.
 */
export function switcherRowState(input: {
  isSolanaRow: boolean;
  hasHref: boolean;
  locked: boolean;
  onSolana: boolean;
  onSolanaTab: boolean;
  chainMatches: boolean;
}): { current: boolean; disabled: boolean } {
  const current = input.onSolana ? input.isSolanaRow : !input.isSolanaRow && input.chainMatches;
  if (input.locked) return { current, disabled: true };
  if (input.hasHref) return { current, disabled: false };
  return { current, disabled: current && !input.onSolanaTab };
}

export type SolanaConnectFailure = 'cancelled' | 'not-installed' | 'failed';

/**
 * Tlumaczenie bledu laczenia portfela Solany na komunikat dla czlowieka.
 *
 * Odmowa to NIE awaria (neutralny komunikat, nie czerwony), brak rozszerzenia
 * mowi, co zrobic. Klasy bledow wallet-adaptera rozpoznajemy po `name`, bo
 * ten modul nie moze ich importowac (patrz naglowek).
 */
export function describeSolanaConnectError(
  error: unknown,
  walletName: string | null | undefined
): { kind: SolanaConnectFailure; message: string } {
  const label = walletName || 'your Solana wallet';
  const name = typeof error === 'object' && error && 'name' in error ? String((error as { name: unknown }).name) : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (/user rejected|user denied|rejected the request|request rejected|user cancel/i.test(message)) {
    return { kind: 'cancelled', message: `${label}: connection cancelled.` };
  }
  if (name === 'WalletNotReadyError' || /not (installed|detected|ready)/i.test(message)) {
    return {
      kind: 'not-installed',
      message: `${label} is not available in this browser. Install or unlock it, then try again.`,
    };
  }
  const detail = message ? `: ${message.slice(0, 120)}` : '.';
  return { kind: 'failed', message: `Could not connect ${label} on Solana${detail}` };
}
