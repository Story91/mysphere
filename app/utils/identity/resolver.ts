/**
 * Warstwa rozwiazywania nazw Basename / ENS - odtworzenie logiki OnchainKit
 * na czystym viem. OnchainKit zostal wygaszony (npm zamrozony na 1.1.2),
 * wiec identyczna logika zyje teraz tutaj.
 *
 * Tu mieszkaja tylko stale i czyste helpery - bez Reacta.
 */

import {
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  stringToBytes,
  type Chain,
  type PublicClient,
} from 'viem';
import { namehash } from 'viem/ens';
import { base, baseSepolia, mainnet, sepolia } from 'viem/chains';

/** Adresy L2Resolvera Basenames (te same, ktorych uzywal OnchainKit). */
export const RESOLVER_ADDRESSES_BY_CHAIN_ID: Record<number, `0x${string}`> = {
  [base.id]: '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD',
  [baseSepolia.id]: '0x6533C94869D28fAA8dF77cc63f9e2b2D6Cf77eBA',
};

/**
 * Wycinek ABI L2Resolvera - tylko funkcje, ktorych faktycznie uzywamy.
 * Pelne ABI z OnchainKit ma ~1000 linii i nie jest do niczego potrzebne.
 */
export const L2ResolverAbi = [
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'node', type: 'bytes32' }],
    name: 'addr',
    outputs: [{ internalType: 'address payable', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'node', type: 'bytes32' },
      { internalType: 'string', name: 'key', type: 'string' },
    ],
    name: 'text',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const isBaseChain = (chainId: number): boolean =>
  chainId === base.id || chainId === baseSepolia.id;

export const isEthereumChain = (chainId: number): boolean =>
  chainId === mainnet.id || chainId === sepolia.id;

/**
 * chainId -> coinType wg ENSIP-11 (0x80000000 | chainId, hex, wielkimi literami).
 * Mainnet ma specjalny przypadek "addr".
 */
export const convertChainIdToCoinType = (chainId: number): string => {
  if (chainId === mainnet.id) {
    return 'addr';
  }
  const cointype = (0x80000000 | chainId) >>> 0;
  return cointype.toString(16).toLocaleUpperCase();
};

/**
 * Wezel reverse dla adresu na danym lancuchu, np. dla Base:
 * keccak256(baseReverseNode ++ keccak256(utf8(adres bez 0x)))
 *
 * Uwaga: hashowany jest TEKST adresu (bajty utf-8), a nie jego wartosc hex -
 * tak jak w oryginale OnchainKit i w konwencji labelhash z ENS.
 */
export const convertReverseNodeToBytes = (
  address: `0x${string}`,
  chainId: number,
): `0x${string}` => {
  const addressFormatted = address.toLocaleLowerCase();
  const addressNode = keccak256(stringToBytes(addressFormatted.substring(2)));
  const chainCoinType = convertChainIdToCoinType(chainId);
  const baseReverseNode = namehash(`${chainCoinType.toLocaleUpperCase()}.reverse`);
  return keccak256(encodePacked(['bytes32', 'bytes32'], [baseReverseNode, addressNode]));
};

export const isBasename = (username: string): boolean =>
  username.endsWith('.base.eth') || username.endsWith('.basetest.eth');

export const getSlicedAddress = (address: string): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

/**
 * Jawne RPC zamiast domyslek viem. Domyslny transport dla mainnetu celuje w
 * eth.merkle.io, ktore w przegladarce potrafi zwracac bledy w petli (dlatego
 * powstal app/utils/merkleProxy.ts). Tutaj po prostu nie strzelamy tam wcale.
 */
const RPC_URL_BY_CHAIN_ID: Record<number, string> = {
  [base.id]: 'https://mainnet.base.org',
  [baseSepolia.id]: 'https://sepolia.base.org',
  [mainnet.id]: 'https://ethereum-rpc.publicnode.com',
};

/** Klienci sa cache'owani per chain - jeden na lancuch, nie jeden na wywolanie. */
const publicClientCache = new Map<number, PublicClient>();

export function getChainPublicClient(chain: Chain): PublicClient {
  const cached = publicClientCache.get(chain.id);
  if (cached) {
    return cached;
  }

  const client = createPublicClient({
    chain,
    transport: http(RPC_URL_BY_CHAIN_ID[chain.id]),
  }) as PublicClient;

  publicClientCache.set(chain.id, client);
  return client;
}
