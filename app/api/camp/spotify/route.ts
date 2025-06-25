import { NextRequest, NextResponse } from 'next/server';
import { SpotifyAPI } from '@campnetwork/sdk';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Initialize Spotify API with backend API key
    // First try non-public env var, fallback to public one for development
    const apiKey = process.env.CAMP_API_KEY || process.env.NEXT_PUBLIC_CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }
    
    const spotifyAPI = new SpotifyAPI({ 
      apiKey: apiKey
    });

    // Fetch user data by wallet address
    const userData = await spotifyAPI.fetchUserByWalletAddress(address);

    return NextResponse.json(userData);
  } catch (error) {
    console.error('Error fetching Spotify data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Spotify data' }, 
      { status: 500 }
    );
  }
} 