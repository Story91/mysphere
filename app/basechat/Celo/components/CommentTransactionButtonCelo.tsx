'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { CELO_POSTING } from '../config/CeloPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonCelo(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={CELO_POSTING} />;
}
