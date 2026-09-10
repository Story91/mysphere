import { arcTestnet } from '../../../startpad/arcChain';
import { ROBINHOOD_POST_CONTRACT_ABI } from '../../Robinhood/contracts/RobinhoodPostContract';

/**
 * Kontrakt postow na Arc (Circle) - ten sam bajt w bajt co na Robinhoodzie i
 * Linei (zrodlo: contracts/ArcPostContract.sol), wiec ABI jest wspolne.
 *
 * ADRES IDZIE Z ENV, bo kontrakt NIE JEST JESZCZE WDROZONY. Deployer z
 * .env.local (0xF1fa...) ma na Arc zero USDC (ZMIERZONE 2026-09-11), a gaz
 * placi sie tam w USDC. Po zasileniu:
 *
 *     npx hardhat run scripts/deployArc.js --network arcTestnet
 *
 * i wpisanie adresu do NEXT_PUBLIC_ARC_POST_CONTRACT. Do tego czasu
 * kompozytor Arc pokazuje baner "not live yet" - tak jak Robinhood przed
 * swoim deployem.
 */
export const ARC_CHAIN_ID = arcTestnet.id;

export const ARC_POST_CONTRACT_ABI = ROBINHOOD_POST_CONTRACT_ABI;

export const ARC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ARC_POST_CONTRACT || '';

export const getArcContractAddress = (chainId: number): string | undefined => {
  if (chainId !== ARC_CHAIN_ID) return undefined;
  return ARC_CONTRACT_ADDRESS || undefined;
};

export const isArcPostContractDeployed = (): boolean => Boolean(ARC_CONTRACT_ADDRESS);
