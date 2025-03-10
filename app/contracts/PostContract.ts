import { ethers } from 'ethers';

export const PostABI = [
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

// Adresy kontraktów
export const MAINNET_CONTRACT_ADDRESS = '0x77B59bc66b71130f88E0Ee31A3209d2D1ED11148';
export const TESTNET_CONTRACT_ADDRESS = '0x92E6Ef6C0Eb25a9C4c9d768427Cc7133345Ecf75';

// Funkcja do pobierania odpowiedniego adresu kontraktu w zależności od sieci
export const getContractAddress = (chainId: number) => {
  // Base Sepolia testnet
  if (chainId === 84532) {
    return TESTNET_CONTRACT_ADDRESS;
  }
  // Base mainnet
  else if (chainId === 8453) {
    return MAINNET_CONTRACT_ADDRESS;
  }
  return undefined;
};

// Funkcja do tworzenia instancji kontraktu
export const getPostContract = (signer: ethers.Signer, contractAddress: string) => {
  return new ethers.Contract(
    contractAddress,
    PostABI,
    signer
  );
};

// Funkcja do tworzenia posta
export const createPost = async (
  signer: ethers.Signer,
  contractAddress: string,
  contentHash: string
) => {
  const contract = getPostContract(signer, contractAddress);
  const tx = await contract.createPost(contentHash);
  await tx.wait();
  return tx;
};

// Funkcja do kodowania danych dla wywołania kontraktu
export const encodeCreatePostData = (contentHash: string) => {
  // Użyj interfejsu ABI do zakodowania danych
  const iface = new ethers.Interface(PostABI);
  return iface.encodeFunctionData('createPost', [contentHash]);
};

// Funkcja do przygotowania danych dla wywołania kontraktu w formacie Call
export const prepareCreatePostCall = (contractAddress: string, contentHash: string) => {
  if (!contractAddress) {
    return undefined;
  }
  
  return [{
    to: contractAddress as `0x${string}`,
    data: encodeCreatePostData(contentHash) as `0x${string}`,
    value: BigInt(0)
  }];
};

// Funkcja do pobierania liczby postów użytkownika
export const getPostCount = async (
  signer: ethers.Signer,
  contractAddress: string,
  userAddress: string
) => {
  const contract = getPostContract(signer, contractAddress);
  return await contract.getPostCount(userAddress);
};

// Funkcja do pobierania całkowitej liczby postów
export const getTotalPosts = async (
  signer: ethers.Signer,
  contractAddress: string
) => {
  const contract = getPostContract(signer, contractAddress);
  return await contract.totalPosts();
}; 