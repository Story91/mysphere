/**
 * getAvatar - awatar dla juz rozwiazanej nazwy (Basename lub ENS).
 *
 * Roznica wzgledem OnchainKit: zamiast wolac getEnsAvatar z podmienionym
 * `universalResolverAddress` (L2Resolver Basenames nie jest universal
 * resolverem i takie wywolanie jest kruche), czytamy rekord tekstowy
 * `avatar` bezposrednio z L2Resolvera i przepuszczamy go przez viemowy
 * parseAvatarRecord (obsluguje ipfs://, ar://, eip155 NFT itd.).
 *
 * Gdy nic nie znajdziemy, zwracamy null - komponent <Avatar> rysuje wtedy
 * wlasny, deterministyczny placeholder (bez gigantycznych SVG z OnchainKit).
 */

import type { Chain } from 'viem';
import { mainnet } from 'viem/chains';
import { namehash, normalize, parseAvatarRecord } from 'viem/ens';
import {
  L2ResolverAbi,
  RESOLVER_ADDRESSES_BY_CHAIN_ID,
  getChainPublicClient,
  isBaseChain,
  isEthereumChain,
} from './resolver';

export type GetAvatarParams = {
  ensName: string;
  chain?: Chain;
};

export type GetAvatarReturnType = string | null;

export async function getAvatar({
  ensName,
  chain = mainnet,
}: GetAvatarParams): Promise<GetAvatarReturnType> {
  const chainIsBase = isBaseChain(chain.id);
  const chainIsEthereum = isEthereumChain(chain.id);

  if (!chainIsEthereum && !chainIsBase) {
    return Promise.reject(
      'ChainId not supported, avatar resolution is only supported on Ethereum and Base.',
    );
  }

  if (!ensName) {
    return null;
  }

  const normalizedName = normalize(ensName);

  if (chainIsBase) {
    try {
      const client = getChainPublicClient(chain);
      const record = (await client.readContract({
        abi: L2ResolverAbi,
        address: RESOLVER_ADDRESSES_BY_CHAIN_ID[chain.id],
        functionName: 'text',
        args: [namehash(normalizedName), 'avatar'],
      })) as string;

      if (record) {
        const parsed = await parseAvatarRecord(client, { record });
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // Brak rekordu na Base - probujemy mainnetu.
    }
  }

  try {
    const mainnetClient = getChainPublicClient(mainnet);
    const mainnetEnsAvatar = await mainnetClient.getEnsAvatar({ name: normalizedName });
    if (mainnetEnsAvatar) {
      return mainnetEnsAvatar;
    }
  } catch {
    // Brak awatara / blad RPC.
  }

  return null;
}
