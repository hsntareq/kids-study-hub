"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, database } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, push, set, onValue, get } from 'firebase/database';

const Icons = {
  add: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  close: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Kids Profile State
  const [kids, setKids] = useState([]);
  const [showAddKidModal, setShowAddKidModal] = useState(false);
  const [newKidName, setNewKidName] = useState('');
  const [newKidGrade, setNewKidGrade] = useState('');
  const [newKidEmail, setNewKidEmail] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        // 1. Check if this logged in user is actually a STUDENT
        const safeEmail = (currentUser.email || '').toLowerCase().replace(/\./g, ',');
        const linkRef = ref(database, `studentLinks/${safeEmail}`);
        
        try {
          const snapshot = await get(linkRef);
          if (snapshot.exists()) {
            const linkData = snapshot.val();
            // Prevent parents from being trapped if they used their own email
            if (linkData.parentId !== currentUser.uid) {
              // User is a student! Redirect them to their student hub
              router.push(`/kid/${linkData.kidId}?parentId=${linkData.parentId}`);
              return;
            }
          }
        } catch(e) {
          console.error("Error checking student links", e);
        }

        // 2. Fetch kids from realtime DB (Parent Mode)
        const kidsRef = ref(database, `users/${currentUser.uid}/kids`);
        onValue(kidsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const kidsList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));
            setKids(kidsList);

            // Keep the studentLinks index updated
            kidsList.forEach(kid => {
              if (kid.email) {
                const sEmail = kid.email.toLowerCase().replace(/\./g, ',');
                set(ref(database, `studentLinks/${sEmail}`), {
                  parentId: currentUser.uid,
                  kidId: kid.id
                }).catch(e => console.log('Link sync error:', e));
              }
            });
          } else {
            setKids([]);
          }
        });
      } else {
        router.push('/');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Error signing out', error);
    }
  };

  const handleAddKid = async (e) => {
    e.preventDefault();
    if (!newKidName || !user) return;
    const colors = ['var(--accent-secondary)', '#10b981', '#f59e0b', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      const kidsRef = ref(database, `users/${user.uid}/kids`);
      const newKidRef = push(kidsRef);
      await set(newKidRef, {
        name: newKidName,
        grade: newKidGrade,
        email: newKidEmail,
        color: randomColor,
        createdAt: Date.now()
      });

      const sEmail = newKidEmail.trim().toLowerCase().replace(/\./g, ',');
      if (sEmail) {
        await set(ref(database, `studentLinks/${sEmail}`), {
          parentId: user.uid,
          kidId: newKidRef.key
        });
      }
      
      setShowAddKidModal(false);
      setNewKidName('');
      setNewKidGrade('');
      setNewKidEmail('');
    } catch (error) {
      console.error("Error adding kid: ", error);
      alert("Failed to add kid. Please try again.");
    }
  };

  if (loading) {
    return <main className="view-container"><div className="card">Loading profile...</div></main>;
  }

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '600px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', minWidth: 0 }}>
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                referrerPolicy="no-referrer"
                style={{ width: '70px', height: '70px', borderRadius: '50%', border: '2px solid var(--accent-primary)', objectFit: 'cover', flexShrink: 0 }} 
                onError={(e) => {
                  e.target.onerror = null; 
                  e.target.style.display = 'none';
                  if (e.target.nextElementSibling) {
                    e.target.nextElementSibling.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div 
              style={{ 
                width: '70px', 
                height: '70px', 
                borderRadius: '50%', 
                background: 'var(--glass-border)', 
                display: user?.photoURL ? 'none' : 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '2rem', 
                fontWeight: 'bold', 
                flexShrink: 0 
              }}
            >
              {user?.displayName?.charAt(0) || 'K'}
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <h1 style={{ marginBottom: '0.25rem', fontSize: '1.6rem', lineHeight: '1.2' }}>
                <span style={{ display: 'block' }}>Welcome,</span>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.displayName || 'Parent'}!</span>
              </h1>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
            </div>
          </div>
          <button onClick={handleSignOut} title="Sign Out" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.5rem', flexShrink: 0 }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>

        {/* Kids Profiles Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ textAlign: 'left', fontSize: '1.3rem', marginBottom: '1rem' }}>Kids Profiles</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
            
            {kids.map(kid => (
              <div key={kid.id} onClick={() => router.push(`/kid/${kid.name.toLowerCase()}`)} style={{ padding: '1.5rem 1rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = kid.color; e.currentTarget.style.transform = 'translateY(-3px)'; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                {kid.email ? (
                  <>
                    <img 
                      src={`https://unavatar.io/${kid.email}?fallback=false`} 
                      alt={kid.name}
                      referrerPolicy="no-referrer"
                      style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', display: 'block' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextElementSibling) {
                          e.target.nextElementSibling.style.display = 'flex';
                        }
                      }}
                    />
                    <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: kid.color, display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: '0 auto 0.75rem', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                      {kid.name.charAt(0)}
                    </div>
                  </>
                ) : (
                  <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: kid.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: '0 auto 0.75rem', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                    {kid.name.charAt(0)}
                  </div>
                )}
                <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.1rem' }}>{kid.name}</h3>
                <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{kid.grade}</p>
                {kid.email && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis' }}>{kid.email}</p>}
              </div>
            ))}
            
            {/* Add Kid Card */}
            <div 
              onClick={() => setShowAddKidModal(true)}
              style={{ padding: '1.5rem 1rem', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--glass-border)', borderRadius: '16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '140px', transition: 'all 0.2s ease' }}
              onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }} 
              onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                {Icons.add}
              </div>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Add Kid</span>
            </div>
            
          </div>
        </div>

      </div>

      {/* Add Kid Modal Overlay */}
      {showAddKidModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', position: 'relative', animation: 'fadeIn 0.2s ease-out' }}>
            <button 
              onClick={() => setShowAddKidModal(false)} 
              style={{ position: 'absolute', top: '1.2rem', right: '1.2rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {Icons.close}
            </button>
            
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.4rem', textAlign: 'left' }}>Add Kid Profile</h2>
            
            <form onSubmit={handleAddKid} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Kid's Name</label>
                <input 
                  type="text" 
                  value={newKidName} 
                  onChange={(e) => setNewKidName(e.target.value)} 
                  placeholder="e.g. Alex" 
                  required 
                  autoFocus 
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Grade / Level</label>
                <input 
                  type="text" 
                  value={newKidGrade} 
                  onChange={(e) => setNewKidGrade(e.target.value)} 
                  placeholder="e.g. 5th Grade" 
                  required 
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Email Address</label>
                <input 
                  type="email" 
                  value={newKidEmail} 
                  onChange={(e) => setNewKidEmail(e.target.value)} 
                  placeholder="e.g. alex@example.com" 
                  style={{ width: '100%' }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddKidModal(false)} style={{ flex: 1, padding: '0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)' }}>Cancel</button>
                <button type="submit" className="primary" style={{ flex: 1, padding: '0.8rem' }}>Add Kid</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
