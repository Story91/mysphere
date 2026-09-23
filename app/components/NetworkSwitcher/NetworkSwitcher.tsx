'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useAccount, useSwitchChain, useChainId } from 'wagmi';
import { base } from 'viem/chains';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { campMainnetChain } from '@/app/contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from '@/app/basechat/Linea/config/LineaNetworkConfig';
import { celoChain } from '@/app/basechat/Celo/config/CeloNetworkConfig';
import { ethereumChain } from '@/app/basechat/ETH/config/EthereumNetworkConfig';
import { worldChain } from '@/app/basechat/World/config/WorldChainNetworkConfig';
import { robinhoodChain } from '@/app/basechat/Robinhood/config/RobinhoodNetworkConfig';
import { arcMainnet } from '@/app/startpad/arcChain';
import { useSolanaWallet } from '@/app/components/solana/SolanaWalletHost';
import {
  SOLANA_ROUTE,
  evmExitRoute,
  isOnSolanaTab,
  shortSolanaAddress,
  switcherRowState,
} from '@/app/components/solana/solanaWalletNav';

// Definicja sieci z polskimi komentarzami
// Definition of networks with Polish comments
const baseEntry = {
  id: base.id,
  name: 'Base',
  shortName: 'BASE',
  iconUrl: '/logotypy/Base_basemark_blue.png', // Ikona dla sieci Base
  color: '#0052FF',
  bgWhite: false,
  postingKey: 'base', // Zakladka composera w basechacie (?network=) - patrz evmExitRoute
} as const;


const campMainnetEntry = {
  id: campMainnetChain.id,
  name: 'Camp',
  shortName: 'CAMP',
  iconUrl: '/Camp.png',
  color: '#FF6B35',
  disabled: !ENABLE_CAMP_MAINNET,
  bgWhite: true, // Białe tło pod logo, żeby było czytelne
  postingKey: 'basecamp',
} as const;

const lineaEntry = {
  id: lineaChain.id,
  name: 'Linea',
  shortName: 'LINEA',
  iconUrl: '/Logomark Blue BG.svg', // Ikona dla sieci Linea
  color: '#000000',
  bgWhite: false,
  postingKey: 'linea',
} as const;

const celoEntry = {
  id: celoChain.id,
  name: 'Celo',
  shortName: 'CELO',
  iconUrl: '/logotypy/AkeHh5LriDwrNIvVvUQ66wSHU.webp', // Ikona dla sieci Celo
  color: '#FCFF52',
  bgWhite: false, // Czarne tło
  bgBlack: true, // Czarne tło dla Celo
  postingKey: 'celo',
} as const;

const ethereumEntry = {
  id: ethereumChain.id,
  name: 'Ethereum',
  shortName: 'ETH',
  iconUrl: '/ethlogo.png', // Logo Ethereum
  color: '#627EEA',
  bgWhite: false,
  postingKey: 'ethereum',
} as const;

const worldChainEntry = {
  id: worldChain.id,
  name: 'World Chain',
  shortName: 'WORLD',
  iconUrl: '/logotypy/world-symbol-dark.svg', // Ikona dla sieci World Chain
  color: '#8B5CF6',
  bgWhite: true, // Białe tło dla World Chain
  postingKey: 'worldchain',
} as const;

const robinhoodEntry = {
  id: robinhoodChain.id,
  name: 'Robinhood Chain',
  shortName: 'RH',
  iconUrl: '/robin.webp', // Oficjalne logo Robinhooda
  color: '#00C805', // Firmowa zielen Robinhooda
  bgWhite: false,
  postingKey: 'robinhood',
} as const;

/**
 * Arc (Circle) - MAINNET. Publiczny start byl 16 wrzesnia 2026 i tego dnia
 * wpis przeszedl z testnetu (5042002) na mainnet (5042): launchpad stoi pod
 * 0xD5f65Cfb..., handel po graduacji dziala, wiec wysylanie ludzi z glownej
 * nawigacji na testnet bylo juz tylko myleniem. Testnet zostaje osiagalny
 * w przelaczniku startpada, nie tutaj.
 *
 * Znak jest prawdziwym plikiem od wlasciciela. Przez chwile stal tu monogram,
 * bo oficjalnego logo nie bylo pod zadnym ze standardowych adresow (favicon,
 * apple-touch - wszystkie 404), a znak firmowy odrysowany z pamieci wyglada
 * jak zepsuty interfejs. Mechanizm monogramu ZOSTAJE dla kolejnej sieci bez
 * logo - patrz `networkIcon` i `NetworkMonogram` nizej.
 *
 * Barwa to blekit z motywu startpada dla tej sieci (app/startpad/config.ts).
 */
const arcEntry = {
  id: arcMainnet.id,
  name: 'Arc',
  shortName: 'ARC',
  iconUrl: '/arc.jpg', // Oficjalny znak Arc, dostarczony przez wlasciciela
  color: '#4D9AF0',
  bgWhite: false,
  postingKey: 'arc',
} as const;

/**
 * Solana - JEDYNY wpis, ktory nie przelacza lancucha, tylko przenosi.
 *
 * Caly ten przelacznik stoi na `switchChain` z wagmi, a ten przyjmuje
 * NUMERYCZNY chainId sieci EVM. Solana takiego identyfikatora nie ma i nie
 * bedzie miala - to inna rodzina lancuchow, z innym portfelem i innymi
 * podpisami. Wpisanie tu atrapy numeru daloby pozycje, ktora po klinieciu
 * cicho nic nie robi (`switchChain` odrzucilby nieznany lancuch), czyli
 * najgorszy mozliwy wariant: przycisk, ktory wyglada na dzialajacy.
 *
 * Zamiast tego `href` prowadzi do zakladki Solany w basechacie, gdzie stoi
 * jej wlasna sciezka transakcyjna. Obsluge rozdziela `handleNetworkPick` nizej.
 *
 * OD 23.09.2026 WYBOR SOLANY TAKZE PODPINA KONTO SOLANY. Samo przeniesienie
 * na zakladke bylo polowa roboty: wlasciciel zglosil, ze w MetaMasku (ktory
 * ma dzis konto Solany) "nie da sie przelaczyc na solane", a Phantom
 * podlaczony w nawigacji siedzial na Ethereum. Teraz klikniecie laczy konto
 * Solany TEGO SAMEGO portfela, na ktorym stoi strona EVM (MetaMask ->
 * MetaMask, Phantom -> Phantom), a bez pary otwiera wybor portfela Solany.
 * Po podlaczeniu pastylka pokazuje Solane i skrot adresu, takze po
 * przeladowaniu (tryb w localStorage, patrz SolanaWalletHost).
 *
 * Znak jest tym samym plikiem, ktorego uzywa pasek sieci w feedzie
 * (SOFT_NETWORKS) - jedno zrodlo na cala aplikacje, zeby Solana nie miala
 * dwoch roznych logotypow w dwoch miejscach interfejsu.
 */
const solanaEntry = {
  id: 'solana',
  name: 'Solana',
  shortName: 'SOL',
  href: SOLANA_ROUTE,
  iconUrl: '/solana.svg',
  color: '#9945FF',
  bgWhite: false,
} as const;

/**
 * Kolejnosc: Base, Arc, Camp, Linea, Celo, Ethereum, World Chain, Robinhood,
 * Solana. Solana stoi na koncu, bo jako jedyna nie przelacza lancucha w
 * portfelu, tylko przenosi na wlasna zakladke - patrz `solanaEntry` wyzej.
 *
 * BASE SEPOLIA WYPADLA STAD 16.09.2026, a Arc wszedl na jej miejsce. Powod:
 * to jedyna siec TESTOWA w glownej nawigacji produkcyjnej - stala tam z
 * czasow, gdy launchpad dzialal wylacznie na testnecie. Dzis Arc ma mainnet
 * z prawdziwymi tokenami, wiec drugie miejsce nalezy do niego, a wysylanie
 * gosci na siec zabawkowa tylko myli.
 *
 * Sepolia NIE znika z aplikacji: zostaje w rejestrze wagmi i w przelaczniku
 * sieci na startpadzie, wiec portfel nadal sie na nia laczy i deweloper ma
 * gdzie testowac. Znika wylacznie z tej listy.
 *
 * Skutek uboczny, swiadomy: portfel podlaczony do Sepolii nie ma juz tu
 * swojego wpisu, wiec pastylka pokaze pierwsza siec z listy (patrz
 * `networks[0]` nizej). Tak samo zachowuje sie kazda inna siec spoza listy.
 */
const networks = [baseEntry, arcEntry, campMainnetEntry, lineaEntry, celoEntry, ethereumEntry, worldChainEntry, robinhoodEntry, solanaEntry] as const;
type Network = (typeof networks)[number];

/** Wpis, ktory przenosi na inna trase zamiast przelaczac lancuch w portfelu. */
function networkHref(network: Network): string | null {
  return 'href' in network ? network.href : null;
}

/** Zakladka composera w basechacie odpowiadajaca tej sieci (wartosc ?network=). */
function networkPostingKey(network: Network): string | null {
  return 'postingKey' in network ? network.postingKey : null;
}

/** Adres pliku znaku sieci albo null, gdy wpis go nie ma (patrz `arcEntry`). */
function networkIcon(network: Network): string | null {
  return 'iconUrl' in network ? network.iconUrl : null;
}

/**
 * Zastepstwo znaku firmowego: dwie litery skrotu na barwie sieci. Ta sama
 * zasada, co przy tokenach bez logo w startpadzie - lepiej uczciwy monogram niz
 * logotyp odrysowany z pamieci.
 */
function NetworkMonogram({ network, size }: { network: Network; size: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-full font-soft-display font-extrabold text-white"
      style={{ width: size, height: size, backgroundColor: network.color, fontSize: Math.round(size * 0.42) }}
    >
      {network.shortName.slice(0, 2)}
    </span>
  );
}

/**
 * Tlo pod logo: nie kazdy wpis ma te pola, wiec pytamy przez `in`, nie przez `any`.
 *
 * Same znaki sieci sa nietykalne - zmienia sie wylacznie domyslna podkladka.
 * `bg-white/10` bylo bialym przydymieniem pod ciemne szklo; na bialej belce
 * jest niewidoczne, wiec krazek dostaje lawendowa powierzchnie zaglebiona.
 */
function iconBackground(network: Network): string {
  if ('bgWhite' in network && network.bgWhite) return 'bg-white';
  if ('bgBlack' in network && network.bgBlack) return 'bg-black';
  return 'bg-soft-sunken';
}

function isNetworkDisabled(network: Network): boolean {
  return 'disabled' in network && !!network.disabled;
}

export function NetworkSwitcher() {
  const { switchChain } = useSwitchChain();
  const router = useRouter();
  // Tylko po to, zeby przelacznik przerysowal sie po nawigacji - stan
  // "czy composer stoi na zakladce Solany" czytamy z window.location nizej.
  const pathname = usePathname();
  const chainId = useChainId();
  const { isConnected, connector } = useAccount();
  const solana = useSolanaWallet();
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Solana jest biezaca siecia, gdy uzytkownik ja wybral I konto Solany jest
  // podlaczone (albo wlasnie wraca po przeladowaniu) - patrz resolveNavSelection.
  const onSolana = solana.navSelection === 'solana';
  const solanaShort = shortSolanaAddress(solana.address);
  // Uzytkownik wybral Solane i portfel wlasnie pyta o zgode. Pastylka zostaje
  // wtedy na sieci EVM (konta jeszcze nie ma), wiec bez tej flagi przez caly
  // czas otwartego okna portfela przelacznik nie mowil, ze cokolwiek sie dzieje.
  const solanaPending = solana.mode === 'solana' && solana.connecting && !onSolana;

  // Aktywna siec WYNIKA z chainId (albo z trybu Solany), wiec jest wyliczana,
  // a nie trzymana w stanie. Wczesniej stan i efekt gonily sie o jeden render:
  // pierwsza klatka po zmianie sieci rysowala jeszcze poprzednie logo.
  // Domyslnie Base, gdy portfel siedzi na nieobslugiwanej sieci.
  const activeNetwork: Network = useMemo(
    () => (onSolana ? solanaEntry : networks.find((net) => net.id === chainId) ?? networks[0]),
    [chainId, onSolana]
  );
  // Skrot adresu Solany w nazwie dostepnej: przy dwoch portfelach naraz
  // "Solana" bez adresu nie mowi, KTORE konto jest podpiete.
  const activeLabel = onSolana && solanaShort
    ? `${activeNetwork.name} (${solanaShort})`
    : solanaPending
      ? `${activeNetwork.name}, connecting Solana`
      : activeNetwork.name;

  // Zamyka menu po kliknięciu poza komponentem albo klawiszem Escape.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  // Nie renderuj komponentu, jesli zaden portfel nie jest polaczony. Samo
  // konto Solany (portfel bez strony EVM, np. Solflare) tez sie liczy.
  if (!isConnected && !onSolana) {
    return null;
  }

  const handleNetworkPick = (network: Network) => {
    const href = networkHref(network);
    if (href) {
      // Siec spoza EVM - nie ma czego przelaczac w wagmi, wiec przenosimy
      // uzytkownika tam, gdzie ta siec faktycznie dziala, i podpinamy konto
      // Solany portfela, na ktorym stoi strona EVM. W miniappie Farcastera
      // connectPreferred nic nie robi - zostaje samo przeniesienie, jak dotad.
      router.push(href);
      solana.connectPreferred(connector?.name ?? null);
      setIsOpen(false);
      return;
    }
    // Podlaczone jest samo konto Solany (Solflare, albo odmowa strony EVM).
    // Wyjscie z trybu Solany schowaloby caly przelacznik (patrz warunek
    // wyzej), a sieci EVM i tak nie ma na czym wlaczyc - wiec zostajemy na
    // Solanie i mowimy, czego brakuje, zamiast cicho nic nie zrobic.
    if (!isConnected) {
      toast(`Connect an Ethereum wallet to use ${network.name}. Use Connect wallet in the top bar.`);
      setIsOpen(false);
      return;
    }
    // Wybor sieci EVM konczy tryb Solany.
    solana.setMode('evm');
    if (typeof window !== 'undefined') {
      // Composer stoi na zakladce Solany - przestawiamy go na wybrana siec,
      // zeby pastylka i formularz pod nia nie mowily dwoch roznych rzeczy.
      // Bez warunku "konto Solany podlaczone": po odmowie w portfelu Solany
      // composer zostaje na zakladce Solany, a to byla wtedy jedyna droga
      // wyjscia. Poza ta zakladka evmExitRoute zwraca null.
      const exit = evmExitRoute(window.location.pathname, window.location.search, networkPostingKey(network));
      if (exit) router.replace(exit);
    }
    // Ten sam lancuch co w portfelu (np. Base po wyjsciu z Solany) nie
    // wymaga prosby do portfela - wystarczyla zmiana trybu.
    if (switchChain && network.id !== chainId) {
      switchChain({ chainId: network.id as number });
    }
    setIsOpen(false);
  };

  // Czytane tylko przy otwartym menu, czyli wylacznie po stronie klienta -
  // zamkniete menu na serwerze i w pierwszym renderze nie zalezy od adresu.
  // `pathname` w warunku wiaze wynik z nawigacja Next.js.
  const onSolanaTab =
    isOpen && !!pathname && typeof window !== 'undefined'
      ? isOnSolanaTab(window.location.pathname, window.location.search)
      : false;

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Kompaktowy przycisk z aktualną siecią */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Switch network, currently ${activeLabel}`}
        aria-busy={solanaPending || undefined}
        title={onSolana && solanaShort ? `Solana account ${solanaShort}` : solanaPending ? 'Connecting Solana…' : undefined}
        className="flex items-center gap-2 px-3 py-2 bg-soft-surface hover:bg-soft-sunken rounded-pill border border-soft-line hover:border-soft-line-strong transition-[background-color,border-color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.97] outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-offset-2 focus-visible:ring-offset-soft-surface"
      >
        {activeNetwork.id === base.id ? (
          <div className="w-5 h-5 bg-white rounded p-0.5 flex items-center justify-center">
            <Image
              src="/logotypy/Base_square_blue.png"
              alt=""
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
        ) : (
          <>
            {networkIcon(activeNetwork) ? (
              <div className={`w-5 h-5 rounded-full overflow-hidden ${iconBackground(activeNetwork)} flex items-center justify-center`}>
                <Image
                  src={networkIcon(activeNetwork) as string}
                  alt=""
                  width={16}
                  height={16}
                  className="object-contain"
                />
              </div>
            ) : (
              <NetworkMonogram network={activeNetwork} size={20} />
            )}
            <span className="hidden sm:block text-soft-ink text-sm font-soft-display font-bold">
              {activeNetwork.shortName}
            </span>
          </>
        )}
        <svg
          aria-hidden="true"
          className={`w-3 h-3 text-soft-ink-faint transition-transform [transition-duration:var(--dur-press)] ease-out-strong ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        /* origin-top-right: menu wyrasta spod swojego przycisku, a nie ze
           swojego srodka. */
        <div className="absolute top-full right-0 mt-2 w-48 origin-top-right bg-soft-surface border border-soft-line rounded-card shadow-float z-50 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 ease-out-strong">
          <div className="p-2">
            {networks.map((network) => {
              const isDisabled = isNetworkDisabled(network);
              // Podlaczone konto Solany dostaje skrot adresu pod nazwa: widac,
              // ze wybor Solany nie poprosi o nic, tylko przelaczy widok.
              const isSolanaRow = network.id === solanaEntry.id;
              const { current: isCurrent, disabled: isRowDisabled } = switcherRowState({
                isSolanaRow,
                hasHref: !!networkHref(network),
                locked: isDisabled,
                onSolana,
                onSolanaTab,
                chainMatches: network.id === chainId,
              });
              const rowAddress = isSolanaRow && solana.connected ? solanaShort : '';
              const rowPending = isSolanaRow && solanaPending;

              return (
              <button
                key={network.id}
                type="button"
                onClick={() => handleNetworkPick(network)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-pill transition-[background-color,color,transform] [transition-duration:var(--dur-press)] ease-out-strong active:scale-[0.98] disabled:active:scale-100 outline-none focus-visible:ring-2 focus-visible:ring-soft-primary focus-visible:ring-inset ${
                  isCurrent
                    ? 'bg-soft-sunken text-soft-ink'
                    : 'text-soft-ink-muted hover:bg-soft-sunken hover:text-soft-ink'
                }`}
                disabled={isRowDisabled}
                aria-current={isCurrent ? 'true' : undefined}
                aria-busy={rowPending || undefined}
                aria-label={
                  isDisabled
                    ? `${network.name} (locked)`
                    : rowAddress
                      ? `${network.name} (connected as ${rowAddress})`
                      : rowPending
                        ? `${network.name} (connecting)`
                        : network.name
                }
                title={isDisabled ? 'Locked' : rowAddress ? `Solana account ${rowAddress}` : undefined}
              >
                {network.id === base.id ? (
                  <div className="bg-white rounded-lg p-1.5 flex items-center justify-center flex-shrink-0">
                    <Image
                      src={networkIcon(network) as string}
                      alt=""
                      width={50}
                      height={20}
                      className="object-contain h-5"
                    />
                  </div>
                ) : (
                  networkIcon(network) ? (
                  <div className={`w-6 h-6 rounded-full overflow-hidden ${iconBackground(network)} flex items-center justify-center flex-shrink-0`}>
                    <Image
                      src={networkIcon(network) as string}
                      alt=""
                      width={20}
                      height={20}
                      className="object-contain"
                    />
                  </div>
                  ) : (
                    <NetworkMonogram network={network} size={24} />
                  )
                )}
                {network.id !== base.id && (
                  <div className="flex-1 min-w-0">
                    <div className="font-soft-display font-bold text-sm truncate">
                      {network.name}
                    </div>
                    {(rowAddress || rowPending) && (
                      <div aria-hidden="true" className="font-soft text-[11px] tabular-nums text-soft-ink-faint truncate">
                        {rowAddress || 'Check your wallet…'}
                      </div>
                    )}
                  </div>
                )}
                {/* Kłódka dla zablokowanych */}
                {isDisabled ? (
                  <svg
                    aria-hidden="true"
                    className="w-3.5 h-3.5 text-soft-ink-faint"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M7 10V8C7 5.79086 8.79086 4 11 4C13.2091 4 15 5.79086 15 8V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="5" y="10" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                ) : isCurrent && (
                  <div aria-hidden="true" className="w-2 h-2 bg-soft-primary rounded-full flex-shrink-0"></div>
                )}
              </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
