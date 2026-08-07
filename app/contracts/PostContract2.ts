import { encodeFunctionData } from 'viem';

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

/**
 * Base Mainnet (8453). POTWIERDZONE lancuchowo: eth_getCode zwraca 1597 bajtow,
 * `totalPosts()` oddaje 15827, wlasciciel ustawiony. To wdrozenie istnieje.
 */
export const MAINNET_CONTRACT_ADDRESS2 = '0x6e1811A5401dfC30E8F3E2DD9dE0Bbe156F97aC7';

/**
 * Base Sepolia (84532). NIE MA TAM WDROZENIA.
 *
 * DLACZEGO `undefined`, a nie adres: stala trzymala DOKLADNIE ten sam ciag co
 * linia wyzej, z komentarzem "Zaktualizowano na Base Sepolia". Sprawdzenie
 * lancucha (scripts/verifyOnchainInventory.js) daje na 84532 eth_getCode = 0x.
 * Bledem byla wiec STALA, nie komentarz: gdyby zawiodl komentarz, pod adresem
 * stalby jakis kontrakt na Sepolii - nie stoi zaden. Zostala przeklejona linia
 * mainnetu i podmieniono w niej tylko nazwe sieci.
 *
 * Nie da sie tu wpisac adresu prawdziwego, bo taki nie istnieje - dlatego
 * zamiast wskazywac mainnet z testnetu, ktory konczylby sie rewertem w
 * `simulateContract` i komunikatem nie mowiacym o co chodzi, oddajemy brak.
 * `undefined` wpada w gotowa sciezke `if (!contractAddress)` w
 * TransactionButton i CommentTransactionButton, ktora odmawia od razu i glosno.
 *
 * PO WDROZENIU NA SEPOLIE: wpisz tu adres i nic wiecej nie trzeba zmieniac.
 */
export const TESTNET_CONTRACT_ADDRESS2: string | undefined = undefined;

// Funkcja do pobierania odpowiedniego adresu kontraktu w zależności od sieci.
// `undefined` znaczy "nie ma na tej sieci wdrozenia" - i tak ma byc czytane.
// Wolajacy MUSI to sprawdzic przed uzyciem; nie ma tu adresu zastepczego.
export const getContractAddress2 = (chainId: number): string | undefined => {
  // Base Sepolia testnet - dzis zawsze undefined, patrz TESTNET_CONTRACT_ADDRESS2
  if (chainId === 84532) {
    return TESTNET_CONTRACT_ADDRESS2;
  }
  // Base mainnet
  else if (chainId === 8453) {
    return MAINNET_CONTRACT_ADDRESS2;
  }
  return undefined;
};

// Funkcja do kodowania danych dla wywołania kontraktu
// viem zamiast ethers.Interface - ethers v6 ciagnal ~100-130 KB do klienckiego
// bundle'a duplikujac to, co viem juz robi.
export const encodeCreatePostData2 = (contentHash: string) => {
  return encodeFunctionData({
    abi: PostABI2 as any,
    functionName: 'createPost',
    args: [contentHash],
  });
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
