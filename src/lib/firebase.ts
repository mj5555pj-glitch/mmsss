import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId || '(default)');

let messaging: Messaging | null = null;

export const initMessaging = async (): Promise<Messaging | null> => {
  try {
    if (typeof window !== 'undefined' && await isSupported()) {
      if (!messaging) {
        messaging = getMessaging(app);
      }
      return messaging;
    }
  } catch (err) {
    console.warn('FCM isSupported check failed:', err);
  }
  return null;
};

export { app, db, messaging, getMessaging, getToken, onMessage };



