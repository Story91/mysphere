export {};

// Czysta logika portfela Solany w nawigacji (app/components/solana/solanaWalletNav.ts):
// parowanie portfela EVM z jego kontem Solany, tryb sieci zapamietany miedzy
// przeladowaniami, decyzja przelacznika sieci i tlumaczenie bledow laczenia.
// Zgloszenie: "Phantom w nawigacji laczy sie z eth zamiast z solana" oraz
// "nie da sie przelaczyc na solane w MetaMasku, ktory tez ma adres solany".
const { expect } = require('chai');
const {
  ACTIVE_NETWORK_STORAGE_KEY,
  SOLANA_WALLET_NAME_STORAGE_KEY,
  SOLANA_ROUTE,
  normalizeWalletName,
  isSameWallet,
  pickSolanaWalletFor,
  findEvmTwin,
  evmRowLabel,
  readNavMode,
  writeNavMode,
  readStoredSolanaWalletName,
  shouldBootSolanaHost,
  resolveNavSelection,
  shortSolanaAddress,
  evmExitRoute,
  isOnSolanaTab,
  switcherRowState,
  restoringBeforeRuntime,
  describeSolanaConnectError,
} = require('../app/components/solana/solanaWalletNav');

type Stored = Record<string, string>;

function memoryStorage(initial: Stored = {}) {
  const data: Stored = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

const throwingStorage = {
  getItem: () => {
    throw new Error('SecurityError: access denied');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const installed = (name: string) => ({ name, readyState: 'Installed' });

describe('solanaWalletNav: normalizacja nazw portfeli', () => {
  it('ta sama nazwa z EIP-6963 i z Wallet Standard daje ten sam klucz', () => {
    expect(normalizeWalletName('MetaMask')).to.equal('metamask');
    expect(normalizeWalletName('Phantom')).to.equal('phantom');
    expect(normalizeWalletName('OKX Wallet')).to.equal(normalizeWalletName('OKX'));
    expect(normalizeWalletName('Coinbase Wallet')).to.equal('coinbase');
    expect(normalizeWalletName('Trust Wallet')).to.equal(normalizeWalletName('Trust'));
  });

  it('stara nazwa Bitget (BitKeep) trafia w te sama pare', () => {
    expect(normalizeWalletName('BitKeep')).to.equal(normalizeWalletName('Bitget Wallet'));
  });

  it('pusta albo sama "Wallet" nie daje klucza, wiec niczego nie paruje', () => {
    expect(normalizeWalletName('')).to.equal('');
    expect(normalizeWalletName(null)).to.equal('');
    expect(normalizeWalletName('Wallet')).to.equal('');
    expect(isSameWallet('Wallet', 'Wallet')).to.equal(false);
  });

  it('prefiks tylko dla sensownie dlugich nazw', () => {
    expect(isSameWallet('MetaMask', 'MetaMask Solana')).to.equal(true);
    expect(isSameWallet('OKX', 'OKXYZ')).to.equal(false);
    expect(isSameWallet('Rabby Wallet', 'Phantom')).to.equal(false);
  });

  it('prefiks tylko z dopiskiem lancucha: Safe to nie SafePal, MetaMask to nie MetaMask Flask', () => {
    expect(isSameWallet('Safe', 'SafePal')).to.equal(false);
    expect(isSameWallet('MetaMask', 'MetaMask Flask')).to.equal(false);
    expect(isSameWallet('OKX', 'OKX Solana')).to.equal(true);
    expect(isSameWallet('Phantom', 'Phantom SOL')).to.equal(true);
  });

  it('Safe (multisig) nie dostaje etykiety ani pary od SafePal', () => {
    expect(evmRowLabel('Safe', ['SafePal'])).to.equal('Safe');
    expect(findEvmTwin([{ name: 'Safe', type: 'safe' }], 'SafePal')).to.equal(null);
    expect(pickSolanaWalletFor('Safe', [installed('SafePal')])).to.equal(null);
  });
});

describe('solanaWalletNav: pickSolanaWalletFor - konto Solany tego samego portfela', () => {
  const wallets = [installed('Phantom'), installed('MetaMask'), installed('Solflare')];

  it('MetaMask po stronie EVM -> konto Solany MetaMaska (zgloszenie nr 2)', () => {
    expect(pickSolanaWalletFor('MetaMask', wallets)).to.equal('MetaMask');
  });

  it('Phantom po stronie EVM -> konto Solany Phantoma (zgloszenie nr 1)', () => {
    expect(pickSolanaWalletFor('Phantom', wallets)).to.equal('Phantom');
  });

  it('portfel bez Solany (Rabby) -> null, czyli wybor portfela zamiast zgadywania', () => {
    expect(pickSolanaWalletFor('Rabby Wallet', wallets)).to.equal(null);
  });

  it('brak konektora EVM albo ogolny "Injected" -> null', () => {
    expect(pickSolanaWalletFor(null, wallets)).to.equal(null);
    expect(pickSolanaWalletFor(undefined, wallets)).to.equal(null);
    expect(pickSolanaWalletFor('Injected', wallets)).to.equal(null);
  });

  it('bierze tylko portfele Installed - NotDetected i Loadable nie maja konta do podpiecia', () => {
    const detected = [
      { name: 'Phantom', readyState: 'NotDetected' },
      { name: 'MetaMask', readyState: 'Loadable' },
    ];
    expect(pickSolanaWalletFor('Phantom', detected)).to.equal(null);
    expect(pickSolanaWalletFor('MetaMask', detected)).to.equal(null);
  });

  it('dokladne dopasowanie wygrywa z prefiksowym', () => {
    const detected = [installed('MetaMask Solana'), installed('MetaMask')];
    expect(pickSolanaWalletFor('MetaMask', detected)).to.equal('MetaMask');
  });

  it('prefiks dziala, gdy portfel dopisal lancuch do nazwy', () => {
    expect(pickSolanaWalletFor('MetaMask', [installed('MetaMask Solana')])).to.equal('MetaMask Solana');
  });

  it('dopisek "Wallet" po jednej stronie nie przeszkadza', () => {
    expect(pickSolanaWalletFor('OKX Wallet', [installed('OKX')])).to.equal('OKX');
    expect(pickSolanaWalletFor('Coinbase Wallet', [installed('Coinbase Wallet')])).to.equal('Coinbase Wallet');
  });
});

describe('solanaWalletNav: findEvmTwin - strona EVM wybranego portfela Solany', () => {
  const connectors = [
    { name: 'MetaMask', type: 'metaMask' },
    { name: 'MetaMask', type: 'injected' },
    { name: 'Phantom', type: 'injected' },
    { name: 'Base Account', type: 'baseAccount' },
  ];

  it('Phantom w sekcji Solany -> konektor wagmi Phantoma', () => {
    expect(findEvmTwin(connectors, 'Phantom')).to.deep.equal({ name: 'Phantom', type: 'injected' });
  });

  it('przy kilku kandydatach wygrywa wykryte rozszerzenie (injected)', () => {
    expect(findEvmTwin(connectors, 'MetaMask')).to.deep.equal({ name: 'MetaMask', type: 'injected' });
  });

  it('portfel wylacznie Solany (Solflare) nie ma pary EVM', () => {
    expect(findEvmTwin(connectors, 'Solflare')).to.equal(null);
    expect(findEvmTwin(connectors, null)).to.equal(null);
  });
});

describe('solanaWalletNav: evmRowLabel - rozroznienie wierszy w modalu', () => {
  it('portfel z kontem Solany dostaje dopisek sieci EVM', () => {
    expect(evmRowLabel('Phantom', ['Phantom', 'Solflare'])).to.equal('Phantom · Ethereum & Base');
    expect(evmRowLabel('MetaMask', ['MetaMask'])).to.equal('MetaMask · Ethereum & Base');
  });

  it('portfel bez Solany zostaje bez zmian', () => {
    expect(evmRowLabel('Rabby Wallet', ['Phantom'])).to.equal('Rabby Wallet');
    expect(evmRowLabel('Base Account', [])).to.equal('Base Account');
  });
});

describe('solanaWalletNav: tryb sieci w localStorage', () => {
  it('uzywa klucza mysphere:activeNetwork', () => {
    expect(ACTIVE_NETWORK_STORAGE_KEY).to.equal('mysphere:activeNetwork');
  });

  it('zapis i odczyt trybu Solany przezywa "przeladowanie"', () => {
    const storage = memoryStorage();
    writeNavMode(storage, 'solana');
    expect(storage.data[ACTIVE_NETWORK_STORAGE_KEY]).to.equal('solana');
    expect(readNavMode(storage)).to.equal('solana');
    writeNavMode(storage, 'evm');
    expect(readNavMode(storage)).to.equal('evm');
  });

  it('brak wpisu, smieci albo brak storage -> EVM', () => {
    expect(readNavMode(memoryStorage())).to.equal('evm');
    expect(readNavMode(memoryStorage({ [ACTIVE_NETWORK_STORAGE_KEY]: 'SOLANA!' }))).to.equal('evm');
    expect(readNavMode(null)).to.equal('evm');
  });

  it('storage, ktory rzuca (tryb prywatny), nie wywala ani odczytu, ani zapisu', () => {
    expect(readNavMode(throwingStorage)).to.equal('evm');
    expect(() => writeNavMode(throwingStorage, 'solana')).not.to.throw();
    expect(readStoredSolanaWalletName(throwingStorage)).to.equal(null);
  });
});

describe('solanaWalletNav: zapamietany portfel Solany (wallet-adapter)', () => {
  it('czyta nazwe zapisana przez wallet-adapter jako JSON', () => {
    expect(SOLANA_WALLET_NAME_STORAGE_KEY).to.equal('walletName');
    const storage = memoryStorage({ walletName: JSON.stringify('Phantom') });
    expect(readStoredSolanaWalletName(storage)).to.equal('Phantom');
  });

  it('brak wpisu, null, pusty string albo zepsuty JSON -> null', () => {
    expect(readStoredSolanaWalletName(memoryStorage())).to.equal(null);
    expect(readStoredSolanaWalletName(memoryStorage({ walletName: 'null' }))).to.equal(null);
    expect(readStoredSolanaWalletName(memoryStorage({ walletName: '""' }))).to.equal(null);
    expect(readStoredSolanaWalletName(memoryStorage({ walletName: 'Phantom' }))).to.equal(null);
    expect(readStoredSolanaWalletName(memoryStorage({ walletName: '42' }))).to.equal(null);
  });
});

describe('solanaWalletNav: shouldBootSolanaHost - kiedy stos Solany wstaje sam', () => {
  it('tylko gdy portfel Solany byl juz podlaczony i nie jestesmy w miniappie', () => {
    expect(shouldBootSolanaHost({ available: true, storedWalletName: 'Phantom', pathname: '/basechat' })).to.equal(true);
  });

  it('nowy uzytkownik bez zapisu nie pobiera stosu Solany', () => {
    expect(shouldBootSolanaHost({ available: true, storedWalletName: null, pathname: '/basechat' })).to.equal(false);
  });

  it('miniapp Farcastera i trwajace wykrywanie miniappa -> nie', () => {
    expect(shouldBootSolanaHost({ available: false, storedWalletName: 'Phantom', pathname: '/' })).to.equal(false);
    expect(shouldBootSolanaHost({ available: null, storedWalletName: 'Phantom', pathname: '/' })).to.equal(false);
  });

  it('strony /blink maja wlasny provider - drugi nie wstaje', () => {
    expect(shouldBootSolanaHost({ available: true, storedWalletName: 'Phantom', pathname: '/blink/tip/abc/' })).to.equal(false);
    expect(shouldBootSolanaHost({ available: true, storedWalletName: 'Phantom', pathname: '/blink' })).to.equal(false);
    expect(shouldBootSolanaHost({ available: true, storedWalletName: 'Phantom', pathname: '/blinkers' })).to.equal(true);
  });
});

describe('solanaWalletNav: resolveNavSelection - co pokazuje przelacznik', () => {
  it('tryb Solany i podlaczone konto -> Solana', () => {
    expect(resolveNavSelection({ mode: 'solana', solanaConnected: true, solanaRestoring: false })).to.equal('solana');
  });

  it('tryb Solany w trakcie powrotu po przeladowaniu -> Solana (bez migniecia EVM)', () => {
    expect(resolveNavSelection({ mode: 'solana', solanaConnected: false, solanaRestoring: true })).to.equal('solana');
  });

  it('tryb Solany bez konta -> EVM: pastylka nie obiecuje konta, ktorego nie ma', () => {
    expect(resolveNavSelection({ mode: 'solana', solanaConnected: false, solanaRestoring: false })).to.equal('evm');
  });

  it('tryb EVM wygrywa nawet przy podlaczonej Solanie (wybor sieci EVM konczy tryb Solany)', () => {
    expect(resolveNavSelection({ mode: 'evm', solanaConnected: true, solanaRestoring: false })).to.equal('evm');
  });
});

describe('solanaWalletNav: shortSolanaAddress', () => {
  it('4 znaki, wielokropek, 4 znaki', () => {
    expect(shortSolanaAddress('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')).to.equal('9WzD…AWWM');
  });

  it('brak adresu albo krotki string bez zmian', () => {
    expect(shortSolanaAddress(null)).to.equal('');
    expect(shortSolanaAddress('abc')).to.equal('abc');
  });
});

describe('solanaWalletNav: evmExitRoute - composer schodzi z zakladki Solany', () => {
  it('basechat na zakladce Solany -> zakladka wybranej sieci EVM', () => {
    expect(evmExitRoute('/basechat', '?network=solana', 'base')).to.equal('/basechat?network=base');
    expect(evmExitRoute('/basechat/', '?network=solana', 'arc')).to.equal('/basechat?network=arc');
  });

  it('inna zakladka, inna trasa albo siec bez zakladki -> bez zmiany adresu', () => {
    expect(evmExitRoute('/basechat', '?network=base', 'arc')).to.equal(null);
    expect(evmExitRoute('/basechat', '', 'arc')).to.equal(null);
    expect(evmExitRoute('/startpad', '?network=solana', 'base')).to.equal(null);
    expect(evmExitRoute('/basechat', '?network=solana', null)).to.equal(null);
  });

  it('SOLANA_ROUTE prowadzi na zakladke Solany', () => {
    expect(SOLANA_ROUTE).to.equal('/basechat?network=solana');
  });
});

describe('solanaWalletNav: describeSolanaConnectError', () => {
  it('odmowa w portfelu to neutralne "cancelled", nie awaria', () => {
    const result = describeSolanaConnectError(new Error('User rejected the request.'), 'Phantom');
    expect(result.kind).to.equal('cancelled');
    expect(result.message).to.contain('Phantom');
  });

  it('WalletNotReadyError -> komunikat, co zrobic', () => {
    const error = Object.assign(new Error(''), { name: 'WalletNotReadyError' });
    const result = describeSolanaConnectError(error, 'Backpack');
    expect(result.kind).to.equal('not-installed');
    expect(result.message).to.contain('Backpack is not available');
  });

  it('inny blad niesie tresc, a bez nazwy portfela mowi ogolnie', () => {
    const result = describeSolanaConnectError(new Error('Something broke'), null);
    expect(result.kind).to.equal('failed');
    expect(result.message).to.equal('Could not connect your Solana wallet on Solana: Something broke');
  });

  it('nie-Error (string, obiekt) nie wywala tlumaczenia', () => {
    expect(describeSolanaConnectError('User denied', 'MetaMask').kind).to.equal('cancelled');
    expect(describeSolanaConnectError({ foo: 1 }, 'MetaMask').kind).to.equal('failed');
  });
});

describe('solanaWalletNav: isOnSolanaTab', () => {
  it('rozpoznaje zakladke Solany, takze z koncowym ukosnikiem', () => {
    expect(isOnSolanaTab('/basechat', '?network=solana')).to.equal(true);
    expect(isOnSolanaTab('/basechat/', '?network=solana&x=1')).to.equal(true);
  });

  it('inna zakladka albo trasa -> false', () => {
    expect(isOnSolanaTab('/basechat', '?network=base')).to.equal(false);
    expect(isOnSolanaTab('/startpad', '?network=solana')).to.equal(false);
    expect(isOnSolanaTab(null, '?network=solana')).to.equal(false);
  });
});

describe('solanaWalletNav: switcherRowState - wiersze przelacznika bez slepych zaulkow', () => {
  const row = (over: Record<string, boolean>) => ({
    isSolanaRow: false,
    hasHref: false,
    locked: false,
    onSolana: false,
    onSolanaTab: false,
    chainMatches: false,
    ...over,
  });

  it('biezaca Solana zostaje klikalna - to droga z innej strony do composera Solany', () => {
    expect(switcherRowState(row({ isSolanaRow: true, hasHref: true, onSolana: true }))).to.deep.equal({
      current: true,
      disabled: false,
    });
  });

  it('w trybie Solany lancuch portfela nie jest biezacy i da sie go wybrac', () => {
    expect(switcherRowState(row({ onSolana: true, chainMatches: true }))).to.deep.equal({
      current: false,
      disabled: false,
    });
  });

  it('biezacy lancuch EVM poza zakladka Solany jest wylaczony, jak dotad', () => {
    expect(switcherRowState(row({ chainMatches: true }))).to.deep.equal({ current: true, disabled: true });
  });

  it('na zakladce Solany bez konta Solany biezacy lancuch EVM jest klikalny (wyjscie po odmowie)', () => {
    expect(switcherRowState(row({ chainMatches: true, onSolanaTab: true }))).to.deep.equal({
      current: true,
      disabled: false,
    });
  });

  it('zablokowana siec zostaje zablokowana', () => {
    expect(switcherRowState(row({ locked: true })).disabled).to.equal(true);
    expect(switcherRowState(row({ locked: true, onSolanaTab: true })).disabled).to.equal(true);
  });
});

describe('solanaWalletNav: restoringBeforeRuntime - bez migniecia EVM po przeladowaniu', () => {
  const base = {
    isMiniApp: null as boolean | null,
    mode: 'solana' as const,
    storedWalletName: 'Phantom',
    pathname: '/basechat',
    bootBlocked: false,
  };

  it('nie czeka na wykrycie miniappa (null) - pastylka od razu na Solanie', () => {
    expect(restoringBeforeRuntime(base)).to.equal(true);
    expect(restoringBeforeRuntime({ ...base, isMiniApp: false })).to.equal(true);
  });

  it('miniapp, tryb EVM, brak zapisu portfela albo blokada po awarii -> nie', () => {
    expect(restoringBeforeRuntime({ ...base, isMiniApp: true })).to.equal(false);
    expect(restoringBeforeRuntime({ ...base, mode: 'evm' })).to.equal(false);
    expect(restoringBeforeRuntime({ ...base, storedWalletName: null })).to.equal(false);
    expect(restoringBeforeRuntime({ ...base, bootBlocked: true })).to.equal(false);
  });

  it('na /blink stos gospodarza nie wstaje, wiec pastylka nie moze czekac na niego w nieskonczonosc', () => {
    expect(restoringBeforeRuntime({ ...base, pathname: '/blink/tip/abc' })).to.equal(false);
  });
});
