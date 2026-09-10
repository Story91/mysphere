'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { ARC_POSTING } from '../config/ArcPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostArc(props: Props) {
  return <ChainCreatePost {...props} config={ARC_POSTING} />;
}
