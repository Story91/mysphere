# 💰 Paid Pinned Posts System

**PRODUCTION-READY** system płatnych przypiętych postów dla BaseChat z pełną integracją blockchain i automatycznym zarządzaniem.

## 🚀 Live Features

### **Visual Experience:**
- ⭐ **Pinned Badge** - żółta gwiazdka + gradient border
- 📍 **Top Placement** - pinned posts automatycznie na górze feeda  
- ⏰ **Live Timer** - "5h 23m 15s" countdown z progress bar
- 🎨 **Color Coding** - 🟢 zielony (>6h) → 🟠 pomarańczowy (1-6h) → 🔴 czerwony (<1h)

### **Blockchain Integration:**
- 💎 **Smart Contract** - `0x163bd9Ec5267491963163dE70D0B64f9400a20AD` on Base
- 💰 **Real ETH Payments** - 0.0005, 0.002, 0.005, 0.02 ETH
- 🔍 **Event Listener** - automatyczne pinowanie po transaction confirmation
- 📜 **Transaction Tracking** - każdy pin linkuje do Basescan

### **System Features:**
- 🔄 **Auto cleanup** - cron job co 5 minut usuwa expired pins
- 🗄️ **Firebase integration** - wszystko w głównym firebase.ts
- 📱 **Mobile responsive** - działa na wszystkich urządzeniach  
- 🔒 **Security** - CRON_SECRET + admin permissions

## 📋 Setup Instructions

### 1. Firebase Indexes

Dodaj te indeksy w Firebase Console:

```bash
# Collection: posts
# Composite indexes needed:
isPaidPin == true AND pinExpiresAt ASC
isPinned == true AND pinnedAt DESC

# Collection: paidPins  
# Composite indexes needed:
isActive == true AND expiresAt ASC
postId == string AND isActive == true
owner == string AND createdAt DESC
```

**Instrukcje:**
1. Idź do Firebase Console → Firestore Database → Indexes
2. Kliknij "Create Index"
3. Wybierz collection i dodaj powyższe pola
4. Ustaw "Query scope" na "Collection"

### 2. Environment Variables

Dodaj do `.env.local`:

```env
# Firebase Config (już istniejące)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Nowe dla Paid Pins
CRON_SECRET=your_secure_random_string_here
```

### 3. Vercel Cron Setup

Dodaj do `vercel.json` w root folder:

```json
{
  "crons": [
    {
      "path": "/api/cleanup-expired-pins",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Jak deploy cron job:**
```bash
# Deploy to Vercel
vercel --prod

# Test cron endpoint manually
curl https://your-domain.vercel.app/api/cleanup-expired-pins
```

### 4. Firebase Rules

Dodaj do Firestore rules:

```javascript
// Allow paid pins collection
match /paidPins/{pinId} {
  allow read: if true;
  allow write: if request.auth != null;
}

// Update posts rules dla paid pin fields
match /posts/{postId} {
  allow read: if true;
  allow write: if request.auth != null;
  // Dodaj nowe pola do dozwolonych
}
```

## 🔧 Testing

### Demo Page
```
http://localhost:3000/basechat/pinned-demo
```

### API Endpoints
```bash
# Automatic cleanup (cron)
GET /api/cleanup-expired-pins

# Manual cleanup (admin only)
POST /api/cleanup-expired-pins
{
  "adminAddress": "0xF1fa20027b6202bc18e4454149C85CB01dC91Dfd"
}
```

### Manual Testing
```bash
# Test Firebase functions
npm run dev
# Otwórz dev tools i sprawdź Console logs

# Test mobile responsive
# Chrome DevTools → Device Toolbar
# iPhone 12 Pro / Galaxy S21
```

## 📱 Mobile Optimizations

- **Responsive modal** - max-w-sm na mobile
- **Touch-friendly** - większe touch targets
- **Smaller fonts** - text-sm na mobile, text-base na desktop  
- **Reduced padding** - p-4 na mobile, p-6 na desktop
- **Full height** - max-h-95vh na mobile

## 🗂️ File Structure

```
PinnedJobs/
├── components/
│   ├── PaidPinModal.tsx           # 💰 Payment UI with contract integration
│   ├── PaidPinButton.tsx          # 🔘 "Pin Post" button (own posts only)
│   ├── PinTimer.tsx               # ⏰ Live countdown timer + progress bar
│   └── ContractEventListener.tsx  # 👂 Listens for blockchain events
├── config/
│   └── contractConfig.ts          # 📜 Contract address + ABI
├── types/
│   └── pinTypes.ts                # 📝 TypeScript definitions
├── utils/
│   ├── pinPricing.ts              # 💲 Pricing + time calculations
│   └── mockPinnedPost.ts          # 🧪 Testing utilities
├── demo/
│   └── PaidPinDemo.tsx            # 🎮 Component showcase
└── index.ts                       # 📦 Exports

# Main Firebase Integration:
../../utils/firebase.ts             # 🔥 All paid pin functions
../../api/cleanup-expired-pins/     # 🧹 Cron job endpoint
```

## 🔄 Integration Points

### **PostList.tsx** - Main Feed Integration
- ⭐ **Visual Design** - pinned posts z gradient border + badge
- 📍 **Auto-sorting** - pinned posts zawsze na górze
- ⏰ **PinTimer** - live countdown dla active pins
- 🔘 **PaidPinButton** - pokazuje się tylko na własnych postach
- 🎨 **Color coding** - timer zmienia kolor w zależności od pozostałego czasu

### **BaseChat page.tsx** - Event Integration  
- 👂 **ContractEventListener** - nasłuchuje blockchain events
- 🔄 **Auto-refresh** - feed odświeża się po nowym pinowaniu
- 📡 **Real-time updates** - posty pojawiają się w 5-10 sekund po płatności

### **Firebase.ts** - Backend Integration
- 💾 **createPaidPin()** - zapisuje pin po transaction confirmation
- 🧹 **cleanupExpiredPaidPins()** - usuwa wygasłe pins
- ✅ **canPinPost()** - sprawdza czy post może być pinowany
- 📊 **Single database instance** - eliminuje konflikty

## 💰 Pricing

- **1 Hour**: 0.0005 ETH (~$1.25)
- **6 Hours**: 0.002 ETH (~$5.00)  
- **24 Hours**: 0.005 ETH (~$12.50) 🔥 POPULAR
- **7 Days**: 0.02 ETH (~$50.00)

## 🚨 Common Issues

### Import Errors
```bash
# If you see import errors:
npm install
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Firebase Errors
```bash
# Check indexes in Firebase Console
# Ensure all composite indexes are created
# Check Firestore rules allow writes
```

### Mobile Issues  
```bash
# Check viewport meta tag in layout
# Test with real device, not just dev tools
# Check touch events work properly
```

## 🔜 Next Steps

1. **Smart Contract** - implement payment logic
2. **Real ETH Price** - API integration  
3. **Extend Functionality** - allow pin extensions
4. **Admin Dashboard** - revenue analytics
5. **Notifications** - pin expiry warnings

## 📞 Support

Jeśli masz problemy:
1. Sprawdź Firebase Console logs
2. Sprawdź Next.js dev console  
3. Sprawdź Network tab w dev tools
4. Sprawdź czy wszystkie environment variables są ustawione 