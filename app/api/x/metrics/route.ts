import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('access_token');
    const startTime = searchParams.get('start_time');

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    // First get user ID
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const userData = await userResponse.json();
    const userId = userData.data.id;

    // Then get tweets with metrics
    const response = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets?` +
      `start_time=${startTime}&` +
      `tweet.fields=public_metrics,non_public_metrics,organic_metrics&` +
      `max_results=100`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Twitter metrics error:', error);
      return NextResponse.json({ error: 'Failed to fetch tweet metrics' }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Twitter metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 