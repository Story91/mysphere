import { NextRequest, NextResponse } from 'next/server';
import { TwitterAPI } from '@campnetwork/origin';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Initialize Twitter API with backend API key
    // First try non-public env var, fallback to public one for development
    const apiKey = process.env.CAMP_API_KEY || process.env.NEXT_PUBLIC_CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }
    
    const twitterAPI = new TwitterAPI({ 
      apiKey: apiKey
    });

    // Fetch user data by wallet address
    const userData = await twitterAPI.fetchUserByWalletAddress(address, 1, 10);

    return NextResponse.json(userData);
  } catch (error) {
    console.error('Error fetching Twitter data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Twitter data' }, 
      { status: 500 }
    );
  }
} 