import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="https://mysphere.fun/images/frame-v2.png" />
        <meta property="fc:frame:button:1" content="Connect Wallet" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://mysphere.fun/basechat" />
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