'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { WORLD_CHAIN_POSTING } from '../config/WorldChainPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonWorldChain(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={WORLD_CHAIN_POSTING} />;
}
