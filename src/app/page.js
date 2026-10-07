"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, googleProvider, signInWithPopup, signInWithEmailAndPassword, database } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';

const Icons = {
  google: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
};

export default function App() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          await saveUserProfile(user);
        } catch (e) {
          console.error("Failed to save user profile:", e);
        }
        router.push('/dashboard');
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const saveUserProfile = async (user) => {
    const userRef = ref(database, `users/${user.uid}/profile`);
    const snapshot = await get(userRef);
    if (!snapshot.exists()) {
      await set(userRef, {
        displayName: user.displayName || 'Parent',
        email: user.email,
        photoURL: user.photoURL || null,
        createdAt: Date.now(),
        lastLogin: Date.now()
      });
    } else {
      await set(ref(database, `users/${user.uid}/profile/lastLogin`), Date.now());
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await saveUserProfile(result.user);
      router.push('/dashboard');
    } catch (error) {
      console.error("Email Auth Error:", error);
      alert("Sign-In failed. Please check your credentials.");
    }
  };

  const handleGoogleAuth = async (e) => {
    e.preventDefault();
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await saveUserProfile(result.user);
      console.log("Successfully logged in as:", result.user.displayName);
      router.push('/dashboard');
    } catch (error) {
      console.error("Google Auth Error:", error);
      if (error.code === 'auth/popup-blocked') {
        alert("Popup blocked by your browser! Attempting redirect instead...");
        try {
          // Fallback for adblockers and strict browsers
          const { signInWithRedirect } = require('firebase/auth');
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectError) {
          console.error("Redirect Auth Error:", redirectError);
        }
      } else {
        alert("Google Sign-In failed. Please check the console for details.");
      }
    }
  };

  if (loading) {
    return <main className="view-container"><div className="card">Loading...</div></main>;
  }

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '360px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <img src="/logo.png" alt="Study Hub Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '1.6rem', marginBottom: '0' }}>Study Hub</h1>
        </div>
        <p style={{ marginBottom: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Welcome back! Please enter your details.</p>
        
        <form onSubmit={handleEmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'left' }}>
          <div>
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto', padding: 0 }} /> Remember me
            </label>
            <a href="#" style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', textDecoration: 'none' }}>Forgot password?</a>
          </div>
          
          <button type="submit" className="primary" style={{ width: '100%', padding: '0.6rem', fontSize: '0.95rem', marginTop: '0.25rem' }}>
            Sign In
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            <span style={{ padding: '0 1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
          </div>

          <button type="button" onClick={handleGoogleAuth} style={{ width: '100%', padding: '0.6rem', background: '#ffffff', color: '#374151', fontWeight: 500, display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
            {Icons.google} Sign in with Google
          </button>
        </form>
        
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', marginBottom: 0 }}>
          Don't have an account? <Link href="/signup" style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>Sign up</Link>
        </p>
      </div>
    </main>
  );
}
