"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { generateGeminiContent } from '../../../../../../lib/gemini';
import Link from 'next/link';

export default function ExamPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [kid, setKid] = useState(null);
  const [subject, setSubject] = useState(null);
  const [exam, setExam] = useState(null);
  const [bookUrl, setBookUrl] = useState('');

  // Mark Distribution state
  const [isEditingMarkDist, setIsEditingMarkDist] = useState(false);
  const [markDistValue, setMarkDistValue] = useState('');

  // Model test generator state
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [modelTestDate, setModelTestDate] = useState('');
  const [modelTestTitle, setModelTestTitle] = useState('');
  const [modelTestResult, setModelTestResult] = useState('0');
  const [selectedChaptersForTest, setSelectedChaptersForTest] = useState([]);
  const [testMarkDistribution, setTestMarkDistribution] = useState('');
  const [testDifficulty, setTestDifficulty] = useState('Standard');
  const [testGuidelines, setTestGuidelines] = useState(['Follow best practice', 'Standard curriculum']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Model test viewer, sliding & grading state
  const [viewingModelTest, setViewingModelTest] = useState(null);
  const [testViewMode, setTestViewMode] = useState('student'); // 'student' or 'examiner'
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [questionDisplayMode, setQuestionDisplayMode] = useState('slide');
  const [savingStatus, setSavingStatus] = useState('');
  const [studentAnswers, setStudentAnswers] = useState({});
  const [uploadedAnswerPages, setUploadedAnswerPages] = useState([]);
  const [awardedMarks, setAwardedMarks] = useState({});
  const [examinerNotes, setExaminerNotes] = useState({});
  const [overallExaminerFeedback, setOverallExaminerFeedback] = useState('');
  const [zoomedImageUrl, setZoomedImageUrl] = useState(null);
  const [isSavingSubmission, setIsSavingSubmission] = useState(false);
  const [isSavingGrading, setIsSavingGrading] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [showAnswerKeys, setShowAnswerKeys] = useState({});
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Add chapter state
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterPdfPage, setNewChapterPdfPage] = useState('');

  const saveDebounceTimer = useRef(null);

  // Compress image helper for uploaded answer sheets
  const compressImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1600;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Clean text helper (removes markdown and formats math)
  const cleanText = (text) => {
    if (!text) return '';
    let s = String(text);
    s = s.replace(/\\times/g, '×');
    s = s.replace(/\\div/g, '÷');
    s = s.replace(/\\pm/g, '±');
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    s = s.replace(/\\text\{([^}]+)\}/g, '$1');
    s = s.replace(/\\%/g, '%');
    s = s.replace(/\$/g, '');
    s = s.replace(/#{1,6}\s*/g, '');
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/_([^_]+)_/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    s = s.replace(/\*\*/g, '');
    s = s.replace(/^\s*[*#\-:]+\s*/gm, '');
    s = s.replace(/\s*[*#\-:]+\s*$/gm, '');
    return s.trim();
  };

  // Parser for questions
  const parseQuestionsData = (raw) => {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map((q, i) => ({
        ...q,
        id: q.id || i + 1,
        section: cleanText(q.section || 'General Section'),
        question: cleanText(q.question),
        options: (q.options || []).map(opt => cleanText(opt)),
        answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
      }));
    }
    if (typeof raw === 'object' && Array.isArray(raw.questions)) {
      return raw.questions.map((q, i) => ({
        ...q,
        id: q.id || i + 1,
        section: cleanText(q.section || 'General Section'),
        question: cleanText(q.question),
        options: (q.options || []).map(opt => cleanText(opt)),
        answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
      }));
    }
    if (typeof raw === 'string') {
      try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return parsed.map((q, i) => ({
            ...q,
            id: q.id || i + 1,
            section: cleanText(q.section || 'General Section'),
            question: cleanText(q.question),
            options: (q.options || []).map(opt => cleanText(opt)),
            answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
          }));
        }
        if (parsed && Array.isArray(parsed.questions)) {
          return parsed.questions.map((q, i) => ({
            ...q,
            id: q.id || i + 1,
            section: cleanText(q.section || 'General Section'),
            question: cleanText(q.question),
            options: (q.options || []).map(opt => cleanText(opt)),
            answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
          }));
        }
      } catch (_) {}
    }
    return [];
  };

  // Keyboard navigation for question slides
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!viewingModelTest || questionDisplayMode !== 'slide') return;
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      const qList = parseQuestionsData(viewingModelTest.questions);
      if (qList.length <= 1) return;

      if (e.key === 'ArrowRight') {
        setCurrentSlideIndex(prev => Math.min(prev + 1, qList.length - 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingModelTest, questionDisplayMode]);

  // Auth and data listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const querySubjectId = searchParams.get('subjectId');
        const queryParentId = searchParams.get('parentId');
        
        // If queryParentId exists, we are logged in as a student viewing parent's data
        const dataOwnerUid = queryParentId || currentUser.uid;
        
        if (queryParentId) {
          setTestViewMode('student'); // Force student view
        }

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
            if (kId === params.id || (data[kId].name && data[kId].name.toLowerCase() === decodeURIComponent(params.id).toLowerCase())) {
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
              if (sId === querySubjectId || sId === params.subject || sSlug === params.subject) {
                matchedSubj = s;
                matchedSubjId = sId;
                break;
              }
            }
          }

          if (matchedSubj) {
            setSubject({ id: matchedSubjId, ...matchedSubj });
            setBookUrl(matchedSubj.bookUrl || '');

            // Find exam
            let matchedEx = null;
            let matchedExId = null;
            if (matchedKid.exams) {
              for (const eId in matchedKid.exams) {
                const ex = matchedKid.exams[eId];
                const eSlug = ex.title ? ex.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
                if (eId === params.examId || eSlug === params.examId) {
                  matchedEx = ex;
                  matchedExId = eId;
                  break;
                }
              }
            }

            if (matchedEx) {
              setExam({ id: matchedExId, ...matchedEx });
              const currentDist = (matchedSubj.examSettings && matchedSubj.examSettings[matchedExId] && matchedSubj.examSettings[matchedExId].markDistribution) || '';
              setMarkDistValue(currentDist);
            }
          }

          setLoading(false);
        });
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [params.id, params.subject, params.examId, searchParams, router]);

  // Exam status and progress calculations
  const chaptersMap = (subject && exam && subject.chapters && subject.chapters[exam.id]) || {};
  const chaptersList = Object.entries(chaptersMap).map(([cId, chap]) => ({ id: cId, ...chap }));
  const completedChaptersCount = chaptersList.filter(c => c.completed || c.status === 'completed').length;
  const totalChaptersCount = chaptersList.length;
  const progressPercent = totalChaptersCount > 0 ? Math.round((completedChaptersCount / totalChaptersCount) * 100) : 0;

  const examSetting = (subject && exam && subject.examSettings && subject.examSettings[exam.id]) || {};
  const examStatus = examSetting.status || (progressPercent === 100 && totalChaptersCount > 0 ? 'Completed' : (progressPercent > 0 ? 'In Progress' : 'Not Started'));

  const rawModelTests = (subject && exam && subject.modelTests && subject.modelTests[exam.id]) || {};
  const modelTestsList = Object.entries(rawModelTests)
    .map(([tId, test]) => ({ id: tId, ...test }))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Handlers for Chapter completion and status
  const handleToggleChapterComplete = async (chapId, currentCompleted) => {
    if (!user || !kid || !subject || !exam) return;
    const newCompleted = !currentCompleted;
    const chapPath = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${exam.id}/${chapId}`;
    await set(ref(database, `${chapPath}/completed`), newCompleted);
    await set(ref(database, `${chapPath}/status`), newCompleted ? 'completed' : 'not_started');
  };

  const handleUpdateExamStatus = async (newStatus) => {
    if (!user || !kid || !subject || !exam) return;
    const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/status`;
    await set(ref(database, path), newStatus);
  };

  const handleSaveMarkDistribution = async () => {
    if (!user || !kid || !subject || !exam) return;
    const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/markDistribution`;
    await set(ref(database, path), markDistValue.trim());
    setIsEditingMarkDist(false);
  };

  const handleAddChapter = async (e) => {
    e.preventDefault();
    if (!newChapterTitle.trim() || !user || !kid || !subject || !exam) return;
    const chapRef = ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${exam.id}`);
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

  // Open generator modal
  const handleOpenGenerator = () => {
    const today = new Date().toISOString().split('T')[0];
    const formattedToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    setModelTestDate(today);
    setModelTestTitle(`Model Test - ${formattedToday}`);
    setModelTestResult('0');
    setSelectedChaptersForTest(chaptersList.map(c => c.id));
    setTestMarkDistribution(markDistValue);
    setTestDifficulty('Standard');
    setTestGuidelines(['Follow best practice', 'Standard curriculum']);
    setCustomInstructions('');
    setGenerateError('');
    setShowGeneratorModal(true);
  };

  const handleGenerateModelTest = async () => {
    if (!user || !kid || !subject || !exam) return;
    setIsGeneratingTest(true);
    setGenerateError('');

    try {
      const selectedChapterTitles = selectedChaptersForTest.map(id => chaptersMap[id]?.title).filter(Boolean);
      const promptText = `Generate a comprehensive Model Test for student: ${kid.name || 'Student'}.
Subject: ${subject.title}
Exam: ${exam.title}
Difficulty: ${testDifficulty}
Guidelines to strictly follow: ${testGuidelines.join(', ')}
${testMarkDistribution ? `Mark Distribution Structure:\n${testMarkDistribution}\n` : ''}
${selectedChapterTitles.length > 0 ? `Syllabus Chapters to cover:\n${selectedChapterTitles.join(', ')}\n` : ''}
${customInstructions ? `Additional Custom Instructions:\n${customInstructions}\n` : ''}`;

      const questionsText = await generateGeminiContent(promptText);

      const testsRef = ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
      const newTestRef = push(testsRef);
      const testData = {
        title: modelTestTitle.trim() || `Model Test - ${modelTestDate}`,
        date: modelTestDate,
        result: modelTestResult.trim() || '0',
        difficulty: testDifficulty,
        guidelines: testGuidelines,
        chapters: selectedChapterTitles,
        markDistribution: testMarkDistribution.trim(),
        customInstruction: customInstructions.trim(),
        questions: questionsText,
        studentAnswers: {},
        uploadedPages: [],
        examinerGrading: null,
        createdAt: Date.now()
      };
      await set(newTestRef, testData);

      setShowGeneratorModal(false);
      openTestViewer({
        subjectId: subject.id,
        examId: exam.id,
        testId: newTestRef.key,
        ...testData
      });
    } catch (err) {
      console.error('Error generating test:', err);
      setGenerateError(err.message || 'Failed to generate model test');
    } finally {
      setIsGeneratingTest(false);
    }
  };

  // Open test viewer modal
  const openTestViewer = (test) => {
    setViewingModelTest(test);
    setTestViewMode('student');
    setCurrentSlideIndex(0);
    setQuestionDisplayMode('slide');
    setStudentAnswers(test.studentAnswers || {});
    setUploadedAnswerPages(test.uploadedPages || []);
    setAwardedMarks(test.examinerGrading?.awardedMarks || {});
    setExaminerNotes(test.examinerGrading?.examinerNotes || {});
    setOverallExaminerFeedback(test.examinerGrading?.overallFeedback || '');
    setNotificationMsg('');
    setSavingStatus('');
  };

  const handleDeleteModelTest = async (testId) => {
    if (!window.confirm('Are you sure you want to delete this model test?')) return;
    await remove(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${testId}`));
    if (viewingModelTest && viewingModelTest.testId === testId) {
      setViewingModelTest(null);
    }
  };

  // Auto-saving for student answers
  const saveStudentAnswers = async (updatedAnswers, immediate = false) => {
    if (!viewingModelTest || !user || !kid || !subject || !exam) return;
    setSavingStatus('saving');

    const executeSave = async () => {
      try {
        const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
        await set(ref(database, `${path}/studentAnswers`), updatedAnswers);
        setViewingModelTest(prev => ({ ...prev, studentAnswers: updatedAnswers }));
        setSavingStatus('saved');
        setTimeout(() => setSavingStatus(''), 2000);
      } catch (err) {
        console.error('Error auto-saving student answers:', err);
        setSavingStatus('');
      }
    };

    if (saveDebounceTimer.current) clearTimeout(saveDebounceTimer.current);
    if (immediate) {
      await executeSave();
    } else {
      saveDebounceTimer.current = setTimeout(executeSave, 700);
    }
  };

  const handleStudentAnswerChange = (qId, text, immediate = false) => {
    const updated = { ...studentAnswers, [qId]: text };
    setStudentAnswers(updated);
    saveStudentAnswers(updated, immediate);
  };

  // Auto-saving for examiner grading
  const saveExaminerGrading = async (updatedMarks, updatedNotes, updatedFeedback, qIdConfirmed = null) => {
    if (!viewingModelTest || !user || !kid || !subject || !exam) return;
    setSavingStatus('saving');

    try {
      const qList = parseQuestionsData(viewingModelTest.questions);
      const totalMax = qList.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
      const totalAwarded = qList.reduce((acc, q) => acc + (Number(updatedMarks[q.id]) || 0), 0);
      const newResult = `${totalAwarded}/${totalMax}`;

      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
      await set(ref(database, `${path}/result`), newResult);
      const gradingObj = {
        awardedMarks: updatedMarks,
        examinerNotes: updatedNotes,
        overallFeedback: updatedFeedback !== undefined ? updatedFeedback : overallExaminerFeedback,
        totalAwarded,
        totalMax,
        evaluatedAt: Date.now()
      };
      await set(ref(database, `${path}/examinerGrading`), gradingObj);

      setViewingModelTest(prev => ({
        ...prev,
        result: newResult,
        examinerGrading: gradingObj
      }));

      setSavingStatus('saved');
      if (qIdConfirmed !== null) {
        setNotificationMsg(`✓ Mark for Q${qIdConfirmed} confirmed! Result updated: Result ${newResult}`);
        setTimeout(() => setNotificationMsg(''), 3000);
      }
      setTimeout(() => setSavingStatus(''), 2000);
    } catch (err) {
      console.error('Error saving examiner grading:', err);
      setSavingStatus('');
    }
  };

  const handleAwardMarkAndConfirm = (qId, val, maxMarks, note = null) => {
    const num = Math.min(Math.max(0, Number(val) || 0), maxMarks);
    const updatedMarks = { ...awardedMarks, [qId]: num };
    const updatedNotes = note !== null ? { ...examinerNotes, [qId]: note } : examinerNotes;
    setAwardedMarks(updatedMarks);
    if (note !== null) setExaminerNotes(updatedNotes);
    saveExaminerGrading(updatedMarks, updatedNotes, overallExaminerFeedback, qId);
  };

  const handleUploadAnswerSheet = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newPages = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const dataUrl = await compressImage(file);
        newPages.push({
          id: Date.now() + '_' + i,
          name: file.name || `Page ${uploadedAnswerPages.length + i + 1}`,
          dataUrl,
          uploadedAt: Date.now()
        });
      } catch (err) {
        console.error('Error compressing image:', err);
      }
    }

    const updated = [...uploadedAnswerPages, ...newPages];
    setUploadedAnswerPages(updated);
    if (viewingModelTest && user && kid && subject && exam) {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const handleDeleteUploadedPage = async (pageId) => {
    const updated = uploadedAnswerPages.filter(p => p.id !== pageId);
    setUploadedAnswerPages(updated);
    if (viewingModelTest && user && kid && subject && exam) {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  if (loading) {
    return (
      <main className="view-container">
        <div className="card" style={{ maxWidth: '900px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading exam workspace...</p>
        </div>
      </main>
    );
  }

  if (!kid || !subject || !exam) {
    return (
      <main className="view-container">
        <div className="card" style={{ maxWidth: '900px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <h2>Exam or Subject not found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            We couldn't locate the requested exam workspace.
          </p>
          <Link href={`/kid/${params.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
            ← Back to Kid Profile
          </Link>
        </div>
      </main>
    );
  }

  const subjectSlug = subject.title ? subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';

  // Questions for current model test in modal
  const modalQuestions = viewingModelTest ? parseQuestionsData(viewingModelTest.questions) : [];
  const modalTotalMax = modalQuestions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
  const modalAwardedSum = modalQuestions.reduce((acc, q) => acc + (Number(awardedMarks[q.id]) || 0), 0);
  const modalAnsweredCount = modalQuestions.filter(q => Boolean(studentAnswers[q.id]?.trim())).length;
  const modalGradedCount = modalQuestions.filter(q => awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '').length;

  const currentModalDisplayResult = viewingModelTest?.examinerGrading?.evaluatedAt
    ? `${viewingModelTest.examinerGrading.totalAwarded || 0}/${viewingModelTest.examinerGrading.totalMax || modalTotalMax}`
    : (modalAwardedSum > 0
        ? `${modalAwardedSum}/${modalTotalMax}`
        : (viewingModelTest?.result && viewingModelTest.result !== '40/100' && viewingModelTest.result !== 'Pending'
            ? viewingModelTest.result
            : `0/${modalTotalMax}`));

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '960px', width: '100%', padding: '2rem 2.5rem' }}>
        
        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            <Link href={`/kid/${params.id}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'color 0.2s' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              <span>{kid.name || 'Kid Profile'}</span>
            </Link>
            <span>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>{subject.title}</span>
            <span>/</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{exam.title}</span>
          </div>

          <Link href={`/kid/${params.id}`} style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← All Subjects
          </Link>
        </div>

        {/* Exam Title & Status Overview Hero */}
        <div style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(0,0,0,0.3))', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '16px', padding: '1.75rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent-primary)', fontWeight: 700 }}>
                  Subject Exam Workspace
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>•</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{subject.title}</span>
              </div>
              <h1 style={{ margin: 0, fontSize: '1.9rem', color: '#fff', fontWeight: 700, letterSpacing: '-0.5px' }}>
                {exam.title}
              </h1>
            </div>

            {/* Status Selector Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Status:</span>
              <select
                value={examStatus}
                onChange={(e) => handleUpdateExamStatus(e.target.value)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: '20px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: `1px solid ${examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.4)' : examStatus === 'In Progress' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                  background: examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.18)' : examStatus === 'In Progress' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(234, 179, 8, 0.18)',
                  color: examStatus === 'Completed' ? '#34d399' : examStatus === 'In Progress' ? '#c084fc' : '#facc15',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value="Not Started" style={{ background: '#1e1b4b', color: '#facc15' }}>● Not Started</option>
                <option value="In Progress" style={{ background: '#1e1b4b', color: '#c084fc' }}>● In Progress</option>
                <option value="Reviewing" style={{ background: '#1e1b4b', color: '#60a5fa' }}>● Reviewing</option>
                <option value="Completed" style={{ background: '#1e1b4b', color: '#34d399' }}>● Completed</option>
              </select>
            </div>
          </div>

          {/* Progress Bar & Stats */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Syllabus Preparation Progress: <strong style={{ color: '#fff' }}>{progressPercent}%</strong>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: '#34d399' }}>{completedChaptersCount}</strong> of {totalChaptersCount} Chapters Mastered
              </span>
            </div>

            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: progressPercent === 100 ? '#10b981' : 'var(--accent-gradient)',
                  transition: 'width 0.4s ease-out'
                }}
              />
            </div>

            {/* Quick Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.8rem', marginTop: '1.25rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Chapters in Syllabus</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff', marginTop: '0.2rem' }}>
                  {totalChaptersCount}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Model Tests Generated</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.2rem' }}>
                  {modelTestsList.length}
                </div>
              </div>

              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Preparation Status</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: examStatus === 'Completed' ? '#34d399' : '#c084fc', marginTop: '0.3rem' }}>
                  {examStatus}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 1. Mark Distribution Section */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>Mark Distribution</h2>
            </div>

            {!isEditingMarkDist && (
              <button
                type="button"
                onClick={() => setIsEditingMarkDist(true)}
                style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                <span>{markDistValue ? 'Edit Distribution' : 'Set Mark Distribution'}</span>
              </button>
            )}
          </div>

          {isEditingMarkDist ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                value={markDistValue}
                onChange={(e) => setMarkDistValue(e.target.value)}
                placeholder={`e.g.\nMCQ: 20 marks\nShort Questions: 30 marks\nCreative Questions: 50 marks\nTotal: 100 marks`}
                rows={5}
                style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--accent-primary)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', resize: 'vertical' }}
              />

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setMarkDistValue("MCQ: 20 marks\nShort Questions: 30 marks\nCreative/Descriptive: 50 marks\nTotal: 100 marks")}
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  + 100 Marks Standard
                </button>
                <button
                  type="button"
                  onClick={() => setMarkDistValue("MCQ: 15 marks\nShort Questions: 15 marks\nCreative Questions: 20 marks\nTotal: 50 marks")}
                  style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  + 50 Marks CT
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setIsEditingMarkDist(false)}
                  style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveMarkDistribution}
                  className="primary"
                  style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Save Distribution
                </button>
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '10px', padding: '1rem' }}>
              {markDistValue ? (
                <p style={{ margin: 0, fontSize: '0.92rem', color: '#cbd5e1', whiteSpace: 'pre-line', lineHeight: 1.55 }}>
                  {markDistValue}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                  No mark distribution configured for this exam yet. Click <strong>Set Mark Distribution</strong> to set MCQ, short questions, and descriptive mark allocation.
                </p>
              )}
            </div>
          )}
        </div>

        {/* 2. Syllabus & Chapters Accordion Section */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>
                Syllabus & Chapters ({totalChaptersCount})
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setShowAddChapterModal(true)}
              style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Chapter</span>
            </button>
          </div>

          {chaptersList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {chaptersList.map((chap, idx) => {
                const isCompleted = chap.completed || chap.status === 'completed';
                const chapSlug = chap.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const queryParentId = searchParams.get("parentId");
                const parentIdQuery = queryParentId ? `?parentId=${queryParentId}` : '';
                const readHref = `/kid/${params.id}/${subjectSlug}/${chapSlug}${parentIdQuery}`;

                return (
                  <div
                    key={chap.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1rem',
                      background: isCompleted ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${isCompleted ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '10px',
                      gap: '0.75rem',
                      flexWrap: 'wrap',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '220px' }}>
                      {/* Checkbox for chapter completion */}
                      <button
                        type="button"
                        onClick={() => handleToggleChapterComplete(chap.id, isCompleted)}
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '6px',
                          border: `1.5px solid ${isCompleted ? '#10b981' : 'rgba(255,255,255,0.25)'}`,
                          background: isCompleted ? '#10b981' : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                        title={isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                      >
                        {isCompleted && '✓'}
                      </button>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.96rem', fontWeight: 600, color: isCompleted ? '#34d399' : '#fff' }}>
                            {chap.title}
                          </span>
                          {chap.pdfPage && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.45rem', borderRadius: '4px' }}>
                              p. {chap.pdfPage}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: isCompleted ? '#34d399' : 'var(--text-secondary)', opacity: 0.85 }}>
                          {isCompleted ? 'Status: Mastered & Completed' : 'Status: To Study / In Progress'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <Link
                        href={readHref}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.82rem',
                          fontWeight: 500,
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>Study Chapter</span>
                        <span>📖</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                No chapters added to this syllabus yet. Click <strong>Add Chapter</strong> to organize the exam curriculum.
              </p>
            </div>
          )}
        </div>

        {/* 3. Model Tests Workspace */}
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>
                Model Tests ({modelTestsList.length})
              </h2>
            </div>

            <button
              type="button"
              onClick={handleOpenGenerator}
              className="primary"
              style={{ padding: '0.45rem 1.1rem', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '8px', cursor: 'pointer' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Generate Model Test</span>
            </button>
          </div>

          {modelTestsList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {modelTestsList.map(test => {
                const displayScore = test.examinerGrading?.totalAwarded !== undefined 
                  ? `${test.examinerGrading.totalAwarded}/${test.examinerGrading.totalMax || 100}`
                  : (test.result && test.result !== '40/100' && test.result !== 'Pending' ? test.result : '0');
                const isGraded = Boolean(test.examinerGrading?.evaluatedAt || (test.result && test.result !== '40/100' && test.result !== '0' && test.result !== 'Pending'));

                return (
                  <div
                    key={test.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.9rem 1.1rem',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '10px',
                      flexWrap: 'wrap',
                      gap: '0.75rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.98rem', fontWeight: 600, color: '#fff' }}>
                          {test.title || `Model Test - ${test.date}`}
                        </span>
                        {test.difficulty && (
                          <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {test.difficulty}
                          </span>
                        )}
                        {test.uploadedPages && test.uploadedPages.length > 0 && (
                          <span style={{ fontSize: '0.7rem', padding: '0.12rem 0.5rem', borderRadius: '10px', background: 'rgba(59,130,246,0.18)', color: '#60a5fa', fontWeight: 600 }}>
                            📄 {test.uploadedPages.length} {test.uploadedPages.length === 1 ? 'Page' : 'Pages'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>📅 {test.date || 'No date'}</span>
                        {test.chapters && test.chapters.length > 0 && (
                          <span> • {test.chapters.length} chapters covered</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      {/* Result Badge */}
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          padding: '0.3rem 0.75rem',
                          borderRadius: '20px',
                          background: isGraded ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                          border: `1px solid ${isGraded ? 'rgba(16, 185, 129, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                          color: isGraded ? '#34d399' : '#facc15'
                        }}
                      >
                        Result {displayScore}
                      </span>

                      {/* Open Test Button */}
                      <button
                        type="button"
                        onClick={() => openTestViewer({ subjectId: subject.id, examId: exam.id, testId: test.id, ...test })}
                        style={{ padding: '0.38rem 0.85rem', fontSize: '0.82rem', background: 'rgba(139, 92, 246, 0.18)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.35)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        <span>Open Test</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteModelTest(test.id)}
                        style={{ padding: '0.38rem', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        title="Delete test"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                No model tests generated yet. Click <strong>Generate Model Test</strong> to create one using the syllabus and mark distribution.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Add Chapter Modal */}
      {showAddChapterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '1.5rem', textAlign: 'left' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#fff' }}>Add Chapter to Syllabus</h3>
            <form onSubmit={handleAddChapter} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Chapter Title</label>
                <input
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  placeholder="e.g. Chapter 4: Fractions & Decimals"
                  required
                  style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff' }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Textbook Page (Optional)</label>
                <input
                  type="text"
                  value={newChapterPdfPage}
                  onChange={(e) => setNewChapterPdfPage(e.target.value)}
                  placeholder="e.g. 42"
                  style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddChapterModal(false)}
                  style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button type="submit" className="primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '6px', cursor: 'pointer' }}>
                  Add Chapter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Model Test Generator Modal */}
      {showGeneratorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#fff' }}>Generate Model Test</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subject.title} • {exam.title}</span>
              </div>
              <button onClick={() => setShowGeneratorModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', cursor: 'pointer' }}>✕</button>
            </div>

            {generateError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {generateError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Title & Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Test Title</label>
                  <input
                    type="text"
                    value={modelTestTitle}
                    onChange={(e) => setModelTestTitle(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Date</label>
                  <input
                    type="date"
                    value={modelTestDate}
                    onChange={(e) => setModelTestDate(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Syllabus Chapters to Cover */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Chapters to Include ({selectedChaptersForTest.length} selected)
                </label>
                {chaptersList.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.4rem', maxHeight: '140px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '8px' }}>
                    {chaptersList.map(chap => {
                      const isSel = selectedChaptersForTest.includes(chap.id);
                      return (
                        <label key={chap.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#cbd5e1', cursor: 'pointer', padding: '0.2rem' }}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedChaptersForTest(prev => [...prev, chap.id]);
                              else setSelectedChaptersForTest(prev => prev.filter(id => id !== chap.id));
                            }}
                          />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chap.title}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No syllabus chapters. General subject concepts will be covered.</p>
                )}
              </div>

              {/* Mark Distribution Preview */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Mark Distribution Pattern</label>
                <textarea
                  value={testMarkDistribution}
                  onChange={(e) => setTestMarkDistribution(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.82rem' }}
                />
              </div>

              {/* Difficulty & Guidelines */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Difficulty</label>
                  <select
                    value={testDifficulty}
                    onChange={(e) => setTestDifficulty(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', background: '#1e1b4b', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="Easy">Easy (Foundation)</option>
                    <option value="Standard">Standard (Board level)</option>
                    <option value="Difficult">Difficult (Challenging)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Custom Instruction (Max 200 words)</label>
                  <input
                    type="text"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Focus on word problems and LCM/HCF concepts"
                    style={{ width: '100%', padding: '0.5rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleGenerateModelTest}
                  disabled={isGeneratingTest}
                  className="primary"
                  style={{ flex: 1, padding: '0.7rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: isGeneratingTest ? 'not-allowed' : 'pointer' }}
                >
                  {isGeneratingTest ? 'Generating with Gemini AI...' : '✨ Generate Model Test'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGeneratorModal(false)}
                  style={{ padding: '0.7rem 1.2rem', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Test Question Paper, Answer Sheet & Grading Modal */}
      {viewingModelTest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '840px', width: '100%', maxHeight: '94vh', overflowY: 'auto', position: 'relative', textAlign: 'left', padding: '1.8rem' }}>
            
            {/* Viewer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.45rem', color: '#fff' }}>
                  {viewingModelTest.title || 'Model Test'}
                </h2>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span>📅 {viewingModelTest.date || 'Today'}</span>
                  <span>• Total Marks: {modalTotalMax}</span>
                  {viewingModelTest.difficulty && (
                    <span style={{ padding: '0.1rem 0.5rem', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.72rem' }}>
                      {viewingModelTest.difficulty}
                    </span>
                  )}
                </div>
              </div>

              <button 
                onClick={() => setViewingModelTest(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.4rem', padding: '0.2rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            {/* Notification Banner */}
            {notificationMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 600 }}>
                {notificationMsg}
              </div>
            )}

            {/* Mode Selector Tab Bar & Current Result */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '10px', marginBottom: '1.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => setTestViewMode('student')}
                  style={{
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: testViewMode === 'student' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                    color: testViewMode === 'student' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  👨‍🎓 Student: Answer & Upload Paper
                </button>
                <button
                  type="button"
                  onClick={() => setTestViewMode('examiner')}
                  style={{
                    padding: '0.45rem 1rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    background: testViewMode === 'examiner' ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.05)',
                    color: testViewMode === 'examiner' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  📝 Examiner: Check & Give Number
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Current:</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.65rem', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  Result {currentModalDisplayResult}
                </span>
              </div>
            </div>

            {/* Uploaded Answer Paper Gallery */}
            {testViewMode === 'examiner' && (
              <div style={{ marginBottom: '1.25rem', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '12px', padding: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1rem' }}>📄</span>
                    <h3 style={{ margin: 0, fontSize: '0.92rem', color: '#fff', fontWeight: 600 }}>Student's Uploaded Answer Paper</h3>
                    <span style={{ fontSize: '0.72rem', padding: '0.1rem 0.5rem', background: 'rgba(255,255,255,0.08)', borderRadius: '10px', color: 'var(--text-secondary)' }}>
                      {uploadedAnswerPages.length} {uploadedAnswerPages.length === 1 ? 'Page' : 'Pages'}
                    </span>
                  </div>
                  {uploadedAnswerPages.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Click any page to zoom fullscreen while grading</span>
                  )}
                </div>

                {uploadedAnswerPages.length > 0 ? (
                  <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.3rem' }}>
                    {uploadedAnswerPages.map((page, idx) => (
                      <div
                        key={page.id || idx}
                        onClick={() => setZoomedImageUrl(page.dataUrl)}
                        style={{ flexShrink: 0, cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.4)', width: '120px', textAlign: 'center' }}
                      >
                        <img src={page.dataUrl} alt={page.name || `Page ${idx + 1}`} style={{ width: '100%', height: '95px', objectFit: 'cover', display: 'block' }} />
                        <div style={{ padding: '0.25rem', fontSize: '0.72rem', color: '#fff', background: 'rgba(0,0,0,0.6)' }}>Page {idx + 1} 🔍</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                    Student has not uploaded photos of handwritten answer sheets yet.
                  </p>
                )}
              </div>
            )}

            {testViewMode === 'student' && (
              <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px dashed var(--glass-border)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.15rem 0', fontSize: '0.98rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>📸</span>
                      <span>Handwritten Answer Paper ({uploadedAnswerPages.length} Pages Attached)</span>
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Take photos of physical answer sheets and attach here.</p>
                  </div>

                  <label style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>Upload Photo(s)</span>
                    <input type="file" accept="image/*" multiple onChange={handleUploadAnswerSheet} style={{ display: 'none' }} />
                  </label>
                </div>

                {uploadedAnswerPages.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
                    {uploadedAnswerPages.map((page, idx) => (
                      <div key={page.id || idx} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.5)' }}>
                        <img src={page.dataUrl} alt={page.name || `Page ${idx + 1}`} onClick={() => setZoomedImageUrl(page.dataUrl)} style={{ width: '100%', height: '90px', objectFit: 'cover', cursor: 'pointer', display: 'block' }} />
                        <div style={{ padding: '0.25rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.7)', fontSize: '0.72rem' }}>
                          <span style={{ color: '#fff' }}>Page {idx + 1}</span>
                          <button type="button" onClick={() => handleDeleteUploadedPage(page.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Slide Navigation Header Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  {questionDisplayMode === 'slide' ? `Question ${currentSlideIndex + 1} of ${modalQuestions.length}` : `All Questions (${modalQuestions.length})`}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.15rem 0.6rem', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
                  {testViewMode === 'student' ? `${modalAnsweredCount}/${modalQuestions.length} Answered` : `${modalGradedCount}/${modalQuestions.length} Graded • Awarded: ${modalAwardedSum}/${modalTotalMax}`}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {savingStatus === 'saving' && (
                  <span style={{ fontSize: '0.78rem', color: '#facc15', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#facc15' }} />
                    <span>Saving...</span>
                  </span>
                )}
                {savingStatus === 'saved' && (
                  <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>✓ Saved</span>
                )}

                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <button
                    type="button"
                    onClick={() => setQuestionDisplayMode('slide')}
                    style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, border: 'none', borderRadius: '4px', background: questionDisplayMode === 'slide' ? 'var(--accent-primary)' : 'transparent', color: questionDisplayMode === 'slide' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    ◫ Slide View
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionDisplayMode('list')}
                    style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', fontWeight: 600, border: 'none', borderRadius: '4px', background: questionDisplayMode === 'list' ? 'var(--accent-primary)' : 'transparent', color: questionDisplayMode === 'list' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    ☰ All List
                  </button>
                </div>
              </div>
            </div>

            {/* Slide Progress Bar */}
            {questionDisplayMode === 'slide' && modalQuestions.length > 0 && (
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div style={{ width: `${((currentSlideIndex + 1) / Math.max(1, modalQuestions.length)) * 100}%`, height: '100%', background: 'var(--accent-gradient)', transition: 'width 0.25s ease-out' }} />
              </div>
            )}

            {/* Question Jump Pills */}
            {questionDisplayMode === 'slide' && modalQuestions.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
                {modalQuestions.map((q, qIdx) => {
                  const isActive = qIdx === currentSlideIndex;
                  const isAns = Boolean(studentAnswers[q.id]?.trim());
                  const isGrd = awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '';
                  const awd = awardedMarks[q.id];
                  const qMax = Number(q.marks) || 5;

                  return (
                    <button
                      key={q.id || qIdx}
                      type="button"
                      onClick={() => {
                        if (testViewMode === 'student') saveStudentAnswers(studentAnswers, true);
                        else saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                        setCurrentSlideIndex(qIdx);
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '0.35rem 0.65rem',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                        background: isActive ? 'rgba(139, 92, 246, 0.25)' : (testViewMode === 'student' ? (isAns ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)') : (isGrd ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)')),
                        color: isActive ? '#fff' : (testViewMode === 'student' ? (isAns ? '#34d399' : 'var(--text-secondary)') : (isGrd ? '#34d399' : 'var(--text-secondary)')),
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <span>Q{q.id || qIdx + 1}</span>
                      {testViewMode === 'student' && isAns && <span style={{ fontSize: '0.7rem', color: '#34d399' }}>✓</span>}
                      {testViewMode === 'examiner' && isGrd && <span style={{ fontSize: '0.68rem', color: '#34d399' }}>[{awd}/{qMax}]</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Questions Container */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              {(questionDisplayMode === 'slide' 
                ? (modalQuestions[currentSlideIndex] ? [modalQuestions[currentSlideIndex]] : [])
                : modalQuestions
              ).map((q, idx) => {
                const actualIndex = questionDisplayMode === 'slide' ? currentSlideIndex : idx;
                const qMarks = Number(q.marks) || 5;
                const awarded = awardedMarks[q.id] !== undefined ? awardedMarks[q.id] : '';
                const studentAns = studentAnswers[q.id] || '';
                const hasKey = Boolean(q.answerKey);
                const isAns = Boolean(studentAns.trim());
                const isGrd = awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '';

                return (
                  <div
                    key={q.id || actualIndex}
                    style={{
                      background: 'rgba(0,0,0,0.28)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      padding: '1.3rem',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.15)', padding: '0.18rem 0.6rem', borderRadius: '6px' }}>
                          Q{q.id || actualIndex + 1}
                        </span>
                        {q.section && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {q.section}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {testViewMode === 'student' && isAns && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                            ✓ Answered
                          </span>
                        )}
                        {testViewMode === 'examiner' && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isGrd ? '#34d399' : '#facc15', background: isGrd ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                            {isGrd ? `✓ Awarded: ${awarded}/${qMarks}` : 'Pending Marking'}
                          </span>
                        )}
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9', background: 'rgba(255,255,255,0.06)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>
                          [{qMarks} Marks]
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '1.02rem', color: '#f8fafc', lineHeight: 1.6, marginBottom: '0.9rem', whiteSpace: 'pre-line' }}>
                      {cleanText(q.question)}
                    </div>

                    {q.options && q.options.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '0.9rem' }}>
                        {q.options.map((opt, optIdx) => {
                          const isPicked = studentAns === opt || studentAns.startsWith(opt.slice(0, 2));
                          const isCorrectKey = hasKey && (q.answerKey.toLowerCase().includes(opt.slice(0, 2).toLowerCase()) || q.answerKey.toLowerCase().includes(opt.toLowerCase()));

                          return (
                            <button
                              key={optIdx}
                              type="button"
                              onClick={() => {
                                if (testViewMode === 'student') handleStudentAnswerChange(q.id, opt, true);
                              }}
                              disabled={testViewMode === 'examiner'}
                              style={{
                                padding: '0.55rem 0.85rem',
                                borderRadius: '8px',
                                textAlign: 'left',
                                fontSize: '0.88rem',
                                background: isPicked ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isPicked ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                                color: isPicked ? '#fff' : 'var(--text-secondary)',
                                cursor: testViewMode === 'student' ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}
                            >
                              <span>{opt}</span>
                              {testViewMode === 'student' && isPicked && <span style={{ color: '#a78bfa' }}>✓</span>}
                              {testViewMode === 'examiner' && isCorrectKey && (
                                <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>Key ✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Student Answer Space */}
                    <div style={{ marginTop: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          ✍️ Student's Answer / Solution:
                        </label>
                        {studentAns && <span style={{ fontSize: '0.72rem', color: '#34d399' }}>✓ Response entered & saved</span>}
                      </div>

                      {testViewMode === 'student' ? (
                        <div>
                          <textarea
                            value={studentAns}
                            onChange={(e) => handleStudentAnswerChange(q.id, e.target.value)}
                            placeholder="Write your step-by-step solution here..."
                            rows={3}
                            style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => saveStudentAnswers(studentAnswers, true)}
                              style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid var(--accent-primary)', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              💾 Save Answer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', fontSize: '0.88rem', color: studentAns ? '#e2e8f0' : 'var(--text-secondary)', fontStyle: studentAns ? 'normal' : 'italic', minHeight: '40px', whiteSpace: 'pre-line' }}>
                          {studentAns || 'No typed answer.'}
                        </div>
                      )}
                    </div>

                    {/* Examiner Evaluation Space */}
                    {testViewMode === 'examiner' && (
                      <div style={{ marginTop: '0.85rem', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px', padding: '0.85rem' }}>
                        {hasKey && (
                          <div style={{ marginBottom: '0.65rem' }}>
                            <button
                              type="button"
                              onClick={() => setShowAnswerKeys(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}
                            >
                              {showAnswerKeys[q.id] ? '▲ Hide Marking Key' : '▼ View Marking Key'}
                            </button>
                            {showAnswerKeys[q.id] && (
                              <div style={{ marginTop: '0.35rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', fontSize: '0.82rem', color: '#cbd5e1', borderLeft: '3px solid var(--accent-primary)' }}>
                                💡 <strong>Rubric:</strong> {q.answerKey}
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9' }}>Give Number / Marks:</span>
                            <input
                              type="number"
                              min={0}
                              max={qMarks}
                              value={awarded}
                              onChange={(e) => {
                                const num = Math.min(Math.max(0, Number(e.target.value) || 0), qMarks);
                                setAwardedMarks(prev => ({ ...prev, [q.id]: num }));
                              }}
                              placeholder="0"
                              style={{ width: '60px', padding: '0.3rem 0.5rem', fontSize: '0.88rem', fontWeight: 700, color: '#34d399', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent-primary)', borderRadius: '6px' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ {qMarks} Marks</span>
                          </div>

                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => handleAwardMarkAndConfirm(q.id, qMarks, qMarks)} style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '4px', cursor: 'pointer' }}>
                              Full ({qMarks})
                            </button>
                            <button type="button" onClick={() => handleAwardMarkAndConfirm(q.id, Math.round(qMarks / 2), qMarks)} style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#facc15', borderRadius: '4px', cursor: 'pointer' }}>
                              Half ({Math.round(qMarks / 2)})
                            </button>
                            <button type="button" onClick={() => handleAwardMarkAndConfirm(q.id, 0, qMarks)} style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '4px', cursor: 'pointer' }}>
                              0
                            </button>
                            <button type="button" onClick={() => handleAwardMarkAndConfirm(q.id, awardedMarks[q.id] !== undefined ? awardedMarks[q.id] : 0, qMarks)} style={{ padding: '0.22rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #34d399', color: '#34d399', borderRadius: '4px', cursor: 'pointer' }}>
                              ✓ Confirm Mark
                            </button>
                          </div>
                        </div>

                        <div style={{ marginTop: '0.6rem' }}>
                          <input
                            type="text"
                            value={examinerNotes[q.id] || ''}
                            onChange={(e) => {
                              const note = e.target.value;
                              setExaminerNotes(prev => ({ ...prev, [q.id]: note }));
                              saveExaminerGrading(awardedMarks, { ...examinerNotes, [q.id]: note }, overallExaminerFeedback);
                            }}
                            placeholder="Teacher's note or correction on this question..."
                            style={{ width: '100%', padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#cbd5e1' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Slide Navigation Controls */}
            {questionDisplayMode === 'slide' && modalQuestions.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '0.8rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (currentSlideIndex > 0) {
                      if (testViewMode === 'student') saveStudentAnswers(studentAnswers, true);
                      else saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                      setCurrentSlideIndex(prev => prev - 1);
                    }
                  }}
                  disabled={currentSlideIndex === 0}
                  style={{
                    padding: '0.55rem 1.2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: currentSlideIndex === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                    color: currentSlideIndex === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                    cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                >
                  ← Previous Question
                </button>

                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.83rem', fontWeight: 600, color: '#f1f5f9' }}>
                    Question {currentSlideIndex + 1} of {modalQuestions.length}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Tip: Use ← → keys to slide</div>
                </div>

                {currentSlideIndex < modalQuestions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (testViewMode === 'student') saveStudentAnswers(studentAnswers, true);
                      else saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                      setCurrentSlideIndex(prev => prev + 1);
                    }}
                    style={{
                      padding: '0.55rem 1.2rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600
                    }}
                  >
                    Next Question →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (testViewMode === 'student') {
                        saveStudentAnswers(studentAnswers, true);
                        setNotificationMsg('✅ All responses submitted successfully!');
                        setTimeout(() => setNotificationMsg(''), 3000);
                      } else {
                        saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                        setNotificationMsg(`🎉 Paper evaluated successfully! Result published: Result ${modalAwardedSum}/${modalTotalMax}`);
                        setTimeout(() => setNotificationMsg(''), 4000);
                      }
                    }}
                    className="primary"
                    style={{ padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {testViewMode === 'student' ? '🚀 Finish & Submit Paper' : `✅ Finish Checking (${modalAwardedSum}/${modalTotalMax})`}
                  </button>
                )}
              </div>
            )}

            {/* Examiner Overall Feedback */}
            {testViewMode === 'examiner' && (
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '1.15rem', marginTop: '1.25rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.8rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', color: '#fff' }}>Examiner Grading Summary</h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Total Awarded: <strong style={{ color: '#34d399', fontSize: '1rem' }}>{modalAwardedSum}</strong> / {modalTotalMax} Marks
                    </p>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Examiner Overall Feedback / Remarks:</label>
                  <input
                    type="text"
                    value={overallExaminerFeedback}
                    onChange={(e) => {
                      setOverallExaminerFeedback(e.target.value);
                      saveExaminerGrading(awardedMarks, examinerNotes, e.target.value);
                    }}
                    placeholder="e.g. Well prepared, review word problems."
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)', marginTop: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => copyToClipboard(viewingModelTest.questions)}
                  style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  {copiedSuccess ? '✓ Copied' : 'Copy Test'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '6px', cursor: 'pointer' }}
                >
                  🖨️ Print
                </button>
              </div>

              <button
                type="button"
                onClick={() => setViewingModelTest(null)}
                style={{ padding: '0.55rem 1.4rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem' }}
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Fullscreen Zoom Image Modal */}
      {zoomedImageUrl && (
        <div 
          onClick={() => setZoomedImageUrl(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: '1rem', cursor: 'zoom-out' }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img src={zoomedImageUrl} alt="Answer sheet full zoom" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
            <button
              onClick={() => setZoomedImageUrl(null)}
              style={{ position: 'absolute', top: '-15px', right: '-15px', width: '32px', height: '32px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </main>
  );
}
