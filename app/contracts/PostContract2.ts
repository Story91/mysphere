import { ethers } from 'ethers';

export const PostABI2 = [
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

// Adresy kontraktów - te będą musiały zostać zaktualizowane po wdrożeniu
export const MAINNET_CONTRACT_ADDRESS2 = '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7'; // Zaktualizowano na Base Mainnet
export const TESTNET_CONTRACT_ADDRESS2 = '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7'; // Zaktualizowano na Base Sepolia

// Funkcja do pobierania odpowiedniego adresu kontraktu w zależności od sieci
export const getContractAddress2 = (chainId: number) => {
  // Base Sepolia testnet
  if (chainId === 84532) {
    return TESTNET_CONTRACT_ADDRESS2;
  }
  // Base mainnet
  else if (chainId === 8453) {
    return MAINNET_CONTRACT_ADDRESS2;
  }
  return undefined;
};

// Funkcja do tworzenia instancji kontraktu
export const getPostContract2 = (signer: ethers.Signer, contractAddress: string) => {
  return new ethers.Contract(
    contractAddress,
    PostABI2,
    signer
  );
};

// Funkcja do tworzenia posta
export const createPost2 = async (
  signer: ethers.Signer,
  contractAddress: string,
  contentHash: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  const tx = await contract.createPost(contentHash);
  await tx.wait();
  return tx;
};

// Funkcja do kodowania danych dla wywołania kontraktu
export const encodeCreatePostData2 = (contentHash: string) => {
  // Użyj interfejsu ABI do zakodowania danych
  const iface = new ethers.Interface(PostABI2);
  return iface.encodeFunctionData('createPost', [contentHash]);
};

// Funkcja do przygotowania danych dla wywołania kontraktu w formacie Call
export const prepareCreatePostCall2 = (contractAddress: string, contentHash: string) => {
  if (!contractAddress) {
    return undefined;
  }
  
  return [{
    to: contractAddress as `0x${string}`,
    data: encodeCreatePostData2(contentHash) as `0x${string}`,
    value: BigInt(0)
  }];
};

// Funkcja do pobierania liczby postów użytkownika
export const getPostCount2 = async (
  signer: ethers.Signer,
  contractAddress: string,
  userAddress: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  return await contract.getPostCount(userAddress);
};

// Funkcja do pobierania całkowitej liczby postów
export const getTotalPosts2 = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  return await contract.totalPosts();
};

// Funkcja do wstrzymania kontraktu (tylko dla właściciela)
export const pauseContract2 = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  const tx = await contract.pause();
  await tx.wait();
  return tx;
};

// Funkcja do wznowienia kontraktu (tylko dla właściciela)
export const unpauseContract2 = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  const tx = await contract.unpause();
  await tx.wait();
  return tx;
};

// Funkcja do sprawdzenia, czy kontrakt jest wstrzymany
export const isPaused2 = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getPostContract2(signer, contractAddress);
  return await contract.paused();
}; 