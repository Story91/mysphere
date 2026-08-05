/**
 * getName - odwrotne rozwiazywanie adresu na Basename/ENS.
 *
 * Algorytm (1:1 z OnchainKit):
 *  1. Na Base: odczyt `name(reverseNode)` z L2Resolvera.
 *  2. WERYFIKACJA W PRZOD: otrzymana nazwa jest rozwiazywana z powrotem na
 *     adres; jesli nie zgadza sie z wejsciowym - wynik jest odrzucany.
 *     To zabezpieczenie przed podszywaniem sie (kazdy moze ustawic sobie
 *     dowolny rekord reverse).
 *  3. Fallback: getEnsName na mainnecie + ta sama weryfikacja w przod.
 *  4. Brak wyniku -> null.
 */

import type { Address, Chain } from 'viem';
import { base, mainnet } from 'viem/chains';
import {
  L2ResolverAbi,
  RESOLVER_ADDRESSES_BY_CHAIN_ID,
  convertReverseNodeToBytes,
  getChainPublicClient,
  isBaseChain,
  isEthereumChain,
} from './resolver';

export type GetNameParams = {
  address: Address;
  chain?: Chain;
};

export type GetNameReturnType = string | null;

/** Rozwiazanie nazwy na adres - zawsze przez mainnet (basenames maja tam resolver CCIP). */
export async function getAddressForName(name: string): Promise<Address | null> {
  const mainnetClient = getChainPublicClient(mainnet);
  const address = await mainnetClient.getEnsAddress({ name });
  return address ?? null;
}

export async function getName({
  address,
  chain = mainnet,
}: GetNameParams): Promise<GetNameReturnType> {
  const chainIsBase = isBaseChain(chain.id);
  const chainIsEthereum = isEthereumChain(chain.id);

  if (!chainIsEthereum && !chainIsBase) {
    return Promise.reject(
      'ChainId not supported, name resolution is only supported on Ethereum and Base.',
    );
  }

  if (!address) {
    return null;
  }

  if (chainIsBase) {
    const client = getChainPublicClient(chain);
    // Wezel reverse liczony zawsze wzgledem base.id - tak samo jak w OnchainKit.
    const addressReverseNode = convertReverseNodeToBytes(address, base.id);

    try {
      const basename = (await client.readContract({
        abi: L2ResolverAbi,
        address: RESOLVER_ADDRESSES_BY_CHAIN_ID[chain.id],
        functionName: 'name',
        args: [addressReverseNode],
      })) as string;

      if (basename) {
        try {
          const resolvedAddress = await getAddressForName(basename);
          if (resolvedAddress && resolvedAddress.toLowerCase() === address.toLowerCase()) {
            return basename;
          }
        } catch (error) {
          console.error('Error during basename forward resolution verification:', error);
        }
      }
    } catch {
      // Brak rekordu / blad RPC - lecimy do fallbacku ENS.
    }
  }

  const fallbackClient = getChainPublicClient(mainnet);
  try {
    const ensName = await fallbackClient.getEnsName({ address });
    if (ensName) {
      try {
        const resolvedAddress = await getAddressForName(ensName);
        if (resolvedAddress && resolvedAddress.toLowerCase() === address.toLowerCase()) {
          return ensName;
        }
      } catch (error) {
        console.error('Error during ENS forward resolution verification:', error);
      }
    }
  } catch {
    // Brak ENS albo blad RPC - zwracamy null.
  }

  return null;
}
