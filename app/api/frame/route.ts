import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="/images/frame-v2.png" />
        <meta property="fc:frame:button:1" content="Open MySphere" />
        <meta property="fc:frame:button:1:action" content="post" />
        <meta property="fc:frame:post_url" content="https://559a-178-235-179-3.ngrok-free.app/api/frame" />
        <meta property="fc:frame:aspect_ratio" content="1.91:1" />
      </head>
    </html>`,
    {
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
} 