import { PinDuration } from '../../../utils/firebase';

// Re-export PinDuration for convenience
export type { PinDuration } from '../../../utils/firebase';

export interface PinPrice {
  duration: PinDuration;
  priceETH: string;
  priceUSD: number;
  label: string;
  description: string;
}

export interface PaidPin {
  postId: string;
  owner: string;
  duration: PinDuration;
  expiresAt: number;
  paidAmount: string;
  txHash: string;
  isActive: boolean;
  createdAt: number;
}

export interface PinContractEvent {
  postId: string;
  owner: string;
  duration: PinDuration;
  amount: bigint;
  expiresAt: number;
  txHash: string;
  blockNumber: number;
}

export interface PinStats {
  totalRevenue: string;
  activePins: number;
  totalPins: number;
  popularDuration: PinDuration;
  avgDuration: number;
  dailyRevenue: string;
}

export interface ExtendPinRequest {
  postId: string;
  currentExpiresAt: number;
  additionalDuration: PinDuration;
  totalCost: string;
} 