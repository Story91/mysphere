'use client';

import { FundButton } from '@coinbase/onchainkit/fund';

export default function FundComponent() {
  return (
    <FundButton 
      className="nav-link flex items-center"
      text="Coinbase On-Ramp"
      openIn="popup"
    />
  );
} 