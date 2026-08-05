'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { ETHEREUM_POSTING } from '../config/EthereumPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostEthereum(props: Props) {
  return <ChainCreatePost {...props} config={ETHEREUM_POSTING} />;
}
