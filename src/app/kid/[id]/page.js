"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, push, set, onValue, remove } from 'firebase/database';
import Link from 'next/link';

export default function KidProfile() {
  const router = useRouter();
  const params = useParams();
  const [loading, setLoading] = useState(true);
  const [kid, setKid] = useState(null);
  const [user, setUser] = useState(null);
  
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState('subject'); // 'subject', 'exam', 'chapter'
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [newPdfPage, setNewPdfPage] = useState('');
  const [editPdfPage, setEditPdfPage] = useState('');
  const [settingsSubject, setSettingsSubject] = useState(null);
  const [subjectBookUrl, setSubjectBookUrl] = useState('');
  
  const [settingsExamInfo, setSettingsExamInfo] = useState(null);
  const [examMarkDistribution, setExamMarkDistribution] = useState('');

  const toggleSubject = (subjectId) => {
    setExpandedSubjects(prev => ({ ...prev, [subjectId]: !prev[subjectId] }));
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const kidsRef = ref(database, `users/${currentUser.uid}/kids`);
          const snapshot = await get(kidsRef);
          if (snapshot.exists()) {
            const data = snapshot.val();
            const kidsList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));
            const foundKid = kidsList.find(k => k.name.toLowerCase() === params.id.toLowerCase());
            
            if (foundKid) {
              setKid(foundKid);
              setUser(currentUser);
              
              const subjectsRef = ref(database, `users/${currentUser.uid}/kids/${foundKid.id}/subjects`);
              onValue(subjectsRef, (snap) => {
                const subData = snap.val();
                if (subData) {
                  setSubjects(Object.keys(subData).map(k => ({ id: k, ...subData[k] })));
                  setSelectedSubjectId(prev => {
                     if (!prev && Object.keys(subData).length > 0) return Object.keys(subData)[0];
                     return prev;
                  });
                } else {
                  setSubjects([]);
                }
              });

              const examsRef = ref(database, `users/${currentUser.uid}/kids/${foundKid.id}/exams`);
              onValue(examsRef, (snap) => {
                const exData = snap.val();
                if (exData) {
                  setExams(Object.keys(exData).map(k => ({ id: k, ...exData[k] })));
                  setSelectedExamId(prev => {
                     if (!prev && Object.keys(exData).length > 0) return Object.keys(exData)[0];
                     return prev;
                  });
                } else {
                  setExams([]);
                }
              });
            }
          }
        } catch (error) {
          console.error("Error fetching kid data:", error);
        }
      } else {
        router.push('/');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, params.id]);

  const handleGlobalAdd = async (e) => {
    e.preventDefault();
    if (!newTitle || !user || !kid) return;

    if (addType === 'subject') {
      const sRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects`);
      await set(push(sRef), { title: newTitle });
    } else if (addType === 'exam') {
      const eRef = ref(database, `users/${user.uid}/kids/${kid.id}/exams`);
      await set(push(eRef), { title: newTitle });
    } else if (addType === 'chapter') {
      if (!selectedSubjectId || !selectedExamId) return;
      const cRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${selectedSubjectId}/chapters/${selectedExamId}`);
      await set(push(cRef), { title: newTitle, pdfPage: newPdfPage });
    }
    
    setNewTitle('');
    setNewPdfPage('');
  };

  const handleEdit = (item) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    if (item.pdfPage !== undefined) setEditPdfPage(item.pdfPage);
    else setEditPdfPage('');
  };

  const handleSaveEdit = async (id, type, parentSubjectId = null, parentExamId = null) => {
    if (!editTitle.trim() || !user || !kid) return;
    
    if (type === 'subject') {
      await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${id}/title`), editTitle);
    } else if (type === 'exam') {
      await set(ref(database, `users/${user.uid}/kids/${kid.id}/exams/${id}/title`), editTitle);
    } else if (type === 'chapter') {
      await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}/title`), editTitle);
      await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}/pdfPage`), editPdfPage);
    }
    
    setEditingId(null);
    setEditTitle('');
    setEditPdfPage('');
  };

  const handleSaveSubjectSettings = async () => {
    if (!settingsSubject || !user || !kid) return;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${settingsSubject.id}/bookUrl`), subjectBookUrl);
    setSettingsSubject(null);
    setSubjectBookUrl('');
  };

  const handleSaveExamSettings = async () => {
    if (!settingsExamInfo || !user || !kid) return;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${settingsExamInfo.subjectId}/examSettings/${settingsExamInfo.examId}/markDistribution`), examMarkDistribution);
    setSettingsExamInfo(null);
    setExamMarkDistribution('');
  };

  const handleDelete = async (id, type, parentSubjectId = null, parentExamId = null) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
    let path = '';
    if (type === 'subject') path = `users/${user.uid}/kids/${kid.id}/subjects/${id}`;
    else if (type === 'exam') path = `users/${user.uid}/kids/${kid.id}/exams/${id}`;
    else if (type === 'chapter') path = `users/${user.uid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}`;
    
    await remove(ref(database, path));
  };

  if (loading) {
    return <main className="view-container"><div className="card">Loading profile...</div></main>;
  }

  if (!kid) {
    return (
      <main className="view-container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Kid not found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>We couldn't find a profile for "{params.id}".</p>
          <Link href="/dashboard" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>← Back to Dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '800px', width: '100%', padding: '2.5rem' }}>
        
        {/* Header / Back Navigation */}
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/dashboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', transition: 'color 0.2s' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Back to Dashboard
          </Link>
        </div>

        {/* Profile Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '3rem', paddingBottom: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
          {kid.email ? (
            <>
              <img 
                src={`https://unavatar.io/${kid.email}?fallback=false`} 
                alt={kid.name}
                referrerPolicy="no-referrer"
                style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, display: 'block' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextElementSibling) {
                    e.target.nextElementSibling.style.display = 'flex';
                  }
                }}
              />
              <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: kid.color, display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 'bold', color: '#fff', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, flexShrink: 0 }}>
                {kid.name.charAt(0)}
              </div>
            </>
          ) : (
            <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: kid.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3.5rem', fontWeight: 'bold', color: '#fff', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, flexShrink: 0 }}>
              {kid.name.charAt(0)}
            </div>
          )}
          
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', lineHeight: 1.1 }}>{kid.name}</h1>
            <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>{kid.grade}</p>
            {kid.email && <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0, opacity: 0.8 }}>{kid.email}</p>}
          </div>
        </div>

        {/* Subjects, Exams, and Syllabus Section */}
        <div style={{ marginTop: '3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ textAlign: 'left', fontSize: '1.5rem', margin: 0 }}>Subjects</h2>
            <button onClick={() => { setNewTitle(''); setAddType('subject'); setShowAddModal(true); }} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {subjects.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>No subjects added yet. Click the + icon to add one.</p>}
            {subjects.map(subject => (
              <div key={subject.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '16px', overflow: 'hidden', textAlign: 'left' }}>
                <div onClick={() => toggleSubject(subject.id)} style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: expandedSubjects[subject.id] ? 'rgba(255,255,255,0.02)' : 'transparent', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.currentTarget.style.background = expandedSubjects[subject.id] ? 'rgba(255,255,255,0.02)' : 'transparent'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#fff' }}>{subject.title}</h3>
                    <button onClick={(e) => { e.stopPropagation(); setSettingsSubject(subject); setSubjectBookUrl(subject.bookUrl || ''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'color 0.2s', padding: '0.2rem' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-primary)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'} title="Subject Settings">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: expandedSubjects[subject.id] ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', color: 'var(--text-secondary)' }}><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
                
                {expandedSubjects[subject.id] && (
                  <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
                    {/* Global Exams List For This Subject */}
                    {exams && exams.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                        {exams.map(exam => {
                          return (
                            <div key={exam.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--glass-border)', borderRadius: '12px', padding: '1rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--accent-primary)' }}>{exam.title}</h4>
                                  <button onClick={() => {
                                      const md = (subject.examSettings && subject.examSettings[exam.id] && subject.examSettings[exam.id].markDistribution) || '';
                                      setSettingsExamInfo({ subjectId: subject.id, examId: exam.id, title: exam.title });
                                      setExamMarkDistribution(md);
                                  }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-primary)'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'} title="Exam Settings">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                  </button>
                                </div>
                              </div>
                              
                              {/* Chapters List */}
                              {subject.chapters && subject.chapters[exam.id] && Object.keys(subject.chapters[exam.id]).length > 0 ? (
                                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                  {Object.keys(subject.chapters[exam.id]).map(chapId => {
                                    const chapTitle = subject.chapters[exam.id][chapId].title;
                                    const subjectSlug = subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                                    const chapSlug = chapTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                                    const linkHref = `/kid/${params.id}/${subjectSlug}/${chapSlug}`;
                                    
                                    return (
                                      <li key={chapId} style={{ marginBottom: '0.4rem' }}>
                                        <Link href={linkHref} style={{ display: 'block', padding: '0.5rem 0.8rem', borderRadius: '8px', color: 'var(--text-secondary)', textDecoration: 'none', transition: 'all 0.2s', cursor: 'pointer' }} onMouseOver={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }} onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: 'var(--accent-primary)', fontSize: '1.2rem', lineHeight: 1 }}>•</span>
                                            <span>{chapTitle}</span>
                                          </div>
                                        </Link>
                                      </li>
                                    );
                                  })}
                                </ul>
                              ) : (
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.6 }}>No chapters added.</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: 'var(--text-secondary)', opacity: 0.7 }}>No exams created yet. Use the + button to add one.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', position: 'relative', animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem', textAlign: 'left' }}>Manage Syllabus</h2>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '8px' }}>
              <button type="button" onClick={() => { setAddType('subject'); setEditingId(null); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: addType === 'subject' ? 'var(--accent-primary)' : 'transparent', color: addType === 'subject' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}>Subject</button>
              <button type="button" onClick={() => { setAddType('exam'); setEditingId(null); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: addType === 'exam' ? 'var(--accent-primary)' : 'transparent', color: addType === 'exam' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}>Exam</button>
              <button type="button" onClick={() => { setAddType('chapter'); setEditingId(null); }} style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: addType === 'chapter' ? 'var(--accent-primary)' : 'transparent', color: addType === 'chapter' ? '#fff' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: '0.9rem', transition: 'all 0.2s' }}>Chapter</button>
            </div>

            <form onSubmit={handleGlobalAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
              {addType === 'chapter' && (
                <>
                  <select value={selectedSubjectId} onChange={e => { setSelectedSubjectId(e.target.value); setEditingId(null); }} required style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '1rem' }}>
                    <option value="" disabled>Select Subject</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                  <select value={selectedExamId} onChange={e => { setSelectedExamId(e.target.value); setEditingId(null); }} required style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '1rem' }}>
                    <option value="" disabled>Select Exam</option>
                    {exams.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </select>
                </>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={`Add new ${addType === 'subject' ? 'subject' : addType === 'exam' ? 'exam' : 'chapter'}...`} required style={{ flex: 1, minWidth: '200px', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '1rem' }} />
                
                {addType === 'chapter' && (
                  <input type="number" value={newPdfPage} onChange={e => setNewPdfPage(e.target.value)} placeholder="Start Page (Optional)" style={{ width: '150px', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }} />
                )}
                <button type="submit" className="primary" style={{ padding: '0 1.2rem', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Add</button>
              </div>
            </form>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
              
              {addType === 'subject' && subjects.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem', borderRadius: '6px' }}>
                  {editingId === s.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus style={{ flex: 1, padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--accent-primary)', borderRadius: '4px' }} />
                      <button onClick={() => handleSaveEdit(s.id, 'subject')} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.95rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '0.5rem' }}>{s.title}</span>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button onClick={() => handleEdit(s)} title="Edit" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseOut={(e) => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(s.id, 'subject')} title="Delete" style={{ background: 'rgba(239, 68, 68, 0.05)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background='rgba(239, 68, 68, 0.15)'} onMouseOut={(e) => e.currentTarget.style.background='rgba(239, 68, 68, 0.05)'}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {addType === 'exam' && exams.map(e => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem', borderRadius: '6px' }}>
                  {editingId === e.id ? (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} autoFocus style={{ flex: 1, padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--accent-primary)', borderRadius: '4px' }} />
                      <button onClick={() => handleSaveEdit(e.id, 'exam')} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingId(null)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.95rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '0.5rem' }}>{e.title}</span>
                      <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                        <button onClick={() => handleEdit(e)} title="Edit" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(ev) => ev.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseOut={(ev) => ev.currentTarget.style.background='rgba(255,255,255,0.05)'}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                        <button onClick={() => handleDelete(e.id, 'exam')} title="Delete" style={{ background: 'rgba(239, 68, 68, 0.05)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(ev) => ev.currentTarget.style.background='rgba(239, 68, 68, 0.15)'} onMouseOut={(ev) => ev.currentTarget.style.background='rgba(239, 68, 68, 0.05)'}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {addType === 'chapter' && selectedSubjectId && selectedExamId && (() => {
                const subj = subjects.find(s => s.id === selectedSubjectId);
                const chaps = subj?.chapters?.[selectedExamId] || {};
                const chapEntries = Object.entries(chaps);
                
                if (chapEntries.length === 0) return <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>No chapters yet.</p>;

                return chapEntries.map(([cId, c]) => (
                  <div key={cId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', background: 'rgba(255,255,255,0.03)', marginBottom: '0.5rem', borderRadius: '6px' }}>
                    {editingId === cId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input value={editTitle} onChange={ev => setEditTitle(ev.target.value)} autoFocus style={{ flex: 1, padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--accent-primary)', borderRadius: '4px' }} />
                          <button onClick={() => handleSaveEdit(cId, 'chapter', selectedSubjectId, selectedExamId)} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '0 0.6rem', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <input type="number" value={editPdfPage} onChange={ev => setEditPdfPage(ev.target.value)} placeholder="Start Page" style={{ width: '100px', padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--glass-border)', borderRadius: '4px', fontSize: '0.85rem' }} />
                        </div>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: '0.95rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '0.5rem' }}>{c.title}</span>
                        <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                          <button onClick={() => handleEdit({id: cId, title: c.title})} title="Edit" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(ev) => ev.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseOut={(ev) => ev.currentTarget.style.background='rgba(255,255,255,0.05)'}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                          </button>
                          <button onClick={() => handleDelete(cId, 'chapter', selectedSubjectId, selectedExamId)} title="Delete" style={{ background: 'rgba(239, 68, 68, 0.05)', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.4rem', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }} onMouseOver={(ev) => ev.currentTarget.style.background='rgba(239, 68, 68, 0.15)'} onMouseOut={(ev) => ev.currentTarget.style.background='rgba(239, 68, 68, 0.05)'}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ));
              })()}
              
            </div>

            <div style={{ display: 'flex', marginTop: '1.5rem' }}>
              <button type="button" onClick={() => { setShowAddModal(false); setEditingId(null); }} style={{ width: '100%', padding: '0.8rem', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close Modal</button>
            </div>
          </div>
        </div>
      )}
      {/* Subject Settings Modal */}
      {settingsSubject && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', position: 'relative', animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>{settingsSubject.title} Settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Book PDF URL</label>
                <input type="url" value={subjectBookUrl} onChange={e => setSubjectBookUrl(e.target.value)} placeholder="https://drive.google.com/file/d/..." style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '1rem' }} />
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8 }}>This book will be used for all chapters in this subject. You can set the starting page for each chapter individually in the syllabus manager.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button onClick={handleSaveSubjectSettings} className="primary" style={{ padding: '0.6rem 1.2rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Save</button>
                <button onClick={() => setSettingsSubject(null)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Exam Settings Modal */}
      {settingsExamInfo && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '500px', width: '100%', position: 'relative', animation: 'fadeIn 0.2s ease-out', textAlign: 'left' }}>
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>{settingsExamInfo.title} Settings</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Mark Distribution</label>
                <textarea value={examMarkDistribution} onChange={e => setExamMarkDistribution(e.target.value)} placeholder={`e.g.\nMCQ: 20 marks\nWritten: 50 marks\nPractical: 30 marks`} style={{ width: '100%', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '1rem', minHeight: '120px', resize: 'vertical' }} />
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8 }}>Define the mark breakdown for this exam within this subject.</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button onClick={handleSaveExamSettings} className="primary" style={{ padding: '0.6rem 1.2rem', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>Save</button>
                <button onClick={() => setSettingsExamInfo(null)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
