'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { ROBINHOOD_POSTING } from '../config/RobinhoodPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonRobinhood(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={ROBINHOOD_POSTING} />;
}
