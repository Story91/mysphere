import { PinDuration, PinPrice } from '../types/pinTypes';

// Tańsze ceny jak ustaliliśmy
export const PIN_PRICES: Record<PinDuration, PinPrice> = {
  HOUR_1: {
    duration: 'HOUR_1',
    priceETH: '0.0005',
    priceUSD: 1.25,
    label: '1 Hour',
    description: 'Quick visibility boost'
  },
  HOURS_6: {
    duration: 'HOURS_6', 
    priceETH: '0.002',
    priceUSD: 5.0,
    label: '6 Hours',
    description: 'Half-day promotion'
  },
  HOURS_24: {
    duration: 'HOURS_24',
    priceETH: '0.005', 
    priceUSD: 12.5,
    label: '24 Hours',
    description: 'Full day featured'
  },
  DAYS_7: {
    duration: 'DAYS_7',
    priceETH: '0.02',
    priceUSD: 50.0,
    label: '7 Days', 
    description: 'Week-long premium'
  }
};

export const getDurationInMilliseconds = (duration: PinDuration): number => {
  switch (duration) {
    case 'HOUR_1':
      return 60 * 60 * 1000; // 1 hour
    case 'HOURS_6':
      return 6 * 60 * 60 * 1000; // 6 hours  
    case 'HOURS_24':
      return 24 * 60 * 60 * 1000; // 24 hours
    case 'DAYS_7':
      return 7 * 24 * 60 * 60 * 1000; // 7 days
    default:
      return 60 * 60 * 1000; // default 1 hour
  }
};

export const calculateExpirationTime = (duration: PinDuration, startTime?: number): number => {
  const start = startTime || Date.now();
  return start + getDurationInMilliseconds(duration);
};

export const formatTimeLeft = (timeLeft: number): string => {
  if (timeLeft <= 0) return 'Expired';
  
  const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
  const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((timeLeft % (60 * 1000)) / 1000);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
};

export const getPriceForDuration = (duration: PinDuration): PinPrice => {
  return PIN_PRICES[duration];
};

export const calculateTotalCost = (duration: PinDuration, ethPrice?: number): {
  ethAmount: string;
  usdAmount: number;
} => {
  const price = getPriceForDuration(duration);
  const ethAmount = price.priceETH;
  const usdAmount = ethPrice ? parseFloat(ethAmount) * ethPrice : price.priceUSD;
  
  return {
    ethAmount,
    usdAmount
  };
};

export const isValidDuration = (duration: string): duration is PinDuration => {
  return Object.keys(PIN_PRICES).includes(duration as PinDuration);
};

export const getAllDurations = (): PinPrice[] => {
  return Object.values(PIN_PRICES);
}; 