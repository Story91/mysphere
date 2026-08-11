// @ts-nocheck
'use client';

import { base, baseSepolia } from 'viem/chains';
import { createContext, useContext, useState, useMemo } from 'react';
import { createConfig, http, fallback, cookieStorage, createStorage } from 'wagmi';
import { WagmiConfig } from 'wagmi';
import {
  injected,
  walletConnect,
  baseAccount,
  coinbaseWallet,
  gemini,
  metaMask,
  safe,
} from 'wagmi/connectors';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FarcasterFrameProvider } from './components/FarcasterFrameProvider/FarcasterFrameProvider';
import { defineChain } from 'viem';
import { baseCampChain } from './contracts/BaseCampPostContract';
import { campMainnetChain } from './contracts/CampMainnet';
import { ENABLE_CAMP_MAINNET, CAMP_MAINNET } from '@/config/camp';
import { lineaChain } from './basechat/Linea/config/LineaNetworkConfig';
import { celoChain } from './basechat/Celo/config/CeloNetworkConfig';
import { ethereumChain } from './basechat/ETH/config/EthereumNetworkConfig';
import { worldChain } from './basechat/World/config/WorldChainNetworkConfig';
import { robinhoodChain, ROBINHOOD_RPC_URLS } from './basechat/Robinhood/config/RobinhoodNetworkConfig';

type ThemeMode = 'auto' | 'light' | 'dark';
type ThemeStyle = 'default' | 'base' | 'cyberpunk' | 'hacker';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  style: ThemeStyle;
  setStyle: (style: ThemeStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Domyslne opcje: bez nich staleTime=0 + refetchOnWindowFocus powoduje, ze kazdy
// powrot do zakladki re-fetchuje WSZYSTKIE query (identity per wiersz, useBalance,
// useName) po publicznych RPC.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 300_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Wagmi Configuration (bez Base Sepolia)
 * PL: Przygotowane dwie gałęzie konfiguracji, aby uniknąć błędu typów dla 484
 */
const CHAINS_BASE = [base, baseSepolia, baseCampChain, lineaChain, celoChain, ethereumChain, worldChain, robinhoodChain] as const;
const TRANSPORTS_BASE = {
  // Base MAINNET: publiczny mainnet.base.org jest rate-limited (429/-32016), a
  // startpad odpala do 90 okien getLogs na load + odczyty handlu. Pod produkcje
  // ustaw NEXT_PUBLIC_BASE_RPC_URL na wlasny endpoint (Alchemy/QuickNode);
  // fallback na publicnode, zeby jeden RPC nie byl pojedynczym punktem awarii.
  [base.id]: fallback([
    http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    http('https://base-rpc.publicnode.com'),
  ]),
  [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org'),
  [baseCampChain.id]: http('https://rpc.basecamp.t.raas.gelato.cloud'),
  [lineaChain.id]: http('https://linea-rpc.publicnode.com'),
  [celoChain.id]: http('https://forno.celo.org'),
  // Ethereum: eth.llamarpc.com PRZESTAL wysylac naglowki CORS - w konsoli
  // produkcyjnej dawalo to kilkadziesiat bledow "blocked by CORS policy" pod
  // rzad i kazdy odczyt z mainnetu (m.in. rozwiazywanie ENS) konczyl sie
  // porazka. Zweryfikowane 5 sierpnia 2026: publicnode odpowiada 200 z
  // `access-control-allow-origin: *`, llamarpc nie odpowiada na preflight.
  //
  // fallback() zamiast pojedynczego http(): gdy pierwszy endpoint padnie, viem
  // przechodzi do nastepnego zamiast zwracac blad. Jeden publiczny RPC to
  // pojedynczy punkt awarii dla calego lancucha.
  [ethereumChain.id]: fallback([
    http('https://ethereum-rpc.publicnode.com'),
    http('https://rpc.ankr.com/eth'),
  ]),
  [worldChain.id]: http('https://worldchain-mainnet.g.alchemy.com/public'),
  // Robinhood Chain: publiczny RPC jest rate-limited i "not recommended for
  // production" - pod produkcje ustaw NEXT_PUBLIC_ROBINHOOD_RPC_URL na wlasny
  // endpoint (Alchemy/QuickNode). ROBINHOOD_RPC_URLS[0] bierze env, a jak go
  // brak - publiczny fallback.
  [robinhoodChain.id]: http(ROBINHOOD_RPC_URLS[0]),
} as const;

const CHAINS_WITH_CAMP_MAINNET = [
  ...CHAINS_BASE,
  campMainnetChain,
] as const;
const TRANSPORTS_WITH_CAMP_MAINNET = {
  ...TRANSPORTS_BASE,
  [campMainnetChain.id]: http(CAMP_MAINNET.RPC_HTTP),
} as const;

// Wallet metadata must match the origin actually serving the app — a hardcoded
// prod URL makes WalletConnect Verify / MetaMask flag localhost sessions as
// mismatched ("unverified") and some wallets refuse to connect.
const APP_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://mysphere.fun';

const COMMON_CONNECTORS = [
  // Aktualny connector spec miniapp (v2). @farcaster/frame-wagmi-connector
  // i @farcaster/frame-sdk to przestarzale nazwy - frame-sdk byl juz tylko shimem.
  farcasterMiniApp(),
  injected(),
  metaMask({
    dappMetadata: {
      name: 'MySphere',
      url: APP_ORIGIN,
      iconUrl: `${APP_ORIGIN}/android-chrome-192x192.png`,
    },
  }),
  // Dedykowany connector Base Account. Zastapil coinbaseWallet({preference:
  // 'smartWalletOnly'}) - Base wydzielilo Base Account z konektora Coinbase
  // Wallet, a wariant smartWalletOnly jest sciezka wygaszana.
  baseAccount({
    appName: 'MySphere',
    appLogoUrl: `${APP_ORIGIN}/android-chrome-192x192.png`,
  }),
  // Coinbase Wallet - rozlaczny przypadek wobec baseAccount. Base Account to
  // smart wallet zakladany passkeyem; ten connector obsluguje ludzi, ktorzy maja
  // rozszerzenie albo aplikacje Coinbase Wallet z wlasnym kluczem. Bez niego
  // odsylalismy ich do "Browser wallet", gdzie czesto laduje inny portfel.
  coinbaseWallet({
    appName: 'MySphere',
    appLogoUrl: `${APP_ORIGIN}/android-chrome-192x192.png`,
  }),
  // Gemini Wallet - dostarczany przez @wagmi/connectors, wiec kosztuje nas
  // jedna linie, a komus zamyka droge do zalogowania.
  gemini(),
  walletConnect({
    projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || '',
    metadata: {
      name: 'MySphere',
      description: 'The onchain social Dapp on Base. Build, grow, and own your digital Sphere.',
      url: APP_ORIGIN,
      icons: [`${APP_ORIGIN}/android-chrome-192x192.png`]
    }
  }),
  safe(),
] as const;

// Stan wagmi trzymany w COOKIE, nie w localStorage, oraz ssr: true.
//
// CELOWO BEZ cookieToInitialState w root layoucie. Odczyt naglowkow/cookie
// w root layoucie opt-outuje z prerenderu KAZDA trase w aplikacji - zmierzone:
// 46 stron statycznych spadlo do 2, a nawet whitepaper (czysty tekst)
// uruchamialby funkcje serwerowa przy kazdym zadaniu. Na Next 14 nie da sie
// miec obu naraz; rozwiazalby to PPR z Next 15.
//
// Co zostaje: cookieStorage daje trwalosc stanu miedzy przeladowaniami,
// a ssr: true chroni przed rozjazdem hydracji. Czego nie ma: serwer nie zna
// adresu przy renderze, wiec pierwszy paint jest "niezalogowany".
const SSR_STORAGE = {
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
} as const;

export const wagmiConfig = ENABLE_CAMP_MAINNET
  ? createConfig({
      ...SSR_STORAGE,
      chains: CHAINS_WITH_CAMP_MAINNET,
      transports: TRANSPORTS_WITH_CAMP_MAINNET,
      connectors: COMMON_CONNECTORS as unknown as any,
    })
  : createConfig({
      ...SSR_STORAGE,
      chains: CHAINS_BASE,
      transports: TRANSPORTS_BASE,
      connectors: COMMON_CONNECTORS as unknown as any,
    });

export function Providers({
  children,
  initialState,
}: {
  children: React.ReactNode;
  /** Stan wagmi odczytany z cookie po stronie serwera (cookieToInitialState). */
  initialState?: any;
}) {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const [style, setStyle] = useState<ThemeStyle>('base');

  // Bez useMemo kazdy render Providers tworzy nowy obiekt kontekstu i re-renderuje
  // kazdego konsumenta useTheme().
  const themeValue = useMemo(
    () => ({ mode, setMode, style, setStyle }),
    [mode, style]
  );

  return (
    <ThemeContext.Provider value={themeValue}>
      <QueryClientProvider client={queryClient}>
        <WagmiConfig config={wagmiConfig} initialState={initialState}>
          <FarcasterFrameProvider>
            {children}
          </FarcasterFrameProvider>
        </WagmiConfig>
      </QueryClientProvider>
    </ThemeContext.Provider>
  );
}
