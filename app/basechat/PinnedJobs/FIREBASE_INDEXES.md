# 🔥 FIREBASE INDEXES - OBOWIĄZKOWE!

## ❌ CRITICAL: BEZ TYCH INDEXÓW CRON JOB NIE DZIAŁA!

### **Brakujące compound indexes powodują:**
- ❌ `cleanupExpiredPaidPins()` throws Firebase errors
- ❌ Cron job `/api/cleanup-expired-pins` failuje  
- ❌ Expired pins **NIE SĄ USUWANE** z feeda
- ❌ System się zatyka po pierwszym expired pin
- ❌ Console error: "The query requires an index"

## 📋 INDEXES DO DODANIA

### **Collection: `posts`**

#### Index 1: Expired Pins Query
```
Collection ID: posts
Fields:
- isPaidPin: Ascending
- pinExpiresAt: Ascending
Query scope: Collection
```

### **Collection: `paidPins`**

#### Index 2: Post Active Pins Query  
```
Collection ID: paidPins
Fields:
- postId: Ascending  
- isActive: Ascending
Query scope: Collection
```

#### Index 3: Active Pins by Expiration
```
Collection ID: paidPins
Fields:
- isActive: Ascending
- expiresAt: Ascending  
Query scope: Collection
```

#### Index 4: User Pins History
```
Collection ID: paidPins
Fields:
- owner: Ascending
- createdAt: Descending
Query scope: Collection
```

## 🚀 JAK DODAĆ INDEXES

### **Sposób 1: Firebase Console (Zalecany)**

1. **Idź do:** https://console.firebase.google.com
2. **Wybierz projekt:** BaseBook/BaseChat
3. **Firestore Database** → **Indexes** → **Composite**
4. **Kliknij:** "Create Index"
5. **Dodaj każdy index** według spec powyżej

### **Sposób 2: Auto-generate (Trigger Error)**

1. **Uruchom:** `npm run dev`
2. **Test endpoint:** `curl http://localhost:3000/api/cleanup-expired-pins`
3. **Firebase Console** pokaże error + link do auto-create indexes
4. **Kliknij link** w error message → automatically create index

### **Sposób 3: Firebase CLI**

```bash
# firebase.json indexes
{
  "firestore": {
    "indexes": [
      {
        "collectionGroup": "posts",
        "queryScope": "COLLECTION",
        "fields": [
          {"fieldPath": "isPaidPin", "order": "ASCENDING"},
          {"fieldPath": "pinExpiresAt", "order": "ASCENDING"}
        ]
      },
      {
        "collectionGroup": "paidPins", 
        "queryScope": "COLLECTION",
        "fields": [
          {"fieldPath": "postId", "order": "ASCENDING"},
          {"fieldPath": "isActive", "order": "ASCENDING"}
        ]
      },
      {
        "collectionGroup": "paidPins",
        "queryScope": "COLLECTION", 
        "fields": [
          {"fieldPath": "isActive", "order": "ASCENDING"},
          {"fieldPath": "expiresAt", "order": "ASCENDING"}
        ]
      },
      {
        "collectionGroup": "paidPins",
        "queryScope": "COLLECTION",
        "fields": [
          {"fieldPath": "owner", "order": "ASCENDING"},
          {"fieldPath": "createdAt", "order": "DESCENDING"}
        ]
      }
    ]
  }
}

# Deploy indexes
firebase deploy --only firestore:indexes
```

## ✅ SPRAWDŹ CZY INDEXES SĄ GOTOWE

### **Test Cron Job:**
```bash
curl http://localhost:3000/api/cleanup-expired-pins
# Powinno zwrócić sukces, nie błędy o indexach
```

### **Console Logs:**
```
✅ GOOD: "Cleanup completed successfully"  
❌ BAD: "FirebaseError: The query requires an index"
```

## 🚨 PILNE - DO ZROBIENIA TERAZ

1. **Dodaj 4 indexes** w Firebase Console
2. **Zaczekaj 5-10 minut** na deployment
3. **Przetestuj:** `/api/cleanup-expired-pins`
4. **Verify:** Brak błędów o indexach

## 🎯 VERIFICATION - System Working Correctly:

### **✅ Success Indicators:**
```json
// Successful cron response:
{
  "success": true,
  "message": "Cleanup completed successfully",
  "expiredPins": 0,
  "errors": [],
  "timestamp": "2024-01-17T..."
}
```

### **❌ Error Indicators:**
```
FirebaseError: The query requires an index. You can create it here: 
https://console.firebase.google.com/v1/r/project/.../firestore/indexes?create_composite=...
```

### **🧪 Complete Test Flow:**
1. **Add indexes** → Wait 5-10 minutes for deployment
2. **Test cron:** `curl localhost:3000/api/cleanup-expired-pins`
3. **Pin a post:** 0.0005 ETH (1 hour)
4. **Verify:** Post appears with ⭐ + timer countdown
5. **Wait for expiry** → Auto-removed by cron job

---

**BEZ INDEXES = EXPIRED PINS NIE SĄ USUWANE! 🔥** 