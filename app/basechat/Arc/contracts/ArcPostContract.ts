import { arcTestnet } from '../../../startpad/arcChain';
import { ROBINHOOD_POST_CONTRACT_ABI } from '../../Robinhood/contracts/RobinhoodPostContract';

/**
 * Kontrakt postow na Arc (Circle) - ten sam bajt w bajt co na Robinhoodzie i
 * Linei (zrodlo: contracts/ArcPostContract.sol), wiec ABI jest wspolne.
 *
 * Wdrozony 2026-09-11 przez wlasciciela (deployment-info.json obok),
 * ZMIERZONE: eth_getCode = 2148 B. Adres siedzi w kodzie jako domyslny -
 * tak jak na Robinhoodzie, gdzie brak zmiennej env wylaczal postowanie na
 * miesiac. NEXT_PUBLIC_ARC_POST_CONTRACT zostaje jako nadpisanie po
 * ewentualnym redeployu (`npm run contracts:deploy:arc`).
 */
export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_POST_CONTRACT_ABI = ROBINHOOD_POST_CONTRACT_ABI;

export const ARC_DEPLOYED_CONTRACT_ADDRESS = '0xD012Afb6E08B0DA44f9041bA3d277EA727F9389b';

export const ARC_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_ARC_POST_CONTRACT || ARC_DEPLOYED_CONTRACT_ADDRESS;

export const getArcContractAddress = (chainId: number): string | undefined => {
  if (chainId !== ARC_CHAIN_ID) return undefined;
  return ARC_CONTRACT_ADDRESS || undefined;
};

export const isArcPostContractDeployed = (): boolean => Boolean(ARC_CONTRACT_ADDRESS);
