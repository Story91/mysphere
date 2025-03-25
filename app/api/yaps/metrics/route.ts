import { NextResponse } from 'next/server';

// Informujemy NextJS, że ten endpoint ma być zawsze dynamiczny
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Direct call to public Kaito Yaps API
    const response = await fetch(`https://api.kaito.ai/api/v1/yaps?username=${username}`);

    if (!response.ok) {
      const error = await response.text();
      console.error('Kaito API error:', error);
      return NextResponse.json({ error: 'Failed to fetch Yaps metrics' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Yaps metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 