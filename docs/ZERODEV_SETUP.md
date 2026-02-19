# 🚀 ZeroDev Smart Wallet Setup Guide

## Overview
This guide explains how to set up ZeroDev Account Abstraction with Privy embedded wallets for gas-sponsored smart wallet transactions.

## 🎯 What You Get
- **Smart Wallets**: ERC-4337 compatible smart wallets for all users
- **Gas Sponsorship**: Users don't pay gas fees
- **Account Abstraction**: Advanced wallet features like batching
- **Privy Integration**: Seamless integration with existing Privy setup

## 📋 Prerequisites
1. **Privy App**: Already configured and working
2. **Base Network**: Your app deployed on Base mainnet
3. **ZeroDev Account**: Sign up at [dashboard.zerodev.app](https://dashboard.zerodev.app)

## 🔧 Step 1: Install Dependencies

```bash
cd BaseBook
npm i @zerodev/sdk @zerodev/ecdsa-validator permissionless viem
```

## 🔑 Step 2: Get ZeroDev Credentials

1. **Visit [ZeroDev Dashboard](https://dashboard.zerodev.app)**
2. **Create a new project** for Base mainnet
3. **Copy your Project ID**
4. **Note the Bundler and Paymaster URLs**

## ⚙️ Step 3: Configure Environment Variables

Create `.env.local` file in your `BaseBook` directory:

```env
# ZeroDev Configuration
NEXT_PUBLIC_ZERODEV_PROJECT_ID=your-zerodev-project-id
NEXT_PUBLIC_ZERODEV_BUNDLER_URL=https://rpc.zerodev.app/api/v2/bundler/8453
NEXT_PUBLIC_ZERODEV_PAYMASTER_URL=https://rpc.zerodev.app/api/v2/paymaster/8453

# Base Network
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org

# Privy (already configured)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

## 🎮 Step 4: Update Privy Configuration

Update your `PrivyProvider` in `app/layout.tsx`:

```tsx
<PrivyProvider
  appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
  config={{
    embeddedWallets: {
      createOnLogin: 'users-without-wallets', // Important!
    },
    // ... other config
  }}
>
```

## 🧪 Step 5: Test the Integration

1. **Start your development server**
2. **Navigate to `/ai-agent`**
3. **Login with Privy** (email/social)
4. **Click "Initialize Smart Wallet"**
5. **Try sending a transaction** (gas will be sponsored!)

## 🔍 How It Works

### 1. **User Authentication**
- User logs in via Privy (email/social)
- Privy creates embedded wallet automatically
- Embedded wallet becomes the signer for smart wallet

### 2. **Smart Wallet Creation**
- ZeroDev creates Kernel account using embedded wallet as signer
- Smart wallet gets unique address on Base network
- Gas sponsorship is configured automatically

### 3. **Transaction Flow**
- User initiates transaction
- ZeroDev bundles and sponsors gas fees
- Transaction executes on Base network
- User gets transaction hash

## 🎉 Features Available

- ✅ **Gas Sponsorship**: Users never pay gas fees
- ✅ **Smart Wallets**: ERC-4337 compatible
- ✅ **Transaction Batching**: Multiple operations in one tx
- ✅ **Social Recovery**: Easy wallet recovery
- ✅ **Privy Integration**: Seamless user experience

## 🚨 Troubleshooting

### **"No embedded wallet found"**
- Ensure `createOnLogin: 'users-without-wallets'` is set
- Check that user is logged in via Privy
- Verify embedded wallet is created

### **"Failed to initialize smart wallet"**
- Check ZeroDev Project ID is correct
- Verify environment variables are set
- Ensure Base network RPC is accessible

### **"Transaction failed"**
- Check ZeroDev project has sufficient funds for gas sponsorship
- Verify recipient address is valid
- Check Base network status

## 📚 Additional Resources

- [ZeroDev Documentation](https://docs.zerodev.app/)
- [Privy Documentation](https://docs.privy.io/)
- [Base Network](https://docs.base.org/)
- [ERC-4337 Standard](https://eips.ethereum.org/EIPS/eip-4337)

## 🆘 Support

If you encounter issues:
1. Check ZeroDev dashboard for project status
2. Verify all environment variables are set
3. Check browser console for detailed error messages
4. Ensure Base network is accessible

---

**🎯 You're now ready to use ZeroDev smart wallets with gas sponsorship!**
