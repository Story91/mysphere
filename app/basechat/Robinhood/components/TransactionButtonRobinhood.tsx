'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { ROBINHOOD_POSTING } from '../config/RobinhoodPostingConfig';

// Komunikat mieszka teraz w konfiguracji lancucha. Re-eksport zostaje, bo
// CreatePostRobinhood.tsx importuje go stad od czasu wdrozenia bramki "Coming soon".
export { ROBINHOOD_POSTING_DISABLED_MESSAGE } from '../config/RobinhoodPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonRobinhood(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={ROBINHOOD_POSTING} />;
}
