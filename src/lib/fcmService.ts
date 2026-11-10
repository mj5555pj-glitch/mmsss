import { db, getToken, onMessage, initMessaging } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getUsersCachedSync, getEmployeesCachedSync } from './dbService';

// 1. Request Notification Permission, Register Service Worker, & Get FCM Token
export async function requestFcmPermissionAndGetToken(userId?: string, employeeId?: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    if (!('Notification' in window)) {
      console.warn('System notifications are not supported in this browser.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Notification permission was not granted by the user.');
      return null;
    }

    // Register Service Worker
    let swReg: ServiceWorkerRegistration | undefined = undefined;
    if ('serviceWorker' in navigator) {
      try {
        swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
      } catch (swErr) {
        console.warn('Failed to register /firebase-messaging-sw.js:', swErr);
      }
    }

    const msgInstance = await initMessaging();
    if (!msgInstance) {
      console.warn('FCM Messaging instance unavailable.');
      return null;
    }

    const token = await getToken(msgInstance, {
      serviceWorkerRegistration: swReg
    });

    if (token) {
      console.log('FCM Token generated:', token);
      if (userId) {
        await saveFcmTokenToFirestore(userId, token, employeeId);
      }
      return token;
    }
  } catch (err) {
    console.error('Error requesting FCM token:', err);
  }
  return null;
}

// 2. Save FCM Token to Firestore in user and employee records
export async function saveFcmTokenToFirestore(userId: string, token: string, employeeId?: string) {
  if (!userId || !token) return;

  try {
    const nowIso = new Date().toISOString();

    // Update user record
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const existingTokens: string[] = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : [];
      const updatedTokens = Array.from(new Set([...existingTokens, token]));

      console.log(`[Firestore Write Log] File: fcmService.ts | Function: saveFcmTokenToFirestore | Collection: users | Reason: حفظ رمز FCM لإشعارات المستخدم`);
      await setDoc(userRef, {
        fcmToken: token,
        fcmTokens: updatedTokens,
        fcmTokenLastUpdated: nowIso
      }, { merge: true });
    }

    // If linked employee, update employee record too
    if (employeeId) {
      const empRef = doc(db, 'employees', employeeId);
      const empSnap = await getDoc(empRef);
      if (empSnap.exists()) {
        const empData = empSnap.data();
        const existingTokens: string[] = Array.isArray(empData.fcmTokens) ? empData.fcmTokens : [];
        const updatedTokens = Array.from(new Set([...existingTokens, token]));

        console.log(`[Firestore Write Log] File: fcmService.ts | Function: saveFcmTokenToFirestore | Collection: employees | Reason: حفظ رمز FCM لإشعارات الموظف`);
        await setDoc(empRef, {
          fcmToken: token,
          fcmTokens: updatedTokens,
          fcmTokenLastUpdated: nowIso
        }, { merge: true });
      }
    }
  } catch (err) {
    console.error('Error saving FCM Token to Firestore:', err);
  }
}

// 3. Dispatch FCM Push Payload to target FCM Tokens
export async function sendFcmPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  soundType: 'new_task' | 'completed' | 'accepted' | 'rejected' = 'new_task',
  dataPayload: Record<string, string> = {}
) {
  if (!tokens || tokens.length === 0) return;

  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) return;

  // Record notification in Firestore outbox
  try {
    const notifRef = doc(collection(db, 'fcm_outbox'));
    console.log(`[Firestore Write Log] File: fcmService.ts | Function: sendFcmPushToTokens | Collection: fcm_outbox | Reason: تسجيل إشعار FCM في صندوق الصادر عند إرسال إشعار للمستخدمين`);
    await setDoc(notifRef, {
      id: notifRef.id,
      tokens: uniqueTokens,
      title,
      body,
      soundType,
      data: dataPayload,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Error saving to fcm_outbox:', e);
  }

  // Send Push to FCM API endpoint for background delivery
  for (const token of uniqueTokens) {
    try {
      await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'key=AIzaSyAIik7ugJKOJevFzR_Pv4KAlkOf0HD8Ldk'
        },
        body: JSON.stringify({
          to: token,
          notification: {
            title,
            body,
            icon: '/manifest.json',
            sound: 'default'
          },
          data: {
            title,
            body,
            soundType,
            ...dataPayload
          },
          priority: 'high'
        })
      });
    } catch (err) {
      console.warn(`Error sending FCM push to token (${token}):`, err);
    }
  }
}

// 4. Send Push Notification to a Technician by employeeId
export async function sendPushNotificationToEmployee(
  employeeId: string,
  title: string,
  body: string,
  soundType: 'new_task' | 'completed' | 'accepted' | 'rejected' = 'new_task'
) {
  if (!employeeId) return;

  try {
    const tokens: string[] = [];

    // Check in-memory local cache first (0 Firestore Reads)
    const cachedUsers = getUsersCachedSync();
    const cachedEmployees = getEmployeesCachedSync();

    const matchedUsers = cachedUsers.filter(u => u.employeeId === employeeId || u.id === employeeId);
    const matchedEmp = cachedEmployees.find(e => e.id === employeeId);

    if (matchedUsers.length > 0 || matchedEmp) {
      matchedUsers.forEach(u => {
        if (u.fcmToken) tokens.push(u.fcmToken);
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
      });

      if (matchedEmp) {
        if (matchedEmp.fcmToken) tokens.push(matchedEmp.fcmToken);
        if (Array.isArray(matchedEmp.fcmTokens)) tokens.push(...matchedEmp.fcmTokens);
      }
    } else {
      // Fallback only if local in-memory cache is empty
      console.log(`[Firestore Read Log] File: fcmService.ts | Function: sendPushNotificationToEmployee | Reason: جلب احتياطي لتوكنات FCM للفني (${employeeId}) لعدم وجودها في الذاكرة`);
      const usersQuery = query(collection(db, 'users'), where('employeeId', '==', employeeId));
      const userDocs = await getDocs(usersQuery);
      userDocs.forEach(d => {
        const u = d.data();
        if (u.fcmToken) tokens.push(u.fcmToken);
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
      });

      const empSnap = await getDoc(doc(db, 'employees', employeeId));
      if (empSnap.exists()) {
        const emp = empSnap.data();
        if (emp.fcmToken) tokens.push(emp.fcmToken);
        if (Array.isArray(emp.fcmTokens)) tokens.push(...emp.fcmTokens);
      }
    }

    await sendFcmPushToTokens(tokens, title, body, soundType);
  } catch (err) {
    console.error('Error in sendPushNotificationToEmployee:', err);
  }
}

// 5. Send Push Notification to All Managers and Owners
export async function sendPushNotificationToAdmins(
  title: string,
  body: string,
  soundType: 'new_task' | 'completed' | 'accepted' | 'rejected' = 'completed'
) {
  try {
    const tokens: string[] = [];

    // Check in-memory local cache first (0 Firestore Reads)
    const cachedUsers = getUsersCachedSync();
    const adminUsers = cachedUsers.filter(u => u.role === 'owner' || u.role === 'manager');

    if (adminUsers.length > 0) {
      adminUsers.forEach(u => {
        if (u.fcmToken) tokens.push(u.fcmToken);
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
      });
    } else {
      // Fallback only if local in-memory cache is empty
      console.log(`[Firestore Read Log] File: fcmService.ts | Function: sendPushNotificationToAdmins | Reason: جلب احتياطي لتوكنات FCM للمسؤولين لعدم وجودها في الذاكرة`);
      const ownersQuery = query(collection(db, 'users'), where('role', 'in', ['owner', 'manager']));
      const adminDocs = await getDocs(ownersQuery);
      adminDocs.forEach(d => {
        const u = d.data();
        if (u.fcmToken) tokens.push(u.fcmToken);
        if (Array.isArray(u.fcmTokens)) tokens.push(...u.fcmTokens);
      });
    }

    await sendFcmPushToTokens(tokens, title, body, soundType);
  } catch (err) {
    console.error('Error in sendPushNotificationToAdmins:', err);
  }
}

// 6. Setup Foreground FCM Message Listener
export function setupForegroundFcmListener(
  onNotificationReceived: (title: string, body: string, soundType: 'new_task' | 'completed' | 'accepted' | 'rejected') => void
) {
  initMessaging().then((msg) => {
    if (!msg) return;
    onMessage(msg, (payload) => {
      console.log('Received foreground FCM message:', payload);
      const title = payload.notification?.title || payload.data?.title || 'إشعار جديد من FutureX';
      const body = payload.notification?.body || payload.data?.body || '';
      const soundType = (payload.data?.soundType as any) || 'new_task';
      onNotificationReceived(title, body, soundType);
    });
  }).catch(err => console.warn('Error setting up foreground FCM listener:', err));
}
