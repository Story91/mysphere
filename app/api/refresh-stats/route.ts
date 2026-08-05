import { NextRequest, NextResponse } from 'next/server';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../utils/firebase';
import { getSessionFromCookies } from '../../utils/auth/session';

// getSessionFromCookies uzywa node:crypto
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Odswiezenie statystyk WLASNEGO profilu.
 *
 * Poprzednio trasa brala adres z ciala zadania i nadpisywala nim
 * `users/{address}.stats` bez zadnego uwierzytelnienia - dowolny anonim mogl
 * przepisac statystyki dowolnego uzytkownika, a przy okazji zamienic trase w
 * darmowy proxy do BaseScan na cudzy klucz API. Adres musi pochodzic z
 * podpisanej sesji.
 *
 * Adres jest tez walidowany regexem, bo trafia do sciezki dokumentu: wartosc ze
 * znakiem `/` rozjezdza sciezke Firestore na inna kolekcje.
 */
function sessionAddress(request: NextRequest): string | null {
  try {
    return getSessionFromCookies(request.cookies)?.address ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const address = sessionAddress(request);

    if (!address) {
      return NextResponse.json({ error: 'Zaloguj sie portfelem' }, { status: 401 });
    }
    if (!ADDRESS_REGEX.test(address)) {
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