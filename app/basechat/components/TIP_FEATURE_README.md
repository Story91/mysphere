# 💰 Tipping Feature Documentation

## Overview
The tipping feature allows users to send Base ETH or USDC directly to creators of pinned posts as a way to show appreciation and support.

## Features

### 🎯 **Selective Display**
- Tip buttons only appear on **pinned posts** (posts with the star icon)
- Users cannot tip themselves (tip button is hidden for own posts)
- Only visible when wallet is connected

### 💱 **Supported Tokens**
- **Base ETH** - Native currency on Base network
- **USDC** - USD Coin (0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA)

### 🔧 **User Interface**
- **Tip Button**: Dollar sign icon with "Tip" label
- **Popup Modal**: Opens when clicking the tip button
- **Token Selection**: Toggle between ETH and USDC
- **Amount Input**: Custom amount with quick-select buttons
- **Balance Display**: Shows current balance for selected token

### 💸 **Quick Amount Options**

#### For ETH:
- 0.001 ETH (~$2.50)
- 0.01 ETH (~$25)
- 0.1 ETH (~$250)

#### For USDC:
- $1 USDC
- $5 USDC
- $10 USDC

### 🛡️ **Safety Features**
- **Network Validation**: Ensures user is on Base Mainnet
- **Balance Checks**: Prevents transactions exceeding available balance
- **Self-Tip Prevention**: Users cannot tip their own posts
- **Transaction Confirmation**: Uses OnchainKit for secure transactions

### 🎨 **Visual Design**
- Clean, modern popup interface
- Dark/light theme support
- Responsive design for mobile and desktop
- Color-coded feedback (green for success, red for errors)

## How to Use

### 1. **Find a Pinned Post**
Look for posts with the yellow star icon and "Pinned" badge.

### 2. **Click the Tip Button**
Click the dollar sign icon with "Tip" label in the action buttons row.

### 3. **Select Token**
Choose between ETH or USDC by clicking the respective button.

### 4. **Enter Amount**
- Type a custom amount in the input field
- Or click one of the quick-select buttons
- Check your balance is sufficient

### 5. **Send Tip**
Click "Tip [amount] [token]" button to initiate the transaction.

### 6. **Confirm Transaction**
Your wallet will open for transaction confirmation.

## Technical Implementation

### **Component Structure**
```
TipButton.tsx - Main tipping component
├── Token selection (ETH/USDC)
├── Amount input with validation
├── Balance checking
├── Transaction execution via OnchainKit
└── Success/error handling
```

### **Integration Points**
- **PostList.tsx**: Conditionally renders TipButton for pinned posts
- **OnchainKit**: Handles transaction creation and execution
- **Wagmi**: Manages wallet connection and balance queries
- **Viem**: Encodes ERC20 transaction data

### **Smart Contract Interactions**
- **ETH Transfer**: Direct value transfer to recipient address
- **USDC Transfer**: ERC20 transfer function call with proper ABI encoding

## Error Handling

### **Common Issues**
1. **"Please switch to Base Mainnet"**: User is on wrong network
2. **"Insufficient [TOKEN]"**: User doesn't have enough balance
3. **"Transaction failed"**: Network error or user rejected transaction

### **Success Indicators**
- **Green toast**: "Tip sent successfully! 🎉"
- **Modal closes**: Automatic cleanup after successful transaction
- **Reset state**: Amount resets to default value

## Future Enhancements

### **Potential Features**
- [ ] Custom token support
- [ ] Tip history tracking
- [ ] Tip leaderboards
- [ ] Multi-recipient splits
- [ ] Scheduled tips
- [ ] Tip notifications
- [ ] Integration with other social features

### **Performance Optimizations**
- [ ] Balance caching
- [ ] Transaction batching
- [ ] Gas optimization
- [ ] Loading states improvements

## Support

For issues or questions about the tipping feature:
1. Check network connection (Base Mainnet required)
2. Verify sufficient token balance
3. Ensure wallet is properly connected
4. Check browser console for detailed error messages

---

*This feature enhances creator monetization on the Base network by enabling direct, crypto-native tipping for quality content.* 