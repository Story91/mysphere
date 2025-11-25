import { doc, getDoc, serverTimestamp, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'miniappNotificationTokens';

type NotificationDetails = {
  url: string;
  token: string;
};

const getDocId = (fid: number, appFid: number) => `${fid}_${appFid}`;

export async function setUserNotificationDetails(
  fid: number,
  appFid: number,
  details: NotificationDetails
) {
  await setDoc(
    doc(db, COLLECTION, getDocId(fid, appFid)),
    {
      fid,
      appFid,
      ...details,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteUserNotificationDetails(fid: number, appFid: number) {
  await deleteDoc(doc(db, COLLECTION, getDocId(fid, appFid)));
}

export async function getUserNotificationDetails(
  fid: number,
  appFid: number
): Promise<NotificationDetails | null> {
  const docRef = await getDoc(doc(db, COLLECTION, getDocId(fid, appFid)));
  if (!docRef.exists()) {
    return null;
  }
  const data = docRef.data();
  if (!data?.token || !data?.url) {
    return null;
  }
  return { token: data.token as string, url: data.url as string };
}

type SendNotificationResult =
  | { state: 'success' }
  | { state: 'no_token' }
  | { state: 'rate_limit' }
  | { state: 'error'; error: unknown };

const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/frame/notifications/';
const appUrl = process.env.NEXT_PUBLIC_URL || 'https://mysphere.fun';

/**
 * Send notification via Neynar API
 * When webhook is configured to Neynar, Neynar manages tokens
 * We just send FIDs and Neynar delivers to all clients where user enabled notifications
 */
async function sendViaNeynarAPI({
  fid,
  title,
  body,
}: {
  fid: number | number[];
  title: string;
  body: string;
}): Promise<SendNotificationResult> {
  const neynarApiKey = process.env.NEYNAR_API_KEY;
  
  if (!neynarApiKey) {
    console.error('NEYNAR_API_KEY not set');
    return { state: 'error', error: 'NEYNAR_API_KEY not configured' };
  }

  const targetFids = Array.isArray(fid) ? fid : [fid];

  const requestBody = {
    target_fids: targetFids,
    notification: {
      title: title.substring(0, 32),
      body: body.substring(0, 128),
      target_url: appUrl,
    },
  };

  console.log('📤 Sending notification via Neynar API:', {
    endpoint: NEYNAR_API_URL,
    targetFids,
    title: requestBody.notification.title,
    target_url: requestBody.notification.target_url,
  });

  try {
    const response = await fetch(NEYNAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': neynarApiKey,
      },
      body: JSON.stringify(requestBody),
    });

    const responseJson = await response.json().catch(() => null);

    console.log('📥 Neynar API response:', {
      status: response.status,
      body: responseJson,
    });

    if (response.status === 200) {
      console.log('✅ Notification sent successfully via Neynar API');
      return { state: 'success' };
    }

    if (response.status === 429) {
      console.warn('⚠️ Neynar API rate limit');
      return { state: 'rate_limit' };
    }

    return { state: 'error', error: responseJson };
  } catch (error) {
    console.error('❌ Neynar API error:', error);
    return {
      state: 'error',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Send notification via Base API (direct with tokens)
 * Fallback when we have tokens stored locally
 */
async function sendViaBaseAPI({
  fid,
  appFid,
  title,
  body,
}: {
  fid: number;
  appFid: number;
  title: string;
  body: string;
}): Promise<SendNotificationResult> {
  const notificationDetails = await getUserNotificationDetails(fid, appFid);
  if (!notificationDetails) {
    return { state: 'no_token' };
  }

  console.log('📤 Sending notification via Base API:', {
    url: notificationDetails.url,
    fid,
    appFid,
  });

  try {
    const response = await fetch(notificationDetails.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notificationId: crypto.randomUUID(),
        title: title.substring(0, 32),
        body: body.substring(0, 128),
        targetUrl: appUrl,
        tokens: [notificationDetails.token],
      }),
    });

    const responseJson = await response.json().catch(() => null);

    console.log('📥 Base API response:', {
      status: response.status,
      body: responseJson,
    });

    if (response.status !== 200) {
      return { state: 'error', error: responseJson };
    }

    const result = responseJson?.result;
    if (Array.isArray(result?.invalidTokens) && result.invalidTokens.length > 0) {
      await deleteUserNotificationDetails(fid, appFid);
    }

    if (Array.isArray(result?.rateLimitedTokens) && result.rateLimitedTokens.length > 0) {
      return { state: 'rate_limit' };
    }

    return { state: 'success' };
  } catch (error) {
    console.error('❌ Base API error:', error);
    return {
      state: 'error',
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Send Mini App notification
 * Uses Neynar API (primary) with Base API fallback
 */
export async function sendMiniAppNotification({
  fid,
  appFid,
  title,
  body,
}: {
  fid: number;
  appFid: number;
  title: string;
  body: string;
  targetUrl?: string;
}): Promise<SendNotificationResult> {
  // Try Neynar API first (recommended when webhook is configured for Neynar)
  const neynarResult = await sendViaNeynarAPI({ fid, title, body });

  if (neynarResult.state === 'success') {
    return neynarResult;
  }

  // Fallback to Base API if we have tokens stored locally
  console.log('⚠️ Neynar API failed, trying Base API fallback...');
  const baseResult = await sendViaBaseAPI({ fid, appFid, title, body });

  if (baseResult.state === 'success') {
    return baseResult;
  }

  // Return Neynar error if both failed
  return neynarResult;
}

