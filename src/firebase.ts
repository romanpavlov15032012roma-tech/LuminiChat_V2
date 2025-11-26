import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

// Helper to check if config is valid
const isValidConfig = (cfg: any) => {
  return cfg && cfg.apiKey && cfg.apiKey !== "AIzaSyD-YOUR-API-KEY-HERE" && cfg.projectId;
};

let firebaseConfig = null;
let isFirebaseConfigured = false;

// 1. Priority: Check Environment Variables (Vercel / .env)
// IMPORTANT: Vite only exposes variables starting with VITE_
const envConfig = {
  apiKey: (import.meta as any).env.VITE_FIREBASE_API_KEY,
  authDomain: (import.meta as any).env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: (import.meta as any).env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: (import.meta as any).env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: (import.meta as any).env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: (import.meta as any).env.VITE_FIREBASE_APP_ID
};

// Debug log to check if env variables are loaded (checks existence, not values for security)
console.log("Checking Environment Variables:", {
  hasApiKey: !!envConfig.apiKey,
  hasProjectId: !!envConfig.projectId
});

if (envConfig.apiKey && envConfig.projectId) {
  firebaseConfig = envConfig;
  isFirebaseConfigured = true;
  console.log("✅ Firebase configured via Environment Variables (Vercel/Env)");
} else {
  // 2. Fallback: Try to get config from LocalStorage (Manual Setup)
  const storedConfigStr = localStorage.getItem('lumini_firebase_config');
  if (storedConfigStr) {
    try {
      const parsed = JSON.parse(storedConfigStr);
      if (isValidConfig(parsed)) {
        firebaseConfig = parsed;
        isFirebaseConfigured = true;
        console.log("✅ Firebase configured via LocalStorage");
      }
    } catch (e) {
      console.error("Invalid stored firebase config", e);
    }
  }
}

// 3. If no valid config, use a dummy placeholder
if (!firebaseConfig) {
  console.warn("⚠️ No Firebase config found. App will require manual setup.");
  firebaseConfig = {
    apiKey: "AIzaSyD-PLACEHOLDER",
    authDomain: "placeholder.firebaseapp.com",
    projectId: "placeholder",
    storageBucket: "placeholder.appspot.com",
    messagingSenderId: "000000000",
    appId: "1:000000000:web:000000000"
  };
}

let app: any;
let auth: Auth;
let db: Firestore;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
  isFirebaseConfigured = false;
  auth = {} as unknown as Auth;
  db = {} as unknown as Firestore;
}

export { auth, db, isFirebaseConfigured };