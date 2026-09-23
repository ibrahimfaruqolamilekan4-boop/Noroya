import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache()
}, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);

// Validation check as required by skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, '_connection_test_', 'status'));
    console.log("Firebase connection established successfully.");
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration or internet connection.");
    }
  }
}

// Defer the connection probe off the initial page load (it is diagnostic only
// and used to compete with the app bundle for the first network slots).
if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
  window.requestIdleCallback(() => { void testConnection(); });
} else if (typeof window !== "undefined") {
  window.setTimeout(() => { void testConnection(); }, 3000);
}
