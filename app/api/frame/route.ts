import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const data = await req.json();
  
  return new Response(
    JSON.stringify({
      version: 'vNext',
      image: 'https://basebook.vercel.app/og-image.png',
      buttons: [
        {
          label: 'Mint Quote',
        },
        {
          label: 'View Collection',
        },
      ],
      post_url: 'https://basebook.vercel.app/api/frame',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    }
  );
}

export const dynamic = 'force-dynamic'; 