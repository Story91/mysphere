import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Pobierz dane z żądania
    const requestData = await request.json();

    // Wykonaj żądanie do API merkle.io
    const merkleResponse = await fetch('https://eth.merkle.io/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    // Pobierz dane odpowiedzi
    const data = await merkleResponse.json();

    // Zwróć odpowiedź
    return NextResponse.json(data);
  } catch (error) {
    console.error('Merkle proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data from Merkle API' },
      { status: 500 }
    );
  }
} 