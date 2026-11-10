import OneSignal from 'react-onesignal';
import { db } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { getUsersCachedSync, getEmployeesCachedSync } from './dbService';

// Default OneSignal App ID (can be overridden via VITE_ONESIGNAL_APP_ID in .env)
export const ONESIGNAL_APP_ID = ((import.meta as any).env?.VITE_ONESIGNAL_APP_ID as string) || 'd15bc5c9-8ffa-43d4-a3ce-8381301de783';
export const ONESIGNAL_REST_API_KEY = ((import.meta as any).env?.VITE_ONESIGNAL_REST_API_KEY as string) || '';

let isInitialized = false;

// 1. Initialize OneSignal SDK
export async function initOneSignal(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isInitialized) return true;

  // Check origin hostname safety
  const hostname = window.location.hostname;
  const customAppIdProvided = Boolean(((import.meta as any).env?.VITE_ONESIGNAL_APP_ID as string));
  const isAllowedDefaultHost = hostname === '6a698933fd3fcac30ad78b44--jocular-cajeta-efb367.netlify.app';

  // If using default Netlify App ID on any other domain, bypass to avoid SDK origin mismatch errors
  if (!customAppIdProvided && ONESIGNAL_APP_ID === 'd15bc5c9-8ffa-43d4-a3ce-8381301de783' && !isAllowedDefaultHost) {
    console.info('OneSignal push notifications bypassed gracefully on host:', hostname, '(Domain requires custom VITE_ONESIGNAL_APP_ID)');
    return false;
  }

  try {
    let success = true;
    try {
      // OneSignal SDK checks window.location.hostname; if it fails due to origin, catch gracefully
      await new Promise<void>((resolve) => {
        try {
          const initPromise = OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: '/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/' },
            notifyButton: {
              enable: false
            } as any
          });

          if (initPromise && typeof (initPromise as any).then === 'function') {
            (initPromise as any)
              .then(() => resolve())
              .catch((err: any) => {
                console.warn('OneSignal initialization skipped for domain:', hostname, err?.message || err);
                success = false;
                resolve();
              });
          } else {
            resolve();
          }
        } catch (err: any) {
          console.warn('OneSignal sync exception on init:', err?.message || err);
          success = false;
          resolve();
        }
      });
    } catch (syncErr) {
      console.warn('OneSignal init sync exception:', syncErr);
      success = false;
    }

    if (!success) {
      return false;
    }

    isInitialized = true;
    console.log('OneSignal initialized successfully.');

    // Auto prompt permission if needed
    if (OneSignal?.Notifications && OneSignal.Notifications.permission !== true) {
      try {
        await OneSignal.Notifications.requestPermission().catch(() => {});
      } catch (pErr) {
        console.warn('OneSignal permission prompt failed:', pErr);
      }
    }

    return true;
  } catch (err) {
    console.warn('OneSignal initialization bypassed gracefully:', err);
    return false;
  }
}

// 2. Register/Login user in OneSignal and sync Subscription ID to Firestore
export async function registerUserInOneSignal(
  userId: string,
  employeeId?: string,
  role?: string,
  username?: string
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const initialized = await initOneSignal();
    if (!initialized) return null;

    // Login user to tie their external_id to OneSignal
    if (userId && OneSignal?.login) {
      try {
        await OneSignal.login(userId);
      } catch (lErr) {
        console.warn('OneSignal login call failed:', lErr);
      }
    }

    // Set user tags for targeted notification filtering
    const tagsToSet: Record<string, string> = {};
    if (role) tagsToSet.role = role;
    if (employeeId) tagsToSet.employeeId = employeeId;
    if (username) tagsToSet.username = username;

    if (Object.keys(tagsToSet).length > 0 && OneSignal?.User?.addTags) {
      try {
        await OneSignal.User.addTags(tagsToSet);
      } catch (tErr) {
        console.warn('OneSignal addTags failed:', tErr);
      }
    }

    // Prompt for permission if not granted
    if (OneSignal?.Notifications?.requestPermission) {
      try {
        await OneSignal.Notifications.requestPermission();
      } catch (e) {
        console.warn('Permission request error:', e);
      }
    }

    // Get Push Subscription ID
    const subscriptionId = OneSignal?.User?.PushSubscription?.id;
    if (subscriptionId) {
      console.log('OneSignal Subscription ID:', subscriptionId);
      await saveOneSignalSubscriptionToFirestore(userId, subscriptionId, employeeId);
      return subscriptionId;
    }
  } catch (err) {
    console.warn('Error in registerUserInOneSignal:', err);
  }
  return null;
}

// Save subscription ID in Firestore
export async function saveOneSignalSubscriptionToFirestore(
  userId: string,
  subscriptionId: string,
  employeeId?: string
) {
  if (!userId || !subscriptionId) return;

  try {
    const nowIso = new Date().toISOString();

    // Update User Record
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const userData = userSnap.data();
      const existingSubs: string[] = Array.isArray(userData.oneSignalSubscriptionIds)
        ? userData.oneSignalSubscriptionIds
        : [];
      const updatedSubs = Array.from(new Set([...existingSubs, subscriptionId]));

      console.log(`[Firestore Write Log] File: onesignalService.ts | Function: saveOneSignalSubscriptionToFirestore | Collection: users | Reason: حفظ معرف اشتراك الإشعارات للمستخدم`);
      await setDoc(
        userRef,
        {
          oneSignalSubscriptionId: subscriptionId,
          oneSignalSubscriptionIds: updatedSubs,
          oneSignalLastUpdated: nowIso
        },
        { merge: true }
      );
    }

    // Update Employee Record if applicable
    if (employeeId) {
      const empRef = doc(db, 'employees', employeeId);
      const empSnap = await getDoc(empRef);
      if (empSnap.exists()) {
        const empData = empSnap.data();
        const existingSubs: string[] = Array.isArray(empData.oneSignalSubscriptionIds)
          ? empData.oneSignalSubscriptionIds
          : [];
        const updatedSubs = Array.from(new Set([...existingSubs, subscriptionId]));

        console.log(`[Firestore Write Log] File: onesignalService.ts | Function: saveOneSignalSubscriptionToFirestore | Collection: employees | Reason: حفظ معرف اشتراك الإشعارات للموظف`);
        await setDoc(
          empRef,
          {
            oneSignalSubscriptionId: subscriptionId,
            oneSignalSubscriptionIds: updatedSubs,
            oneSignalLastUpdated: nowIso
          },
          { merge: true }
        );
      }
    }
  } catch (err) {
    console.error('Error saving OneSignal subscription to Firestore:', err);
  }
}

// 3. Send Push Notification via OneSignal REST API
export async function sendOneSignalPushNotification(payload: {
  title: string;
  body: string;
  externalUserIds?: string[];
  subscriptionIds?: string[];
  filters?: any[];
  soundType?: 'new_task' | 'completed' | 'accepted' | 'rejected';
  data?: Record<string, string>;
}) {
  const { title, body, externalUserIds, subscriptionIds, filters, soundType = 'new_task', data } = payload;

  const requestBody: any = {
    app_id: ONESIGNAL_APP_ID,
    contents: { ar: body, en: body },
    headings: { ar: title, en: title },
    data: {
      title,
      body,
      soundType,
      ...data
    },
    priority: 10
  };

  if (externalUserIds && externalUserIds.length > 0) {
    requestBody.include_aliases = { external_id: externalUserIds };
    requestBody.target_channel = 'push';
  } else if (subscriptionIds && subscriptionIds.length > 0) {
    requestBody.include_subscription_ids = subscriptionIds;
  } else if (filters && filters.length > 0) {
    requestBody.filters = filters;
  } else {
    // Send to all subscribed users as fallback
    requestBody.included_segments = ['Subscribed Users'];
  }

  // Also log to Firestore outbox
  try {
    const notifRef = doc(collection(db, 'onesignal_outbox'));
    console.log(`[Firestore Write Log] File: onesignalService.ts | Function: sendOneSignalPushNotification | Collection: onesignal_outbox | Reason: تسجيل الإشعار الصادر في صندوق الصادر بناءً على إرسال إشعار للمستخدمين`);
    await setDoc(notifRef, {
      id: notifRef.id,
      title,
      body,
      soundType,
      externalUserIds: externalUserIds || [],
      subscriptionIds: subscriptionIds || [],
      filters: filters || [],
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Error saving to onesignal_outbox:', e);
  }

  // Post to OneSignal REST API
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8'
    };
    if (ONESIGNAL_REST_API_KEY) {
      headers['Authorization'] = `Basic ${ONESIGNAL_REST_API_KEY}`;
    }

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    const resultJson = await res.json();
    console.log('OneSignal notification API response:', resultJson);
  } catch (err) {
    console.warn('Error dispatching OneSignal push notification:', err);
  }
}

// 4. Send OneSignal Push Notification to a Technician by Employee ID
export async function sendOneSignalToEmployee(
  employeeId: string,
  title: string,
  body: string,
  soundType: 'new_task' | 'completed' | 'accepted' | 'rejected' = 'new_task'
) {
  if (!employeeId) return;

  try {
    const subscriptionIds: string[] = [];
    const externalUserIds: string[] = [employeeId];

    // Check in-memory local cache first (0 Firestore Reads)
    const cachedUsers = getUsersCachedSync();
    const cachedEmployees = getEmployeesCachedSync();

    const matchedUsers = cachedUsers.filter(u => u.employeeId === employeeId || u.id === employeeId);
    const matchedEmp = cachedEmployees.find(e => e.id === employeeId);

    if (matchedUsers.length > 0 || matchedEmp) {
      matchedUsers.forEach((u) => {
        if (u.id) externalUserIds.push(u.id);
        if (u.oneSignalSubscriptionId) subscriptionIds.push(u.oneSignalSubscriptionId);
        if (Array.isArray(u.oneSignalSubscriptionIds)) subscriptionIds.push(...u.oneSignalSubscriptionIds);
      });

      if (matchedEmp) {
        if (matchedEmp.oneSignalSubscriptionId) subscriptionIds.push(matchedEmp.oneSignalSubscriptionId);
        if (Array.isArray(matchedEmp.oneSignalSubscriptionIds)) subscriptionIds.push(...matchedEmp.oneSignalSubscriptionIds);
      }
    } else {
      // Fallback only if local in-memory cache is empty
      console.log(`[Firestore Read Log] File: onesignalService.ts | Function: sendOneSignalToEmployee | Reason: جلب احتياطي لمعرفات OneSignal للفني (${employeeId}) لعدم وجودها في الذاكرة`);
      const usersQuery = query(collection(db, 'users'), where('employeeId', '==', employeeId));
      const userDocs = await getDocs(usersQuery);
      userDocs.forEach((d) => {
        const u = d.data();
        if (u.id) externalUserIds.push(u.id);
        if (u.oneSignalSubscriptionId) subscriptionIds.push(u.oneSignalSubscriptionId);
        if (Array.isArray(u.oneSignalSubscriptionIds)) subscriptionIds.push(...u.oneSignalSubscriptionIds);
      });

      const empSnap = await getDoc(doc(db, 'employees', employeeId));
      if (empSnap.exists()) {
        const emp = empSnap.data();
        if (emp.oneSignalSubscriptionId) subscriptionIds.push(emp.oneSignalSubscriptionId);
        if (Array.isArray(emp.oneSignalSubscriptionIds)) subscriptionIds.push(...emp.oneSignalSubscriptionIds);
      }
    }

    const uniqueSubs = Array.from(new Set(subscriptionIds.filter(Boolean)));
    const uniqueExternals = Array.from(new Set(externalUserIds.filter(Boolean)));

    await sendOneSignalPushNotification({
      title,
      body,
      externalUserIds: uniqueExternals,
      subscriptionIds: uniqueSubs.length > 0 ? uniqueSubs : undefined,
      filters: [
        { field: 'tag', key: 'employeeId', relation: '=', value: employeeId }
      ],
      soundType
    });
  } catch (err) {
    console.error('Error in sendOneSignalToEmployee:', err);
  }
}

// 5. Send OneSignal Push Notification to All Managers and Owners
export async function sendOneSignalToAdmins(
  title: string,
  body: string,
  soundType: 'new_task' | 'completed' | 'accepted' | 'rejected' = 'completed'
) {
  try {
    const subscriptionIds: string[] = [];
    const externalUserIds: string[] = [];

    // Check in-memory local cache first (0 Firestore Reads)
    const cachedUsers = getUsersCachedSync();
    const adminUsers = cachedUsers.filter(u => u.role === 'owner' || u.role === 'manager');

    if (adminUsers.length > 0) {
      adminUsers.forEach((u) => {
        if (u.id) externalUserIds.push(u.id);
        if (u.oneSignalSubscriptionId) subscriptionIds.push(u.oneSignalSubscriptionId);
        if (Array.isArray(u.oneSignalSubscriptionIds)) subscriptionIds.push(...u.oneSignalSubscriptionIds);
      });
    } else {
      // Fallback only if local in-memory cache is empty
      console.log(`[Firestore Read Log] File: onesignalService.ts | Function: sendOneSignalToAdmins | Reason: جلب احتياطي لمعرفات OneSignal للمسؤولين لعدم وجودها في الذاكرة`);
      const adminQuery = query(collection(db, 'users'), where('role', 'in', ['owner', 'manager']));
      const adminDocs = await getDocs(adminQuery);
      adminDocs.forEach((d) => {
        const u = d.data();
        if (u.id) externalUserIds.push(u.id);
        if (u.oneSignalSubscriptionId) subscriptionIds.push(u.oneSignalSubscriptionId);
        if (Array.isArray(u.oneSignalSubscriptionIds)) subscriptionIds.push(...u.oneSignalSubscriptionIds);
      });
    }

    const uniqueSubs = Array.from(new Set(subscriptionIds.filter(Boolean)));
    const uniqueExternals = Array.from(new Set(externalUserIds.filter(Boolean)));

    await sendOneSignalPushNotification({
      title,
      body,
      externalUserIds: uniqueExternals,
      subscriptionIds: uniqueSubs.length > 0 ? uniqueSubs : undefined,
      filters: [
        { field: 'tag', key: 'role', relation: '=', value: 'owner' },
        { operator: 'OR' },
        { field: 'tag', key: 'role', relation: '=', value: 'manager' }
      ],
      soundType
    });
  } catch (err) {
    console.error('Error in sendOneSignalToAdmins:', err);
  }
}

// 6. Setup Foreground OneSignal Notification Listener
export function setupOneSignalForegroundListener(
  onNotificationReceived: (title: string, body: string, soundType: 'new_task' | 'completed' | 'accepted' | 'rejected') => void
) {
  initOneSignal().then((initialized) => {
    if (!initialized) return;
    try {
      if (OneSignal?.Notifications?.addEventListener) {
        OneSignal.Notifications.addEventListener('foregroundWillDisplay', (event: any) => {
          console.log('OneSignal foreground notification received:', event);
          const notification = event?.getNotification ? event.getNotification() : (event?.notification || {});
          const title = notification?.title || 'إشعار جديد من FutureX';
          const body = notification?.body || '';
          const soundType = (notification?.additionalData?.soundType as any) || 'new_task';

          onNotificationReceived(title, body, soundType);
        });
      }
    } catch (e) {
      console.warn('Error adding foregroundWillDisplay listener:', e);
    }
  }).catch((err) => {
    console.warn('setupOneSignalForegroundListener failed:', err);
  });
}
