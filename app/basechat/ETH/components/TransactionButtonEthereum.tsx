'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { ETHEREUM_POSTING } from '../config/EthereumPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonEthereum(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={ETHEREUM_POSTING} />;
}
