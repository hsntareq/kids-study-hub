import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getDatabase } from "firebase/database";

// TODO: Replace this with your actual Firebase project configuration
// If you are using the Firebase Emulator, you can use dummy values here.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const database = getDatabase(app);

// Uncomment the following line if you want to use the Local Auth Emulator
// import { connectAuthEmulator } from "firebase/auth";
// connectAuthEmulator(auth, "http://127.0.0.1:9099");

export { auth, googleProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, database };
