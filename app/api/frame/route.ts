import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <meta name="fc:frame" content='{
          "version": "next",
          "imageUrl": "https://mysphere.fun/images/frame-v2.png",
          "buttons": [
            {
              "label": "Connect Wallet",
              "action": "post_redirect",
              "target": "https://mysphere.fun/basechat"
            }
          ],
          "postUrl": "https://mysphere.fun/api/frame"
        }' />
      </head>
    </html>`,
    {
      headers: {
        'Content-Type': 'text/html',
      },
    }
  );
} 