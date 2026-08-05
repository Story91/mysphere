'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { ETHEREUM_POSTING } from '../config/EthereumPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonEthereum(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={ETHEREUM_POSTING} />;
}
