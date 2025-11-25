import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import type { Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

// Helper to check if config is valid
const isValidConfig = (cfg: any) => {
  return cfg && cfg.apiKey && cfg.apiKey !== "AIzaSyD-YOUR-API-KEY-HERE" && cfg.projectId;
};

// 1. Try to get config from LocalStorage
const storedConfigStr = localStorage.getItem('lumini_firebase_config');
let firebaseConfig = null;
let isFirebaseConfigured = false;

if (storedConfigStr) {
  try {
    const parsed = JSON.parse(storedConfigStr);
    if (isValidConfig(parsed)) {
      firebaseConfig = parsed;
      isFirebaseConfigured = true;
    }
  } catch (e) {
    console.error("Invalid stored firebase config", e);
  }
}

// 2. If no valid config, use a dummy placeholder to prevent import crashes,
// but keep isFirebaseConfigured = false so App.tsx knows to show the Setup screen.
if (!firebaseConfig) {
  firebaseConfig = {
    apiKey: "AIzaSyD-PLACEHOLDER", // Invalid key
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

// Initialize safely
try {
  // Use named import initializeApp
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization failed:", error);
  // Re-throw or handle in UI. 
  // Since we check isFirebaseConfigured in App.tsx, we can safely ignore specific init errors here 
  // as the UI will redirect to setup if keys are bad.
  isFirebaseConfigured = false;
  // We cast to any to satisfy TS strictness for the export, 
  // but App.tsx guards against using these if !isFirebaseConfigured
  auth = {} as unknown as Auth;
  db = {} as unknown as Firestore;
}

export { auth, db, isFirebaseConfigured };