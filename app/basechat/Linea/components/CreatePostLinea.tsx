'use client';

import ChainCreatePost from '../../chainPosting/ChainCreatePost';
import type { ChainCreatePostProps } from '../../chainPosting/ChainCreatePost';
import { LINEA_POSTING } from '../config/LineaPostingConfig';

type Props = Omit<ChainCreatePostProps, 'config'>;

/** Cala logika siedzi w `ChainCreatePost`; tu zostaje tylko wybor lancucha. */
export default function CreatePostLinea(props: Props) {
  return <ChainCreatePost {...props} config={LINEA_POSTING} />;
}
