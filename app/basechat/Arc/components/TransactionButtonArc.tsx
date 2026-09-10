'use client';

import ChainPostButton from '../../chainPosting/ChainPostButton';
import type { ChainPostButtonProps } from '../../chainPosting/types';
import { ARC_POSTING } from '../config/ArcPostingConfig';


/** Cala logika siedzi w `ChainPostButton`; tu zostaje tylko wybor lancucha. */
export default function TransactionButtonArc(props: ChainPostButtonProps) {
  return <ChainPostButton {...props} config={ARC_POSTING} />;
}
