import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager 
} from 'firebase/firestore';
import { getMessaging, getToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import firebaseConfig from '../../firebase-applet-config.json';

const metaEnv = (import.meta as any)?.env || {};

const activeConfig = {
  projectId: (metaEnv.VITE_FIREBASE_PROJECT_ID as string) || firebaseConfig?.projectId || 'winged-antler-3n50x',
  appId: (metaEnv.VITE_FIREBASE_APP_ID as string) || firebaseConfig?.appId || '1:293424127969:web:3f7bd7aaba16550772bca0',
  apiKey: (metaEnv.VITE_FIREBASE_API_KEY as string) || firebaseConfig?.apiKey || 'AIzaSyAIik7ugJKOJevFzR_Pv4KAlkOf0HD8Ldk',
  authDomain: (metaEnv.VITE_FIREBASE_AUTH_DOMAIN as string) || firebaseConfig?.authDomain || 'winged-antler-3n50x.firebaseapp.com',
  firestoreDatabaseId: (metaEnv.VITE_FIREBASE_DATABASE_ID as string) || firebaseConfig?.firestoreDatabaseId || 'ai-studio-futurex-0d8e2faa-0d9e-496f-9665-e2ea1deff8a9',
  storageBucket: (metaEnv.VITE_FIREBASE_STORAGE_BUCKET as string) || firebaseConfig?.storageBucket || 'winged-antler-3n50x.firebasestorage.app',
  messagingSenderId: (metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID as string) || firebaseConfig?.messagingSenderId || '293424127969',
};

const app = initializeApp(activeConfig);

let db: ReturnType<typeof initializeFirestore>;
try {
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, activeConfig.firestoreDatabaseId || '(default)');
} catch (cacheErr) {
  console.warn('Persistent local cache init failed, falling back to memory/simple store:', cacheErr);
  db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
  }, activeConfig.firestoreDatabaseId || '(default)');
}

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



