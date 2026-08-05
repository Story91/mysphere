'use client';

import ChainCommentButton from '../../chainPosting/ChainCommentButton';
import type { ChainCommentButtonProps } from '../../chainPosting/types';
import { LINEA_POSTING } from '../config/LineaPostingConfig';

/** Cala logika siedzi w `ChainCommentButton`; tu zostaje tylko wybor lancucha. */
export default function CommentTransactionButtonLinea(props: ChainCommentButtonProps) {
  return <ChainCommentButton {...props} config={LINEA_POSTING} />;
}
