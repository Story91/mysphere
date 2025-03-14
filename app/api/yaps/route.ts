import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://api.kaito.ai/api/v1/yaps?username=${encodeURIComponent(username)}`);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Kaito API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      return NextResponse.json(
        { error: `Failed to fetch data from Kaito API: ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching from Kaito API:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Kaito API' },
      { status: 500 }
    );
  }
} 