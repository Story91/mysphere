'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { BASECAMP_POSTING } from './BaseCampPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonBaseCamp(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={BASECAMP_POSTING} />;
}
