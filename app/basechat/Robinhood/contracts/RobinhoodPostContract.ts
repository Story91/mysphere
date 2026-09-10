import { ROBINHOOD_CHAIN_ID } from '../config/RobinhoodNetworkConfig';

// ABI dla kontraktu RobinhoodPostContract - identyczne z kontraktem postow
// uzywanym na Linei (zrodlo .sol: app/basechat/Linea/contracts/LineaPostContract.sol)
export const ROBINHOOD_POST_CONTRACT_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "string",
        "name": "contentHash",
        "type": "string"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
      }
    ],
    "name": "PostCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Paused",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "Unpaused",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "contentHash",
        "type": "string"
      }
    ],
    "name": "createPost",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "user",
        "type": "address"
      }
    ],
    "name": "getPostCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotalPosts",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "isPaused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalPosts",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "unpause",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "userPostCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// Adres kontraktu postow na Robinhood Chain.
//
// KONTRAKT NIE JEST JESZCZE WDROZONY NA TEJ SIECI. Dopoki nie ustawimy
// NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT, adres jest pusty, getRobinhoodContractAddress
// zwraca undefined, a komponenty postowania wylaczaja przycisk zamiast wysylac
// transakcje na pusty/nieprawidlowy adres.
/**
 * Kontrakt wdrozony 2026-08-05 (deployment-info.json obok), ZMIERZONE
 * 2026-09-11: eth_getCode pod tym adresem oddaje 1458 bajtow. Wczesniej adres
 * szedl WYLACZNIE z env i gdy zmiennej brakowalo (lokalnie jej nie ma),
 * caly kompozytor Robinhooda pokazywal "not live yet" - miesiac po deployu.
 * Env zostaje jako nadpisanie na wypadek redeployu.
 */
export const ROBINHOOD_DEPLOYED_CONTRACT_ADDRESS = '0xd02A166A186bcc5C537FeCD5103E9c1A94Bb49D6';

export const ROBINHOOD_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_ROBINHOOD_POST_CONTRACT || ROBINHOOD_DEPLOYED_CONTRACT_ADDRESS;

// Funkcja do pobierania adresu kontraktu w zaleznosci od sieci.
// Zwraca undefined gdy adres nie jest skonfigurowany (kontrakt niewdrozony).
export const getRobinhoodContractAddress = (chainId: number): string | undefined => {
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    return undefined;
  }
  if (!ROBINHOOD_CONTRACT_ADDRESS) {
    return undefined;
  }
  return ROBINHOOD_CONTRACT_ADDRESS;
};

// Czy kontrakt postow jest juz dostepny (uzywane przez UI do wylaczenia przycisku).
export const isRobinhoodPostContractDeployed = (): boolean =>
  Boolean(ROBINHOOD_CONTRACT_ADDRESS);

// Analogicznie do LineaPostContract.ts: NIE dodajemy tu zadnych funkcji opartych
// na ethers. Zywe eksporty to ROBINHOOD_POST_CONTRACT_ABI i
// getRobinhoodContractAddress, uzywane przez TransactionButtony na wagmi.
