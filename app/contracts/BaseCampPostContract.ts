import { defineChain } from 'viem';

// Define BaseCamp chain
export const BASECAMP_CHAIN_ID = 123420001114;

// Define full chain object for easier use with wagmi functions
export const baseCampChain = defineChain({
  id: BASECAMP_CHAIN_ID,
  name: 'BaseCamp',
  nativeCurrency: {
    decimals: 18,
    name: 'Camp Token',
    symbol: 'CAMP',
  },
  rpcUrls: {
    default: { http: ['https://rpc.basecamp.t.raas.gelato.cloud'] },
    public: { http: ['https://rpc.basecamp.t.raas.gelato.cloud'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://basecamp.cloud.blockscout.com/' },
  },
  // Add BaseCamp logo SVG for wallet confirmation UI
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjYwMCIgdmlld0JveD0iMCAwIDYwMCA2MDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPHBhdGggZD0iTTMwMCAwQzEzNC4zIDAgMCAxMzQuMyAwIDMwMHMxMzQuMyAzMDAgMzAwIDMwMCAzMDAtMTM0LjMgMzAwLTMwMFM0NjUuNyAwIDMwMCAweiIgZmlsbD0iIzAwMCIvPgogIDxwYXRoIGQ9Ik0zMDAgMTAwYy0xMTAuNSAwLTIwMCA4OS41LTIwMCAyMDBzODkuNSAyMDAgMjAwIDIwMCAyMDAtODkuNSAyMDAtMjAwLTg5LjUtMjAwLTIwMC0yMDB6IiBmaWxsPSIjZmZmIi8+CiAgPHBhdGggZD0iTTMzMCAxOTBjMCAwLTMwIDQwLTEwIDgwIDIwIDQwIDIwIDkwLTIwIDEyMCAwIDAgNzAtMzAgNzAtMTAwIDAtNzAtNDAtMTAwLTQwLTEwMHoiIGZpbGw9IiNGRjZCMDAiLz4KICA8cGF0aCBkPSJNMjcwIDIzMGMwIDAtMjAgMzAtMTAgNjAgMTAgMzAgMTAgNjAtMzAgODAgMCAwIDYwLTEwIDYwLTYwIDAtNTAtMjAtODAtMjAtODB6IiBmaWxsPSIjRkY2QjAwIi8+Cjwvc3ZnPg==',
  testnet: false,
});

export const BASECAMP_CONTRACT_ADDRESS = '0x177Af844a3c7A1749dE97656a5d84b6373Fc350E';

// ABI for the BaseCamp contract's createPost function
export const BASECAMP_POST_CONTRACT_ABI = [
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
  }
];

export function getBaseCampContractAddress() {
  return BASECAMP_CONTRACT_ADDRESS;
} 