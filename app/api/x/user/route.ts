import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('access_token');

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 });
    }

    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      console.error('Twitter user info error:', error);
      return NextResponse.json({ error: 'Failed to get user info' }, { status: 500 });
    }

    const userData = await userResponse.json();
    return NextResponse.json(userData);
  } catch (error) {
    console.error('Twitter user info error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 