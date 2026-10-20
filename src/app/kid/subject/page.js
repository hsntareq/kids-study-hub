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

  // Decluttering: Collapsible accordion panels state (summaries visible by default)
  const [isChaptersExpanded, setIsChaptersExpanded] = useState(false);
  const [isExamsExpanded, setIsExamsExpanded] = useState(false);

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

  // Syllabus & Mark Distribution Section states
  const [selectedExamForDistribution, setSelectedExamForDistribution] = useState('all'); // 'all' or exam.id
  const [hoveredChapterId, setHoveredChapterId] = useState(null);
  const [showMarksModal, setShowMarksModal] = useState(false);
  const [editingChapterForMarks, setEditingChapterForMarks] = useState(null);
  const [tempChapterMarks, setTempChapterMarks] = useState('');
  const [tempChapterTopics, setTempChapterTopics] = useState([]);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicMarks, setNewTopicMarks] = useState('');

  // Centralized Exam-Level Mark Allocation states
  const [showCentralExamMarksModal, setShowCentralExamMarksModal] = useState(false);
  const [centralConfigExamId, setCentralConfigExamId] = useState(null);
  const [targetExamMarks, setTargetExamMarks] = useState(100);
  const [examChapterDrafts, setExamChapterDrafts] = useState([]);
  const [isSavingExamMarks, setIsSavingExamMarks] = useState(false);
  const [examMarksToast, setExamMarksToast] = useState('');

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

  // Curated vibrant visual weightage color palette for chapters and topic segments
  const WEIGHTAGE_COLORS = [
    '#38bdf8', // sky cyan
    '#818cf8', // indigo
    '#34d399', // emerald
    '#fbbf24', // amber
    '#f43f5e', // rose
    '#a855f7', // purple
    '#06b6d4', // cyan
    '#10b981', // green
    '#6366f1', // violet
    '#f97316'  // orange
  ];

  // Helper to extract or generate structured topics for a chapter
  const getChapterTopics = (chap) => {
    if (Array.isArray(chap.topics) && chap.topics.length > 0) {
      return chap.topics;
    }
    if (chap.topics && typeof chap.topics === 'object') {
      const entries = Object.entries(chap.topics);
      if (entries.length > 0) {
        return entries.map(([k, v]) => {
          if (typeof v === 'string') {
            return { id: k, name: v, marks: Math.max(1, Math.round((Number(chap.marks) || 20) / entries.length)) };
          }
          return { id: k, ...v };
        });
      }
    }
    // Sensible defaults based on chapter marks
    const chapMarks = Number(chap.marks) || 20;
    const m1 = Math.max(1, Math.round(chapMarks * 0.35));
    const m2 = Math.max(1, Math.round(chapMarks * 0.40));
    const m3 = Math.max(1, chapMarks - m1 - m2);
    return [
      { id: 't1', name: 'Core Foundations & Definitions', marks: m1 },
      { id: 't2', name: 'Formula Applications & Problem Solving', marks: m2 },
      { id: 't3', name: 'Analytical Thinking & Model Exercises', marks: m3 }
    ];
  };

  // Helper to get chapter marks
  const getChapterMarks = (chap, defaultPerChap) => {
    if (chap.marks !== undefined && !isNaN(Number(chap.marks)) && Number(chap.marks) > 0) {
      return Number(chap.marks);
    }
    return defaultPerChap;
  };

  // Compute detailed syllabus and mark distribution
  const distributionData = useMemo(() => {
    const relevantChapters = allSubjectChapters.filter(ch => {
      if (selectedExamForDistribution === 'all') return true;
      return ch.examId === selectedExamForDistribution;
    });

    const totalCount = relevantChapters.length;
    // Default evenly distributed marks (targeting standard 100 marks or 20 per chapter)
    const defaultPerChap = totalCount > 0 ? Math.max(5, Math.round(100 / totalCount)) : 20;

    let totalMarks = 0;
    let masteredMarks = 0;
    let inProgressMarks = 0;
    let notStartedMarks = 0;

    const mappedChapters = relevantChapters.map((chap, idx) => {
      const marks = getChapterMarks(chap, defaultPerChap);
      const topics = getChapterTopics({ ...chap, marks });
      totalMarks += marks;

      if (chap.isCompleted) {
        masteredMarks += marks;
      } else if (chap.status === 'in_progress') {
        inProgressMarks += marks;
      } else {
        notStartedMarks += marks;
      }

      return {
        ...chap,
        marks,
        topics,
        colorIndex: idx % WEIGHTAGE_COLORS.length,
        color: WEIGHTAGE_COLORS[idx % WEIGHTAGE_COLORS.length]
      };
    });

    // Calculate percentage weightages
    const finalChapters = mappedChapters.map(chap => {
      const weightagePct = totalMarks > 0 ? Math.round((chap.marks / totalMarks) * 100) : 0;
      return {
        ...chap,
        weightagePct
      };
    });

    const masteredPct = totalMarks > 0 ? Math.round((masteredMarks / totalMarks) * 100) : 0;
    const inProgressPct = totalMarks > 0 ? Math.round((inProgressMarks / totalMarks) * 100) : 0;
    const notStartedPct = totalMarks > 0 ? Math.round((notStartedMarks / totalMarks) * 100) : 0;

    return {
      chapters: finalChapters,
      totalMarks,
      masteredMarks,
      masteredPct,
      inProgressMarks,
      inProgressPct,
      notStartedMarks,
      notStartedPct,
      highYieldChapter: [...finalChapters].sort((a, b) => b.marks - a.marks)[0] || null
    };
  }, [allSubjectChapters, selectedExamForDistribution]);

  // Open modal to configure marks & topics for a chapter
  const handleOpenMarksModal = (chap) => {
    setEditingChapterForMarks(chap);
    setTempChapterMarks(String(chap.marks || 20));
    setTempChapterTopics(chap.topics ? JSON.parse(JSON.stringify(chap.topics)) : []);
    setNewTopicName('');
    setNewTopicMarks('');
    setShowMarksModal(true);
  };

  // Add a new topic inside the modal
  const handleAddTopicToModal = () => {
    if (!newTopicName.trim()) return;
    const m = Number(newTopicMarks) || 5;
    const newTopic = {
      id: `top_${Date.now()}`,
      name: newTopicName.trim(),
      marks: m
    };
    setTempChapterTopics(prev => [...prev, newTopic]);
    setNewTopicName('');
    setNewTopicMarks('');
  };

  // Delete a topic inside the modal
  const handleDeleteTopicFromModal = (topicId) => {
    setTempChapterTopics(prev => prev.filter(t => t.id !== topicId));
  };

  // Evenly balance topic marks to match total chapter marks
  const handleDistributeTopicsEvenly = () => {
    if (tempChapterTopics.length === 0) return;
    const totalChapM = Number(tempChapterMarks) || 20;
    const perTopic = Math.max(1, Math.floor(totalChapM / tempChapterTopics.length));
    const remainder = totalChapM - (perTopic * tempChapterTopics.length);
    setTempChapterTopics(prev => prev.map((t, idx) => ({
      ...t,
      marks: idx === 0 ? perTopic + remainder : perTopic
    })));
  };

  // Save customized chapter marks & topics to Firebase
  const handleSaveChapterMarksAndTopics = async (e) => {
    e.preventDefault();
    if (!user || !kid || !subject || !editingChapterForMarks) return;
    const { examId, id: chapId } = editingChapterForMarks;
    const marksNum = Number(tempChapterMarks) || 0;
    const dataOwnerUid = searchParams.get('parentId') || user.uid;
    const chapPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/chapters/${examId}/${chapId}`;

    await set(ref(database, `${chapPath}/marks`), marksNum);
    await set(ref(database, `${chapPath}/topics`), tempChapterTopics);

    setShowMarksModal(false);
    setEditingChapterForMarks(null);
  };

  // Helper to open centralized exam-level marks configuration
  const handleOpenCentralizedExamMarks = (targetExamId = null) => {
    let examIdToUse = targetExamId;
    if (!examIdToUse) {
      if (selectedExamForDistribution !== 'all') {
        examIdToUse = selectedExamForDistribution;
      } else if (exams.length > 0) {
        examIdToUse = exams[0].id;
      }
    }
    if (!examIdToUse) return;

    setCentralConfigExamId(examIdToUse);

    const chaptersForThisExam = allSubjectChapters.filter(c => c.examId === examIdToUse);
    const count = chaptersForThisExam.length;
    const defaultPerChap = count > 0 ? Math.max(5, Math.round(100 / count)) : 25;

    let sumMarks = 0;
    const drafts = chaptersForThisExam.map((c, idx) => {
      const marks = (c.marks !== undefined && !isNaN(Number(c.marks)) && Number(c.marks) > 0)
        ? Number(c.marks)
        : defaultPerChap;
      sumMarks += marks;
      return {
        id: c.id,
        examId: c.examId,
        title: c.title,
        marks,
        color: WEIGHTAGE_COLORS[idx % WEIGHTAGE_COLORS.length],
        topics: c.topics || [],
        isCompleted: c.isCompleted,
        status: c.status,
        pdfPage: c.pdfPage || null
      };
    });

    setTargetExamMarks(sumMarks > 0 ? sumMarks : 100);
    setExamChapterDrafts(drafts);
    setShowCentralExamMarksModal(true);
  };

  // Switch active exam inside centralized modal
  const handleSwitchCentralExam = (newExamId) => {
    setCentralConfigExamId(newExamId);
    const chaptersForThisExam = allSubjectChapters.filter(c => c.examId === newExamId);
    const count = chaptersForThisExam.length;
    const defaultPerChap = count > 0 ? Math.max(5, Math.round(100 / count)) : 25;

    let sumMarks = 0;
    const drafts = chaptersForThisExam.map((c, idx) => {
      const marks = (c.marks !== undefined && !isNaN(Number(c.marks)) && Number(c.marks) > 0)
        ? Number(c.marks)
        : defaultPerChap;
      sumMarks += marks;
      return {
        id: c.id,
        examId: c.examId,
        title: c.title,
        marks,
        color: WEIGHTAGE_COLORS[idx % WEIGHTAGE_COLORS.length],
        topics: c.topics || [],
        isCompleted: c.isCompleted,
        status: c.status,
        pdfPage: c.pdfPage || null
      };
    });

    setTargetExamMarks(sumMarks > 0 ? sumMarks : 100);
    setExamChapterDrafts(drafts);
  };

  // Update single chapter marks in drafts
  const handleUpdateChapterDraftMarks = (chapId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setExamChapterDrafts(prev => prev.map(c => c.id === chapId ? { ...c, marks: num } : c));
  };

  // Adjust single chapter marks by delta (+5 or -5)
  const handleStepChapterDraftMarks = (chapId, delta) => {
    setExamChapterDrafts(prev => prev.map(c => {
      if (c.id === chapId) {
        const nextMarks = Math.max(0, (c.marks || 0) + delta);
        return { ...c, marks: nextMarks };
      }
      return c;
    }));
  };

  // Auto-distribute target exam marks evenly across all chapters in drafts
  const handleDistributeExamMarksEvenly = (customTotal = null) => {
    const total = customTotal !== null ? customTotal : (Number(targetExamMarks) || 100);
    if (examChapterDrafts.length === 0) return;
    const count = examChapterDrafts.length;
    const perChap = Math.floor(total / count);
    const remainder = total - (perChap * count);

    setExamChapterDrafts(prev => prev.map((c, idx) => ({
      ...c,
      marks: idx === 0 ? perChap + remainder : perChap
    })));
  };

  // Auto-balance remainder to reach target total marks exactly
  const handleAutoBalanceRemainder = () => {
    const total = Number(targetExamMarks) || 100;
    const currentSum = examChapterDrafts.reduce((acc, c) => acc + (Number(c.marks) || 0), 0);
    const diff = total - currentSum;
    if (diff === 0 || examChapterDrafts.length === 0) return;

    setExamChapterDrafts(prev => {
      const first = prev[0];
      const newMarks = Math.max(0, (Number(first.marks) || 0) + diff);
      return prev.map((c, idx) => idx === 0 ? { ...c, marks: newMarks } : c);
    });
  };

  // Save centralized exam-level marks to Firebase
  const handleSaveCentralExamMarks = async () => {
    if (!user || !kid || !subject || !centralConfigExamId) return;
    setIsSavingExamMarks(true);
    try {
      const dataOwnerUid = searchParams.get('parentId') || user.uid;
      const updates = [];

      examChapterDrafts.forEach(chap => {
        const chapPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/chapters/${centralConfigExamId}/${chap.id}`;
        updates.push(set(ref(database, `${chapPath}/marks`), chap.marks));

        // If chapter already had topics, rebalance topics to match new chapter marks
        if (chap.topics && chap.topics.length > 0) {
          const topicCount = chap.topics.length;
          const perTopic = Math.floor(chap.marks / topicCount);
          const remainder = chap.marks - (perTopic * topicCount);
          const balancedTopics = chap.topics.map((t, tIdx) => ({
            ...t,
            marks: tIdx === 0 ? perTopic + remainder : perTopic
          }));
          updates.push(set(ref(database, `${chapPath}/topics`), balancedTopics));
        }
      });

      // Save configured total marks under examSettings
      const examSettingsPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${centralConfigExamId}/totalMarks`;
      updates.push(set(ref(database, examSettingsPath), Number(targetExamMarks) || 100));

      await Promise.all(updates);

      setShowCentralExamMarksModal(false);
      const exTitle = exams.find(e => e.id === centralConfigExamId)?.title || 'Exam';
      setExamMarksToast(`✓ Exam-level mark distribution saved successfully for ${exTitle}!`);
      setTimeout(() => setExamMarksToast(''), 4500);
    } catch (err) {
      console.error('Error saving exam marks:', err);
    } finally {
      setIsSavingExamMarks(false);
    }
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
      
      {/* 1. Enhanced Navigation Breadcrumbs */}
      <nav
        aria-label="Breadcrumb navigation"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          padding: '0.75rem 1.25rem',
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: '16px',
          marginBottom: '1.75rem',
          fontSize: '0.86rem',
          flexWrap: 'wrap',
          boxShadow: '0 8px 24px -6px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
        }}
      >
        {/* Step 1: Dashboard */}
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            color: '#94a3b8',
            textDecoration: 'none',
            fontWeight: 500,
            padding: '0.3rem 0.65rem',
            borderRadius: '8px',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>Dashboard</span>
        </Link>

        {/* Separator Chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Step 2: Student Profile */}
        <Link
          href={`/kid/profile?id=${searchParams.get("id")}${parentIdQuery}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            color: '#94a3b8',
            textDecoration: 'none',
            fontWeight: 500,
            padding: '0.3rem 0.65rem',
            borderRadius: '8px',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
          onMouseUp={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>Student Profile</span>
          {kid?.name && (
            <span style={{
              fontSize: '0.72rem',
              color: '#cbd5e1',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '0.12rem 0.5rem',
              borderRadius: '6px',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {kid.name}
            </span>
          )}
        </Link>

        {/* Separator Chevron */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>

        {/* Step 3: Current Page Location: Mathematics Hub */}
        <div
          aria-current="page"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.55rem',
            padding: '0.35rem 0.85rem',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
            border: '1px solid rgba(129, 140, 248, 0.5)',
            borderRadius: '10px',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 0 16px rgba(99, 102, 241, 0.3)',
            letterSpacing: '-0.01em'
          }}
        >
          <span style={{ fontSize: '0.95rem' }}>📐</span>
          <span>{subject?.title ? `${subject.title} Hub` : 'Mathematics Hub'}</span>
          <span style={{
            fontSize: '0.68rem',
            padding: '0.12rem 0.45rem',
            borderRadius: '6px',
            background: 'rgba(52, 211, 153, 0.25)',
            border: '1px solid rgba(52, 211, 153, 0.4)',
            color: '#34d399',
            fontWeight: 800,
            letterSpacing: '0.04em'
          }}>
            CURRENT HUB
          </span>
        </div>
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
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  flexShrink: 0
                }}
                title="Universal Subject Settings & Auto-Archive Policy"
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#818cf8';
                  e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.5)';
                  e.currentTarget.style.transform = 'rotate(45deg)';
                  e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.transform = 'rotate(0deg)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                }}
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
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(56, 189, 248, 0.35)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
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
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.3)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                }}
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
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.5)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.35)';
              }}
              onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Exam</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. HIGH-CONTRAST SCANNABLE VISUAL: Overall Subject Syllabus Mastery */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(30, 27, 75, 0.85))',
        border: '1px solid rgba(129, 140, 248, 0.3)',
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
          width: '220px',
          height: '220px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🎯</span>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
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
            gap: '0.5rem',
            padding: '0.45rem 1rem',
            borderRadius: '9999px',
            background: subjectProgressPercent === 100 
              ? 'rgba(16, 185, 129, 0.2)' 
              : subjectProgressPercent > 0 
                ? 'rgba(99, 102, 241, 0.2)' 
                : 'linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(99, 102, 241, 0.18))',
            border: `1px solid ${
              subjectProgressPercent === 100 
                ? 'rgba(52, 211, 153, 0.5)' 
                : subjectProgressPercent > 0 
                  ? 'rgba(165, 180, 252, 0.5)' 
                  : 'rgba(56, 189, 248, 0.5)'
            }`,
            color: subjectProgressPercent === 100 ? '#34d399' : subjectProgressPercent > 0 ? '#a5b4fc' : '#38bdf8',
            fontSize: '0.84rem',
            fontWeight: 700,
            boxShadow: subjectProgressPercent === 0 ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none'
          }}>
            <span>{subjectProgressPercent === 100 ? '🎉 Fully Mastered' : subjectProgressPercent > 0 ? '🚀 In Active Study' : '🌱 Ready to Begin (0% Complete)'}</span>
          </div>
        </div>

        {/* High-Contrast Core Display: Radial Progress + Metric Cards */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem', flexWrap: 'wrap' }}>
          
          {/* Radial SVG Gauge with Glowing High-Contrast Stroke & Precision Pip for 0% */}
          <div style={{ position: 'relative', width: '124px', height: '124px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="124" height="124" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="mastery-radial-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
                <filter id="glow-pip" x="-40%" y="-40%" width="180%" height="180%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.8" />
                </filter>
                <filter id="glow-progress" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#818cf8" floodOpacity="0.6" />
                </filter>
              </defs>

              {/* Precision outer calibration guide ring */}
              <circle
                cx="60"
                cy="60"
                r="54"
                stroke={subjectProgressPercent === 0 ? "rgba(56, 189, 248, 0.4)" : "rgba(148, 163, 184, 0.25)"}
                strokeWidth="1.5"
                strokeDasharray="3 4"
                fill="transparent"
              />

              {/* High-Contrast Baseline Track */}
              <circle
                cx="60"
                cy="60"
                r="46"
                stroke="rgba(255, 255, 255, 0.16)"
                strokeWidth="9"
                fill="rgba(15, 23, 42, 0.6)"
              />

              {/* For 0% Syllabus: High-Contrast Primed Calibration Track */}
              {subjectProgressPercent === 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  stroke="rgba(56, 189, 248, 0.35)"
                  strokeWidth="9"
                  strokeDasharray="2 5"
                  fill="transparent"
                />
              )}

              {/* Active Progress Ring (when > 0%) */}
              {subjectProgressPercent > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  stroke={subjectProgressPercent === 100 ? '#34d399' : 'url(#mastery-radial-grad)'}
                  strokeWidth="9"
                  strokeDasharray={289.02}
                  strokeDashoffset={289.02 - (289.02 * subjectProgressPercent) / 100}
                  strokeLinecap="round"
                  fill="transparent"
                  filter="url(#glow-progress)"
                  style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
                />
              )}

              {/* High-Contrast Starter Pip at 12 o'clock for 0% standing */}
              {subjectProgressPercent === 0 && (
                <circle
                  cx="106"
                  cy="60"
                  r="5"
                  fill="#38bdf8"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  filter="url(#glow-pip)"
                />
              )}
            </svg>

            {/* Dial Center Information */}
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', userSelect: 'none' }}>
              <span style={{
                fontSize: '1.85rem',
                fontWeight: 800,
                color: subjectProgressPercent === 100 ? '#34d399' : '#fff',
                lineHeight: 1,
                letterSpacing: '-0.03em',
                textShadow: subjectProgressPercent === 0 ? '0 0 16px rgba(56, 189, 248, 0.6)' : 'none'
              }}>
                {subjectProgressPercent}%
              </span>
              <span style={{
                fontSize: '0.62rem',
                color: subjectProgressPercent === 0 ? '#38bdf8' : '#94a3b8',
                background: subjectProgressPercent === 0 ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                border: subjectProgressPercent === 0 ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: '4px',
                fontWeight: 800,
                boxShadow: subjectProgressPercent === 0 ? '0 0 12px rgba(56, 189, 248, 0.3)' : 'none'
              }}>
                {subjectProgressPercent === 0 ? '0% SYLLABUS' : 'SYLLABUS'}
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

      {/* 4. DETAILED SYLLABUS & MARK DISTRIBUTION SECTION (WITH VISUAL WEIGHTAGE BAR) */}
      <div 
        id="syllabus-mark-distribution-section"
        style={{
          background: 'linear-gradient(135deg, rgba(23, 28, 44, 0.95), rgba(15, 18, 32, 0.98))',
          border: '1px solid rgba(129, 140, 248, 0.28)',
          borderRadius: '20px',
          padding: '1.75rem 2rem',
          marginBottom: '2.5rem',
          boxShadow: '0 16px 40px -10px rgba(0, 0, 0, 0.55)',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Ambient background glow */}
        <div style={{
          position: 'absolute',
          top: '-60px',
          left: '30%',
          width: '260px',
          height: '260px',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.18) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        {/* Section Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '1.35rem' }}>📊</span>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                Detailed Syllabus & Mark Distribution
              </h2>
              <span style={{
                fontSize: '0.72rem',
                padding: '0.15rem 0.55rem',
                borderRadius: '8px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                color: '#38bdf8',
                fontWeight: 700
              }}>
                Weighted Curriculum
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--text-secondary)' }}>
              Centralized marks allocation and topic weightage breakdown across examination tracks for students and parents.
            </p>
          </div>

          {/* Action CTAs & Exam Filter Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Primary Centralized Mark Allocation CTA */}
            <button
              type="button"
              onClick={() => handleOpenCentralizedExamMarks()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 1.15rem',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.28) 0%, rgba(168, 85, 247, 0.28) 100%)',
                border: '1px solid rgba(129, 140, 248, 0.45)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.25)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1.5px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.45)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.42) 0%, rgba(168, 85, 247, 0.42) 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.25)';
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.28) 0%, rgba(168, 85, 247, 0.28) 100%)';
              }}
              title="Centralize mark configuration: set marks for all chapters under this exam track"
            >
              <span style={{ fontSize: '0.95rem' }}>⚖️</span>
              <span>Centralized Mark Allocation</span>
              <span style={{
                fontSize: '0.68rem',
                padding: '0.12rem 0.45rem',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.18)',
                color: '#fff',
                fontWeight: 700
              }}>
                Exam-Level
              </span>
            </button>

            {/* Exam Track Filter Tabs */}
            {exams.length > 0 && (
              <div style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.35)',
                padding: '0.25rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                gap: '0.25rem',
                flexWrap: 'wrap'
              }}>
                <button
                  type="button"
                  onClick={() => setSelectedExamForDistribution('all')}
                  style={{
                    padding: '0.38rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedExamForDistribution === 'all' ? 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' : 'transparent',
                    color: selectedExamForDistribution === 'all' ? '#fff' : 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  All Tracks ({allSubjectChapters.length})
                </button>

                {exams.map(ex => {
                  const count = allSubjectChapters.filter(c => c.examId === ex.id).length;
                  const isSelected = selectedExamForDistribution === ex.id;
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => setSelectedExamForDistribution(ex.id)}
                      style={{
                        padding: '0.38rem 0.85rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: isSelected ? 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' : 'transparent',
                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <span>{ex.title}</span>
                      <span style={{
                        fontSize: '0.66rem',
                        background: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                        padding: '0.05rem 0.35rem',
                        borderRadius: '5px'
                      }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Success Toast Banner */}
        {examMarksToast && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1.15rem',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(52, 211, 153, 0.4)',
            color: '#34d399',
            fontSize: '0.86rem',
            fontWeight: 600,
            marginBottom: '1.25rem',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.1rem' }}>✓</span>
              <span>{examMarksToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setExamMarksToast('')}
              style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* VISUAL WEIGHTAGE BAR CARD */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '1.25rem 1.45rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {/* Bar Header Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Curriculum Marks Weightage Bar
              </span>
              <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                ({distributionData.totalMarks} Total Marks • 100% Allocation)
              </span>
            </div>

            {/* Live Hover/Selection Inspector Pill */}
            <div style={{
              fontSize: '0.74rem',
              color: hoveredChapterId ? '#fff' : '#94a3b8',
              background: hoveredChapterId ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 255, 255, 0.04)',
              border: hoveredChapterId ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              transition: 'all 0.2s',
              fontWeight: 500
            }}>
              {hoveredChapterId ? (() => {
                const hoveredChap = distributionData.chapters.find(c => c.id === hoveredChapterId);
                return hoveredChap 
                  ? `🔍 Inspecting: ${hoveredChap.title} — ${hoveredChap.marks} Marks (${hoveredChap.weightagePct}% Weightage) • ${hoveredChap.topics.length} Topics` 
                  : 'Hover over any segment to inspect topic weightage';
              })() : '💡 Hover or tap any bar segment to spotlight chapter & topic allocation'}
            </div>
          </div>

          {/* Multi-Segment Proportional Weightage Bar */}
          <div style={{
            height: '30px',
            background: 'rgba(255, 255, 255, 0.04)',
            borderRadius: '10px',
            overflow: 'hidden',
            display: 'flex',
            boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            position: 'relative'
          }}>
            {distributionData.chapters.length === 0 ? (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                No chapters mapped yet in this track. Add chapters to generate weightage bar.
              </div>
            ) : (
              distributionData.chapters.map((chap, idx) => {
                const widthPercent = distributionData.totalMarks > 0 
                  ? (chap.marks / distributionData.totalMarks) * 100 
                  : 100 / distributionData.chapters.length;

                const isHovered = hoveredChapterId === chap.id;

                return (
                  <div
                    key={`${chap.examId}_${chap.id}`}
                    onMouseEnter={() => setHoveredChapterId(chap.id)}
                    onMouseLeave={() => setHoveredChapterId(null)}
                    onClick={() => {
                      const el = document.getElementById(`chap-weightage-${chap.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    style={{
                      width: `${widthPercent}%`,
                      height: '100%',
                      background: chap.color,
                      borderRight: idx < distributionData.chapters.length - 1 ? '1.5px solid rgba(15, 18, 30, 0.9)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      filter: isHovered ? 'brightness(1.25)' : 'brightness(1)',
                      transform: isHovered ? 'scaleY(1.1)' : 'scaleY(1)',
                      zIndex: isHovered ? 2 : 1,
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                    title={`${chap.title}: ${chap.marks} Marks (${chap.weightagePct}% Weightage)`}
                  >
                    {widthPercent >= 8 && (
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        color: '#ffffff',
                        textShadow: '0 1px 3px rgba(0, 0, 0, 0.8)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        padding: '0 0.35rem'
                      }}>
                        Ch.{idx + 1} ({chap.marks}M)
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Interactive Legend Strip */}
          {distributionData.chapters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center' }}>
              {distributionData.chapters.map((chap, idx) => {
                const isHovered = hoveredChapterId === chap.id;
                return (
                  <div
                    key={`${chap.examId}_${chap.id}`}
                    onMouseEnter={() => setHoveredChapterId(chap.id)}
                    onMouseLeave={() => setHoveredChapterId(null)}
                    onClick={() => {
                      const el = document.getElementById(`chap-weightage-${chap.id}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.22rem 0.6rem',
                      borderRadius: '8px',
                      background: isHovered ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                      border: isHovered ? `1px solid ${chap.color}` : '1px solid rgba(255, 255, 255, 0.06)',
                      fontSize: '0.74rem',
                      color: isHovered ? '#fff' : '#cbd5e1',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: chap.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, maxWidth: '140px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {chap.title}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {chap.marks}M ({chap.weightagePct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SCANNABLE SUMMARY KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem', marginBottom: '1.75rem' }}>
          
          {/* Card 1: Total Syllabus Marks */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Examination Marks
              </span>
              <span style={{ fontSize: '1rem' }}>🎯</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
              {distributionData.totalMarks} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Marks</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Across {distributionData.chapters.length} active syllabus chapters
            </div>
          </div>

          {/* Card 2: Mastered Marks (Secured) */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ✓ Marks Secured (Mastered)
              </span>
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '6px', background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', fontWeight: 700 }}>
                {distributionData.masteredPct}%
              </span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', lineHeight: 1.1 }}>
              {distributionData.masteredMarks} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a7f3d0' }}>/ {distributionData.totalMarks}</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
              Curriculum marks fully ready for exams
            </div>
          </div>

          {/* Card 3: In Progress Marks */}
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                ⏳ In Progress Marks
              </span>
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '6px', background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontWeight: 700 }}>
                {distributionData.inProgressPct}%
              </span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', lineHeight: 1.1 }}>
              {distributionData.inProgressMarks} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fde68a' }}>Marks</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
              Currently in active revision & study
            </div>
          </div>

          {/* Card 4: Remaining Marks Target */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(165, 180, 252, 0.25)',
            borderRadius: '14px',
            padding: '1rem 1.15rem',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                📖 Unstarted Marks Target
              </span>
              <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '6px', background: 'rgba(165, 180, 252, 0.2)', color: '#a5b4fc', fontWeight: 700 }}>
                {distributionData.notStartedPct}%
              </span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1 }}>
              {distributionData.notStartedMarks} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1' }}>Marks</span>
            </div>
            <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
              Pending curriculum to master
            </div>
          </div>

        </div>

        {/* DETAILED CHAPTER & TOPIC ALLOCATION CARDS */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.15rem', flexWrap: 'wrap', gap: '0.65rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📑</span>
                <span>Chapter & Topic Marks Breakdown</span>
              </h3>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Chapter allocations are centralized at the exam level for optimal curriculum balance.
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleOpenCentralizedExamMarks()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.95rem',
                borderRadius: '10px',
                background: 'rgba(99, 102, 241, 0.18)',
                border: '1px solid rgba(129, 140, 248, 0.35)',
                color: '#c7d2fe',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.28)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
                e.currentTarget.style.color = '#c7d2fe';
              }}
            >
              <span>⚙️ Configure Exam Mark Distribution</span>
            </button>
          </div>

          {distributionData.chapters.length === 0 ? (
            <div style={{ padding: '2.5rem 1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                No chapters found in this exam track. Add chapters above to map syllabus marks.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.1rem' }}>
              {distributionData.chapters.map((chap, idx) => {
                const isHovered = hoveredChapterId === chap.id;
                const chapterHref = `/kid/chapter?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${chap.examId}&chapterId=${chap.id}${parentIdQuery}`;
                const totalTopicMarks = chap.topics.reduce((acc, t) => acc + (Number(t.marks) || 0), 0);

                return (
                  <div
                    key={`${chap.examId}_${chap.id}`}
                    id={`chap-weightage-${chap.id}`}
                    style={{
                      background: isHovered 
                        ? 'linear-gradient(145deg, rgba(30, 37, 56, 0.98), rgba(20, 24, 40, 0.98))' 
                        : 'rgba(255, 255, 255, 0.025)',
                      border: isHovered 
                        ? `1px solid ${chap.color}` 
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '1.2rem 1.35rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.9rem',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      boxShadow: isHovered ? `0 8px 24px -4px ${chap.color}35` : '0 4px 16px rgba(0,0,0,0.2)',
                      position: 'relative'
                    }}
                    onMouseEnter={() => setHoveredChapterId(chap.id)}
                    onMouseLeave={() => setHoveredChapterId(null)}
                  >
                    {/* Chapter Header: Index badge, Title, Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                        {/* Colored Chapter Index Badge */}
                        <div style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '10px',
                          background: `${chap.color}22`,
                          border: `1px solid ${chap.color}55`,
                          color: chap.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.85rem',
                          fontWeight: 800,
                          flexShrink: 0
                        }}>
                          {idx + 1}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <h4 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                            {chap.title}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            <span>🎯 {chap.examTitle}</span>
                            {chap.pdfPage && (
                              <>
                                <span>•</span>
                                <span style={{ color: '#38bdf8' }}>Page {chap.pdfPage}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.14rem 0.5rem',
                        borderRadius: '8px',
                        background: chap.isCompleted ? 'rgba(16, 185, 129, 0.15)' : chap.status === 'in_progress' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                        color: chap.isCompleted ? '#34d399' : chap.status === 'in_progress' ? '#fbbf24' : '#94a3b8',
                        border: `1px solid ${chap.isCompleted ? 'rgba(16, 185, 129, 0.3)' : chap.status === 'in_progress' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                        flexShrink: 0
                      }}>
                        {chap.isCompleted ? '✓ Mastered' : chap.status === 'in_progress' ? '⏳ In Progress' : '○ Not Started'}
                      </span>
                    </div>

                    {/* Weightage & Marks Banner */}
                    <div style={{
                      padding: '0.65rem 0.85rem',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.6rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: chap.color, lineHeight: 1 }}>
                          {chap.marks}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f1f5f9' }}>
                            Marks Allocated
                          </span>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                            {chap.weightagePct}% of Total Examination
                          </span>
                        </div>
                      </div>

                      {/* Weightage Category Pill */}
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.18rem 0.55rem',
                        borderRadius: '6px',
                        background: `${chap.color}20`,
                        color: chap.color,
                        border: `1px solid ${chap.color}45`
                      }}>
                        {chap.marks >= 25 ? '⭐ High Yield' : chap.marks >= 15 ? 'Core Chapter' : 'Foundational'}
                      </span>
                    </div>

                    {/* Topic Weightage Mini Bar */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                        <span>Topic Weightage Distribution ({chap.topics.length} Topics):</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{totalTopicMarks} Marks Mapped</span>
                      </div>
                      <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', overflow: 'hidden', display: 'flex', gap: '1px' }}>
                        {chap.topics.map((top, tIdx) => {
                          const topW = totalTopicMarks > 0 ? (top.marks / totalTopicMarks) * 100 : 100 / chap.topics.length;
                          return (
                            <div
                              key={top.id || tIdx}
                              style={{
                                width: `${topW}%`,
                                height: '100%',
                                background: chap.color,
                                opacity: 0.5 + (0.5 * ((tIdx + 1) / chap.topics.length))
                              }}
                              title={`${top.name}: ${top.marks} Marks`}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Topics Breakdown List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.1rem' }}>
                      {chap.topics.map((top, tIdx) => {
                        const topPct = chap.marks > 0 ? Math.round((top.marks / chap.marks) * 100) : 0;
                        return (
                          <div
                            key={top.id || tIdx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.45rem 0.65rem',
                              background: 'rgba(255, 255, 255, 0.025)',
                              border: '1px solid rgba(255, 255, 255, 0.04)',
                              borderRadius: '8px',
                              gap: '0.5rem',
                              fontSize: '0.76rem'
                            }}
                          >
                            <span style={{ color: '#cbd5e1', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {top.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                              <span style={{ fontWeight: 700, color: chap.color }}>
                                {top.marks} M
                              </span>
                              <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                                ({topPct}%)
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Card Actions Footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.75rem', marginTop: 'auto', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenCentralizedExamMarks(chap.examId)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '8px',
                            background: 'rgba(99, 102, 241, 0.18)',
                            border: '1px solid rgba(129, 140, 248, 0.35)',
                            color: '#c7d2fe',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                            e.currentTarget.style.color = '#fff';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
                            e.currentTarget.style.color = '#c7d2fe';
                          }}
                          title="Open Centralized Exam Mark Allocation for this exam"
                        >
                          <span>⚖️ Exam Mark Allocation</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenMarksModal(chap)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.74rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                            e.currentTarget.style.color = '#fff';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }}
                          title="Fine-tune individual topics"
                        >
                          <span>📑 Topics ({chap.topics ? chap.topics.length : 0})</span>
                        </button>
                      </div>

                      <Link
                        href={chapterHref}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontSize: '0.76rem',
                          color: 'var(--accent-primary)',
                          fontWeight: 600,
                          textDecoration: 'none'
                        }}
                      >
                        <span>Study Desk</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                      </Link>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* 5. COMPACT GRID: Subject Resources & Materials */}
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
                const distSection = document.getElementById('syllabus-mark-distribution-section');
                if (distSection) distSection.scrollIntoView({ behavior: 'smooth' });
              }}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                background: 'rgba(168, 85, 247, 0.16)',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                borderRadius: '8px',
                color: '#d8b4fe',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.28)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(168, 85, 247, 0.16)';
                e.currentTarget.style.color = '#d8b4fe';
              }}
            >
              View Marks Weightage Bar ↑
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
                setIsExamsExpanded(true);
                setTimeout(() => {
                  const examsSection = document.getElementById('upcoming-exams-section');
                  if (examsSection) examsSection.scrollIntoView({ behavior: 'smooth' });
                }, 100);
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

      {/* 5. FILTERABLE CHAPTERS & SYLLABUS LIST (COLLAPSIBLE ACCORDION PANEL - SUMMARY BY DEFAULT) */}
      <div 
        id="chapters-curriculum-section"
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: isChaptersExpanded ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '1.4rem 1.6rem',
          marginBottom: '2rem',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          boxShadow: isChaptersExpanded ? '0 12px 30px -8px rgba(0, 0, 0, 0.5)' : 'none'
        }}
      >
        {/* Accordion Header Bar (Clickable) */}
        <div
          onClick={() => setIsChaptersExpanded(prev => !prev)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingBottom: isChaptersExpanded ? '1.25rem' : '0.2rem',
            borderBottom: isChaptersExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
            transition: 'padding-bottom 0.2s ease'
          }}
        >
          {/* Left: Icon, Title & Summary Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: isChaptersExpanded ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: isChaptersExpanded ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>
              📑
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                  Chapters & Syllabus Curriculum
                </h2>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '8px',
                  background: completedSubjectChapters === totalSubjectChapters && totalSubjectChapters > 0
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(99, 102, 241, 0.15)',
                  color: completedSubjectChapters === totalSubjectChapters && totalSubjectChapters > 0
                    ? '#34d399'
                    : '#a5b4fc'
                }}>
                  {completedSubjectChapters} of {totalSubjectChapters} Mastered
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {isChaptersExpanded
                  ? 'Filtered by mastery status with instant completion toggles and textbook page references.'
                  : 'Curriculum summary view. Expand to manage individual chapters, track topics, or launch study desks.'}
              </p>
            </div>
          </div>

          {/* Right: Add Chapter + Accordion Toggle Chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {exams.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTargetExamForChapter(exams[0]);
                  setNewChapterTitle('');
                  setNewChapterPdfPage('');
                  setShowAddChapterModal(true);
                }}
                style={{
                  padding: '0.4rem 0.85rem',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  borderRadius: '8px',
                  color: '#a5b4fc',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                + Add Chapter
              </button>
            )}

            {/* Accordion Expand / Collapse Interactive Component */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsChaptersExpanded(prev => !prev);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                background: isChaptersExpanded 
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.28), rgba(168, 85, 247, 0.22))' 
                  : 'rgba(255, 255, 255, 0.06)',
                border: isChaptersExpanded 
                  ? '1px solid rgba(129, 140, 248, 0.55)' 
                  : '1px solid rgba(255, 255, 255, 0.14)',
                color: isChaptersExpanded ? '#e0e7ff' : '#cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isChaptersExpanded ? '0 0 16px rgba(99, 102, 241, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.7)';
                if (!isChaptersExpanded) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = isChaptersExpanded ? 'rgba(129, 140, 248, 0.55)' : 'rgba(255, 255, 255, 0.14)';
                if (!isChaptersExpanded) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              <span>{isChaptersExpanded ? 'Collapse Curriculum' : `View All Chapters (${totalSubjectChapters})`}</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: isChaptersExpanded ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.1)',
                transition: 'all 0.25s ease'
              }}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isChaptersExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: isChaptersExpanded ? '#a5b4fc' : '#94a3b8'
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* DEFAULT SUMMARY PREVIEW BAR (Visible when Collapsed) */}
        {!isChaptersExpanded && (
          <div
            onClick={() => setIsChaptersExpanded(true)}
            style={{
              marginTop: '0.9rem',
              padding: '0.9rem 1.15rem',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              flexWrap: 'wrap',
              gap: '1rem',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.25)'}
          >
            {/* Quick Metrics Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                {completedSubjectChapters} Mastered
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#fbbf24', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24' }} />
                {inProgressSubjectChapters} In Progress
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#64748b' }} />
                {notStartedSubjectChapters} Not Started
              </span>

              <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.85rem' }}>
                Summary active • Detailed cards collapsed to keep interface clutter-free
              </span>
            </div>

            {/* Interactive Expand Trigger Pill Component */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.85rem',
              borderRadius: '9999px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(129, 140, 248, 0.35)',
              color: '#c7d2fe',
              fontSize: '0.78rem',
              fontWeight: 700,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              <span>Expand Chapter List ({totalSubjectChapters})</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.25)'
              }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isChaptersExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: '#a5b4fc'
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>
        )}

        {/* EXPANDED VIEW: Search & Filter Tabs + Full Chapters Grid */}
        {isChaptersExpanded && (
          <div style={{ marginTop: '1.25rem', animation: 'fadeIn 0.2s ease-out' }}>
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

        {/* Bottom Collapse Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '1rem',
          marginTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            Showing {filteredChapters.length} of {totalSubjectChapters} syllabus chapters
          </span>
          <button
            type="button"
            onClick={() => setIsChaptersExpanded(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
              e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.5)';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
              e.currentTarget.style.color = '#cbd5e1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span>Collapse Curriculum</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.25)'
            }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: 'rotate(180deg)',
                  transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  color: '#a5b4fc'
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    )}
  </div>

      {/* 6. UPCOMING EXAMINATIONS SUMMARY (COLLAPSIBLE ACCORDION PANEL - SUMMARY BY DEFAULT) */}
      <div 
        id="upcoming-exams-section" 
        style={{
          background: 'rgba(255, 255, 255, 0.025)',
          border: isExamsExpanded ? '1px solid rgba(129, 140, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '1.4rem 1.6rem',
          marginBottom: '2.5rem',
          textAlign: 'left',
          transition: 'all 0.2s ease',
          boxShadow: isExamsExpanded ? '0 12px 30px -8px rgba(0, 0, 0, 0.5)' : 'none'
        }}
      >
        {/* Accordion Header Bar (Clickable) */}
        <div
          onClick={() => setIsExamsExpanded(prev => !prev)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingBottom: isExamsExpanded ? '1.25rem' : '0.2rem',
            borderBottom: isExamsExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
            transition: 'padding-bottom 0.2s ease'
          }}
        >
          {/* Left: Icon, Title & Summary Meta */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: isExamsExpanded ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
              border: isExamsExpanded ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25rem'
            }}>
              📝
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                  Upcoming Examinations Summary
                </h2>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '8px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc'
                }}>
                  {exams.length} {exams.length === 1 ? 'Exam Track' : 'Exam Tracks'} Mapped
                </span>
                {nextUpExam && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.12rem 0.5rem',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.18)',
                    color: '#fbbf24',
                    border: '1px solid rgba(251, 191, 36, 0.35)'
                  }}>
                    ⚡ Next Up: {nextUpExam.title}
                  </span>
                )}
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {isExamsExpanded
                  ? 'Dedicated exam workspaces with mark distributions, model test history, and scoring.'
                  : 'Exam track summary view. Expand to enter dedicated workspaces or view readiness per exam.'}
              </p>
            </div>
          </div>

          {/* Right: Add Exam + Accordion Toggle Chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setNewExamTitle('');
                setShowAddExamModal(true);
              }}
              style={{
                padding: '0.4rem 0.85rem',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: '8px',
                color: '#a5b4fc',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              + Add Exam
            </button>

            {/* Accordion Expand / Collapse Interactive Component */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsExamsExpanded(prev => !prev);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.45rem 1rem',
                borderRadius: '9999px',
                background: isExamsExpanded 
                  ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.28), rgba(168, 85, 247, 0.22))' 
                  : 'rgba(255, 255, 255, 0.06)',
                border: isExamsExpanded 
                  ? '1px solid rgba(129, 140, 248, 0.55)' 
                  : '1px solid rgba(255, 255, 255, 0.14)',
                color: isExamsExpanded ? '#e0e7ff' : '#cbd5e1',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isExamsExpanded ? '0 0 16px rgba(99, 102, 241, 0.3)' : '0 2px 8px rgba(0, 0, 0, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.7)';
                if (!isExamsExpanded) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = isExamsExpanded ? 'rgba(129, 140, 248, 0.55)' : 'rgba(255, 255, 255, 0.14)';
                if (!isExamsExpanded) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }}
            >
              <span>{isExamsExpanded ? 'Collapse Exams' : `View All Exam Tracks (${exams.length})`}</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: isExamsExpanded ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.1)',
                transition: 'all 0.25s ease'
              }}>
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isExamsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: isExamsExpanded ? '#a5b4fc' : '#94a3b8'
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* DEFAULT SUMMARY PREVIEW BAR (Visible when Collapsed) */}
        {!isExamsExpanded && (
          <div
            onClick={() => setIsExamsExpanded(true)}
            style={{
              marginTop: '0.9rem',
              padding: '0.9rem 1.15rem',
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              flexWrap: 'wrap',
              gap: '1rem',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.25)'}
          >
            {/* Quick Exams Focus Information */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
              {nextUpExam ? (
                <>
                  <span style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 700 }}>
                    ⚡ Immediate Exam Focus: {nextUpExam.title}
                  </span>
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                    • {exams.length} tracks scheduled
                  </span>
                </>
              ) : (
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                  {exams.length > 0 ? `${exams.length} exam tracks active.` : 'No exams scheduled yet.'}
                </span>
              )}

              <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.85rem' }}>
                Summary active • Detailed workspaces collapsed to keep interface clutter-free
              </span>
            </div>

            {/* Interactive Expand Trigger Pill Component */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 0.85rem',
              borderRadius: '9999px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(129, 140, 248, 0.35)',
              color: '#c7d2fe',
              fontSize: '0.78rem',
              fontWeight: 700,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
            }}>
              <span>Expand Exam Workspaces ({exams.length})</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.25)'
              }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isExamsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: '#a5b4fc'
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>
          </div>
        )}

        {/* EXPANDED VIEW: Detailed Exam Cards Grid */}
        {isExamsExpanded && (
          <div style={{ marginTop: '1.25rem', animation: 'fadeIn 0.2s ease-out' }}>
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

        {/* Bottom Collapse Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: '1rem',
          marginTop: '1rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
            Showing {exams.length} dedicated exam workspaces
          </span>
          <button
            type="button"
            onClick={() => setIsExamsExpanded(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.45rem 1rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.18)';
              e.currentTarget.style.borderColor = 'rgba(129, 140, 248, 0.5)';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
              e.currentTarget.style.color = '#cbd5e1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span>Collapse Exams</span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: 'rgba(99, 102, 241, 0.25)'
            }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: 'rotate(180deg)',
                  transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                  color: '#a5b4fc'
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </button>
        </div>
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

      {/* 9.5. MODAL: Centralized Exam-Level Mark Allocation */}
      {showCentralExamMarksModal && centralConfigExamId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 7, 15, 0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.25rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(23, 28, 48, 0.98), rgba(15, 18, 34, 0.99))',
            border: '1px solid rgba(129, 140, 248, 0.35)',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '880px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.75), 0 0 35px rgba(99, 102, 241, 0.25)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Top decorative ambient glow */}
            <div style={{
              position: 'absolute',
              top: '-80px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '380px',
              height: '180px',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            {/* Modal Header */}
            <div style={{
              padding: '1.5rem 1.75rem 1rem 1.75rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '1rem',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
                  border: '1px solid rgba(129, 140, 248, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.35rem',
                  flexShrink: 0
                }}>
                  ⚖️
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                      Centralized Exam Mark Allocation
                    </h3>
                    <span style={{
                      fontSize: '0.72rem',
                      padding: '0.15rem 0.55rem',
                      borderRadius: '9999px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      color: '#38bdf8',
                      fontWeight: 700
                    }}>
                      Exam-Level Management
                    </span>
                  </div>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                    Configure and balance syllabus marks for all chapters under this examination track simultaneously.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowCentralExamMarksModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  borderRadius: '10px',
                  width: '34px',
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#fff';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div style={{ padding: '1.25rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Exam Track Switcher Tabs (if multiple exams) */}
              {exams.length > 1 && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Select Examination Track:
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', background: 'rgba(0,0,0,0.3)', padding: '0.35rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {exams.map(ex => {
                      const isActive = centralConfigExamId === ex.id;
                      const exChapsCount = allSubjectChapters.filter(c => c.examId === ex.id).length;
                      return (
                        <button
                          key={ex.id}
                          type="button"
                          onClick={() => handleSwitchCentralExam(ex.id)}
                          style={{
                            padding: '0.45rem 0.95rem',
                            borderRadius: '8px',
                            border: 'none',
                            background: isActive ? 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))' : 'transparent',
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            transition: 'all 0.15s'
                          }}
                        >
                          <span>{ex.title}</span>
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '0.05rem 0.4rem',
                            borderRadius: '9999px',
                            background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'
                          }}>
                            {exChapsCount} Chapters
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Exam Total & Smart Balance Controls Card */}
              <div style={{
                background: 'rgba(0, 0, 0, 0.28)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '16px',
                padding: '1.15rem 1.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  {/* Target Total Marks Input & Presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.3rem' }}>
                        Target Total Exam Marks
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <input
                          type="number"
                          min="10"
                          max="500"
                          value={targetExamMarks}
                          onChange={(e) => setTargetExamMarks(Math.max(1, parseInt(e.target.value, 10) || 0))}
                          style={{
                            width: '85px',
                            padding: '0.45rem 0.65rem',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(129, 140, 248, 0.4)',
                            borderRadius: '8px',
                            color: '#fff',
                            fontSize: '1.05rem',
                            fontWeight: 800,
                            textAlign: 'center',
                            outline: 'none'
                          }}
                        />
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c7d2fe' }}>Marks</span>
                      </div>
                    </div>

                    {/* Quick Preset Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '1.1rem' }}>
                      {[50, 75, 100, 150].map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setTargetExamMarks(preset);
                            handleDistributeExamMarksEvenly(preset);
                          }}
                          style={{
                            padding: '0.32rem 0.6rem',
                            borderRadius: '7px',
                            background: targetExamMarks === preset ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                            border: targetExamMarks === preset ? '1px solid rgba(129, 140, 248, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
                            color: targetExamMarks === preset ? '#ffffff' : 'var(--text-secondary)',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s'
                          }}
                        >
                          {preset}M
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Smart Distribution Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleDistributeExamMarksEvenly()}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.48rem 0.85rem',
                        borderRadius: '9px',
                        background: 'rgba(99, 102, 241, 0.2)',
                        border: '1px solid rgba(129, 140, 248, 0.4)',
                        color: '#c7d2fe',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.35)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.2)';
                        e.currentTarget.style.color = '#c7d2fe';
                      }}
                      title="Evenly divides the target total marks across all chapters"
                    >
                      <span>⚡ Auto-Distribute Evenly</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAutoBalanceRemainder}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.48rem 0.85rem',
                        borderRadius: '9px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = '#cbd5e1';
                      }}
                      title="Adjusts first chapter to absorb any remainder gap"
                    >
                      <span>⚖️ Auto-Balance Gap</span>
                    </button>
                  </div>
                </div>

                {/* Live Balance Status Indicator */}
                {(() => {
                  const currentSum = examChapterDrafts.reduce((acc, c) => acc + (Number(c.marks) || 0), 0);
                  const target = Number(targetExamMarks) || 100;
                  const diff = target - currentSum;
                  const isBalanced = diff === 0;
                  const isUnder = diff > 0;

                  return (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      background: isBalanced
                        ? 'rgba(16, 185, 129, 0.12)'
                        : isUnder
                          ? 'rgba(245, 158, 11, 0.12)'
                          : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${
                        isBalanced
                          ? 'rgba(52, 211, 153, 0.35)'
                          : isUnder
                            ? 'rgba(251, 191, 36, 0.35)'
                            : 'rgba(248, 113, 113, 0.35)'
                      }`,
                      color: isBalanced ? '#34d399' : isUnder ? '#fbbf24' : '#f87171',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>{isBalanced ? '✅' : isUnder ? '⚠️' : '🛑'}</span>
                        <span>
                          {isBalanced
                            ? `Perfect Balance: All ${target} marks are fully allocated across ${examChapterDrafts.length} chapters (100%).`
                            : isUnder
                              ? `Under-allocated: ${diff} marks remaining to reach target of ${target} marks.`
                              : `Over-allocated: Exceeds target by ${Math.abs(diff)} marks (${currentSum}/${target} marks).`}
                        </span>
                      </div>

                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'rgba(0,0,0,0.25)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '6px'
                      }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                          {currentSum} / {target}
                        </span>
                        <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>Marks</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Live Proportional Weightage Preview Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                    <span>Live Proportional Weightage Bar:</span>
                    <span>{examChapterDrafts.length} Chapters</span>
                  </div>
                  <div style={{
                    height: '18px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    overflow: 'hidden',
                    display: 'flex',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    {(() => {
                      const sum = examChapterDrafts.reduce((acc, c) => acc + (Number(c.marks) || 0), 0) || 1;
                      return examChapterDrafts.map((c, idx) => {
                        const pct = (c.marks / sum) * 100;
                        return (
                          <div
                            key={c.id}
                            style={{
                              width: `${pct}%`,
                              height: '100%',
                              background: c.color,
                              borderRight: idx < examChapterDrafts.length - 1 ? '1px solid rgba(15, 18, 30, 0.8)' : 'none',
                              transition: 'width 0.2s',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden'
                            }}
                            title={`${c.title}: ${c.marks} Marks (${Math.round(pct)}%)`}
                          >
                            {pct >= 10 && (
                              <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                Ch.{idx + 1}
                              </span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

              </div>

              {/* Chapters Allocation Matrix / Table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Chapter Marks Distribution Matrix ({examChapterDrafts.length} Chapters)
                  </h4>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Type marks or use -5 / +5 quick steppers
                  </span>
                </div>

                {examChapterDrafts.length === 0 ? (
                  <div style={{ padding: '2.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                    No syllabus chapters found under this exam track. Add chapters to set exam mark distribution.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {examChapterDrafts.map((chap, idx) => {
                      const currentTotal = Number(targetExamMarks) || 100;
                      const weightagePct = currentTotal > 0 ? Math.round(((chap.marks || 0) / currentTotal) * 100) : 0;

                      return (
                        <div
                          key={chap.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.07)',
                            borderRadius: '12px',
                            padding: '0.75rem 1rem',
                            gap: '1rem',
                            flexWrap: 'wrap',
                            transition: 'all 0.15s'
                          }}
                        >
                          {/* Left: Chapter Index Badge & Title */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px', flex: 1 }}>
                            <div style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '8px',
                              background: `${chap.color}25`,
                              border: `1px solid ${chap.color}65`,
                              color: chap.color,
                              fontSize: '0.82rem',
                              fontWeight: 800,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {idx + 1}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {chap.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                {chap.pdfPage && <span>Page {chap.pdfPage} •</span>}
                                <span>{chap.topics ? chap.topics.length : 0} Topics Mapped</span>
                              </div>
                            </div>
                          </div>

                          {/* Middle: Steppers and Marks Input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => handleStepChapterDraftMarks(chap.id, -5)}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e2e8f0',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Decrease 5 marks"
                            >
                              -5
                            </button>

                            <input
                              type="number"
                              min="0"
                              max="200"
                              value={chap.marks}
                              onChange={(e) => handleUpdateChapterDraftMarks(chap.id, e.target.value)}
                              style={{
                                width: '68px',
                                padding: '0.4rem 0.5rem',
                                background: 'rgba(0,0,0,0.4)',
                                border: `1px solid ${chap.color}75`,
                                borderRadius: '8px',
                                color: '#ffffff',
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                textAlign: 'center',
                                outline: 'none'
                              }}
                            />

                            <button
                              type="button"
                              onClick={() => handleStepChapterDraftMarks(chap.id, 5)}
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#e2e8f0',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                              title="Increase 5 marks"
                            >
                              +5
                            </button>
                            <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600, marginLeft: '0.2rem' }}>Marks</span>
                          </div>

                          {/* Right: Calculated Weightage & Mini Progress */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: '130px', justifyContent: 'flex-end' }}>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.92rem', fontWeight: 800, color: chap.color }}>
                                {weightagePct}%
                              </div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                Weightage
                              </div>
                            </div>
                            <div style={{ width: '45px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, weightagePct)}%`, height: '100%', background: chap.color }} />
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer Actions */}
            <div style={{
              padding: '1.15rem 1.75rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <span>🎯 Target: {targetExamMarks} Marks</span>
                <span style={{ margin: '0 0.4rem' }}>•</span>
                <span>Configuring {examChapterDrafts.length} chapters</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCentralExamMarksModal(false)}
                  disabled={isSavingExamMarks}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#e2e8f0',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: isSavingExamMarks ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveCentralExamMarks}
                  disabled={isSavingExamMarks || examChapterDrafts.length === 0}
                  style={{
                    padding: '0.65rem 1.65rem',
                    borderRadius: '10px',
                    background: isSavingExamMarks
                      ? 'rgba(99, 102, 241, 0.4)'
                      : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: (isSavingExamMarks || examChapterDrafts.length === 0) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 6px 20px -2px rgba(99, 102, 241, 0.5), 0 0 15px rgba(219, 39, 119, 0.3)',
                    transition: 'all 0.2s',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSavingExamMarks) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.filter = 'brightness(1.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSavingExamMarks) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.filter = 'brightness(1)';
                    }
                  }}
                >
                  {isSavingExamMarks ? (
                    <>
                      <span>Saving Allocations...</span>
                    </>
                  ) : (
                    <>
                      <span>💾 Save Exam Mark Allocation</span>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        background: 'rgba(255, 255, 255, 0.25)',
                        fontWeight: 700
                      }}>
                        {examChapterDrafts.reduce((acc, c) => acc + (Number(c.marks) || 0), 0)}M
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 10. MODAL: Configure Chapter Marks & Topics */}
      {showMarksModal && editingChapterForMarks && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left', padding: '1.75rem', borderRadius: '18px', background: 'linear-gradient(145deg, #181d2c, #101422)', border: '1px solid rgba(129, 140, 248, 0.3)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '0.85rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', color: '#fff', fontWeight: 700 }}>
                  Configure Chapter Marks &amp; Topics
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                  {editingChapterForMarks.title} • {editingChapterForMarks.examTitle}
                </p>
              </div>
              <button 
                type="button"
                onClick={() => { setShowMarksModal(false); setEditingChapterForMarks(null); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem 0.5rem', transition: 'color 0.15s' }}
                onMouseOver={(e) => e.currentTarget.style.color = '#fff'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveChapterMarksAndTopics} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* Total Chapter Marks Field */}
              <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                <label style={{ fontSize: '0.84rem', color: '#f1f5f9', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Total Chapter Marks (Syllabus Weightage)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={tempChapterMarks}
                    onChange={(e) => setTempChapterMarks(e.target.value)}
                    required
                    style={{
                      width: '100px',
                      padding: '0.55rem 0.75rem',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(129, 140, 248, 0.4)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: 700,
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.35, flex: 1 }}>
                    Specifies the total score allocated to this chapter in the visual weightage bar and syllabus evaluations.
                  </div>
                </div>
              </div>

              {/* Topics Breakdown Editor */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.84rem', color: '#f1f5f9', fontWeight: 600 }}>
                    Topic Breakdown ({tempChapterTopics.length} Topics)
                  </label>
                  {tempChapterTopics.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDistributeTopicsEvenly}
                      style={{
                        fontSize: '0.74rem',
                        padding: '0.25rem 0.65rem',
                        borderRadius: '6px',
                        background: 'rgba(99, 102, 241, 0.18)',
                        border: '1px solid rgba(129, 140, 248, 0.35)',
                        color: '#c7d2fe',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      ⚡ Auto-Balance Evenly
                    </button>
                  )}
                </div>

                {/* Topics List Rows */}
                {tempChapterTopics.length === 0 ? (
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    No custom topics added yet. Add topics below to detail marks allocation.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                    {tempChapterTopics.map((top, idx) => (
                      <div
                        key={top.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '8px',
                          padding: '0.45rem 0.65rem'
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', width: '20px', textAlign: 'center' }}>
                          {idx + 1}.
                        </span>
                        <input
                          type="text"
                          value={top.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTempChapterTopics(prev => prev.map((t, i) => i === idx ? { ...t, name: val } : t));
                          }}
                          style={{
                            flex: 1,
                            padding: '0.35rem 0.55rem',
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '0.82rem',
                            outline: 'none'
                          }}
                          placeholder="Topic Name..."
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={top.marks}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setTempChapterTopics(prev => prev.map((t, i) => i === idx ? { ...t, marks: val } : t));
                            }}
                            style={{
                              width: '54px',
                              padding: '0.3rem 0.4rem',
                              background: 'rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: '6px',
                              color: '#38bdf8',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              textAlign: 'center',
                              outline: 'none'
                            }}
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>M</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteTopicFromModal(top.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f87171',
                            cursor: 'pointer',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.85rem'
                          }}
                          title="Remove Topic"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Topic Input Row */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="New topic name (e.g. Formulae & Identities)..."
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newTopicMarks}
                    onChange={(e) => setNewTopicMarks(e.target.value)}
                    placeholder="Marks"
                    style={{
                      width: '64px',
                      padding: '0.5rem 0.5rem',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.8rem',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddTopicToModal}
                    style={{
                      padding: '0.5rem 0.85rem',
                      background: 'rgba(99, 102, 241, 0.25)',
                      border: '1px solid rgba(129, 140, 248, 0.4)',
                      borderRadius: '8px',
                      color: '#e0e7ff',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    + Add Topic
                  </button>
                </div>
              </div>

              {/* Marks Balance Status Indicator */}
              {(() => {
                const totalM = Number(tempChapterMarks) || 0;
                const topicsSum = tempChapterTopics.reduce((acc, t) => acc + (Number(t.marks) || 0), 0);
                const isBalanced = totalM === topicsSum;
                return (
                  <div style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: '8px',
                    background: isBalanced ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    border: `1px solid ${isBalanced ? 'rgba(52, 211, 153, 0.35)' : 'rgba(251, 191, 36, 0.35)'}`,
                    fontSize: '0.78rem',
                    color: isBalanced ? '#34d399' : '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}>
                    <span>
                      {isBalanced 
                        ? `✓ Topic marks match chapter total: ${topicsSum} / ${totalM} Marks`
                        : `⚠️ Topic sum (${topicsSum}M) does not equal chapter total (${totalM}M)`}
                    </span>
                    {!isBalanced && tempChapterTopics.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDistributeTopicsEvenly}
                        style={{
                          background: 'rgba(245, 158, 11, 0.2)',
                          border: '1px solid rgba(251, 191, 36, 0.4)',
                          color: '#fef3c7',
                          borderRadius: '6px',
                          padding: '0.15rem 0.5rem',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          fontWeight: 600
                        }}
                      >
                        Auto-Fix Balance
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => { setShowMarksModal(false); setEditingChapterForMarks(null); }}
                  style={{
                    padding: '0.6rem 1.15rem',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  style={{
                    padding: '0.6rem 1.35rem',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)'
                  }}
                >
                  Save Marks Allocation
                </button>
              </div>

            </form>
          </div>
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
