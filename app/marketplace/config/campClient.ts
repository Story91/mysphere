import { createPublicClient, fallback, http } from 'viem';
import { baseCampChain } from '@/app/contracts/BaseCampPostContract';
import { CAMP_MAINNET } from '@/config/camp';

/**
 * Jeden klient odczytu dla calego modulu marketplace.
 *
 * Do 2026-09-11 kazdy komponent tworzyl wlasny createPublicClient z RPC
 * `rpc.basecamp.t.raas.gelato.cloud` (Basecamp testnet), a dwa z nich
 * definiowaly przy tym chain o id 325000. Host zniknal z DNS (NXDOMAIN),
 * wiec wszystkie odczyty konczyly sie ENOTFOUND, a zapisy przez wagmi i tak
 * szly juz na Camp mainnet (484) przez baseCampChain. Tu jest ta sama para
 * RPC co w app/providers.tsx: glowny + Blockscout jako zapas.
 *
 * Kontrakty z simpleMarketplace.ts nadal nie maja bajtkodu na 484, trasa
 * /marketplace stoi w config/routeStatus.js. Ten plik naprawia transport,
 * nie adresy.
 */
export function createCampPublicClient() {
  return createPublicClient({
    chain: baseCampChain,
    transport: fallback([http(CAMP_MAINNET.RPC_HTTP), http(CAMP_MAINNET.RPC_HTTP_FALLBACK)]),
  });
}
