# Staking Component

## Overview

The Staking Component is a React-based interface for interacting with the $AIS Token Staking System. It provides a user-friendly interface for staking, withdrawing, and claiming rewards in the yield farming program.

## Files

- `StakingComponent.tsx` - Main component implementation
- `README.md` - This documentation file

## Features

- Token staking and withdrawal
- Reward claiming
- Real-time balance updates
- Staking statistics display
- Error handling and validation
- Mobile-responsive design

## Usage

```typescript
import StakingComponent from '../components/Staking/StakingComponent';

// In your page component:
export default function Page() {
  return (
    <div>
      <StakingComponent />
    </div>
  );
}
```

## Component Structure

### State Variables

```typescript
const [stakedAmount, setStakedAmount] = useState('0');
const [earnedRewards, setEarnedRewards] = useState('0');
const [walletBalance, setWalletBalance] = useState('0');
const [stakeAmount, setStakeAmount] = useState('');
const [withdrawAmount, setWithdrawAmount] = useState('');
const [isApproved, setIsApproved] = useState(false);
const [totalStakers, setTotalStakers] = useState(0);
```

### Key Functions

1. **Contract Interaction**
   - `getContracts()` - Initialize contract instances
   - `fetchData()` - Fetch user and contract data
   - `handleApprove()` - Approve token spending
   - `handleStake()` - Stake tokens
   - `handleWithdraw()` - Withdraw tokens
   - `handleClaim()` - Claim rewards

2. **Validation**
   - `validateStakeAmount()` - Validate stake amount against minimum

### Constants

```typescript
const STAKING_CONTRACT_ADDRESS = "0x..."; // TODO: Add deployed contract address
const TOKEN_CONTRACT_ADDRESS = "0x26F732eD652A63aE66F365936fdDD2389c051B31";
const MINIMUM_STAKE = parseUnits('10000000', 18);
const MINIMUM_STAKING_PERIOD = 7 * 24 * 60 * 60;
const REWARD_RATE = parseUnits('38.58', 18);
```

## Dependencies

- ethers.js - Ethereum library
- wagmi - React Hooks for Ethereum
- framer-motion - Animation library

## Requirements

- Web3-enabled browser
- Connected wallet
- Sufficient $AIS tokens
- ETH for gas fees

## Error Handling

The component handles various error scenarios:

```typescript
try {
  // Contract interaction
} catch (err: any) {
  console.error('Error:', err);
  setError(err.message || 'Error occurred');
} finally {
  setIsLoading(false);
}
```

## Styling

The component uses Tailwind CSS for styling:

- Dark theme with blue accents
- Responsive grid layout
- Animated buttons and transitions
- Loading states and error displays

## Auto-Updates

Data is automatically refreshed:

```typescript
useEffect(() => {
  if (isConnected && address) {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }
}, [isConnected, address]);
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License 