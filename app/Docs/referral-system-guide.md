# 🚀 BaseChat Referral System Guide

## Welcome to the BaseChat Referral Program!

The BaseChat Referral System rewards you for inviting new members to our community. Share your unique referral link, help grow the platform, and earn points for every successful referral!

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [How It Works](#how-it-works)
3. [Rewards Structure](#rewards-structure)
4. [Using Your Dashboard](#using-your-dashboard)
5. [For New Users](#for-new-users)
6. [Leaderboard](#leaderboard)
7. [FAQ](#faq)
8. [Technical Details](#technical-details)

---

## 🚀 Quick Start

### Get Your Referral Link in 3 Steps:

1. **Open Your Profile** - Navigate to your profile in BaseChat
2. **Click "Referral System"** - Find the green button below your profile stats
3. **Copy Your Link** - Your unique link is ready to share!

Your referral link format:
```
https://basechat.app/join?ref=YOUR_CODE
```

---

## 🎯 How It Works

### For Referrers (You!)

#### Step 1: Access Your Dashboard
- Go to your profile page
- Click the "Referral System" button
- Your dashboard shows all referral statistics

#### Step 2: Share Your Link
- **Direct Sharing** - Copy and paste your link
- **QR Code** - Show the QR code for in-person sharing
- **Social Media** - Share on Twitter, Discord, Telegram
- **Messaging Apps** - Send via WhatsApp, Signal, etc.

#### Step 3: Track Your Referrals
- **Overview Tab** - See your total stats and progress
- **My Referrals Tab** - View all your referrals and their status
- **Rewards Tab** - Check your earned points and milestones

### Referral Statuses

| Status | Description | Reward |
|--------|-------------|--------|
| **Pending** | User joined but not yet active | Waiting |
| **Active** | User is actively using BaseChat | 100 points |
| **Rewarded** | First post bonus claimed | +50 points |

---

## 💎 Rewards Structure

### Base Rewards

| Action | Points | Description |
|--------|--------|-------------|
| **Successful Referral** | 100 | When someone joins using your link |
| **First Post Bonus** | +50 | When your referral creates their first post |

### Milestone Bonuses

Earn extra rewards when you reach these milestones:

| Milestone | Bonus Points | Total Potential |
|-----------|--------------|-----------------|
| **5 Referrals** | 250 | 750 points total |
| **10 Referrals** | 500 | 1,500 points total |
| **25 Referrals** | 1,500 | 4,000 points total |
| **50 Referrals** | 5,000 | 10,000 points total |

### Points Calculation Example

If you refer 10 friends who all create posts:
- Base rewards: 10 × 100 = 1,000 points
- First post bonuses: 10 × 50 = 500 points
- Milestone bonuses: 250 (5 referrals) + 500 (10 referrals) = 750 points
- **Total: 2,250 points!**

---

## 📊 Using Your Dashboard

### Overview Tab

The Overview tab displays:
- **Your Referral Link** - Copy with one click
- **QR Code** - Toggle visibility for easy sharing
- **Statistics** - Total, active, and pending referrals
- **Next Milestone** - Progress bar to your next bonus
- **Current Rewards** - Base and bonus reward information

### My Referrals Tab

Track all your referrals:
- **User Address** - Wallet address of referred user
- **Join Date** - When they used your link
- **Status** - Current status (Pending/Active/Rewarded)
- **Real-time Updates** - Automatic refresh every 30 seconds

### Rewards Tab

View your achievements:
- **Milestone Progress** - Visual indicators for each milestone
- **Total Points Earned** - Cumulative rewards from referrals
- **Reward History** - Detailed breakdown of all earned points

---

## 🆕 For New Users

### Joining Through a Referral Link

1. **Click the Link** - Open the referral link shared with you
2. **Welcome Page** - See who invited you to BaseChat
3. **Connect Wallet** - Use MetaMask, Coinbase Wallet, or others
4. **Automatic Registration** - You're instantly registered
5. **Welcome Message** - See confirmation in BaseChat

### After Joining

- Create your first post to give your referrer a bonus
- Access your own referral link in your profile
- Start inviting friends to earn your own rewards

---

## 🏆 Leaderboard

### Top Referrers

The leaderboard showcases our community's top contributors:
- **Ranking** - Your position among all referrers
- **Total Referrals** - Number of successful invites
- **Points Earned** - Total rewards accumulated
- **Weekly/Monthly/All-Time** - Different time period views

Find the leaderboard in the left panel of BaseChat, below the 3D profile card.

---

## ❓ FAQ

### General Questions

**Q: How is my referral code generated?**
A: Your code uses the first 6 characters of your wallet address plus 4 random characters, ensuring uniqueness.

**Q: Can I change my referral code?**
A: No, codes are permanent to maintain consistency and prevent abuse.

**Q: Do referral links expire?**
A: No, your referral link is permanent and never expires.

### Rewards Questions

**Q: When do I receive my rewards?**
A: Base reward (100 points) is instant when someone joins. The bonus (50 points) comes when they create their first post.

**Q: Can I refer myself?**
A: No, the system prevents self-referrals automatically.

**Q: Is there a limit to how many people I can refer?**
A: No limit! Refer as many people as you want.

### Technical Questions

**Q: Can someone be referred by multiple people?**
A: No, each user can only be referred once - by the first person whose link they use.

**Q: What if someone joins without using my link?**
A: They won't count as your referral. Make sure they use your specific link.

**Q: How do I know if my referral was successful?**
A: Check your dashboard - new referrals appear immediately in the "My Referrals" tab.

---

## 🔧 Technical Details

### For Developers

#### System Architecture
- **Frontend**: React + TypeScript + Next.js
- **Backend**: Firebase Firestore
- **Authentication**: Wallet-based (wagmi)
- **State Management**: React Hooks

#### Key Components
```typescript
// Referral Service Functions
generateReferralCode(address: string): string
initializeReferralStats(userId: string): Promise<ReferralStats>
registerReferral(code: string, newUser: string): Promise<boolean>
awardReferralPoints(userId: string, amount: number): Promise<boolean>
```

#### Database Schema
```typescript
interface ReferralStats {
  userId: string;
  totalReferrals: number;
  successfulReferrals: number;
  pendingReferrals: number;
  totalRewards: number;
  referralCode: string;
  referralLink: string;
  milestones: MilestoneStatus;
}
```

#### Anti-Fraud Measures
- IP hash tracking
- Device fingerprinting
- One referrer per user limit
- Automatic status validation

---

## 📞 Support

Having issues with the referral system?

1. **Check Browser Console** - Look for error messages (F12)
2. **Verify Wallet Connection** - Ensure your wallet is connected
3. **Clear Cache** - Try refreshing the page (Ctrl+F5)
4. **Contact Support** - Reach out with your wallet address

---

## 🎉 Tips for Success

### Best Practices

1. **Share Authentically** - Tell friends why you love BaseChat
2. **Use Multiple Channels** - Diversify your sharing platforms
3. **Timing Matters** - Share when your audience is most active
4. **Follow Up** - Help new users with their first steps
5. **Celebrate Wins** - Share milestones with the community

### Growth Strategies

- **Content Creation** - Make posts about BaseChat features
- **Community Engagement** - Be active and helpful
- **Educational Content** - Teach others about Web3
- **Network Effects** - Encourage referrals to refer others

---

## 🚀 Start Referring Today!

Ready to grow the BaseChat community and earn rewards?

1. Go to your profile
2. Click "Referral System"
3. Copy your link
4. Start sharing!

Every referral helps build a stronger, more vibrant BaseChat community. Thank you for being part of our growth!

---

*Last Updated: January 2025*
*Version: 1.0.0*

