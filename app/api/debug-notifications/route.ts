import { NextRequest, NextResponse } from 'next/server';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/app/utils/firebase';
import {
  getUserNotificationDetails,
  sendMiniAppNotification,
} from '@/app/utils/miniappNotifications';

const COLLECTION = 'miniappNotificationTokens';

// GET: List all saved notification tokens
export async function GET(req: NextRequest) {
  try {
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

