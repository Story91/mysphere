'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { BASECAMP_POSTING } from './BaseCampPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonBaseCamp(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={BASECAMP_POSTING} />;
}
