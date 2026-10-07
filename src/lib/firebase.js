import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase } from "firebase/database";

// TODO: Replace this with your actual Firebase project configuration
// If you are using the Firebase Emulator, you can use dummy values here.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "dummy_api_key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "dummy.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "dummy_project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "dummy.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-ABCDEF",
  databaseURL: (process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL && process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL !== "undefined") 
    ? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL 
    : "https://dummy-default-rtdb.firebaseio.com"
};

let app;
let auth;
let googleProvider;
let database;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  database = getDatabase(app);
} catch (error) {
  console.warn("Firebase initialization failed. If this is a static build, this warning can be ignored. Error:", error.message);
}

// Uncomment the following line if you want to use the Local Auth Emulator
// import { connectAuthEmulator } from "firebase/auth";
// connectAuthEmulator(auth, "http://127.0.0.1:9099");

export { auth, googleProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, database };
