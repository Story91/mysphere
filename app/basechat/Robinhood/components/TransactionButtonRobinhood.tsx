'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { ROBINHOOD_POSTING } from '../config/RobinhoodPostingConfig';

// Komunikat "Coming soon" mieszka teraz w RobinhoodPostingConfig - tam, gdzie
// reszta wiedzy o tej sieci. Nikt nie importuje go juz stad.

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonRobinhood(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={ROBINHOOD_POSTING} />;
}
