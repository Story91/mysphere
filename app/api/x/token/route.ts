import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { code, code_verifier } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Authorization code is required' }, { status: 400 });
    }

    if (!code_verifier) {
      return NextResponse.json({ error: 'Code verifier is required' }, { status: 400 });
    }

    const redirectUri = process.env.NEXT_PUBLIC_X_REDIRECT_URI;
    if (!redirectUri) {
      return NextResponse.json({ error: 'Redirect URI is not configured' }, { status: 500 });
    }

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('X token exchange error:', error);
      return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 500 });
    }

    const tokenData = await tokenResponse.json();
    return NextResponse.json(tokenData);
  } catch (error) {
    console.error('X token exchange error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 