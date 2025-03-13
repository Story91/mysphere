import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { text, accessToken } = await request.json();

    if (!text || !accessToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('Attempting to post tweet...');
    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    const responseData = await response.json();
    console.log('Twitter API response:', responseData);

    if (!response.ok) {
      console.error('Failed to post tweet:', responseData);
      return NextResponse.json(
        { 
          error: 'Failed to post tweet', 
          details: responseData,
          message: responseData.detail || responseData.message || 'Unknown error'
        },
        { status: response.status }
      );
    }

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error posting tweet:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 