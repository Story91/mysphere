import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import {
  getUserNotificationDetails,
  sendMiniAppNotification,
} from '@/app/utils/miniappNotifications';

const COLLECTION = 'miniappNotificationTokens';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/frame/notifications/';

// GET: List all saved notification tokens and env status
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const testFid = url.searchParams.get('testFid');

    // If testFid provided, send test notification directly via Neynar
    if (testFid) {
      const neynarApiKey = process.env.NEYNAR_API_KEY;
      if (!neynarApiKey) {
        return NextResponse.json({
          success: false,
          error: 'NEYNAR_API_KEY not configured',
        });
      }

      const response = await fetch(NEYNAR_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': neynarApiKey,
        },
        body: JSON.stringify({
          target_fids: [parseInt(testFid, 10)],
          notification: {
            title: '🧪 Debug Test',
            body: 'Test notification from debug endpoint',
            target_url: process.env.NEXT_PUBLIC_URL || 'https://mysphere.fun',
          },
        }),
      });

      const responseJson = await response.json().catch(() => null);
      return NextResponse.json({
        success: response.status === 200,
        neynarResponse: {
          status: response.status,
          body: responseJson,
        },
      });
    }

    // Otherwise, list tokens from Firestore
    const tokensRef = collection(db, COLLECTION);
    const q = query(tokensRef, limit(50));
    const snapshot = await getDocs(q);

    const tokens = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        fid: data.fid,
        appFid: data.appFid,
        url: data.url,
        token: data.token ? data.token.substring(0, 15) + '...' : null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({
      success: true,
      count: tokens.length,
      tokens,
      env: {
        NEYNAR_API_KEY: process.env.NEYNAR_API_KEY ? '✅ Set' : '❌ Missing',
        WEBHOOK_URL: process.env.WEBHOOK_URL || '❌ Missing',
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL || '❌ Missing',
      },
      hint: 'Add ?testFid=YOUR_FID to send a test notification via Neynar API',
    });
  } catch (error) {
    console.error('Debug GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST: Send test notification
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fid, appFid, title, body: notificationBody } = body;

    if (!fid || !appFid) {
      return NextResponse.json(
        { success: false, error: 'fid and appFid are required' },
        { status: 400 }
      );
    }

    // First check if we have token for this user
    const details = await getUserNotificationDetails(Number(fid), Number(appFid));
    
    if (!details) {
      return NextResponse.json({
        success: false,
        error: 'No notification token found for this fid/appFid combination',
        hint: 'User may not have enabled notifications or token was not saved',
      });
    }

    console.log('📤 Sending test notification to:', {
      fid,
      appFid,
      url: details.url,
      token: details.token.substring(0, 15) + '...',
    });

    // Send test notification
    const result = await sendMiniAppNotification({
      fid: Number(fid),
      appFid: Number(appFid),
      title: title || '🧪 Test Notification',
      body: notificationBody || 'This is a test notification from MySphere debug endpoint.',
    });

    return NextResponse.json({
      success: result.state === 'success',
      result,
      tokenUsed: {
        url: details.url,
        token: details.token.substring(0, 15) + '...',
      },
    });
  } catch (error) {
    console.error('Debug POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

