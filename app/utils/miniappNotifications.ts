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

export async function sendMiniAppNotification({
  fid,
  appFid,
  title,
  body,
  targetUrl,
}: {
  fid: number;
  appFid: number;
  title: string;
  body: string;
  targetUrl?: string;
}): Promise<SendNotificationResult> {
  const notificationDetails = await getUserNotificationDetails(fid, appFid);
  if (!notificationDetails) {
    return { state: 'no_token' };
  }

  const response = await fetch(notificationDetails.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notificationId: crypto.randomUUID(),
      title,
      body,
      targetUrl: targetUrl || process.env.NEXT_PUBLIC_URL || 'https://mysphere.fun',
      tokens: [notificationDetails.token],
    }),
  });

  const responseJson = await response.json().catch(() => null);
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
}

