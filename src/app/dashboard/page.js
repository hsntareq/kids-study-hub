"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, database } from '../../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, push, set, onValue, get, remove } from 'firebase/database';

const Icons = {
  add: <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>,
  link: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>,
  close: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>,
  search: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Own Kids & Assigned Students State
  const [kids, setKids] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);

  // Modal State
  const [showAddKidModal, setShowAddKidModal] = useState(false);
  const [modalTab, setModalTab] = useState('assign'); // 'assign' or 'create'

  // Tab 1: Assign Existing Student by Email
  const [searchStudentEmail, setSearchStudentEmail] = useState('');
  const [isSearchingEmail, setIsSearchingEmail] = useState(false);
  const [foundStudentData, setFoundStudentData] = useState(null);
  const [searchFeedback, setSearchFeedback] = useState(null); // { type: 'success' | 'error' | 'info', message: '' }

  // Tab 2: Create New Student
  const [newKidName, setNewKidName] = useState('');
  const [newKidGrade, setNewKidGrade] = useState('');
  const [newKidEmail, setNewKidEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusToast, setStatusToast] = useState('');

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
            // Prevent parents/teachers from being redirected away if they used their own email
            if (linkData.parentId !== currentUser.uid) {
              router.push(`/kid/profile?id=${linkData.kidId}&parentId=${linkData.parentId}`);
              return;
            }
          }
        } catch(e) {
          console.error("Error checking student links", e);
        }

        // 2. Fetch kids created by this parent/teacher
        const kidsRef = ref(database, `users/${currentUser.uid}/kids`);
        onValue(kidsRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const kidsList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));
            setKids(kidsList);

            // Keep the studentLinks index updated with metadata
            kidsList.forEach(kid => {
              if (kid.email) {
                const sEmail = kid.email.toLowerCase().replace(/\./g, ',');
                set(ref(database, `studentLinks/${sEmail}`), {
                  parentId: currentUser.uid,
                  kidId: kid.id,
                  name: kid.name,
                  grade: kid.grade || '',
                  email: kid.email,
                  color: kid.color || '#6366f1'
                }).catch(e => console.log('Link sync error:', e));
              }
            });
          } else {
            setKids([]);
          }
        });

        // 3. Fetch students assigned to this user from other parents / classes
        const assignedRef = ref(database, `users/${currentUser.uid}/assignedStudents`);
        onValue(assignedRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const list = Object.keys(data).map(key => ({
              id: data[key].id || key,
              assignedKey: key,
              isAssigned: true,
              ...data[key]
            }));
            setAssignedStudents(list);
          } else {
            setAssignedStudents([]);
          }
        });

        // 4. Fetch pending invites sent to this teacher/parent's email
        if (currentUser.email) {
          const teacherSafeEmail = currentUser.email.toLowerCase().replace(/\./g, ',');
          const invitesRef = ref(database, `teacherInvites/${teacherSafeEmail}`);
          onValue(invitesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
              const invList = Object.keys(data).map(key => ({
                inviteKey: key,
                ...data[key]
              }));
              setPendingInvites(invList);
            } else {
              setPendingInvites([]);
            }
          });
        }
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

  // Search existing student by email
  const handleSearchStudentByEmail = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = searchStudentEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setSearchFeedback({ type: 'error', message: 'Please enter a student email address.' });
      return;
    }

    setIsSearchingEmail(true);
    setFoundStudentData(null);
    setSearchFeedback(null);

    try {
      const safeEmail = cleanEmail.replace(/\./g, ',');
      const linkRef = ref(database, `studentLinks/${safeEmail}`);
      const snap = await get(linkRef);

      if (snap.exists()) {
        const student = snap.val();
        
        // Check if student is already in own kids or already assigned
        const isOwn = kids.some(k => k.id === student.kidId || (k.email && k.email.toLowerCase() === cleanEmail));
        const isAlreadyAssigned = assignedStudents.some(k => k.id === student.kidId || (k.email && k.email.toLowerCase() === cleanEmail));

        if (isOwn) {
          setSearchFeedback({
            type: 'info',
            message: `"${student.name || 'This student'}" is already registered directly in your dashboard as your child.`
          });
          setFoundStudentData({ ...student, alreadyConnected: true });
        } else if (isAlreadyAssigned) {
          setSearchFeedback({
            type: 'info',
            message: `"${student.name || 'This student'}" is already assigned to your dashboard.`
          });
          setFoundStudentData({ ...student, alreadyConnected: true });
        } else {
          setFoundStudentData(student);
          setSearchFeedback({
            type: 'success',
            message: `✓ Student Found: ${student.name || 'Student'} (${student.grade || 'Grade level set'})`
          });
        }
      } else {
        setSearchFeedback({
          type: 'error',
          message: `No existing student found with email "${cleanEmail}". You can create a new profile for this student below.`
        });
      }
    } catch (err) {
      console.error('Error searching student:', err);
      setSearchFeedback({ type: 'error', message: 'Failed to look up student email: ' + err.message });
    } finally {
      setIsSearchingEmail(false);
    }
  };

  // Assign the found student to this user's dashboard
  const handleAssignFoundStudent = async () => {
    if (!foundStudentData || !user) return;
    setIsSubmitting(true);
    try {
      const studentId = foundStudentData.kidId;
      const targetRef = ref(database, `users/${user.uid}/assignedStudents/${studentId}`);
      await set(targetRef, {
        id: studentId,
        parentId: foundStudentData.parentId,
        name: foundStudentData.name || 'Student',
        grade: foundStudentData.grade || '',
        email: foundStudentData.email || searchStudentEmail.trim().toLowerCase(),
        color: foundStudentData.color || '#6366f1',
        assignedAt: Date.now()
      });

      setStatusToast(`🎉 Successfully assigned ${foundStudentData.name || 'Student'} to your dashboard!`);
      setTimeout(() => setStatusToast(''), 4000);
      setShowAddKidModal(false);
      setSearchStudentEmail('');
      setFoundStudentData(null);
      setSearchFeedback(null);
    } catch (err) {
      console.error('Error assigning student:', err);
      alert('Failed to assign student: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Accept a teacher invite
  const handleAcceptInvite = async (invite) => {
    if (!user) return;
    try {
      await set(ref(database, `users/${user.uid}/assignedStudents/${invite.kidId}`), {
        id: invite.kidId,
        parentId: invite.parentId,
        name: invite.name || 'Student',
        grade: invite.grade || '',
        email: invite.email || '',
        color: invite.color || '#6366f1',
        assignedAt: Date.now()
      });

      const teacherSafeEmail = user.email.toLowerCase().replace(/\./g, ',');
      await remove(ref(database, `teacherInvites/${teacherSafeEmail}/${invite.inviteKey}`));
      
      setStatusToast(`✓ Accepted student assignment for ${invite.name}!`);
      setTimeout(() => setStatusToast(''), 3500);
    } catch (err) {
      console.error('Error accepting invite:', err);
      alert('Failed to accept invite: ' + err.message);
    }
  };

  // Dismiss a teacher invite
  const handleDismissInvite = async (invite) => {
    if (!user) return;
    try {
      const teacherSafeEmail = user.email.toLowerCase().replace(/\./g, ',');
      await remove(ref(database, `teacherInvites/${teacherSafeEmail}/${invite.inviteKey}`));
    } catch (err) {
      console.error('Error dismissing invite:', err);
    }
  };

  // Unassign an assigned student from dashboard
  const handleUnassignStudent = async (student, e) => {
    e.stopPropagation();
    const confirmed = window.confirm(`Are you sure you want to remove "${student.name}" from your assigned students list?\n\n(Their original data will remain completely intact with their parent).`);
    if (!confirmed) return;

    try {
      await remove(ref(database, `users/${user.uid}/assignedStudents/${student.assignedKey || student.id}`));
      setStatusToast(`Removed ${student.name} from your dashboard.`);
      setTimeout(() => setStatusToast(''), 3000);
    } catch (err) {
      console.error('Error unassigning student:', err);
      alert('Failed to unassign: ' + err.message);
    }
  };

  // Add brand new student profile
  const handleAddKid = async (e) => {
    e.preventDefault();
    if (!newKidName.trim() || !user) return;
    setIsSubmitting(true);
    const colors = ['var(--accent-secondary)', '#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#8b5cf6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    try {
      const kidsRef = ref(database, `users/${user.uid}/kids`);
      const newKidRef = push(kidsRef);
      const kidData = {
        name: newKidName.trim(),
        grade: newKidGrade.trim(),
        email: newKidEmail.trim().toLowerCase(),
        color: randomColor,
        createdAt: Date.now()
      };
      await set(newKidRef, kidData);

      const sEmail = newKidEmail.trim().toLowerCase().replace(/\./g, ',');
      if (sEmail) {
        await set(ref(database, `studentLinks/${sEmail}`), {
          parentId: user.uid,
          kidId: newKidRef.key,
          name: kidData.name,
          grade: kidData.grade,
          email: kidData.email,
          color: kidData.color
        });
      }
      
      setStatusToast(`🎉 Created student profile for ${kidData.name}!`);
      setTimeout(() => setStatusToast(''), 3500);

      setShowAddKidModal(false);
      setNewKidName('');
      setNewKidGrade('');
      setNewKidEmail('');
    } catch (error) {
      console.error("Error adding kid: ", error);
      alert("Failed to create student: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <main className="view-container"><div className="card">Loading profile...</div></main>;
  }

  const allDisplayStudents = [
    ...kids.map(k => ({ ...k, isAssigned: false })),
    ...assignedStudents
  ];

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '680px', width: '100%', padding: '1.75rem' }}>
        
        {/* Status Toast */}
        {statusToast && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            color: '#34d399',
            padding: '0.65rem 1rem',
            borderRadius: '10px',
            marginBottom: '1.25rem',
            fontSize: '0.88rem',
            fontWeight: 600,
            textAlign: 'left'
          }}>
            {statusToast}
          </div>
        )}

        {/* User Profile Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.75rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: 0 }}>
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                referrerPolicy="no-referrer"
                style={{ width: '68px', height: '68px', borderRadius: '50%', border: '2px solid var(--accent-primary)', objectFit: 'cover', flexShrink: 0 }} 
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
                width: '68px', 
                height: '68px', 
                borderRadius: '50%', 
                background: 'var(--glass-border)', 
                display: user?.photoURL ? 'none' : 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: '1.8rem', 
                fontWeight: 'bold', 
                flexShrink: 0 
              }}
            >
              {user?.displayName?.charAt(0) || 'U'}
            </div>
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.15rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(129, 140, 248, 0.35)', color: '#a5b4fc', textTransform: 'uppercase' }}>
                  Parent & Teacher Portal
                </span>
              </div>
              <h1 style={{ margin: '0 0 0.15rem 0', fontSize: '1.45rem', lineHeight: '1.2' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  {user?.displayName || 'Educator / Parent'}
                </span>
              </h1>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email}
              </p>
            </div>
          </div>
          <button onClick={handleSignOut} title="Sign Out" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.55rem', borderRadius: '8px', flexShrink: 0, cursor: 'pointer' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>

        {/* Pending Teacher / Parent Invites Section */}
        {pendingInvites.length > 0 && (
          <div style={{ marginBottom: '1.75rem', textAlign: 'left' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>📬</span>
              <span>Pending Student Assignment Invitations ({pendingInvites.length}):</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {pendingInvites.map(inv => (
                <div
                  key={inv.inviteKey}
                  style={{
                    background: 'linear-gradient(145deg, rgba(56, 189, 248, 0.1) 0%, rgba(30, 27, 75, 0.4) 100%)',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    borderRadius: '12px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                      {inv.name} <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 500 }}>({inv.grade})</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Assigned by: <strong style={{ color: '#e2e8f0' }}>{inv.invitedBy}</strong> {inv.email ? `• Student: ${inv.email}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => handleAcceptInvite(inv)}
                      style={{
                        padding: '0.35rem 0.85rem',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        background: 'var(--accent-gradient, #6366f1)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Accept & Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissInvite(inv)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.8rem',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Students Section Header with Actions */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ textAlign: 'left' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.15rem 0', color: '#fff' }}>
              Students & Kids Profiles
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {allDisplayStudents.length} {allDisplayStudents.length === 1 ? 'student' : 'students'} active ({kids.length} created, {assignedStudents.length} assigned by email)
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                setModalTab('assign');
                setShowAddKidModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.9rem',
                fontSize: '0.84rem',
                fontWeight: 700,
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Assign an existing student using their email"
            >
              {Icons.link}
              <span>Assign by Email</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModalTab('create');
                setShowAddKidModal(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.45rem 0.9rem',
                fontSize: '0.84rem',
                fontWeight: 600,
                borderRadius: '8px',
                background: 'var(--accent-gradient, #6366f1)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)'
              }}
            >
              {Icons.add}
              <span>Add Student</span>
            </button>
          </div>
        </div>

        {/* Student Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          
          {allDisplayStudents.map(student => {
            const profileHref = student.isAssigned && student.parentId 
              ? `/kid/profile?id=${student.id}&parentId=${student.parentId}`
              : `/kid/profile?id=${student.id}`;

            return (
              <div 
                key={student.assignedKey || student.id} 
                onClick={() => router.push(profileHref)} 
                style={{ 
                  position: 'relative',
                  padding: '1.4rem 0.9rem', 
                  background: student.isAssigned ? 'linear-gradient(145deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.6))' : 'rgba(0,0,0,0.22)', 
                  border: `1px solid ${student.isAssigned ? 'rgba(56, 189, 248, 0.3)' : 'var(--glass-border)'}`, 
                  borderRadius: '16px', 
                  textAlign: 'center', 
                  cursor: 'pointer', 
                  transition: 'all 0.2s ease', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)' 
                }} 
                onMouseOver={(e) => { 
                  e.currentTarget.style.borderColor = student.color || 'var(--accent-primary)'; 
                  e.currentTarget.style.transform = 'translateY(-3px)'; 
                }} 
                onMouseOut={(e) => { 
                  e.currentTarget.style.borderColor = student.isAssigned ? 'rgba(56, 189, 248, 0.3)' : 'var(--glass-border)'; 
                  e.currentTarget.style.transform = 'translateY(0)'; 
                }}
              >
                {/* Role / Assignment Badge */}
                {student.isAssigned && (
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    padding: '0.12rem 0.4rem',
                    borderRadius: '6px',
                    background: 'rgba(56, 189, 248, 0.18)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56, 189, 248, 0.35)'
                  }}>
                    Assigned
                  </div>
                )}

                {/* Unassign Button for assigned students */}
                {student.isAssigned && (
                  <button
                    type="button"
                    onClick={(e) => handleUnassignStudent(student, e)}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f87171',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                    title="Unassign student from dashboard"
                  >
                    ✕
                  </button>
                )}

                {/* Avatar */}
                {student.email ? (
                  <>
                    <img 
                      src={`https://unavatar.io/${student.email}?fallback=false`} 
                      alt={student.name}
                      referrerPolicy="no-referrer"
                      style={{ width: '54px', height: '54px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 0.75rem', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', display: 'block' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextElementSibling) {
                          e.target.nextElementSibling.style.display = 'flex';
                        }
                      }}
                    />
                    <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: student.color || '#6366f1', display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: '0 auto 0.75rem', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                      {(student.name || 'S').charAt(0)}
                    </div>
                  </>
                ) : (
                  <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: student.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', margin: '0 auto 0.75rem', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
                    {(student.name || 'S').charAt(0)}
                  </div>
                )}
                <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {student.name}
                </h3>
                <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {student.grade || 'Student'}
                </p>
                {student.email && (
                  <p style={{ margin: 0, fontSize: '0.72rem', color: '#38bdf8', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {student.email}
                  </p>
                )}
              </div>
            );
          })}
          
          {/* Add / Assign Quick Card */}
          <div 
            onClick={() => {
              setModalTab('assign');
              setShowAddKidModal(true);
            }}
            style={{ 
              padding: '1.4rem 0.9rem', 
              background: 'rgba(255,255,255,0.025)', 
              border: '1px dashed rgba(255,255,255,0.15)', 
              borderRadius: '16px', 
              textAlign: 'center', 
              cursor: 'pointer', 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: '145px', 
              transition: 'all 0.2s ease' 
            }}
            onMouseOver={(e) => { 
              e.currentTarget.style.borderColor = 'var(--accent-primary)'; 
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; 
            }} 
            onMouseOut={(e) => { 
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; 
              e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; 
            }}
          >
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.65rem', color: '#a5b4fc' }}>
              {Icons.add}
            </div>
            <span style={{ fontSize: '0.88rem', color: '#e2e8f0', fontWeight: 600 }}>Assign / Add</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>via email or new</span>
          </div>
          
        </div>

      </div>

      {/* Unified Add / Assign Student Modal */}
      {showAddKidModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '460px', width: '100%', position: 'relative', animation: 'fadeIn 0.2s ease-out', padding: '1.75rem', textAlign: 'left' }}>
            
            <button 
              onClick={() => {
                setShowAddKidModal(false);
                setSearchFeedback(null);
                setFoundStudentData(null);
              }} 
              style={{ position: 'absolute', top: '1.2rem', right: '1.2rem', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {Icons.close}
            </button>
            
            <h2 style={{ margin: '0 0 0.4rem 0', fontSize: '1.35rem', color: '#fff' }}>
              {modalTab === 'assign' ? 'Assign Student by Email' : 'Create New Student Profile'}
            </h2>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {modalTab === 'assign' 
                ? 'Teachers or parents can link and monitor an existing student using their email.'
                : 'Register a new child or student profile under your account.'}
            </p>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '3px', marginBottom: '1.25rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <button
                type="button"
                onClick={() => setModalTab('assign')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: modalTab === 'assign' ? 'var(--accent-gradient, #6366f1)' : 'transparent',
                  color: modalTab === 'assign' ? '#fff' : 'var(--text-secondary)'
                }}
              >
                🔗 Assign by Email
              </button>
              <button
                type="button"
                onClick={() => setModalTab('create')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: modalTab === 'create' ? 'var(--accent-gradient, #6366f1)' : 'transparent',
                  color: modalTab === 'create' ? '#fff' : 'var(--text-secondary)'
                }}
              >
                ➕ Create New
              </button>
            </div>

            {/* TAB 1: ASSIGN EXISTING STUDENT BY EMAIL */}
            {modalTab === 'assign' && (
              <div>
                <form onSubmit={handleSearchStudentByEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0' }}>
                      Student's Email Address:
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="email" 
                        value={searchStudentEmail} 
                        onChange={(e) => {
                          setSearchStudentEmail(e.target.value);
                          setSearchFeedback(null);
                          setFoundStudentData(null);
                        }} 
                        placeholder="e.g. student@school.com" 
                        required 
                        autoFocus 
                        style={{ flex: 1, padding: '0.65rem 0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                      />
                      <button
                        type="submit"
                        disabled={isSearchingEmail}
                        style={{
                          padding: '0.65rem 1rem',
                          background: 'rgba(56, 189, 248, 0.2)',
                          border: '1px solid rgba(56, 189, 248, 0.4)',
                          color: '#38bdf8',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {Icons.search}
                        <span>{isSearchingEmail ? 'Checking...' : 'Find'}</span>
                      </button>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8', display: 'block', marginTop: '0.35rem' }}>
                      Enter the email assigned to the student by their parent, school, or teacher.
                    </span>
                  </div>

                  {/* Feedback Message */}
                  {searchFeedback && (
                    <div style={{
                      padding: '0.7rem 0.9rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      background: searchFeedback.type === 'success' 
                        ? 'rgba(16, 185, 129, 0.15)' 
                        : (searchFeedback.type === 'info' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)'),
                      border: `1px solid ${searchFeedback.type === 'success' 
                        ? 'rgba(16, 185, 129, 0.4)' 
                        : (searchFeedback.type === 'info' ? 'rgba(56, 189, 248, 0.4)' : 'rgba(239, 68, 68, 0.4)')}`,
                      color: searchFeedback.type === 'success' ? '#34d399' : (searchFeedback.type === 'info' ? '#38bdf8' : '#f87171')
                    }}>
                      {searchFeedback.message}
                    </div>
                  )}

                  {/* Found Student Preview Card */}
                  {foundStudentData && (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      borderRadius: '12px',
                      padding: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.85rem'
                    }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: foundStudentData.color || '#6366f1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.4rem',
                        fontWeight: 'bold',
                        color: '#fff',
                        flexShrink: 0
                      }}>
                        {(foundStudentData.name || 'S').charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                          {foundStudentData.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {foundStudentData.grade || 'Student'} • {foundStudentData.email}
                        </div>
                      </div>
                      {!foundStudentData.alreadyConnected && (
                        <button
                          type="button"
                          onClick={handleAssignFoundStudent}
                          disabled={isSubmitting}
                          style={{
                            padding: '0.55rem 1rem',
                            background: 'var(--accent-gradient, #6366f1)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {isSubmitting ? 'Assigning...' : 'Assign to Me'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Quick fallback if not found */}
                  {searchFeedback?.type === 'error' && (
                    <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setNewKidEmail(searchStudentEmail.trim().toLowerCase());
                          setModalTab('create');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#38bdf8',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        Create new student profile with this email →
                      </button>
                    </div>
                  )}
                </form>
              </div>
            )}

            {/* TAB 2: CREATE BRAND NEW STUDENT */}
            {modalTab === 'create' && (
              <form onSubmit={handleAddKid} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Student's Full Name *
                  </label>
                  <input 
                    type="text" 
                    value={newKidName} 
                    onChange={(e) => setNewKidName(e.target.value)} 
                    placeholder="e.g. Alex Rahman" 
                    required 
                    autoFocus 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    Grade / Level *
                  </label>
                  <input 
                    type="text" 
                    value={newKidGrade} 
                    onChange={(e) => setNewKidGrade(e.target.value)} 
                    placeholder="e.g. 5th Grade" 
                    required 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
                    Student Email Address (for Login & Teacher Assignment)
                  </label>
                  <input 
                    type="email" 
                    value={newKidEmail} 
                    onChange={(e) => setNewKidEmail(e.target.value)} 
                    placeholder="e.g. alex@student.edu" 
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '8px', color: '#38bdf8', fontSize: '0.9rem' }}
                  />
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'block', marginTop: '0.35rem' }}>
                    Assigning student email allows them to take exams independently and lets teachers assign them.
                  </span>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddKidModal(false)} 
                    style={{ flex: 1, padding: '0.7rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#cbd5e1', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="primary" 
                    style={{ flex: 1, padding: '0.7rem', fontSize: '0.85rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Student'}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}
    </main>
  );
}
