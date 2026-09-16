import { arcMainnet, arcTestnet } from '../../../startpad/arcChain';
import { ROBINHOOD_POST_CONTRACT_ABI } from '../../Robinhood/contracts/RobinhoodPostContract';

/**
 * Kontrakt postow na Arc (Circle) - ten sam bajt w bajt co na Robinhoodzie i
 * Linei (zrodlo: contracts/ArcPostContract.sol), wiec ABI jest wspolne.
 *
 * ===========================================================================
 * DWIE SIECI, JEDEN WPIS - I DLACZEGO PRZELACZA SIE SAM
 * ===========================================================================
 * Do 16.09.2026 caly ten plik znal WYLACZNIE testnet. Skutkiem bylo to, ze
 * uzytkownik z portfelem na Arc mainnet - czyli na sieci, na ktorej stoi juz
 * launchpad i handluja prawdziwe tokeny - dostawal w basechacie prosbe o
 * przelaczenie na siec testowa i nie mial jak napisac posta.
 *
 * Adres mainnetu nie jest tu wpisany, bo kontraktu tam jeszcze nie ma
 * (sprawdzone: `eth_getCode` = 0x). Wdraza go wlasciciel:
 *
 *   npm run contracts:deploy:arc:mainnet
 *
 * Skrypt wypisuje gotowa linie `NEXT_PUBLIC_ARC_POST_CONTRACT_MAINNET=0x...`
 * i zapisuje `deployment-info.mainnet.json`. Od chwili, gdy ta zmienna jest
 * ustawiona, basechat POSTUJE NA MAINNECIE - bez zmiany kodu. Dopoki jej nie
 * ma, zostaje testnet, czyli dokladnie dzisiejsze zachowanie.
 *
 * Testnet: wdrozony 2026-09-11 przez wlasciciela (deployment-info.json obok),
 * ZMIERZONE: eth_getCode = 2148 B. Adres siedzi w kodzie jako domyslny - tak
 * jak na Robinhoodzie, gdzie brak zmiennej env wylaczal postowanie na miesiac.
 */

/** Wdrozony 2026-09-11 na 5042002. */
export const ARC_TESTNET_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_ARC_POST_CONTRACT || '0xD012Afb6E08B0DA44f9041bA3d277EA727F9389b';

/** Pusty, dopoki wlasciciel nie wdrozy na 5042 - patrz naglowek. */
export const ARC_MAINNET_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ARC_POST_CONTRACT_MAINNET || '';

const BY_CHAIN: Record<number, string> = {
  [arcTestnet.id]: ARC_TESTNET_CONTRACT_ADDRESS,
  [arcMainnet.id]: ARC_MAINNET_CONTRACT_ADDRESS,
};

/**
 * Siec, o ktora basechat prosi uzytkownika. Mainnet wygrywa, GDY MA KONTRAKT -
 * inaczej prosilibysmy o przelaczenie na siec, na ktorej i tak nie da sie nic
 * wyslac, a to gorsze niz testnet.
 */
export const ARC_CHAIN_ID = ARC_MAINNET_CONTRACT_ADDRESS ? arcMainnet.id : arcTestnet.id;

export const ARC_CHAIN = ARC_CHAIN_ID === arcMainnet.id ? arcMainnet : arcTestnet;

/** Etykieta w interfejsie - ma mowic prawde o tym, gdzie leci transakcja. */
export const ARC_NETWORK_LABEL = ARC_CHAIN_ID === arcMainnet.id ? 'Arc' : 'Arc Testnet';

export const ARC_POST_CONTRACT_ABI = ROBINHOOD_POST_CONTRACT_ABI;

/** Zostaje dla zgodnosci ze starymi importami - adres AKTYWNEJ sieci. */
export const ARC_CONTRACT_ADDRESS = BY_CHAIN[ARC_CHAIN_ID] ?? '';

export const ARC_DEPLOYED_CONTRACT_ADDRESS = ARC_TESTNET_CONTRACT_ADDRESS;

/** Adres kontraktu dla sieci, na ktorej STOI portfel - nie dla domyslnej. */
export const getArcContractAddress = (chainId: number): string | undefined => BY_CHAIN[chainId] || undefined;

export const isArcPostContractDeployed = (): boolean => Boolean(ARC_CONTRACT_ADDRESS);
