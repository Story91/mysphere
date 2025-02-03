import { NextResponse } from 'next/server';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Brak adresu' }, { status: 400 });
    }

    // Pobierz dane z BaseScan API
    const baseApiKey = process.env.NEXT_PUBLIC_BASESCAN_API_KEY;
    const baseUrl = 'https://api.basescan.org/api';

    // Pobierz transakcje
    const txResponse = await fetch(`${baseUrl}?module=account&action=txlist&address=${address}&apikey=${baseApiKey}`);
    const txData = await txResponse.json();

    // Pobierz tokeny
    const tokenResponse = await fetch(`${baseUrl}?module=account&action=tokenlist&address=${address}&apikey=${baseApiKey}`);
    const tokenData = await tokenResponse.json();

    // Pobierz NFT
    const nftResponse = await fetch(`${baseUrl}?module=account&action=tokennfttx&address=${address}&apikey=${baseApiKey}`);
    const nftData = await nftResponse.json();

    // Oblicz statystyki
    const stats = {
      transactions: txData.result?.length || 0,
      tokens: tokenData.result?.length || 0,
      nfts: nftData.result?.length || 0,
      lastUpdated: Date.now()
    };

    // Zaktualizuj dane w Firebase
    const userRef = doc(db, 'users', address);
    await updateDoc(userRef, {
      stats,
      lastActive: Date.now()
    });

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error('Błąd odświeżania statystyk:', error);
    return NextResponse.json({ error: 'Błąd serwera' }, { status: 500 });
  }
} 