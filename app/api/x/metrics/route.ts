import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('access_token');
    const startTime = searchParams.get('start_time');

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    console.log('Fetching user info...');
    // First get user ID
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json();
      console.error('Failed to get user info:', errorData);
      throw new Error(`Failed to get user info: ${errorData.detail || errorData.message || 'Unknown error'}`);
    }

    const userData = await userResponse.json();
    const userId = userData.data.id;

    console.log('Fetching tweets with metrics...');
    // Then get tweets with metrics
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?` +
      `start_time=${startTime}&` +
      `tweet.fields=public_metrics,non_public_metrics,organic_metrics,promoted_metrics&` +
      `max_results=100`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    const responseData = await response.json();
    console.log('Twitter API response:', responseData);

    if (!response.ok) {
      console.error('Failed to fetch tweet metrics:', responseData);
      return NextResponse.json({ 
        error: 'Failed to fetch tweet metrics',
        details: responseData,
        message: responseData.detail || responseData.message || 'Unknown error'
      }, { status: response.status });
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Twitter metrics error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 