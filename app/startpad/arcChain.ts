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
