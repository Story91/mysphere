import { NextRequest, NextResponse } from 'next/server';
import { TwitterAPI } from '@campnetwork/origin';

// Trasa czyta dane z zadania (nextUrl / naglowki), wiec nie da sie jej
// prerenderowac. Bez tej deklaracji Next probuje ja wygenerowac statycznie
// przy buildzie i zasmieca log stacktrace'ami DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

// Types for Camp Network API responses
interface TwitterUser {
  id: string;
  displayName: string;
  userHandle: string;
  profileBio: string;
  profilePictureUrl: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  verifiedType: string;
  location: string;
  likeCount: number;
  followerCount: number;
  followingCount: number;
  dailyTweetCount: number | null;
  weeklyTweetCount: number | null;
  tweetFrequencyInDays: number | null;
}

interface Tweet {
  id: string;
  twitterUserId: string;
  tweetText: string;
  tweetTimestamp: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  isReTweet: boolean;
  replyToTweetId: string | null;
  tweetedBy: string | null;
  replyToUserId: string | null;
}

// Enhanced fetch function using Camp Network direct API
async function fetchTwitterDataDirect(address: string) {
  const apiKey = process.env.CAMP_API_KEY;
  
  if (!apiKey) {
    throw new Error('CAMP_API_KEY not found in environment variables');
  }

  const baseURL = 'https://wv2h4to5qa.execute-api.us-east-2.amazonaws.com/dev/twitter';
  
  try {
    // Fetch user data by wallet address using Camp Network API
    const response = await fetch(`${baseURL}/wallet-twitter-data?walletAddress=${encodeURIComponent(address)}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`Camp Network API returned ${response.status} for address ${address}`);
      return null;
    }

    const data = await response.json();
    
    if (data.isError || !data.data) {
      console.warn('Camp Network API returned error or no data:', data.message);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('Error fetching from Camp Network API:', error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.nextUrl);
    const address = searchParams.get('address');
    const useDirectAPI = searchParams.get('direct') === 'true';

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    // Try direct Camp Network API first if requested or as fallback
    if (useDirectAPI) {
      console.log('Using direct Camp Network API for address:', address);
      const directData = await fetchTwitterDataDirect(address);
      
      if (directData) {
        return NextResponse.json({
          source: 'camp-network-direct',
          data: directData
        });
      }
    }

    const apiKey = process.env.CAMP_API_KEY;
    
    if (!apiKey) {
      throw new Error('Camp API key not found in environment variables');
    }
    
    const twitterAPI = new TwitterAPI({ 
      apiKey: apiKey
    });

    try {
      // Fetch user data by wallet address using origin library
      const userData = await twitterAPI.fetchUserByWalletAddress(address, 1, 10);
      
      return NextResponse.json({
        source: 'camp-network-origin',
        data: userData
      });
    } catch (originError) {
      console.warn('Origin library failed, trying direct API:', originError);
      
      // Fallback to direct API
      const directData = await fetchTwitterDataDirect(address);
      
      if (directData) {
        return NextResponse.json({
          source: 'camp-network-direct-fallback',
          data: directData
        });
      }
      
      throw originError;
    }

  } catch (error) {
    console.error('Error fetching Twitter data:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch Twitter data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
} 