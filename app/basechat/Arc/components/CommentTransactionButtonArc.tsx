'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { ARC_POSTING } from '../config/ArcPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonArc(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={ARC_POSTING} />;
}
