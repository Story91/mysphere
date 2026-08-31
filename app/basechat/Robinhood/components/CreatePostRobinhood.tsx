'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { ROBINHOOD_POSTING } from '../config/RobinhoodPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostRobinhood(props: Props) {
  return <ChainCreatePost {...props} config={ROBINHOOD_POSTING} />;
}
