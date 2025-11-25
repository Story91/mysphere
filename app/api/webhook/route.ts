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

    let data;
    try {
      data = await parseWebhookEvent(body, verifyAppKeyWithNeynar);
    } catch (e) {
      console.error('Webhook verification error:', e);
      return NextResponse.json({ error: 'invalid_webhook' }, { status: 400 });
    }

    const { fid, appFid, event } = data;

    console.log(`Webhook event: ${event.event}, fid: ${fid}, appFid: ${appFid}`);

    switch (event.event) {
      case 'miniapp_added':
        console.log('miniapp_added', 'fid:', fid, 'appFid:', appFid);
        if (event.notificationDetails) {
          console.log('💾 Saving notification details:', {
            fid,
            appFid,
            url: event.notificationDetails.url,
            token: event.notificationDetails.token.substring(0, 10) + '...',
          });
          await setUserNotificationDetails(fid, appFid, event.notificationDetails);
          console.log('✅ Notification details saved');

          // IMPORTANT: Base app waits for webhook response before activating tokens
          // Send notification asynchronously AFTER returning response to avoid timeout
          // Don't await - let it run in background
          sendMiniAppNotification({
            fid,
            appFid,
            title: '👋 Welcome to MySphere!',
            body: 'Thank you for adding MySphere. Enjoy onchain social!',
          }).catch((error) => {
            console.error('Failed to send welcome notification:', error);
          });
        } else {
          console.log('⚠️ No notificationDetails in event');
          await deleteUserNotificationDetails(fid, appFid);
        }
        break;

      case 'notifications_enabled':
        console.log('notifications_enabled', 'fid:', fid, 'appFid:', appFid);
        if (event.notificationDetails) {
          console.log('💾 Saving notification details:', {
            fid,
            appFid,
            url: event.notificationDetails.url,
            token: event.notificationDetails.token.substring(0, 10) + '...',
          });
          await setUserNotificationDetails(fid, appFid, event.notificationDetails);
          console.log('✅ Notification details saved');

          // IMPORTANT: Base app waits for webhook response before activating tokens
          // Send notification asynchronously AFTER returning response to avoid timeout
          // Don't await - let it run in background
          sendMiniAppNotification({
            fid,
            appFid,
            title: '🔔 Notifications Enabled!',
            body: 'You will now receive updates from MySphere.',
          }).catch((error) => {
            console.error('Failed to send notification enabled confirmation:', error);
          });
        }
        break;

      case 'notifications_disabled':
        console.log('notifications_disabled', 'fid:', fid, 'appFid:', appFid);
        await deleteUserNotificationDetails(fid, appFid);
        break;

      case 'miniapp_removed':
        console.log('miniapp_removed', 'fid:', fid, 'appFid:', appFid);
        await deleteUserNotificationDetails(fid, appFid);
        break;

      default:
        console.log('Unknown event:', (event as { event: string }).event);
        break;
    }

    // Return response immediately - notifications sent in background
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
