import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const requestData = await request.json();

    const merkleResponse = await fetch('https://eth.merkle.io/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    const contentType = merkleResponse.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Merkle API unavailable', jsonrpc: '2.0', id: requestData?.id ?? null },
        { status: 502 }
      );
    }

    const data = await merkleResponse.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Merkle proxy failed', jsonrpc: '2.0', id: null },
      { status: 502 }
    );
  }
} 