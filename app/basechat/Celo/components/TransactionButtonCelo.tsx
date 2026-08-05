'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { CELO_POSTING } from '../config/CeloPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonCelo(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={CELO_POSTING} />;
}
