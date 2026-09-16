import { defineChain } from 'viem';

/**
 * Arc testnet (Circle) jako lancuch dla viem i wagmi.
 *
 * ===========================================================================
 * JEDNOSTKA NATYWNA TO USDC, NIE ETH
 * ===========================================================================
 * I nie jest to kosmetyka nazwy. Gaz, `msg.value` i `getBalance` chodza tu w
 * USDC z 18 miejscami po przecinku - czyli arytmetycznie identycznie jak wei,
 * wiec `formatEther` i `parseEther` dzialaja bez zmian. Ten SAM pieniadz
 * widziany przez interfejs ERC-20 pod `0x3600...0000` ma 6 miejsc. Zmierzone
 * na parze USDC/EURC: saldo natywne 236704171000000000000 przy `balanceOf`
 * 236704171 - to jest jedno saldo w dwoch zapisach, a nie dwa tokeny.
 *
 * Praktyczny skutek dla nas: prog graduacji krzywej, `G = 4 x R_VIRT`, wychodzi
 * na tej sieci 3 USDC zamiast 3 ETH. Na testnecie to zaleta, bo pelny przebieg
 * kosztuje trzy dolary. Przed mainnetem trzeba to przeliczyc.
 *
 * ===========================================================================
 * DLACZEGO BLOCKDAEMON JEST PIERWSZY
 * ===========================================================================
 * Circle podaje piec publicznych endpointow. Przetestowalem wszystkie pod
 * katem okna `eth_getLogs`, bo od niego zalezy, czy strona tokena w ogole
 * odtworzy historie:
 *
 *     rpc.testnet.arc.network   10 000
 *     rpc.testnet.arc.io        10 000
 *     drpc                      10 000
 *     quicknode                 10 000
 *     blockdaemon               50 000   <-
 *
 * Arc robi blok co 0,51 s, czyli ~169 tys. blokow na dobe. Przy oknie 10 tys.
 * jedna doba historii to siedemnascie kolejek - tyle, ze wykres nie zdazylby
 * powstac. Przy 50 tys. to trzy i pol. Dlatego domyslny jest Blockdaemon, a
 * oficjalny endpoint stoi za nim jako zapas.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    // 18, a nie 6. To jest zapis NATYWNY, ten od `msg.value` i gazu.
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.blockdaemon.testnet.arc.io', 'https://rpc.testnet.arc.io'],
      webSocket: ['wss://rpc.blockdaemon.testnet.arc.io:443/websocket'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://testnet.arcscan.app',
      // Blockscout - sprawdzone: /api/v2/stats odpowiada jego ksztaltem, wiec
      // `blockscout.ts` (liczba posiadaczy) zadziala tu bez zmian.
      apiUrl: 'https://testnet.arcscan.app/api',
    },
  },
  testnet: true,
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

/**
 * Arc MAINNET (chainId 5042).
 *
 * ===========================================================================
 * CO JEST SPRAWDZONE ODCZYTEM Z LANCUCHA (11-12.09.2026), A CO NIE
 * ===========================================================================
 * Sprawdzone: siec produkuje bloki co 0,50 s (20,5 mln blokow), gasPrice
 * ~21,5 gwei, USDC pod tym samym `0x3600...0000` (6 miejsc w ERC-20, podaz
 * 4,4 mln), Multicall3 i Permit2 pod adresami kanonicznymi, CREATE2 factory
 * jest. Stoi tam GOTOWY Uniswap v4 PoolManager `0x8366a39C...0951` - prawdziwy
 * singleton (`extsload` odpowiada), wiec w odroznieniu od testnetu NIE musimy
 * stawiac wlasnego.
 *
 * NIE sprawdzone i wazne: czy walidator przyjmie nasza transakcje. `eth_estimateGas`
 * na wdrozenie kontraktu z naszego adresu przechodzi (56 036 gas), ale to tylko
 * symulacja - portfel ma 0 USDC, wiec zadnej transakcji jeszcze nie wyslalismy.
 *
 * ===========================================================================
 * RPC: DLACZEGO TEN ADRES I DLACZEGO TO JEST TYMCZASOWE
 * ===========================================================================
 * Circle do 12.09.2026 nie opublikowal endpointow mainnetu ("Mainnet endpoints
 * and parameters are published separately when available"), a chainlist ma 5042
 * z PUSTA lista RPC. Jedyny dzialajacy, jaki znalazlem, to `rpc.arc-scan.org`
 * - nalezy do zewnetrznego eksploratora, nie do Circle, i tnie `eth_getLogs`
 * powyzej 10 000 blokow. Przy 0,5 s na blok to 83 minuty historii na zapytanie,
 * czyli za malo dla tablicy tokenow.
 *
 * PUBLICZNY MAINNET RUSZA 16.09.2026 (komunikat Circle). Wtedy pojawia sie
 * oficjalne endpointy i CCTP - i wtedy ten adres trzeba podmienic, najlepiej
 * na dostawce z kluczem (NEXT_PUBLIC_ARC_MAINNET_RPC_URL).
 *
 * Oficjalny eksplorator `explorer.arc.io` stoi dzis za logowaniem Cloudflare
 * Access Circle, wiec jako publiczny wpisany jest `arc-scan.org`.
 */
export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    // Jak na testnecie: natywny zapis ma 18 miejsc, ERC-20 sześć.
    decimals: 18,
  },
  rpcUrls: {
    default: {
      // 16.09.2026 (dzien startu): oficjalny endpoint Circle odpowiada i przyjmuje
      // eth_getLogs; arc-scan zostaje zapasem. Okno getLogs - patrz config.ts.
      http: [process.env.NEXT_PUBLIC_ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io', 'https://rpc.arc-scan.org'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arcscan',
      url: 'https://arc-scan.org',
      apiUrl: 'https://arc-scan.org/api',
    },
  },
  testnet: false,
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});
