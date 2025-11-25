import { NextRequest, NextResponse } from 'next/server';
import { parseWebhookEvent, verifyAppKeyWithNeynar } from '@farcaster/miniapp-node';
import {
  deleteUserNotificationDetails,
  sendMiniAppNotification,
  setUserNotificationDetails,
} from '@/app/utils/miniappNotifications';

const REQUIRED_ENV = ['NEYNAR_API_KEY', 'WEBHOOK_URL'] as const;

const missingVariables = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingVariables.length) {
  console.warn(`Missing env variables for Neynar notifications: ${missingVariables.join(', ')}`);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await parseWebhookEvent(body, verifyAppKeyWithNeynar);

    const { fid, appFid, event } = data;

    switch (event.event) {
      case 'miniapp_added':
      case 'notifications_enabled':
        if (event.notificationDetails) {
          await setUserNotificationDetails(fid, appFid, event.notificationDetails);

          if (event.event === 'notifications_enabled') {
            await sendMiniAppNotification({
              fid,
              appFid,
              title: 'MySphere notifications enabled',
              body: 'Expect onchain updates here.',
            });
          }
        }
        break;
      case 'notifications_disabled':
      case 'miniapp_removed':
        await deleteUserNotificationDetails(fid, appFid);
        break;
      default:
        break;
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error processing Neynar webhook', error);
    return NextResponse.json({ error: 'invalid_webhook' }, { status: 400 });
  }
}

