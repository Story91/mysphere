'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { CELO_POSTING } from '../config/CeloPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostCelo(props: Props) {
  return <ChainCreatePost {...props} config={CELO_POSTING} />;
}
