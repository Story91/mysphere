'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { WORLD_CHAIN_POSTING } from '../config/WorldChainPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostWorldChain(props: Props) {
  return <ChainCreatePost {...props} config={WORLD_CHAIN_POSTING} />;
}
