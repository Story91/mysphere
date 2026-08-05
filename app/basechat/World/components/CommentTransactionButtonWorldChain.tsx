'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { WORLD_CHAIN_POSTING } from '../config/WorldChainPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonWorldChain(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={WORLD_CHAIN_POSTING} />;
}
