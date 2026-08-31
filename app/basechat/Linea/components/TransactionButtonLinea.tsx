'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { LINEA_POSTING } from '../config/LineaPostingConfig';

/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonLinea(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={LINEA_POSTING} />;
}
