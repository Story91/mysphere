import { base, baseSepolia } from 'viem/chains';
import type { Chain } from 'viem';
import { robinhoodChain } from '../basechat/Robinhood/config/RobinhoodNetworkConfig';
import { arcTestnet } from './arcChain';
// Import TYLKO typu - `networkTheme` czyta z tego pliku LAUNCHPAD_NETWORKS, wiec
// import wartosci zrobilby cykl. Typ znika przy kompilacji i cyklu nie ma.
import type { NetworkTheme } from './networkTheme';
import { pickChainId } from './chainFromUrl';

/**
 * KONFIGURACJA WIELOSIECIOWA - kazda siec to osobne, pelne wdrozenie.
 *
 * Domyslne adresy to AKTUALNE wdrozenia (docs/LAUNCHPAD-STAN.md). Wczesniejsze
 * (Sepolia: 0xA760..., 0x0712..., 0x811d...; Robinhood: 0x0096...e811 z
 * odbiorca oplat pod adresem admina) sa MARTWE. Fallback MUSI nadazac za
 * wdrozeniem - produkcja bez zmiennych srodowiskowych patrzy wlasnie tutaj.
 *
 * Wybor sieci zyje w localStorage i jest czytany RAZ, przy ladowaniu modulu.
 * Zmiana sieci przeladowuje strone (patrz `setLaunchpadChain`) - dzieki temu
 * KAZDY stan aplikacji rodzi sie juz we wlasciwej sieci i nie istnieje ani
 * jeden tor, w ktorym polowa odczytow patrzy w stara siec, a polowa w nowa.
 * Na serwerze (SSR) modul zawsze widzi siec domyslna; jedyne chain-zalezne
 * elementy renderowane statycznie (stopka) czekaja z adresami na klienta.
 */
export type LaunchpadNetwork = {
  chain: Chain;
  /** Krotka etykieta do UI. */
  label: string;
  testnet: boolean;
  /** 'b20' = token robi precompile sieci; 'plain' = nasz LaunchToken (ERC-20). */
  tokenStandard: 'b20' | 'plain';
  launchpad: `0x${string}`;
  vault: `0x${string}`;
  hook: `0x${string}`;
  tokenFactory: `0x${string}`;
  deployBlock: bigint;
  explorerUrl: string;
  /**
   * Ile blokow bierze jeden `getLogs` przy odtwarzaniu rynku, i ile takich
   * okien najwyzej.
   *
   * TE LICZBY MAJA BYC ZMIERZONE, NIE ZGADNIETE. Przez pomylke stalo tu 1900
   * z komentarzem "publiczny RPC tnie na 2000" - realny limit obu sieci Base
   * to 10 000 blokow (sprawdzone 2026-08-13 na `mainnet.base.org`,
   * `sepolia.base.org` i na CDP), wiec skan robil pieciokrotnie wiecej kolejek
   * niz musial i strona tokena sie zacinala. Robinhood (Arbitrum Orbit,
   * sub-sekundowe bloki) przyjmuje 200k w jednym strzale - a bez duzego okna
   * skan NIE SIEGA bloku wdrozenia, bo siec robi ~100k blokow dziennie.
   *
   * Sprawdzenie limitu to jedno zapytanie:
   *   curl -s <RPC> -H 'content-type: application/json' -d '{"jsonrpc":"2.0",
   *   "id":1,"method":"eth_getLogs","params":[{"fromBlock":"0x1","toBlock":"0x2710"}]}'
   */
  scanWindow: bigint;
  maxScanWindows: number;
  /**
   * Ile sekund trwa jeden blok tej sieci.
   *
   * NIE jest to ciekawostka: strona szczegolow tokena estymuje z tego BLOK
   * STARTU (`anchorBlock - wiek/secondsPerBlock`) i czas kazdej transakcji na
   * wykresie, zeby nie robic `getBlock` per log. Do 2026-08-13 stala 2 s byla
   * zaszyta na sztywno pod Base - na Robinhoodzie (blok co 0,1 s) mylila sie
   * DWUDZIESTOKROTNIE, wiec skan zaczynal grubo powyzej realnego startu tokena
   * i historia wychodzila pusta.
   */
  secondsPerBlock: number;
  /** Sciezka logo sieci w /public; brak = bez logo. */
  logo?: string;
  /** Tailwind pastylki z nazwa sieci - w barwach marki danego lancucha. */
  pillClass: string;
  /** Tailwind akcentu tekstowego (naglowki, eyebrow w stopce). */
  accentTextClass: string;
  /**
   * PELNA paleta startpada dla tej sieci. Brak pola znaczy "jasny motyw
   * produktu", i tak zostaje dla Base oraz Sepolii - lawenda jest glosem
   * MySphere i nie ma powodu jej zmieniac tam, gdzie siec nie ma wlasnego.
   *
   * Mechanika i uzasadnienie: app/startpad/networkTheme.ts.
   */
  theme?: NetworkTheme;
};

/**
 * Base MAINNET - wdrozenie z 2026-08-11 (docs/LAUNCHPAD-STAN.md). Fallbacki to
 * REALNE adresy, wiec siec dziala na Vercelu nawet bez zmiennych srodowiskowych;
 * env je tylko nadpisuje. Adresy sa `immutable`, wiec redeployu nie bedzie -
 * jak przy Sepolii i Robinhoodzie fallback ma nadazac za wdrozeniem.
 * FEE_RECIPIENT = Safe 0x83E2...4142F (wpiety w kontrakt na stale).
 */
const baseMainnetEntry: LaunchpadNetwork = {
  chain: base,
  label: 'Base B20',
  testnet: false,
  tokenStandard: 'b20',
  launchpad:
    (process.env.NEXT_PUBLIC_LAUNCHPAD_BASE_ADDRESS as `0x${string}` | undefined) ??
    '0xCF541A7EcE881945833ff1680dFc067C5Dd4cE2D',
  vault:
    (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_BASE_ADDRESS as `0x${string}` | undefined) ??
    '0x6108aDCb176D2A4A6283A06bb0Dd468b86A6AB63',
  hook:
    (process.env.NEXT_PUBLIC_LAUNCH_HOOK_BASE_ADDRESS as `0x${string}` | undefined) ??
    '0x71028Ea6999e2c415b46cc022ED0A9fDca2e2044',
  tokenFactory:
    (process.env.NEXT_PUBLIC_B20_TOKEN_FACTORY_BASE_ADDRESS as `0x${string}` | undefined) ??
    '0xEC7db55Bc081289820097703B3A66003092844D1',
  deployBlock: BigInt(process.env.NEXT_PUBLIC_LAUNCHPAD_BASE_DEPLOY_BLOCK ?? '49843030'),
  explorerUrl: 'https://basescan.org',
  // ZMIERZONE 2026-08-13 na `mainnet.base.org` ORAZ na CDP: limit `eth_getLogs`
  // to 10 000 blokow, nie 2 000 - tak stalo w tym komentarzu przez pomylke z
  // Sepolia, i to ta pomylka byla glowna przyczyna zacinania sie strony tokena.
  // Historia tokena z 11 sierpnia (78 tys. blokow) schodzila przy oknie 1900 w
  // 41 kolejkach; przy 10 000 to 8 okien i ~3,8 s. Zostawiamy 9 500 z zapasem
  // pod krancowy blok, zeby nie ocierac sie o sufit.
  scanWindow: 9_500n,
  // 90 x 9500 to ~855 tys. blokow, czyli ponad trzy tygodnie lancucha Base -
  // grubo wiecej, niz ma najstarszy launch, a sufit i tak zwykle nie dziala:
  // petla urywa sie na zdarzeniu Launched.
  maxScanWindows: 90,
  secondsPerBlock: 2,
  // Barwy marki Base: #0052FF na bieli.
  logo: '/logotypy/Base_square_blue.png',
  pillClass: 'border-[#0052FF]/30 bg-white text-[#0052FF]',
  accentTextClass: 'text-[#0052FF]',
};

export const LAUNCHPAD_NETWORKS: Record<number, LaunchpadNetwork> = {
  [base.id]: baseMainnetEntry,
  [baseSepolia.id]: {
    chain: baseSepolia,
    label: 'Base B20 Sepolia',
    testnet: true,
    tokenStandard: 'b20',
    launchpad:
      (process.env.NEXT_PUBLIC_LAUNCHPAD_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
      '0x4Cc0ff50912400eeeC38db45ef5CEf00f5Ad1A48',
    vault:
      (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
      '0x35B3217b8Ada69103b801FEFe9ca16E307a649B6',
    hook:
      (process.env.NEXT_PUBLIC_LAUNCH_HOOK_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
      '0xf2EAEBceeC6Ccc168d8fe5B539F37e2d8c44e044',
    tokenFactory:
      (process.env.NEXT_PUBLIC_B20_TOKEN_FACTORY_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
      '0x8ad50FFdD5957C34519e922c1Ff18e3DF089565F',
    deployBlock: BigInt(process.env.NEXT_PUBLIC_LAUNCHPAD_DEPLOY_BLOCK ?? '45304536'),
    explorerUrl: 'https://sepolia.basescan.org',
    // ZMIERZONE 2026-08-13 na `sepolia.base.org`: 10 000 przechodzi, 25 000
    // odbija sie o "limited to a 10,000 range". Stalo tu 1900 z komentarzem o
    // limicie 2000 - nieprawda, i ta nieprawda kosztowala piec razy dluzszy
    // skan. 9 500 z zapasem pod krancowy blok.
    scanWindow: 9_500n,
    maxScanWindows: 64,
    secondsPerBlock: 2,
    pillClass: 'border-[#0052FF]/25 bg-[#eef3ff] text-[#0052FF]',
    accentTextClass: 'text-soft-primary-deep',
  },
  [robinhoodChain.id]: {
    chain: robinhoodChain,
    label: 'RobinHood',
    testnet: false,
    tokenStandard: 'plain',
    launchpad:
      (process.env.NEXT_PUBLIC_LAUNCHPAD_ROBINHOOD_ADDRESS as `0x${string}` | undefined) ??
      '0x712E93401b455d226284BbA873cE13CC1492B22f',
    vault:
      (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_ROBINHOOD_ADDRESS as `0x${string}` | undefined) ??
      '0xbeC6D16d93fbD3B5237A1456A4F1434bb3e69913',
    hook:
      (process.env.NEXT_PUBLIC_LAUNCH_HOOK_ROBINHOOD_ADDRESS as `0x${string}` | undefined) ??
      '0x177be4EF50d92d7B7bf381e078F7c333De5B6044',
    tokenFactory:
      (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ROBINHOOD_ADDRESS as `0x${string}` | undefined) ??
      '0x91ca4f9C7eAA8A1C3775A2d1213a6F379f13a65A',
    deployBlock: BigInt(process.env.NEXT_PUBLIC_LAUNCHPAD_ROBINHOOD_DEPLOY_BLOCK ?? '33102326'),
    explorerUrl: 'https://robinhoodchain.blockscout.com',
    /**
     * Zmierzone 2026-08-13: RPC Robinhooda oddaje 2 MLN blokow w jednym
     * getLogs w ~160 ms (sprawdzone kolejno 200k, 500k, 1M, 2M - wszystkie OK).
     *
     * DLACZEGO OKNO MUSI BYC TAK DUZE WLASNIE TUTAJ: Robinhood robi blok co
     * ~0,1 s, czyli ~864 tys. blokow na dobe. Poprzednie 15 x 100k = 1,5 mln
     * blokow dawalo raptem ~1,7 DOBY historii - token Smoke (start i cztery
     * transakcje) wypadl przez to poza skan i znikal z tablicy na kazdym
     * swiezym urzadzeniu, mimo ze na lancuchu stoi nietkniety.
     *
     * 1 mln x 60 okien = 60 mln blokow, czyli ~70 dni historii. To NIE jest
     * drozsze, tylko tansze: skan przerywa sie na bloku wdrozenia, wiec dzis
     * caly lancuch miesci sie w 2 zapytaniach zamiat 15.
     */
    scanWindow: 1_000_000n,
    maxScanWindows: 60,
    // Zmierzone: ~0,1 s/blok (~864 tys. blokow na dobe).
    secondsPerBlock: 0.1,
    // Barwy marki Robinhooda: jaskrawa zielen #00C805 na czerni - te same,
    // ktorych uzywa sciezka postowania w basechat (RobinhoodPostingConfig).
    logo: '/robin.webp',
    pillClass: 'border-[#00C805]/50 bg-black text-[#00C805]',
    accentTextClass: 'text-[#00b104]',
    /**
     * CZARNO-ZIELONY STARTPAD. Te same barwy marki, co pastylka wyzej i sciezka
     * postowania w basechat: #00C805 na czerni.
     *
     * Wartosci sa TROJKAMI RGB - Tailwind sklada z nich `rgb(var(--x)/alfa)`.
     * Uklad odwraca dwie rzeczy wobec jasnego motywu i obie sa celowe:
     *   - `--sp-shade` z czerni robi biel, bo na nim stoja WSZYSTKIE krawedzie
     *     i przygaszone teksty (`border-black/10`, `text-black/45`); jedna
     *     zmienna odwraca ich cala rodzine, nie ruszajac przezroczystosci;
     *   - `deep` jest tu JASNIEJSZE od podstawowego, a nie ciemniejsze. W
     *     jasnym motywie `deep` sluzyl do pisania po bieli, wiec musial byc
     *     ciemny; na czerni ta sama rola wymaga odwrotnego kierunku.
     *
     * Pomarancz spadku zostaje pomaranczem, tylko rozjasnionym: zielen jest tu
     * kolorem MARKI, wiec gdyby oznaczala takze wzrost, spadek nie mialby z
     * czym kontrastowac.
     */
    theme: {
      key: 'robinhood',
      colorScheme: 'dark',
      vars: {
        '--sp-bg': '8 9 10',
        '--sp-surface': '18 20 23',
        '--sp-sunken': '13 15 17',
        '--sp-shade': '255 255 255',
        '--sp-ink': '236 255 238',
        '--sp-ink-soft': '126 139 128',
        '--sp-hover': '16 26 18',
        '--sp-brand': '0 200 5',
        '--sp-on-brand': '8 9 10',
        '--sp-brand-deep': '0 230 6',
        '--sp-brand-soft': '11 36 16',
        '--sp-brand-strong': '124 255 131',
        '--sp-up': '0 200 5',
        '--sp-up-vivid': '75 255 90',
        '--sp-up-soft': '10 32 16',
        '--sp-up-line': '22 85 42',
        '--sp-down': '240 160 60',
        '--sp-down-deep': '255 186 105',
        '--sp-down-soft': '36 26 12',
        '--sp-down-line': '92 60 24',
        '--sp-danger': '255 107 107',
        '--sp-danger-soft': '45 16 16',
        '--sp-info': '90 180 255',
        '--sp-info-soft': '12 26 40',
        // Wspolna powloka: nawigacja i dolny pasek sa pisane tokenami --soft-*,
        // wiec bez tych dziewieciu linii czarna tablica siedzialaby pod jasna
        // belka. Poza startpadem atrybut nie istnieje, wiec nic sie nie zmienia.
        '--soft-bg': '8 9 10',
        '--soft-surface': '18 20 23',
        '--soft-surface-sunken': '13 15 17',
        '--soft-ink': '236 255 238',
        '--soft-ink-muted': '150 165 152',
        '--soft-ink-soft': '126 139 128',
        '--soft-ink-faint': '100 110 102',
        '--soft-primary': '0 200 5',
        '--soft-primary-deep': '0 230 6',
        '--soft-on-primary': '8 9 10',
        '--soft-line': '38 46 40',
        '--soft-line-strong': '58 68 60',
        '--soft-accent': '245 167 59',
        '--soft-accent-soft': '40 27 12',
        '--soft-accent-deep': '255 186 105',
        '--soft-info': '90 180 255',
        '--soft-info-soft': '12 26 40',
      },
      chart: {
        background: '#0D0F11',
        text: '#7E8B80',
        grid: 'rgba(255,255,255,0.06)',
        up: '#00C805',
        down: '#F0A03C',
        line: '#00C805',
        lineFill: 'rgba(0,200,5,0.16)',
      },
    },
  },
  /**
   * ARC TESTNET (Circle). Wdrozenie 2026-08-13, pelne fakty i pomiary sieci w
   * docs/LAUNCHPAD-STAN.md.
   *
   * TRZY RZECZY, KTORYCH NIE MA ZADNA INNA SIEC W TEJ MAPIE:
   *
   * 1. JEDNOSTKA NATYWNA TO USDC. Prog graduacji `G = 4 x R_VIRT` wychodzi tu
   *    3 USDC, a nie 3 ETH - ten sam bajtkod, inna waluta. Na testnecie to
   *    zaleta: pelny cykl do graduacji kosztuje okolo trzech dolarow. Interfejs
   *    pisze na razie wszedzie "ETH" i to jest DO POPRAWKI (etykieta jednostki
   *    per siec), nie cecha.
   *
   * 2. POOLMANAGER JEST NASZ. Uniswap na Arc nie istnieje i nie zapowiedzial
   *    sie - postawilismy v4 ze zrodel, bo Arc ma transient storage. Bez tego
   *    graduacja nie mialaby dokad wypuscic plynnosci.
   *
   * 3. OKNO SKANU 50 000, a nie 9 500. Blok co 0,51 s daje ~169 tys. blokow na
   *    dobe, wiec przy oknie 10 tys. (tyle daja cztery z pieciu publicznych
   *    endpointow) historia jednego dnia to siedemnascie kolejek. Domyslny RPC
   *    tej sieci to Blockdaemon - jedyny z oknem 50 tys.; uzasadnienie i pomiar
   *    przy `arcTestnet` w arcChain.ts.
   */
  [arcTestnet.id]: {
    chain: arcTestnet,
    label: 'Arc Testnet',
    testnet: true,
    // Precompile B20 zyje tylko na Base - tu, jak na Robinhoodzie, token jest
    // zwyklym ERC-20 z naszej fabryki.
    tokenStandard: 'plain',
    launchpad:
      (process.env.NEXT_PUBLIC_LAUNCHPAD_ARC_ADDRESS as `0x${string}` | undefined) ??
      '0xdAe0dd6EE87a8d7eE7575dD9904A72fA9CA6600d',
    vault:
      (process.env.NEXT_PUBLIC_LIQUIDITY_VAULT_ARC_ADDRESS as `0x${string}` | undefined) ??
      '0x8F224A0782b55aF138A05b0EEA03f8D6D69A51D6',
    hook:
      (process.env.NEXT_PUBLIC_LAUNCH_HOOK_ARC_ADDRESS as `0x${string}` | undefined) ??
      '0x2615415f5eE2E0dF65bF0788E7c43ACdCB036044',
    tokenFactory:
      (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ARC_ADDRESS as `0x${string}` | undefined) ??
      '0xC10eDaF3473CcDB6e91090F204b01Ccb555686C9',
    deployBlock: BigInt(process.env.NEXT_PUBLIC_LAUNCHPAD_ARC_DEPLOY_BLOCK ?? '56844144'),
    explorerUrl: 'https://testnet.arcscan.app',
    // ZMIERZONE 2026-08-13 na wszystkich pieciu endpointach z docs.arc.io:
    // 50 000 przechodzi wylacznie na Blockdaemonie, pozostale odbijaja sie o
    // "requested range too large" powyzej 10 000. Zapas pod krancowy blok.
    scanWindow: 49_000n,
    // 60 x 49 000 to ~2,9 mln blokow, czyli okolo siedemnastu dni tego lancucha.
    maxScanWindows: 60,
    // Zmierzone: 0,51 s (100 tys. blokow roznicy timestampow / 100 tys.).
    secondsPerBlock: 0.51,
    // Blekit USDC - Arc jest lancuchem tego jednego pieniadza i to jest jego
    // najuczciwszy znak rozpoznawczy.
    // Pastylka i akcent zyja WEWNATRZ ciemnego motywu ponizej, wiec sa ciemne.
    pillClass: 'border-[#4D9AF0]/40 bg-[#0E1E30] text-[#7CB8FF]',
    accentTextClass: 'text-[#7CB8FF]',
    /**
     * GRANATOWY STARTPAD. Arc jest lancuchem jednego pieniadza i to dyktuje
     * kolor: blekit USDC, a nie barwa wymyslona pod nastroj.
     *
     * Dlaczego ciemny, skoro Robinhood juz jest ciemny. Bo strona Arc jest
     * ciemna i instytucjonalna, a te dwa motywy nie sa do pomylenia: tam czern
     * z jaskrawa zielenia, tu granat z chlodnym blekitem. Zielen na Arc znaczy
     * WZROST i nic wiecej - nie jest kolorem marki, wiec nie musi walczyc o te
     * sama role co na Robinhoodzie.
     *
     * `--sp-on-brand` jest ciemny z tego samego powodu, co tam: bialy tekst na
     * #4D9AF0 ma kontrast 2.6:1, ciemny ma 7:1.
     */
    theme: {
      key: 'arc',
      colorScheme: 'dark',
      vars: {
        '--sp-bg': '7 11 18',
        '--sp-surface': '16 23 34',
        '--sp-sunken': '11 17 26',
        '--sp-shade': '255 255 255',
        '--sp-ink': '232 240 251',
        '--sp-ink-soft': '125 140 163',
        '--sp-hover': '18 28 42',
        '--sp-brand': '77 154 240',
        '--sp-on-brand': '7 11 18',
        '--sp-brand-deep': '124 184 255',
        '--sp-brand-soft': '14 30 48',
        '--sp-brand-strong': '169 212 255',
        '--sp-up': '34 197 94',
        '--sp-up-vivid': '74 222 128',
        '--sp-up-soft': '12 36 23',
        '--sp-up-line': '23 81 47',
        '--sp-down': '240 160 60',
        '--sp-down-deep': '255 186 105',
        '--sp-down-soft': '36 26 12',
        '--sp-down-line': '92 60 24',
        '--sp-danger': '255 107 107',
        '--sp-danger-soft': '45 16 16',
        '--sp-info': '90 180 255',
        '--sp-info-soft': '12 26 40',
        // Wspolna powloka - nawigacja i dolny pasek.
        '--soft-bg': '7 11 18',
        '--soft-surface': '16 23 34',
        '--soft-surface-sunken': '11 17 26',
        '--soft-ink': '232 240 251',
        '--soft-ink-muted': '148 163 184',
        '--soft-ink-soft': '125 140 163',
        '--soft-ink-faint': '100 116 139',
        '--soft-primary': '77 154 240',
        '--soft-primary-deep': '124 184 255',
        '--soft-on-primary': '7 11 18',
        '--soft-line': '30 41 59',
        '--soft-line-strong': '45 58 79',
        '--soft-accent': '245 167 59',
        '--soft-accent-soft': '36 26 12',
        '--soft-accent-deep': '255 186 105',
        '--soft-info': '90 180 255',
        '--soft-info-soft': '12 26 40',
      },
      chart: {
        background: '#0B111A',
        text: '#7D8CA3',
        grid: 'rgba(255,255,255,0.06)',
        up: '#22C55E',
        down: '#F0A03C',
        line: '#4D9AF0',
        lineFill: 'rgba(77,154,240,0.16)',
      },
    },
  },
};

// Po wdrozeniu mainnetu (env ustawione) domyslna sieca staje sie Base mainnet;
// do tego czasu - Base Sepolia. Dzieki temu SSR i swiezy gosc trafiaja od razu
// na wlasciwa siec bez recznej zmiany kodu.
// Base mainnet jest domyslna sieca od wdrozenia 2026-08-11 - swiezy gosc i SSR
// trafiaja od razu na produkcyjny launchpad. Sepolie/Robinhood zostaja w
// przelaczniku.
export const DEFAULT_LAUNCHPAD_CHAIN_ID = base.id;
const STORAGE_KEY = 'startpad.chainId';

function resolveActiveNetwork(): LaunchpadNetwork {
  if (typeof window === 'undefined') return LAUNCHPAD_NETWORKS[DEFAULT_LAUNCHPAD_CHAIN_ID];

  // ADRES WYGRYWA Z PAMIECIA - uzasadnienie i testy przy `pickChainId`.
  const chainId = pickChainId({
    search: window.location.search,
    stored: window.localStorage.getItem(STORAGE_KEY),
    networks: LAUNCHPAD_NETWORKS,
    fallback: DEFAULT_LAUNCHPAD_CHAIN_ID,
  });

  // Siec z linku ZOSTAJE po wejsciu. Bez tego zapisu pierwsze klikniecie w
  // menu wracaloby do sieci sprzed linku - i wygladaloby jak samoczynne
  // przelaczenie w trakcie ogladania.
  try {
    if (String(chainId) !== window.localStorage.getItem(STORAGE_KEY)) {
      window.localStorage.setItem(STORAGE_KEY, String(chainId));
    }
  } catch {
    // Tryb prywatny - wybor dziala na ta jedna strone i tyle.
  }

  return LAUNCHPAD_NETWORKS[chainId];
}

export const ACTIVE_LAUNCHPAD_NETWORK = resolveActiveNetwork();

/**
 * Zmiana sieci = zapis + PRZELADOWANIE. Celowo nie ma tu setState: stale
 * modulu (adresy, chain, blok wdrozenia) sa wpiete w dziesiatki callbackow
 * i pol pamieci komponentow; podmiana "na zywo" zostawilaby stan handlu
 * jednej sieci naprzeciw adresow drugiej.
 */
export function setLaunchpadChain(chainId: number) {
  if (!LAUNCHPAD_NETWORKS[chainId]) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(chainId));
  } catch {
    // Tryb prywatny - wybor przeniesie sam adres, ponizej.
  }

  // WYBOR SIECI LADUJE W ADRESIE, nie tylko w pamieci. Dzieki temu kazda siec
  // ma wlasny link: po przelaczeniu na Robinhooda pasek adresu pokazuje
  // `/startpad?c=4663` i skopiowanie go po prostu dziala. Wczesniej wszystkie
  // trzy sieci mialy ten sam adres, wiec wyslany link otwieral sie odbiorcy na
  // JEGO sieci, a nie na tej, ktora nadawca ogladal.
  //
  // Siec domyslna zostaje BEZ parametru - najczestszy link ma byc krotki.
  const url = new URL(window.location.href);
  if (chainId === DEFAULT_LAUNCHPAD_CHAIN_ID) url.searchParams.delete('c');
  else url.searchParams.set('c', String(chainId));

  // `assign`, a nie `reload`: przeladowanie musi isc pod NOWY adres, inaczej
  // parametr zniknalby razem ze starym.
  window.location.assign(url.toString());
}

export const LAUNCHPAD_CHAIN = ACTIVE_LAUNCHPAD_NETWORK.chain;

/**
 * Symbol jednostki, w ktorej liczy KRZYWA - czyli waluty natywnej tej sieci.
 *
 * Do 2026-08-13 caly startpad mial wpisane "ETH" w stu kilkunastu miejscach i
 * bylo to prawda na kazdej obslugiwanej sieci. Arc to konczy: tam jednostka
 * natywna to USDC, wiec "3 ETH do graduacji" bylo by po prostu nieprawda -
 * i to nieprawda o pieniadzach, na dodatek w miejscu, gdzie ktos podejmuje
 * decyzje o zakupie.
 *
 * Arytmetyka sie NIE zmienia: natywne USDC ma 18 miejsc, dokladnie jak wei,
 * wiec `formatEther` i `parseEther` licza tak samo. Zmienia sie wylacznie to,
 * co jest napisane obok liczby.
 */
export const NATIVE_SYMBOL = ACTIVE_LAUNCHPAD_NETWORK.chain.nativeCurrency.symbol;

/**
 * Czy jednostka natywna JEST dolarem. Na takiej sieci kurs do dopiskow USD
 * wynosi 1 i nie ma czego pytac zadnej wyroczni - patrz `useEthUsd`.
 */
export const NATIVE_IS_USD = /^(USDC|USDT|USD)$/i.test(NATIVE_SYMBOL);
export const LAUNCHPAD_EXPLORER_URL = ACTIVE_LAUNCHPAD_NETWORK.explorerUrl;
export const LAUNCHPAD_ADDRESS = ACTIVE_LAUNCHPAD_NETWORK.launchpad;
export const LIQUIDITY_VAULT_ADDRESS = ACTIVE_LAUNCHPAD_NETWORK.vault;
export const LAUNCH_HOOK_ADDRESS = ACTIVE_LAUNCHPAD_NETWORK.hook;
export const B20_TOKEN_FACTORY_ADDRESS = ACTIVE_LAUNCHPAD_NETWORK.tokenFactory;
/**
 * 'b20' = token robi precompile Base (adres vanity da sie wykopac); 'plain' =
 * nasz ERC-20 (bez B20, wiec bez vanity). Modal startu pokazuje sekcje vanity
 * WYLACZNIE na 'b20' - czyli Base, nigdy Robinhood.
 */
export const LAUNCHPAD_TOKEN_STANDARD = ACTIVE_LAUNCHPAD_NETWORK.tokenStandard;
// Precompile B20 wbudowany w siec Base - ten sam adres na mainnecie i Sepolii.
// To NIE jest nasz kontrakt, wiec nie ma zmiennej srodowiskowej. Na sieciach
// bez B20 (tokenStandard 'plain') nie ma go wcale.
export const B20_PRECOMPILE_ADDRESS = '0xB20f000000000000000000000000000000000000' as const;

export const launchpadAbi = [
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'payable',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    // Rozszerzony start. UWAGA: wdrozenie spod `LAUNCHPAD_ADDRESS` moze byc
    // STARSZE niz ta funkcja. Interfejs NIE MOZE zakladac, ze ona tam jest -
    // wykrywa to odczytem `MAX_BUYBACK_BPS`, patrz `LaunchpadBoard`.
    type: 'function',
    name: 'launchAdvanced',
    stateMutability: 'payable',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'feeBps_', type: 'uint16' },
      { name: 'creatorFeeBps_', type: 'uint16' },
      { name: 'buybackBps_', type: 'uint16' },
      { name: 'windowCap_', type: 'uint256' },
      { name: 'receiverAccounts_', type: 'address[]' },
      { name: 'receiverSharesBps_', type: 'uint16[]' },
      { name: 'metadataURI_', type: 'string' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    // Start z adresem VANITY. Salt wybiera tworca, adres jest PRZEWIDYWALNY -
    // interfejs kopie go offline (utils/b20/launchpadVanity) i wola te funkcje z
    // gotowym `vanitySalt`. Jak launchAdvanced, tylko z saltem na przodzie.
    // UWAGA: starsze wdrozenie moze jej NIE miec - wykrywamy odczytem
    // `predictVanityToken`, patrz `vanitySupported` w LaunchTokenModal.
    type: 'function',
    name: 'launchVanity',
    stateMutability: 'payable',
    inputs: [
      { name: 'vanitySalt', type: 'bytes32' },
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'feeBps_', type: 'uint16' },
      { name: 'creatorFeeBps_', type: 'uint16' },
      { name: 'buybackBps_', type: 'uint16' },
      { name: 'windowCap_', type: 'uint256' },
      { name: 'receiverAccounts_', type: 'address[]' },
      { name: 'receiverSharesBps_', type: 'uint16[]' },
      { name: 'metadataURI_', type: 'string' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    // Adres, jaki dostanie `creator` dla tego `vanitySalt`. Interfejs liczy to
    // SAM offline; ten odczyt sluzy tylko do (a) wykrycia, czy wdrozenie zna
    // vanity, i (b) ostatecznego sprawdzenia mined-adresu przed transakcja.
    type: 'function',
    name: 'predictVanityToken',
    stateMutability: 'view',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'vanitySalt', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    // KOLEJNOSC ZWROTEK MUSI ZGADZAC SIE Z CurveLaunchpad.launchOf CO DO POLA.
    // Wszystkie sa statyczne, wiec przestawienie ich NIE wywala dekodera -
    // po cichu zwraca inne pole. Bylo tu `startedAt` przed rezerwami, przez co
    // to, co interfejs pokazywal jako zebrane ETH, bylo rezerwa TOKENA.
    type: 'function',
    name: 'launchOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'ethReserve', type: 'uint256' },
      { name: 'tokenReserve', type: 'uint256' },
      { name: 'startedAt', type: 'uint40' },
      { name: 'launchId', type: 'bytes32' },
    ],
  },
  {
    type: 'function',
    name: 'quoteBuy',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'ethIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'tokensOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
      { name: 'refund', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'VAULT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'HOOK',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'Launched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'launchId', type: 'bytes32', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'symbol', type: 'string', indexed: false },
      { name: 'totalSupply', type: 'uint256', indexed: false },
      { name: 'curveSupply', type: 'uint256', indexed: false },
      { name: 'tMin', type: 'uint256', indexed: false },
      { name: 'rVirt', type: 'uint256', indexed: false },
      { name: 'feeBps', type: 'uint16', indexed: false },
      { name: 'creatorFeeBps', type: 'uint16', indexed: false },
      { name: 'startedAt', type: 'uint40', indexed: false },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  WYJSCIE Z POZYCJI - sprzedaz na krzywej                              */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'quoteSell',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'ethOut', type: 'uint256' },
      { name: 'fee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'ethOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'sellWithPermit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'tokensIn', type: 'uint256' },
      { name: 'minEthOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'permitDeadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [{ name: 'ethOut', type: 'uint256' }],
  },

  /* -------------------------------------------------------------------- */
  /*  AWANS - bezuprawnieniowy, z nagroda dla wolajacego                   */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'graduate',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'gradFeeOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'callerReward', type: 'uint256' },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  WYPLATY - oplaty sa PULLEM, nie pushem                               */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimFor',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [],
  },

  /* -------------------------------------------------------------------- */
  /*  ODCZYTY POMOCNICZE                                                   */
  /* -------------------------------------------------------------------- */

  {
    type: 'function',
    name: 'spotPriceWeiPerToken',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'windowBought',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { type: 'function', name: 'T0', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'T_MIN', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'R_VIRT', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'MAX_BUY', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'LAUNCH_WINDOW',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'WINDOW_ADDR_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  { type: 'function', name: 'FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'CREATOR_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_CREATOR_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_BUYBACK_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'MAX_FEE_RECIPIENTS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  {
    type: 'function',
    name: 'feeConfigOf',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'feeBps', type: 'uint16' },
      { name: 'creatorFeeBps', type: 'uint16' },
      { name: 'receiverCount', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'metadataURI',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
  },

  /* -------------------------------------------------------------------- */
  /*  ZDARZENIA - jedyne zrodlo wykresu przed awansem                      */
  /* -------------------------------------------------------------------- */

  {
    type: 'event',
    name: 'Bought',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'ethIn', type: 'uint256', indexed: false },
      { name: 'ethNet', type: 'uint256', indexed: false },
      { name: 'feeEth', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
      { name: 'refund', type: 'uint256', indexed: false },
      { name: 'ethReserveAfter', type: 'uint256', indexed: false },
      { name: 'tokenReserveAfter', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Sold',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'tokensIn', type: 'uint256', indexed: false },
      { name: 'ethGross', type: 'uint256', indexed: false },
      { name: 'feeEth', type: 'uint256', indexed: false },
      { name: 'ethOut', type: 'uint256', indexed: false },
      { name: 'ethReserveAfter', type: 'uint256', indexed: false },
      { name: 'tokenReserveAfter', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CurveLocked',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'ethReserve', type: 'uint256', indexed: false },
      { name: 'tokenReserve', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Graduated',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'ethToPool', type: 'uint256', indexed: false },
      { name: 'tokensToPool', type: 'uint256', indexed: false },
      { name: 'tokensToDead', type: 'uint256', indexed: false },
      { name: 'gradFee', type: 'uint256', indexed: false },
      { name: 'sqrtPriceX96', type: 'uint160', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },

  /* -------------------------------------------------------------------- */
  /*  BLEDY - bez nich viem pokazuje surowy selektor zamiast powodu         */
  /* -------------------------------------------------------------------- */

  {
    // Kazde naliczenie oplaty, co do wei, per ODBIORCA. kind: 0 = protokol
    // z oplaty handlowej, 1 = odbiorcy tworcy z oplaty handlowej, 2 = protokol
    // z oplaty graduacyjnej, 3 = wolajacy graduate(). Jedyne zrodlo, ktore
    // rozlicza takze splity miedzy odbiorcow fee - sumy per konto zgadzaja sie
    // z claimable() co do wei (minus wyplaty z eventu Claimed).
    // Sygnatura zweryfikowana z CurveLaunchpad.sol.
    type: 'event',
    name: 'FeeAccrued',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'account', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'kind', type: 'uint8', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchConfigured',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buybackBps', type: 'uint16', indexed: false },
      { name: 'windowCap', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchMetadataSet',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'metadataURI', type: 'string', indexed: false },
    ],
  },

  { type: 'error', name: 'UnknownToken', inputs: [] },
  { type: 'error', name: 'InvalidFeeConfig', inputs: [] },
  { type: 'error', name: 'InvalidFeeReceiver', inputs: [] },
  { type: 'error', name: 'TooManyFeeRecipients', inputs: [] },
  { type: 'error', name: 'FeeTooHigh', inputs: [] },
  { type: 'error', name: 'Expired', inputs: [] },
  { type: 'error', name: 'SlippageRequired', inputs: [] },
  { type: 'error', name: 'Slippage', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'DustTrade', inputs: [] },
  { type: 'error', name: 'BuyTooLarge', inputs: [] },
  { type: 'error', name: 'WindowCap', inputs: [] },
  { type: 'error', name: 'CreatorLocked', inputs: [] },
  { type: 'error', name: 'CurveIsLocked', inputs: [] },
  { type: 'error', name: 'AlreadyGraduated', inputs: [] },
  { type: 'error', name: 'NotLocked', inputs: [] },
  { type: 'error', name: 'ReserveTooSmallToGraduate', inputs: [] },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
  { type: 'error', name: 'Arithmetic', inputs: [] },
  { type: 'error', name: 'Reentrancy', inputs: [] },
  { type: 'error', name: 'EthTransferFailed', inputs: [] },
  { type: 'error', name: 'TokenTransferFailed', inputs: [] },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
] as const;

export const liquidityVaultAbi = [
  { type: 'function', name: 'poolKeyOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' }] }] },
  { type: 'function', name: 'positionOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: 'poolId', type: 'bytes32' }, { name: 'liquidity', type: 'uint128' }, { name: 'tickLower', type: 'int24' }, { name: 'tickUpper', type: 'int24' }] },
  { type: 'function', name: 'seeded', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'creatorOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'claimableEth', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'harvest', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'claimEth', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'event', name: 'Harvested', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'poolId', type: 'bytes32', indexed: true }, { name: 'caller', type: 'address', indexed: true }, { name: 'fee0', type: 'uint256', indexed: false }, { name: 'fee1', type: 'uint256', indexed: false }] },
] as const;

export const hookAbi = [
  { type: 'function', name: 'pendingEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'pendingToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableEth', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimableToken', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }, { name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'function', name: 'HOOK_FEE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'PROTOCOL_SHARE_BPS', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'buybackBps', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'pendingBuybackEth', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'buybackTokens', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function',
    name: 'executeBuyback',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'minTokensOut', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'tokensOut', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'AutoBuyback',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'ethIn', type: 'uint256', indexed: false },
      { name: 'tokensBought', type: 'uint256', indexed: false },
      { name: 'caller', type: 'address', indexed: true },
    ],
  },
  { type: 'error', name: 'NothingToBuyback', inputs: [] },
  { type: 'function', name: 'claimEth', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'claimToken', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }], outputs: [] },
  { type: 'event', name: 'HookFeeSettled', inputs: [{ name: 'token', type: 'address', indexed: true }, { name: 'ethToProtocol', type: 'uint256', indexed: false }, { name: 'ethToCreator', type: 'uint256', indexed: false }, { name: 'ethToBuyback', type: 'uint256', indexed: false }, { name: 'tokenToProtocol', type: 'uint256', indexed: false }, { name: 'tokenToCreator', type: 'uint256', indexed: false }] },
] as const;

/**
 * Stan startu, tak jak go numeruje `CurveLaunchpad.State`. Zero znaczy "ten
 * kontrakt nie zna tego tokena" i nie jest stanem, ktory wolno pokazac jako
 * pusta krzywa - to jest nieznany adres.
 */
export const LAUNCH_STATE = ['None', 'Curve', 'Locked', 'Graduated'] as const;

export type LaunchState = (typeof LAUNCH_STATE)[number];

/** Zbiorka do awansu wynika ze stalych krzywej i jest DOKLADNIE 3.00 ETH. */
export const CURVE_TARGET_ETH = 3;

/**
 * Blok wdrozenia launchpada na AKTYWNEJ sieci. `getLogs` od bloku 0 na
 * publicznym RPC albo trwa wieczne, albo dostaje limit zakresu - a przed tym
 * blokiem zadnego `Launched` z definicji nie ma.
 */
export const LAUNCHPAD_DEPLOY_BLOCK = ACTIVE_LAUNCHPAD_NETWORK.deployBlock;

export type LaunchpadToken = {
  id: string;
  name: string;
  symbol: string;
  creator: string;
  address?: `0x${string}`;
  state: 'Curve' | 'Locked' | 'Graduated';
  raised: number;
  target: number;
  holders: number;
  age: string;
  accent: string;
  live?: boolean;
  volume?: number;
  trades?: number;
  lastPrice?: number;
  /** Logo z profilu tworcy albo z `metadataURI`. Lancuch sam go NIE zna. */
  logoUrl?: string;
};

export const previewTokens: LaunchpadToken[] = [
  {
    id: 'lumen',
    name: 'Lumen Commons',
    symbol: 'LUMEN',
    creator: '0x93f...8b4',
    state: 'Curve',
    raised: 2.42,
    target: 3,
    holders: 84,
    age: '18 min',
    accent: '#8b78e6',
  },
  {
    id: 'moss',
    name: 'Moss Radio',
    symbol: 'MOSS',
    creator: '0x2ab...d19',
    state: 'Graduated',
    raised: 3,
    target: 3,
    holders: 216,
    age: '1 h',
    accent: '#5fa78c',
  },
  {
    id: 'nook',
    name: 'Nook Notes',
    symbol: 'NOOK',
    creator: '0x7cf...031',
    state: 'Locked',
    raised: 3,
    target: 3,
    holders: 143,
    age: '2 h',
    accent: '#d78a55',
  },
  {
    id: 'orbit',
    name: 'Orbit Garden',
    symbol: 'ORBT',
    creator: '0xd11...a62',
    state: 'Curve',
    raised: 0.84,
    target: 3,
    holders: 31,
    age: '4 h',
    accent: '#5b8bd9',
  },
];
