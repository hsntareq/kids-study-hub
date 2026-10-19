"use client";

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push } from 'firebase/database';
import Link from 'next/link';

function SubjectPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [kid, setKid] = useState(null);
  const [subject, setSubject] = useState(null);
  const [exams, setExams] = useState([]);
  const [bookUrl, setBookUrl] = useState('');

  // Chapter filter & search states
  const [chapterStatusFilter, setChapterStatusFilter] = useState('all'); // 'all' | 'completed' | 'in_progress' | 'not_started'
  const [chapterSearchQuery, setChapterSearchQuery] = useState('');

  // Universal Subject Settings Modal state
  const [showSubjectSettings, setShowSubjectSettings] = useState(false);
  const [tempBookUrl, setTempBookUrl] = useState('');
  const [examRetentionDays, setExamRetentionDays] = useState(7);
  const [tempRetentionDays, setTempRetentionDays] = useState('7');

  // Add Exam Modal state
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');

  // Add Chapter Modal state
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [targetExamForChapter, setTargetExamForChapter] = useState(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterPdfPage, setNewChapterPdfPage] = useState('');

  // Auth and data listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const querySubjectId = searchParams.get('subjectId');
        const queryParentId = searchParams.get('parentId');
        const dataOwnerUid = queryParentId || currentUser.uid;

        const kidsRef = ref(database, `users/${dataOwnerUid}/kids`);

        onValue(kidsRef, (snapshot) => {
          const data = snapshot.val();
          if (!data) {
            setLoading(false);
            return;
          }

          let matchedKid = null;
          let matchedKidId = null;

          for (const kId in data) {
            const paramId = searchParams.get("id") || "";
            if (kId === paramId || (data[kId].name && data[kId].name.toLowerCase() === decodeURIComponent(paramId).toLowerCase())) {
              matchedKid = data[kId];
              matchedKidId = kId;
              break;
            }
          }

          if (!matchedKid) {
            setLoading(false);
            return;
          }

          setKid({ id: matchedKidId, ...matchedKid });

          // Find subject
          let matchedSubj = null;
          let matchedSubjId = null;
          if (matchedKid.subjects) {
            for (const sId in matchedKid.subjects) {
              const s = matchedKid.subjects[sId];
              const sSlug = s.title ? s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
              const paramSubject = searchParams.get("subject") || "";
              if (sId === querySubjectId || sId === paramSubject || sSlug === paramSubject) {
                matchedSubj = s;
                matchedSubjId = sId;
                break;
              }
            }
          }

          if (matchedSubj) {
            setSubject({ id: matchedSubjId, ...matchedSubj });
            setBookUrl(matchedSubj.bookUrl || '');
            setTempBookUrl(matchedSubj.bookUrl || '');
            const retDays = matchedSubj.examRetentionDays !== undefined ? matchedSubj.examRetentionDays : 7;
            setExamRetentionDays(retDays);
            setTempRetentionDays(String(retDays));
          }

          // Read exams list
          if (matchedKid.exams) {
            const exList = Object.entries(matchedKid.exams).map(([eId, ex]) => ({ id: eId, ...ex }));
            setExams(exList);
          } else {
            setExams([]);
          }

          setLoading(false);
        });
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [searchParams, router]);

  // Aggregate chapters and calculate metrics
  const { 
    allSubjectChapters, 
    totalSubjectChapters, 
    completedSubjectChapters, 
    inProgressSubjectChapters, 
    notStartedSubjectChapters, 
    totalSubjectModelTests,
    subjectProgressPercent 
  } = useMemo(() => {
    let totalChapters = 0;
    let completedChapters = 0;
    let inProgressChapters = 0;
    let notStartedChapters = 0;
    let totalModelTests = 0;
    const chaptersList = [];

    if (subject && exams.length > 0) {
      exams.forEach(ex => {
        const chaps = (subject.chapters && subject.chapters[ex.id]) || {};
        const chapsEntries = Object.entries(chaps);
        totalChapters += chapsEntries.length;

        chapsEntries.forEach(([cId, c]) => {
          const isCompleted = Boolean(c.completed || c.status === 'completed');
          const status = isCompleted ? 'completed' : (c.status === 'in_progress' ? 'in_progress' : 'not_started');
          if (isCompleted) {
            completedChapters++;
          } else if (status === 'in_progress') {
            inProgressChapters++;
          } else {
            notStartedChapters++;
          }

          chaptersList.push({
            id: cId,
            examId: ex.id,
            examTitle: ex.title,
            ...c,
            isCompleted,
            status
          });
        });

        const tests = (subject.modelTests && subject.modelTests[ex.id]) || {};
        totalModelTests += Object.keys(tests).length;
      });
    }

    const progressPct = totalChapters > 0
      ? Math.round((completedChapters / totalChapters) * 100)
      : 0;

    return {
      allSubjectChapters: chaptersList,
      totalSubjectChapters: totalChapters,
      completedSubjectChapters: completedChapters,
      inProgressSubjectChapters: inProgressChapters,
      notStartedSubjectChapters: notStartedChapters,
      totalSubjectModelTests: totalModelTests,
      subjectProgressPercent: progressPct
    };
  }, [subject, exams]);

  // Filter and search chapters
  const filteredChapters = useMemo(() => {
    return allSubjectChapters.filter(ch => {
      // Status filter
      if (chapterStatusFilter === 'completed' && !ch.isCompleted) return false;
      if (chapterStatusFilter === 'in_progress' && ch.status !== 'in_progress') return false;
      if (chapterStatusFilter === 'not_started' && ch.status !== 'not_started') return false;

      // Search query filter
      if (chapterSearchQuery.trim()) {
        const q = chapterSearchQuery.toLowerCase().trim();
        const matchesTitle = ch.title && ch.title.toLowerCase().includes(q);
        const matchesExam = ch.examTitle && ch.examTitle.toLowerCase().includes(q);
        const matchesPage = ch.pdfPage && String(ch.pdfPage).includes(q);
        if (!matchesTitle && !matchesExam && !matchesPage) return false;
      }

      return true;
    });
  }, [allSubjectChapters, chapterStatusFilter, chapterSearchQuery]);

  // Identify next upcoming exam
  const nextUpExam = useMemo(() => {
    return exams.find(ex => {
      const examSetting = (subject && subject.examSettings && subject.examSettings[ex.id]) || {};
      return examSetting.status === 'In Progress';
    }) || exams.find(ex => {
      const examSetting = (subject && subject.examSettings && subject.examSettings[ex.id]) || {};
      return examSetting.status !== 'Completed';
    }) || exams[0];
  }, [exams, subject]);

  // Chapter completion toggle
  const handleToggleChapterComplete = async (examId, chapId, currentCompleted) => {
    if (!user || !kid || !subject) return;
    const newCompleted = !currentCompleted;
    const chapPath = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${examId}/${chapId}`;
    await set(ref(database, `${chapPath}/completed`), newCompleted);
    await set(ref(database, `${chapPath}/status`), newCompleted ? 'completed' : 'not_started');
  };

  // Exam status toggle
  const handleUpdateExamStatus = async (examId, newStatus) => {
    if (!user || !kid || !subject) return;
    const path = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${examId}/status`;
    await set(ref(database, path), newStatus);
  };

  // Save Universal Subject Settings
  const handleSaveSubjectSettings = async () => {
    if (!user || !kid || !subject) return;
    const retentionNum = Number(tempRetentionDays) || 0;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/bookUrl`), tempBookUrl.trim());
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examRetentionDays`), retentionNum);
    setBookUrl(tempBookUrl.trim());
    setExamRetentionDays(retentionNum);
    setShowSubjectSettings(false);
  };

  // Add chapter to an exam
  const handleAddChapter = async (e) => {
    e.preventDefault();
    if (!newChapterTitle.trim() || !user || !kid || !subject || !targetExamForChapter) return;
    const chapRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${targetExamForChapter.id}`);
    const newChap = push(chapRef);
    await set(newChap, {
      title: newChapterTitle.trim(),
      pdfPage: newChapterPdfPage.trim(),
      completed: false,
      status: 'not_started',
      createdAt: Date.now()
    });
    setNewChapterTitle('');
    setNewChapterPdfPage('');
    setShowAddChapterModal(false);
  };

  // Add a new exam
  const handleAddExam = async (e) => {
    e.preventDefault();
    if (!newExamTitle.trim() || !user || !kid) return;
    const exRef = ref(database, `users/${user.uid}/kids/${kid.id}/exams`);
    const newEx = push(exRef);
    await set(newEx, {
      title: newExamTitle.trim(),
      createdAt: Date.now()
    });
    setNewExamTitle('');
    setShowAddExamModal(false);
  };

  if (loading) {
    return (
      <main className="view-container" style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <p>Loading {subject ? subject.title : 'Subject'} Hub...</p>
      </main>
    );
  }

  if (!kid || !subject) {
    return (
      <main className="view-container" style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h2>Subject Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Unable to locate this subject in the kid profile.</p>
        <Link href={`/kid/profile?id=${searchParams.get("id")}`} className="button primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          Return to Profile
        </Link>
      </main>
    );
  }

  const subjectSlug = subject.title ? subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
  const queryParentId = searchParams.get("parentId");
  const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';

  return (
    <main className="view-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', color: '#fff' }}>
      
      {/* 1. Breadcrumb Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Dashboard</Link>
        <span>›</span>
        <Link href={`/kid/profile?id=${searchParams.get("id")}${parentIdQuery}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{kid.name}</Link>
        <span>›</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{subject.title} Hub</span>
      </nav>

      {/* 2. Hero Header Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(23, 28, 44, 0.95), rgba(15, 18, 30, 0.98))',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '1.75rem 2rem',
        marginBottom: '1.75rem',
        boxShadow: '0 12px 32px -8px rgba(0, 0, 0, 0.5)',
        textAlign: 'left'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', fontWeight: 600 }}>
                🎓 {kid.grade || 'Curriculum Syllabus'}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Student: <strong style={{ color: '#fff' }}>{kid.name}</strong>
              </span>
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {exams.length} {exams.length === 1 ? 'Exam Track' : 'Exam Tracks'}
              </span>
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {totalSubjectChapters} {totalSubjectChapters === 1 ? 'Chapter' : 'Chapters'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                {subject.title} Hub
              </h1>
              <button
                onClick={() => {
                  setTempBookUrl(bookUrl || '');
                  setTempRetentionDays(String(examRetentionDays !== undefined ? examRetentionDays : 7));
                  setShowSubjectSettings(true);
                }}
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.45rem', borderRadius: '10px', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}
                title="Universal Subject Settings & Auto-Archive Policy"
                onMouseOver={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
            </div>

            <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Mastery dashboard, curriculum syllabus progress, learning materials, and upcoming exams.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {bookUrl && (
              <a
                href={bookUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.6rem 1.1rem',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '10px',
                  color: '#38bdf8',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)'}
              >
                <span>Read Textbook 📖</span>
              </a>
            )}

            {exams.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTargetExamForChapter(exams[0]);
                  setNewChapterTitle('');
                  setNewChapterPdfPage('');
                  setShowAddChapterModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
              >
                <span>+ Add Chapter</span>
              </button>
            )}

            <button
              onClick={() => { setNewExamTitle(''); setShowAddExamModal(true); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.6rem 1.25rem',
                background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Exam</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. HIGH-CONTRAST SCANNABLE VISUAL: Overall Subject Syllabus Mastery */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(30, 27, 75, 0.8))',
        border: '1px solid rgba(129, 140, 248, 0.25)',
        borderRadius: '20px',
        padding: '1.75rem 2rem',
        marginBottom: '2rem',
        boxShadow: '0 16px 36px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        textAlign: 'left',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Glow ambient background element */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '200px',
          height: '200px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                Overall Subject Syllabus Mastery
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
              Real-time curriculum readiness evaluated across all active syllabus chapters
            </p>
          </div>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.35rem 0.85rem',
            borderRadius: '20px',
            background: subjectProgressPercent === 100 
              ? 'rgba(16, 185, 129, 0.2)' 
              : subjectProgressPercent > 0 
                ? 'rgba(99, 102, 241, 0.2)' 
                : 'rgba(148, 163, 184, 0.15)',
            border: `1px solid ${
              subjectProgressPercent === 100 
                ? 'rgba(52, 211, 153, 0.4)' 
                : subjectProgressPercent > 0 
                  ? 'rgba(165, 180, 252, 0.4)' 
                  : 'rgba(148, 163, 184, 0.3)'
            }`,
            color: subjectProgressPercent === 100 ? '#34d399' : subjectProgressPercent > 0 ? '#a5b4fc' : '#94a3b8',
            fontSize: '0.84rem',
            fontWeight: 700
          }}>
            <span>{subjectProgressPercent === 100 ? '🎉 Fully Mastered' : subjectProgressPercent > 0 ? '🚀 In Active Study' : '🌱 Ready to Begin'}</span>
          </div>
        </div>

        {/* High-Contrast Core Display: Radial Progress + Metric Cards */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
          
          {/* Radial SVG Gauge with Glowing High-Contrast Stroke */}
          <div style={{ position: 'relative', width: '110px', height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="110" height="110" viewBox="0 0 110 110" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="mastery-radial-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.4" />
                </filter>
              </defs>
              {/* Background Track */}
              <circle
                cx="55"
                cy="55"
                r="44"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="8"
                fill="transparent"
              />
              {/* Active Progress Ring */}
              <circle
                cx="55"
                cy="55"
                r="44"
                stroke={subjectProgressPercent === 100 ? '#34d399' : subjectProgressPercent > 0 ? 'url(#mastery-radial-grad)' : 'rgba(255, 255, 255, 0.12)'}
                strokeWidth="8"
                strokeDasharray={276.46}
                strokeDashoffset={276.46 - (276.46 * subjectProgressPercent) / 100}
                strokeLinecap="round"
                fill="transparent"
                filter={subjectProgressPercent > 0 ? "url(#glow)" : "none"}
                style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            </svg>
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: '1.65rem', fontWeight: 800, color: subjectProgressPercent === 100 ? '#34d399' : '#fff', lineHeight: 1, letterSpacing: '-0.03em' }}>
                {subjectProgressPercent}%
              </span>
              <span style={{ fontSize: '0.62rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '3px', fontWeight: 700 }}>
                SYLLABUS
              </span>
            </div>
          </div>

          {/* Scannable Metrics Grid */}
          <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
              
              {/* Mastered Metric */}
              <div style={{
                padding: '0.9rem 1.1rem',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '14px',
                border: '1px solid rgba(52, 211, 153, 0.35)',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ✓ Mastered
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>
                    {totalSubjectChapters > 0 ? Math.round((completedSubjectChapters / totalSubjectChapters) * 100) : 0}%
                  </span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34d399', lineHeight: 1.1 }}>
                  {completedSubjectChapters} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>/ {totalSubjectChapters}</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Chapters Complete
                </div>
              </div>

              {/* In Progress Metric */}
              <div style={{
                padding: '0.9rem 1.1rem',
                background: 'rgba(245, 158, 11, 0.1)',
                borderRadius: '14px',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    ⏳ In Progress
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Active</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1.1 }}>
                  {inProgressSubjectChapters}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Chapters Studying
                </div>
              </div>

              {/* Not Started Metric */}
              <div style={{
                padding: '0.9rem 1.1rem',
                background: 'rgba(99, 102, 241, 0.08)',
                borderRadius: '14px',
                border: '1px solid rgba(165, 180, 252, 0.25)',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📖 Up Next
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Queue</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1 }}>
                  {notStartedSubjectChapters}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Chapters To Cover
                </div>
              </div>

              {/* Total Practice Tests Metric */}
              <div style={{
                padding: '0.9rem 1.1rem',
                background: 'rgba(168, 85, 247, 0.1)',
                borderRadius: '14px',
                border: '1px solid rgba(192, 132, 252, 0.3)',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    📝 Practice Tests
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Records</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c084fc', lineHeight: 1.1 }}>
                  {totalSubjectModelTests}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                  Model Tests Completed
                </div>
              </div>

            </div>

            {/* Segmented High-Contrast Visual Breakdown Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#94a3b8', marginBottom: '0.4rem' }}>
                <span>Syllabus Distribution Bar:</span>
                <span style={{ fontWeight: 600, color: '#f1f5f9' }}>
                  {completedSubjectChapters} Mastered • {inProgressSubjectChapters} In Progress • {notStartedSubjectChapters} Unstarted
                </span>
              </div>
              <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                {totalSubjectChapters > 0 ? (
                  <>
                    <div style={{ width: `${(completedSubjectChapters / totalSubjectChapters) * 100}%`, background: '#10b981', transition: 'width 0.4s' }} title={`Mastered: ${completedSubjectChapters}`} />
                    <div style={{ width: `${(inProgressSubjectChapters / totalSubjectChapters) * 100}%`, background: '#f59e0b', transition: 'width 0.4s' }} title={`In Progress: ${inProgressSubjectChapters}`} />
                    <div style={{ width: `${(notStartedSubjectChapters / totalSubjectChapters) * 100}%`, background: '#475569', transition: 'width 0.4s' }} title={`Not Started: ${notStartedSubjectChapters}`} />
                  </>
                ) : null}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* 4. COMPACT GRID: Subject Resources & Materials */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📚</span>
              <span>Subject Resources & Materials</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Curriculum reference materials, digital textbooks, and study tools for {subject.title}
            </p>
          </div>
        </div>

        {/* Compact 4-Card Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem' }}>
          
          {/* Card 1: Textbook */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.8rem',
            transition: 'border-color 0.2s'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.2rem' }}>📖</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: bookUrl ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: bookUrl ? '#34d399' : '#facc15', fontWeight: 600 }}>
                  {bookUrl ? 'Linked' : 'Not Set'}
                </span>
              </div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                Online Textbook / PDF
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                {bookUrl ? 'Official online reader connected with page jumps' : 'Attach Google Drive or web PDF for 1-click access'}
              </p>
            </div>

            {bookUrl ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={bookUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    flex: 1,
                    padding: '0.42rem 0.65rem',
                    textAlign: 'center',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '8px',
                    color: '#38bdf8',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textDecoration: 'none'
                  }}
                >
                  Open Reader ↗
                </a>
                <button
                  onClick={() => {
                    setTempBookUrl(bookUrl || '');
                    setTempRetentionDays(String(examRetentionDays !== undefined ? examRetentionDays : 7));
                    setShowSubjectSettings(true);
                  }}
                  style={{ padding: '0.42rem 0.65rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                  title="Configure Link"
                >
                  ⚙️
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTempBookUrl(bookUrl || '');
                  setTempRetentionDays(String(examRetentionDays !== undefined ? examRetentionDays : 7));
                  setShowSubjectSettings(true);
                }}
                style={{
                  width: '100%',
                  padding: '0.45rem 0.75rem',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '8px',
                  color: '#a5b4fc',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + Link Textbook URL
              </button>
            )}
          </div>

          {/* Card 2: Curriculum & Syllabus Guide */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.8rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.2rem' }}>📐</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe', fontWeight: 600 }}>
                  Curriculum
                </span>
              </div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                Syllabus & Weightage
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                {totalSubjectChapters} active chapters mapped across {exams.length} upcoming exam tracks.
              </p>
            </div>

            <button
              onClick={() => {
                const chapterSection = document.getElementById('chapters-curriculum-section');
                if (chapterSection) chapterSection.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Browse Chapters Below ↓
            </button>
          </div>

          {/* Card 3: Model Test & Examination Hub */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.8rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontWeight: 600 }}>
                  Dedicated Workspaces
                </span>
              </div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                Model Tests & Exam Workspaces
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                AI practice tests, digital answer sheet evaluations, and scoring on dedicated pages.
              </p>
            </div>

            <button
              onClick={() => {
                const examsSection = document.getElementById('upcoming-exams-section');
                if (examsSection) examsSection.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                background: 'rgba(139, 92, 246, 0.18)',
                border: '1px solid rgba(139, 92, 246, 0.35)',
                borderRadius: '8px',
                color: 'var(--accent-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View Upcoming Exams →
            </button>
          </div>

          {/* Card 4: Chapter Study Workspaces */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.8rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🎯</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 600 }}>
                  Formula & Revision
                </span>
              </div>
              <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                Chapter Study Desks
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                Interactive practice problems, revision trackers, and chapter-specific notes.
              </p>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>Click any chapter card below to launch</span>
            </div>
          </div>

        </div>
      </div>

      {/* 5. FILTERABLE CHAPTERS & SYLLABUS LIST WITH CLEAR PROGRESS INDICATORS */}
      <div 
        id="chapters-curriculum-section"
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '1.6rem',
          marginBottom: '2.5rem',
          textAlign: 'left'
        }}
      >
        {/* Section Header with Search & Filter Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📑</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                Chapters & Syllabus Curriculum
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Filtered by mastery status with instant completion toggles and textbook page references
            </p>
          </div>

          {/* Action to add chapter */}
          {exams.length > 0 && (
            <button
              onClick={() => {
                setTargetExamForChapter(exams[0]);
                setNewChapterTitle('');
                setNewChapterPdfPage('');
                setShowAddChapterModal(true);
              }}
              style={{
                padding: '0.45rem 0.9rem',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: '8px',
                color: '#a5b4fc',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              + Add Chapter
            </button>
          )}
        </div>

        {/* Filter Bar: Live Search + Status Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem', marginBottom: '1.25rem' }}>
          
          {/* Status Tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '0.25rem',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            gap: '0.25rem',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'all', label: 'All Chapters', count: allSubjectChapters.length },
              { id: 'completed', label: '✓ Mastered', count: completedSubjectChapters, color: '#34d399' },
              { id: 'in_progress', label: '⏳ In Progress', count: inProgressSubjectChapters, color: '#fbbf24' },
              { id: 'not_started', label: '📖 Not Started', count: notStartedSubjectChapters, color: '#94a3b8' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChapterStatusFilter(tab.id)}
                style={{
                  background: chapterStatusFilter === tab.id ? 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' : 'transparent',
                  color: chapterStatusFilter === tab.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '0.68rem',
                  background: chapterStatusFilter === tab.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                  padding: '0.08rem 0.4rem',
                  borderRadius: '6px',
                  color: tab.color || '#fff'
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '220px' }}>
            <input
              type="text"
              placeholder="🔍 Search chapters..."
              value={chapterSearchQuery}
              onChange={(e) => setChapterSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.8rem',
                fontSize: '0.82rem',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#fff',
                outline: 'none'
              }}
            />
            {chapterSearchQuery && (
              <button
                onClick={() => setChapterSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                ✕
              </button>
            )}
          </div>

        </div>

        {/* Chapters Cards Grid */}
        {filteredChapters.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {chapterSearchQuery 
                ? `No chapters found matching "${chapterSearchQuery}".`
                : chapterStatusFilter === 'all'
                  ? 'No syllabus chapters created yet for this subject.'
                  : `No chapters in the "${chapterStatusFilter.replace('_', ' ')}" category.`}
            </p>
            {chapterSearchQuery ? (
              <button
                onClick={() => setChapterSearchQuery('')}
                style={{ padding: '0.35rem 0.8rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Clear Search
              </button>
            ) : exams.length > 0 ? (
              <button
                onClick={() => {
                  setTargetExamForChapter(exams[0]);
                  setShowAddChapterModal(true);
                }}
                className="primary"
                style={{ padding: '0.45rem 1.1rem', borderRadius: '8px', fontSize: '0.82rem' }}
              >
                + Add First Chapter
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.85rem' }}>
            {filteredChapters.map(chap => {
              const chapterHref = `/kid/chapter?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${chap.examId}&chapterId=${chap.id}${parentIdQuery}`;
              
              return (
                <div
                  key={`${chap.examId}_${chap.id}`}
                  style={{
                    background: chap.isCompleted 
                      ? 'rgba(16, 185, 129, 0.04)' 
                      : chap.status === 'in_progress' 
                        ? 'rgba(245, 158, 11, 0.04)' 
                        : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${
                      chap.isCompleted 
                        ? 'rgba(16, 185, 129, 0.25)' 
                        : chap.status === 'in_progress' 
                          ? 'rgba(245, 158, 11, 0.25)' 
                          : 'rgba(255, 255, 255, 0.07)'
                    }`,
                    borderRadius: '12px',
                    padding: '0.95rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    transition: 'all 0.2s'
                  }}
                >
                  <div>
                    {/* Header: Status toggle checkbox + Chapter Title */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                      <input
                        type="checkbox"
                        checked={chap.isCompleted}
                        onChange={() => handleToggleChapterComplete(chap.examId, chap.id, chap.isCompleted)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          marginTop: '2px',
                          accentColor: '#10b981',
                          flexShrink: 0
                        }}
                        title={chap.isCompleted ? "Mark incomplete" : "Mark as Mastered"}
                      />
                      <div style={{ flex: 1 }}>
                        <h4 style={{
                          margin: 0,
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: chap.isCompleted ? '#cbd5e1' : '#fff',
                          textDecoration: chap.isCompleted ? 'line-through' : 'none',
                          lineHeight: 1.35
                        }}>
                          {chap.title}
                        </h4>

                        {/* Metadata badges: Exam + Page */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.45rem', fontSize: '0.72rem' }}>
                          <span style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-secondary)', padding: '0.12rem 0.45rem', borderRadius: '6px' }}>
                            🎯 {chap.examTitle}
                          </span>
                          {chap.pdfPage && (
                            <span style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8', padding: '0.12rem 0.45rem', borderRadius: '6px' }}>
                              📄 Page {chap.pdfPage}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Status badge + Study workspace link */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.55rem', marginTop: '0.2rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '8px',
                      background: chap.isCompleted ? 'rgba(16, 185, 129, 0.15)' : chap.status === 'in_progress' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      color: chap.isCompleted ? '#34d399' : chap.status === 'in_progress' ? '#fbbf24' : '#94a3b8'
                    }}>
                      {chap.isCompleted ? '✓ Mastered' : chap.status === 'in_progress' ? '⏳ In Progress' : '○ Not Started'}
                    </span>

                    <Link
                      href={chapterHref}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.78rem',
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}
                    >
                      <span>Study Chapter</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 6. UPCOMING EXAMINATIONS SUMMARY (CLUTTER-FREE, LINKING TO DEDICATED EXAM PAGES) */}
      <div id="upcoming-exams-section" style={{ textAlign: 'left', marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📝</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                Upcoming Examinations Summary
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Summary of scheduled exams. Access dedicated exam workspaces for detailed mark distribution, model tests, and evaluation.
            </p>
          </div>

          <button
            onClick={() => { setNewExamTitle(''); setShowAddExamModal(true); }}
            style={{
              padding: '0.45rem 0.95rem',
              background: 'rgba(99, 102, 241, 0.18)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: '8px',
              color: 'var(--accent-primary)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add Exam
          </button>
        </div>

        {/* Exams Summary Cards Grid */}
        {exams.length === 0 ? (
          <div style={{ padding: '2.5rem 1rem', background: 'rgba(0,0,0,0.18)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.08)', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>No exams created for this subject yet.</p>
            <button onClick={() => setShowAddExamModal(true)} className="primary" style={{ padding: '0.5rem 1.25rem', borderRadius: '8px' }}>
              + Add First Exam
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {exams.map(ex => {
              const examHref = `/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${ex.id}&subjectId=${subject.id}${parentIdQuery}`;
              const isNextUp = nextUpExam && ex.id === nextUpExam.id;

              const chapsObj = (subject.chapters && subject.chapters[ex.id]) || {};
              const chapsList = Object.values(chapsObj);
              const exTotal = chapsList.length;
              const exDone = chapsList.filter(c => c.completed || c.status === 'completed').length;
              const exProgress = exTotal > 0 ? Math.round((exDone / exTotal) * 100) : 0;
              
              const testsObj = (subject.modelTests && subject.modelTests[ex.id]) || {};
              const testList = Object.values(testsObj);
              const testCount = testList.length;

              const examSetting = (subject.examSettings && subject.examSettings[ex.id]) || {};
              const examStatus = examSetting.status || (exProgress === 100 && exTotal > 0 ? 'Completed' : (exProgress > 0 ? 'In Progress' : 'Scheduled'));

              return (
                <div
                  key={ex.id}
                  style={{
                    background: isNextUp 
                      ? 'linear-gradient(145deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.75))' 
                      : 'rgba(255, 255, 255, 0.025)',
                    border: isNextUp 
                      ? '1px solid rgba(129, 140, 248, 0.45)' 
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    boxShadow: isNextUp ? '0 8px 24px -4px rgba(99, 102, 241, 0.2)' : 'none',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header: Title + Next Up / Status Badges */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {isNextUp && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.55rem',
                            borderRadius: '12px',
                            background: 'rgba(245, 158, 11, 0.2)',
                            border: '1px solid rgba(251, 191, 36, 0.4)',
                            color: '#fbbf24',
                            letterSpacing: '0.04em'
                          }}>
                            ⚡ NEXT UP
                          </span>
                        )}
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '10px',
                          background: examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                          color: examStatus === 'Completed' ? '#34d399' : '#a5b4fc'
                        }}>
                          {examStatus}
                        </span>
                      </div>

                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                        {exTotal} {exTotal === 1 ? 'Chapter' : 'Chapters'}
                      </span>
                    </div>

                    <h3 style={{ margin: '0.2rem 0 0.5rem 0', fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                      {ex.title}
                    </h3>

                    {/* Readiness progress mini-bar */}
                    <div style={{ marginBottom: '0.8rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                        <span>Syllabus Readiness</span>
                        <span style={{ fontWeight: 600, color: exProgress === 100 ? '#34d399' : '#a5b4fc' }}>
                          {exDone} of {exTotal} chapters ({exProgress}%)
                        </span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${exProgress}%`, height: '100%', background: exProgress === 100 ? '#10b981' : 'var(--accent-gradient, #6366f1)', borderRadius: '4px', transition: 'width 0.4s' }} />
                      </div>
                    </div>

                    {/* Model test indicator pill */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.4rem 0.65rem',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '0.76rem',
                      color: '#cbd5e1'
                    }}>
                      <span>📝</span>
                      <span>
                        {testCount > 0 
                          ? `${testCount} Practice Model ${testCount === 1 ? 'Test' : 'Tests'} Recorded` 
                          : 'No model tests yet — ready for first test'}
                      </span>
                    </div>
                  </div>

                  {/* Primary CTA: Dedicated Exam Page */}
                  <Link
                    href={examHref}
                    style={{
                      width: '100%',
                      padding: '0.65rem',
                      borderRadius: '10px',
                      background: isNextUp ? 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' : 'rgba(255, 255, 255, 0.07)',
                      border: isNextUp ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#fff',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      boxShadow: isNextUp ? '0 4px 12px rgba(99, 102, 241, 0.35)' : 'none',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={(e) => { if (!isNextUp) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseOut={(e) => { if (!isNextUp) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'; }}
                  >
                    <span>Open Dedicated Exam Page</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </Link>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 7. UNIVERSAL SUBJECT SETTINGS MODAL */}
      {showSubjectSettings && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(5, 8, 16, 0.75)', 
            backdropFilter: 'blur(10px)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 110, 
            padding: '1.25rem' 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSubjectSettings(false);
          }}
        >
          <div 
            className="card" 
            style={{ 
              maxWidth: '540px', 
              width: '100%', 
              position: 'relative', 
              animation: 'fadeIn 0.2s ease-out', 
              textAlign: 'left',
              padding: '1.75rem',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.7)',
              background: 'linear-gradient(145deg, rgba(23, 28, 44, 0.95), rgba(15, 18, 30, 0.98))'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  Universal Subject Settings
                </div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {subject.title}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Applies to all exams, chapters, and resources for this subject
                </p>
              </div>
              <button 
                onClick={() => setShowSubjectSettings(false)}
                style={{ 
                  background: 'rgba(255, 255, 255, 0.06)', 
                  border: 'none', 
                  color: 'var(--text-secondary)', 
                  width: '32px', 
                  height: '32px', 
                  borderRadius: '50%', 
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.35rem' }}>
              {/* Setting 1: Online Textbook / PDF URL */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fff', fontSize: '0.92rem', fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#38bdf8' }}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    Online Textbook / PDF Reader URL
                  </label>
                  {tempBookUrl.trim() && (
                    <a 
                      href={tempBookUrl.trim()} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      style={{ fontSize: '0.78rem', color: '#38bdf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'rgba(56, 189, 248, 0.1)' }}
                    >
                      Test Link ↗
                    </a>
                  )}
                </div>
                <input 
                  type="url" 
                  value={tempBookUrl} 
                  onChange={e => setTempBookUrl(e.target.value)} 
                  placeholder="https://drive.google.com/file/d/... or PDF link" 
                  style={{ 
                    width: '100%', 
                    padding: '0.7rem 0.85rem', 
                    background: 'rgba(0, 0, 0, 0.35)', 
                    border: '1px solid rgba(255, 255, 255, 0.12)', 
                    borderRadius: '8px', 
                    color: '#fff', 
                    fontSize: '0.92rem',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary, #6366f1)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)'}
                />
                <p style={{ margin: '0.45rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Universal textbook reference for all chapters. Chapter cards and study sessions link directly to their specific starting page numbers.
                </p>
              </div>

              {/* Setting 2: Exam Post-Deadline Visibility / Retention Window */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fff', fontSize: '0.92rem', fontWeight: 600 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#f59e0b' }}><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    Post-Deadline Exam Visibility
                  </label>
                  <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', fontWeight: 500 }}>
                    Parent & Teacher Policy
                  </span>
                </div>
                <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Duration an exam remains visible on the active dashboard after its deadline has passed before being automatically archived.
                </p>

                {/* Quick Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.85rem' }}>
                  {[
                    { label: '3 Days', value: '3' },
                    { label: '7 Days', value: '7', badge: 'Default' },
                    { label: '14 Days', value: '14' },
                    { label: '30 Days', value: '30' },
                    { label: 'Never', value: '0', badge: 'Keep' }
                  ].map((preset) => {
                    const isSelected = String(tempRetentionDays) === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setTempRetentionDays(preset.value)}
                        style={{
                          padding: '0.5rem 0.25rem',
                          borderRadius: '8px',
                          border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                          background: isSelected ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                          color: isSelected ? '#fff' : 'var(--text-secondary)',
                          fontSize: '0.78rem',
                          fontWeight: isSelected ? 600 : 500,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '0.15rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{preset.label}</span>
                        {preset.badge && (
                          <span style={{ fontSize: '0.62rem', opacity: isSelected ? 1 : 0.6, color: isSelected ? '#a5b4fc' : 'inherit' }}>
                            {preset.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom input & feedback indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(0, 0, 0, 0.25)', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Custom Days:</span>
                    <input 
                      type="number" 
                      min="0" 
                      max="365"
                      value={tempRetentionDays} 
                      onChange={(e) => setTempRetentionDays(e.target.value)} 
                      style={{ 
                        width: '72px', 
                        padding: '0.35rem 0.5rem', 
                        background: 'rgba(255, 255, 255, 0.06)', 
                        border: '1px solid rgba(255, 255, 255, 0.15)', 
                        borderRadius: '6px', 
                        color: '#fff', 
                        fontSize: '0.88rem', 
                        fontWeight: 600, 
                        textAlign: 'center' 
                      }} 
                    />
                  </div>
                  <div style={{ fontSize: '0.78rem', color: tempRetentionDays === '0' || Number(tempRetentionDays) === 0 ? '#34d399' : '#94a3b8', lineHeight: 1.3, flex: 1 }}>
                    {tempRetentionDays === '0' || Number(tempRetentionDays) === 0 ? (
                      <span>🛡️ <strong>Permanent</strong> — exams will never auto-archive and stay visible until manually removed.</span>
                    ) : (
                      <span>⏳ Retained for <strong>{tempRetentionDays || 0} day{Number(tempRetentionDays) === 1 ? '' : 's'}</strong> post-deadline for parent & kid review before auto-archival.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button 
                  type="button" 
                  onClick={() => setShowSubjectSettings(false)} 
                  style={{ 
                    padding: '0.65rem 1.25rem', 
                    background: 'rgba(255, 255, 255, 0.06)', 
                    color: 'var(--text-secondary)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 500
                  }}
                  onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                  onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveSubjectSettings} 
                  className="primary" 
                  style={{ 
                    padding: '0.65rem 1.4rem', 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: 'pointer', 
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Add Exam */}
      {showAddExamModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <form onSubmit={handleAddExam} className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'left', padding: '1.5rem', borderRadius: '16px', background: 'var(--surface-color, #1a1e29)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Exam to {subject.title}</h3>
            <input
              type="text"
              value={newExamTitle}
              onChange={(e) => setNewExamTitle(e.target.value)}
              placeholder="e.g. Midterm Examination / CT-4"
              required
              style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', marginBottom: '1.25rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setShowAddExamModal(false)} style={{ padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" className="primary" style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', cursor: 'pointer' }}>Add Exam</button>
            </div>
          </form>
        </div>
      )}

      {/* 9. MODAL: Add Chapter */}
      {showAddChapterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <form onSubmit={handleAddChapter} className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'left', padding: '1.5rem', borderRadius: '16px', background: 'var(--surface-color, #1a1e29)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Chapter ({targetExamForChapter?.title})</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Chapter Title</label>
              <input
                type="text"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                placeholder="e.g. Chapter 4: Fractions & Decimals"
                required
                style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Textbook Page (Optional)</label>
              <input
                type="text"
                value={newChapterPdfPage}
                onChange={(e) => setNewChapterPdfPage(e.target.value)}
                placeholder="e.g. 52"
                style={{ width: '100%', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setShowAddChapterModal(false)} style={{ padding: '0.55rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" className="primary" style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', cursor: 'pointer' }}>Save Chapter</button>
            </div>
          </form>
        </div>
      )}

    </main>
  );
}

export default function SubjectPage() {
  return (
    <Suspense fallback={<div className="view-container" style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>Loading subject...</div>}>
      <SubjectPageContent />
    </Suspense>
  );
}
