import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('access_token');

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    console.log('Fetching user info with token:', accessToken.substring(0, 10) + '...');

    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      console.error('Twitter API error response:', error);
      return NextResponse.json({ 
        error: 'Failed to get user info',
        details: error
      }, { status: userResponse.status });
    }

    const userData = await userResponse.json();
    console.log('Twitter API response:', userData);
    
    return NextResponse.json(userData);
  } catch (error) {
    console.error('Twitter user info error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 