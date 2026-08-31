// Publiczne wejscie warstwy tozsamosci (zamiennik @coinbase/onchainkit/identity).

export {
  L2ResolverAbi,
  RESOLVER_ADDRESSES_BY_CHAIN_ID,
  convertChainIdToCoinType,
  convertReverseNodeToBytes,
  getChainPublicClient,
  getSlicedAddress,
  isBaseChain,
  isBasename,
  isEthereumChain,
} from './resolver';

export { getName, getAddressForName } from './getName';
export type { GetNameParams, GetNameReturnType } from './getName';

export { getAvatar } from './getAvatar';
export type { GetAvatarParams, GetAvatarReturnType } from './getAvatar';

export { useName } from './useName';
export type { UseNameParams, IdentityQueryOptions } from './useName';

export { useAvatar } from './useAvatar';
export type { UseAvatarParams } from './useAvatar';
