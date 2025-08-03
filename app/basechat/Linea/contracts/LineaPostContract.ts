import { ethers } from 'ethers';
import { LINEA_CHAIN_ID } from '../config/LineaNetworkConfig';

// ABI dla kontraktu LineaPostContract
export const LINEA_POST_CONTRACT_ABI = [
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

// Adres kontraktu - zaktualizowany po wdrożeniu
export let LINEA_CONTRACT_ADDRESS = '0x9fB36660849D85CEe6609f6020af3336aB7541f5';

// Funkcja do ustawiania adresu kontraktu po deployu
export const setLineaContractAddress = (address: string) => {
  LINEA_CONTRACT_ADDRESS = address;
};

// Funkcja do pobierania adresu kontraktu w zależności od sieci
export const getLineaContractAddress = (chainId: number) => {
  if (chainId === LINEA_CHAIN_ID) {
    return LINEA_CONTRACT_ADDRESS;
  }
  return undefined;
};

// Funkcja do tworzenia instancji kontraktu
export const getLineaPostContract = (signer: ethers.Signer, contractAddress: string) => {
  return new ethers.Contract(
    contractAddress,
    LINEA_POST_CONTRACT_ABI,
    signer
  );
};

// Funkcja do kodowania danych dla wywołania kontraktu
export const encodeCreatePostDataLinea = (contentHash: string) => {
  const iface = new ethers.Interface(LINEA_POST_CONTRACT_ABI);
  return iface.encodeFunctionData('createPost', [contentHash]);
};

// Funkcja do przygotowania danych dla wywołania kontraktu w formacie Call
export const prepareCreatePostCallLinea = (contractAddress: string, contentHash: string) => {
  if (!contractAddress) {
    return undefined;
  }
  
  return [{
    to: contractAddress as `0x${string}`,
    data: encodeCreatePostDataLinea(contentHash) as `0x${string}`,
    value: BigInt(0)
  }];
};

// Funkcje pomocnicze dla interakcji z kontraktem
export const createPostLinea = async (
  signer: ethers.Signer,
  contractAddress: string,
  contentHash: string
) => {
  const contract = getLineaPostContract(signer, contractAddress);
  const tx = await contract.createPost(contentHash);
  await tx.wait();
  return tx;
};

export const getPostCountLinea = async (
  signer: ethers.Signer,
  contractAddress: string,
  userAddress: string
) => {
  const contract = getLineaPostContract(signer, contractAddress);
  return await contract.getPostCount(userAddress);
};

export const getTotalPostsLinea = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getLineaPostContract(signer, contractAddress);
  return await contract.getTotalPosts();
};

export const isPausedLinea = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getLineaPostContract(signer, contractAddress);
  return await contract.isPaused();
};