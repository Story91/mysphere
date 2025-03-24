// Import wymaganych modułów Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';

// Konfiguracja Firebase (skopiuj z lokalnego projektu)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default async function handler(req, res) {
  const { address } = req.query;
  
  if (!address) {
    return res.status(400).json({ error: 'Adres portfela jest wymagany' });
  }

  try {
    // Sprawdź czy dokument użytkownika istnieje
    const userRef = doc(db, 'users', address);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Zaktualizuj dokument, dodając pole socialLinks jeśli nie istnieje
      const userData = userDoc.data();
      if (!userData.socialLinks) {
        await updateDoc(userRef, {
          socialLinks: {
            twitter: '',
            farcaster: '',
            discord: ''
          }
        });
        return res.status(200).json({ success: true, message: 'Zaktualizowano dokument użytkownika' });
      }
      return res.status(200).json({ success: true, message: 'Dokument użytkownika już zawiera socialLinks' });
    } else {
      // Utwórz nowy dokument użytkownika z pustymi socialLinks
      await setDoc(userRef, {
        name: `${address.slice(0, 6)}...${address.slice(-4)}`,
        address: address,
        joinedAt: new Date(),
        lastActive: new Date(),
        socialLinks: {
          twitter: '',
          farcaster: '',
          discord: ''
        }
      });
      return res.status(200).json({ success: true, message: 'Utworzono nowy dokument użytkownika' });
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji Firebase:', error);
    return res.status(500).json({ error: 'Wystąpił błąd podczas aktualizacji' });
  }
} 