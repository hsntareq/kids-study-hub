"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { generateGeminiContent, autoReviewExamWithAI } from '../../../lib/gemini';
import { onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { ref, get, push, set, onValue, remove } from 'firebase/database';
import Link from 'next/link';
import MarkDistributionField from '../../../components/MarkDistributionField';

function KidProfileContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [kid, setKid] = useState(null);
  const [user, setUser] = useState(null);
  const [isStudentView, setIsStudentView] = useState(false);
  
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState('subject'); // 'subject', 'exam', 'chapter'
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [subjectsLayoutMode, setSubjectsLayoutMode] = useState('grid'); // 'grid' | 'carousel'
  const [expandedExams, setExpandedExams] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [newPdfPage, setNewPdfPage] = useState('');
  const [editPdfPage, setEditPdfPage] = useState('');
  const [settingsSubject, setSettingsSubject] = useState(null);
  const [subjectBookUrl, setSubjectBookUrl] = useState('');
  const [subjectExamRetentionDays, setSubjectExamRetentionDays] = useState('7');
  
  const [settingsExamInfo, setSettingsExamInfo] = useState(null);
  const [examMarkDistribution, setExamMarkDistribution] = useState('');

  // Mark Distribution inline edit state
  const [editingMarkDistKey, setEditingMarkDistKey] = useState(null); // `${subjectId}_${examId}`
  const [inlineMarkDistValue, setInlineMarkDistValue] = useState('');

  // Exam Archive state
  const [archiveToast, setArchiveToast] = useState(null); // { message, subjectId, examId }
  const [showArchivedExamsMap, setShowArchivedExamsMap] = useState({}); // { [subjectId]: boolean }

  // Model test popover / generator state
  const [modelTestTarget, setModelTestTarget] = useState(null); // { subject, exam }
  const [modelTestDate, setModelTestDate] = useState('');
  const [modelTestTitle, setModelTestTitle] = useState('');
  const [modelTestResult, setModelTestResult] = useState('0');
  const [selectedChaptersForTest, setSelectedChaptersForTest] = useState([]);
  const [testMarkDistribution, setTestMarkDistribution] = useState('');
  const [testDifficulty, setTestDifficulty] = useState('Standard'); // 'Easy', 'Standard', 'Difficult'
  const [testGuidelines, setTestGuidelines] = useState(['Follow best practice', 'Standard curriculum']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [selectedBookIdsForTest, setSelectedBookIdsForTest] = useState([]);

  // Model test viewer, sliding & grading state
  const [viewingModelTest, setViewingModelTest] = useState(null);
  const [testViewMode, setTestViewMode] = useState('student'); // 'student' or 'examiner'
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [questionDisplayMode, setQuestionDisplayMode] = useState('slide'); // 'slide' or 'list'
  const [savingStatus, setSavingStatus] = useState(''); // '' | 'saving' | 'saved'
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
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [aiReviewingQId, setAiReviewingQId] = useState(null);

  const [editingResultTestId, setEditingResultTestId] = useState(null);
  const [tempResultInput, setTempResultInput] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Timer & Exam completion state
  const [isExamStarted, setIsExamStarted] = useState(false);
  const [isExamFinished, setIsExamFinished] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState(null);
  const [examSubmittedAt, setExamSubmittedAt] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [modelTestDuration, setModelTestDuration] = useState(60);
  const [examDurationMinutes, setExamDurationMinutes] = useState(null);
  const [editingDurationModal, setEditingDurationModal] = useState(null);
  const [tempDurationValue, setTempDurationValue] = useState(60);

  // Exam pause state
  const [isExamPaused, setIsExamPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState(null);          // timestamp when paused
  const [totalPausedMs, setTotalPausedMs] = useState(0);  // total accumulated paused time
  const [pauseLog, setPauseLog] = useState([]);            // [{ reason, pausedAt, resumedAt }]
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReasonInput, setPauseReasonInput] = useState('');

  // Question Navigator State (Scroller vs Collapsible by Question Type)
  const [navigatorViewMode, setNavigatorViewMode] = useState('collapsible'); // 'collapsible' or 'scroller'
  const [selectedSetFilter, setSelectedSetFilter] = useState('all');
  const [collapsedSets, setCollapsedSets] = useState({});
  const [isNavigatorCollapsed, setIsNavigatorCollapsed] = useState(false);
  const pillsScrollRef = useRef(null);

  // Student email assignment & Teacher invite state
  const [showAssignEmailModal, setShowAssignEmailModal] = useState(false);
  const [studentEmailInput, setStudentEmailInput] = useState('');
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailModalError, setEmailModalError] = useState('');

  const [showInviteTeacherModal, setShowInviteTeacherModal] = useState(false);
  const [teacherEmailInput, setTeacherEmailInput] = useState('');
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteModalError, setInviteModalError] = useState('');
  const [inviteModalSuccess, setInviteModalSuccess] = useState('');

  // Set Password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordModalError, setPasswordModalError] = useState('');
  const [passwordModalSuccess, setPasswordModalSuccess] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Delete request state (student requests, parent approves)
  const [deleteRequests, setDeleteRequests] = useState({}); // { [testId]: { [qId]: { questionText, requestedAt, status } } }

  const saveDebounceTimer = useRef(null);

  const toggleSubject = (subjectId) => {
    setExpandedSubjects(prev => ({ ...prev, [subjectId]: !prev[subjectId] }));
  };

  const toggleExam = (subjectId, examId) => {
    const key = `${subjectId}_${examId}`;
    setExpandedExams(prev => ({
      ...prev,
      [key]: prev[key] !== undefined ? !prev[key] : false
    }));
  };

  const countWords = (text) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const getSubjectIcon = (title) => {
    const t = (title || '').toLowerCase();
    if (t.includes('math')) return '📐';
    if (t.includes('scien') || t.includes('physic') || t.includes('chem') || t.includes('bio')) return '🔬';
    if (t.includes('eng') || t.includes('lit') || t.includes('gram') || t.includes('read') || t.includes('lang')) return '📖';
    if (t.includes('hist') || t.includes('geog') || t.includes('social') || t.includes('civic')) return '🌍';
    if (t.includes('comp') || t.includes('ict') || t.includes('code') || t.includes('tech') || t.includes('program')) return '💻';
    if (t.includes('art') || t.includes('draw')) return '🎨';
    if (t.includes('music')) return '🎵';
    if (t.includes('islam') || t.includes('relig') || t.includes('moral')) return '🕌';
    if (t.includes('bangla') || t.includes('bengali')) return '🇧🇩';
    return '📚';
  };

  // Image compressor for answer sheet upload
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

  // Clean text by stripping all markdown symbols, asterisks, and converting LaTeX to plain readable text
  const cleanText = (text) => {
    if (!text) return '';
    let s = String(text);
    // LaTeX conversions to standard readable math symbols
    s = s.replace(/\\times/g, '×');
    s = s.replace(/\\div/g, '÷');
    s = s.replace(/\\pm/g, '±');
    s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    s = s.replace(/\\text\{([^}]+)\}/g, '$1');
    s = s.replace(/\\%/g, '%');
    s = s.replace(/\$/g, '');
    // Markdown headers and paired formatting removal
    s = s.replace(/#{1,6}\s*/g, '');
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/_([^_]+)_/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    // Strip ANY remaining stray double or single asterisks, hashes, colons, or bullets
    s = s.replace(/\*\*/g, '');
    s = s.replace(/^\s*[*#\-:]+\s*/gm, '');
    s = s.replace(/\s*[*#\-:]+\s*$/gm, '');
    return s.trim();
  };

  // Enrich questions with set numbers (MCQ is Set 1 -> 1.1, 1.2..., Set 2 -> 2.1, 2.2...)
  const enrichWithSetNumbers = (questions) => {
    if (!questions || !Array.isArray(questions) || questions.length === 0) return [];

    const getNormalizedSecKey = (q) => {
      let rawSec = (q.section || '').trim();
      const hasOpts = q.options && q.options.length > 0;
      const isMcq = hasOpts || /mcq|multiple choice/i.test(rawSec);

      let secKey = rawSec;
      if (!secKey) {
        return isMcq ? '1. Multiple Choice Questions (MCQ)' : 'Descriptive Questions';
      }
      // Remove question-specific suffixes like "(Question 1)", "(Q1)", "- Question 1" so sections group questions cleanly
      secKey = secKey
        .replace(/\s*[\(\[]\s*(?:question|q)\s*\d+\s*[\)\]]/gi, '')
        .replace(/\s*-\s*(?:question|q)\s*\d+\b/gi, '')
        .trim();
      if (!secKey) {
        return isMcq ? '1. Multiple Choice Questions (MCQ)' : 'Descriptive Questions';
      }
      return secKey;
    };

    const sectionOrder = [];
    const sectionInfo = new Map();

    questions.forEach((q, i) => {
      const hasOpts = q.options && q.options.length > 0;
      const isMcq = hasOpts || /mcq|multiple choice/i.test(q.section || '');
      const secKey = getNormalizedSecKey(q);

      if (!sectionInfo.has(secKey)) {
        sectionInfo.set(secKey, {
          name: secKey,
          isMcq,
          firstIndex: i
        });
        sectionOrder.push(secKey);
      }
    });

    const sectionToSetNum = new Map();
    const usedNumbers = new Set();

    // 1. Any section with explicit leading number like "1. MCQ" or "2. Short Questions"
    sectionOrder.forEach(secKey => {
      const numMatch = secKey.match(/^(\d+)[.):\s]/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        sectionToSetNum.set(secKey, num);
        usedNumbers.add(num);
      }
    });

    // 2. If MCQ section exists and doesn't have an explicit number, assign 1
    const mcqSec = sectionOrder.find(sec => sectionInfo.get(sec)?.isMcq);
    if (mcqSec && !sectionToSetNum.has(mcqSec)) {
      if (!usedNumbers.has(1)) {
        sectionToSetNum.set(mcqSec, 1);
        usedNumbers.add(1);
      }
    }

    // 3. Assign sequential numbers (1, 2, 3...) to remaining sections
    let currentCounter = 1;
    sectionOrder.forEach(secKey => {
      if (!sectionToSetNum.has(secKey)) {
        while (usedNumbers.has(currentCounter)) {
          currentCounter++;
        }
        sectionToSetNum.set(secKey, currentCounter);
        usedNumbers.add(currentCounter);
      }
    });

    const setCounters = {};

    return questions.map((q) => {
      const secKey = getNormalizedSecKey(q);
      const setNum = sectionToSetNum.get(secKey) || 1;
      setCounters[setNum] = (setCounters[setNum] || 0) + 1;
      const subNum = setCounters[setNum];
      const displayNumber = `${setNum}.${subNum}`;

      let cleanSecTitle = secKey.replace(/^(?:section|part)?\s*\d+[:.)\s-]*/i, '').trim();
      if (!cleanSecTitle) cleanSecTitle = secKey;

      return {
        ...q,
        setNumber: setNum,
        subNumber: subNum,
        displayNumber,
        cleanSectionTitle: cleanSecTitle
      };
    });
  };

  // Parser to convert questions into structured clean array without any markdown
  const parseQuestionsData = (raw) => {
    if (!raw) return [];

    let result = [];

    // If already an array of question objects
    if (Array.isArray(raw)) {
      result = raw.map((q, i) => ({
        ...q,
        id: q.id || i + 1,
        section: cleanText(q.section || 'General Section'),
        question: cleanText(q.question),
        options: (q.options || []).map(opt => cleanText(opt)),
        answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
      }));
      return enrichWithSetNumbers(result);
    }

    // If an object with a .questions array
    if (typeof raw === 'object' && Array.isArray(raw.questions)) {
      result = raw.questions.map((q, i) => ({
        ...q,
        id: q.id || i + 1,
        section: cleanText(q.section || 'General Section'),
        question: cleanText(q.question),
        options: (q.options || []).map(opt => cleanText(opt)),
        answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
      }));
      return enrichWithSetNumbers(result);
    }

    if (typeof raw === 'string') {
      try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          return enrichWithSetNumbers(parsed.map((q, i) => ({
            ...q,
            id: q.id || i + 1,
            section: cleanText(q.section || 'General Section'),
            question: cleanText(q.question),
            options: (q.options || []).map(opt => cleanText(opt)),
            answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
          })));
        }
        if (parsed && Array.isArray(parsed.questions)) {
          return enrichWithSetNumbers(parsed.questions.map((q, i) => ({
            ...q,
            id: q.id || i + 1,
            section: cleanText(q.section || 'General Section'),
            question: cleanText(q.question),
            options: (q.options || []).map(opt => cleanText(opt)),
            answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
          })));
        }
        if (parsed && parsed.modelTest && Array.isArray(parsed.modelTest.questions)) {
          return enrichWithSetNumbers(parsed.modelTest.questions.map((q, i) => ({
            ...q,
            id: q.id || i + 1,
            section: cleanText(q.section || 'General Section'),
            question: cleanText(q.question),
            options: (q.options || []).map(opt => cleanText(opt)),
            answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
          })));
        }
        if (parsed && Array.isArray(parsed.sections)) {
          const collected = [];
          parsed.sections.forEach((sec, sIdx) => {
            const secQuestions = sec.questions || sec.items || [];
            if (Array.isArray(secQuestions)) {
              secQuestions.forEach(q => {
                collected.push({
                  ...q,
                  id: q.id || collected.length + 1,
                  section: cleanText(sec.title || sec.name || q.section || `Section ${sIdx + 1}`),
                  question: cleanText(q.question || q.prompt || q.text || ''),
                  options: (q.options || q.choices || []).map(opt => cleanText(opt)),
                  answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || '')
                });
              });
            }
          });
          if (collected.length > 0) return enrichWithSetNumbers(collected);
        }
      } catch (_) {}

      // Fallback robust line-by-line parser (handles markdown-formatted text from past tests)
      const lines = raw.split('\n');
      const questions = [];
      let currentQ = null;
      let currentSection = 'General Section';

      for (let line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;

        // Section header detection (e.g., "#### **Section B: Short Questions**")
        if (trimmed.match(/^(?:#+\s*)?(?:\*\*)?(?:section|part)\s+[a-z0-9]/i)) {
          currentSection = cleanText(trimmed);
          continue;
        }

        // Question detection: handles "* **Q11:**", "**Q11:**", "Q11:", "Question 11:", "11.", etc.
        const qMatch = trimmed.match(/^(?:[\*\-]\s*)?(?:\*\*)?(?:question\s*(\d+)|q(\d+)|(\d+))(?:\*\*)?(?:[:.)]|(?:\*\*:))\s*(.*)/i);
        if (qMatch) {
          if (currentQ) questions.push(currentQ);
          const qNum = qMatch[1] || qMatch[2] || qMatch[3];
          const rest = qMatch[4] || '';
          const markMatch = rest.match(/\[(\d+)\s*(?:marks?|pts?)\]/i) || rest.match(/\((\d+)\s*(?:marks?|pts?)\)/i);
          const marks = markMatch ? parseInt(markMatch[1], 10) : 5;
          const cleanContent = cleanText(rest.replace(/\[\d+\s*(?:marks?|pts?)\]/gi, '').replace(/\(\d+\s*(?:marks?|pts?)\)/gi, ''));

          currentQ = {
            id: questions.length + 1,
            number: qNum,
            section: currentSection,
            question: cleanContent || `Question ${qNum}`,
            marks: marks,
            options: [],
            answerKey: ''
          };
          continue;
        }

        // Check MCQ option: (a) 15 cm, A) 15 cm, etc.
        const optMatch = trimmed.match(/^(?:[\*\-]\s*)?(?:\()?\s*([a-d])(?:\)|\.)\s+(.*)/i);
        if (currentQ && optMatch) {
          currentQ.options.push(optMatch[1].toUpperCase() + ') ' + cleanText(optMatch[2]));
          continue;
        }

        // Answer key detection
        if (currentQ && (trimmed.toLowerCase().startsWith('answer:') || trimmed.toLowerCase().startsWith('ans:') || trimmed.toLowerCase().startsWith('**answer:'))) {
          currentQ.answerKey = cleanText(trimmed.replace(/^(?:\*\*answer:\*\*|answer:|ans:?)\s*/i, ''));
          continue;
        }

        // Append text to current question
        if (currentQ) {
          const cleanedLine = cleanText(trimmed);
          if (cleanedLine) {
            currentQ.question += '\n' + cleanedLine;
          }
        }
      }

      if (currentQ) questions.push(currentQ);
      if (questions.length > 0) return enrichWithSetNumbers(questions);

      return enrichWithSetNumbers([
        {
          id: 1,
          number: 1,
          section: 'General Section',
          question: cleanText(raw),
          marks: 10,
          options: [],
          answerKey: ''
        }
      ]);
    }
    return [];
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          const queryParentId = searchParams.get("parentId");
          if (queryParentId) {
            setIsStudentView(true);
          }
          const kidsRef = ref(database, `users/${queryParentId || currentUser.uid}/kids`);
          const snapshot = await get(kidsRef);
          if (snapshot.exists()) {
            const data = snapshot.val();
            const kidsList = Object.keys(data).map(key => ({
              id: key,
              ...data[key]
            }));
            const foundKid = kidsList.find(k => k.name?.toLowerCase() === decodeURIComponent(searchParams.get("id")).toLowerCase() || k.id === searchParams.get("id"));
            
            if (foundKid) {
              setKid(foundKid);
              setUser(currentUser);
              
              const subjectsRef = ref(database, `users/${searchParams.get("parentId") || currentUser.uid}/kids/${foundKid.id}/subjects`);
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

              const examsRef = ref(database, `users/${searchParams.get("parentId") || currentUser.uid}/kids/${foundKid.id}/exams`);
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
  }, [router, searchParams.get("id"), searchParams]);

  // Load delete requests from Firebase (realtime)
  useEffect(() => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get('parentId') || user.uid;
    const reqRef = ref(database, `users/${dataOwnerUid}/kids/${kid.id}/deleteRequests`);
    const unsub = onValue(reqRef, (snap) => {
      setDeleteRequests(snap.val() || {});
    });
    return () => unsub();
  }, [user?.uid, kid?.id]);

  // Student sends a delete request for a question
  const handleRequestQuestionDelete = async (testId, question) => {
    if (!user || !kid || !viewingModelTest) return;
    const dataOwnerUid = searchParams.get('parentId') || user.uid;
    const reqPath = `users/${dataOwnerUid}/kids/${kid.id}/deleteRequests/${testId}/${question.id}`;
    await set(ref(database, reqPath), {
      questionId: question.id,
      questionText: (question.question || '').slice(0, 200),
      displayNumber: question.displayNumber || question.id,
      section: question.cleanSectionTitle || question.section || '',
      requestedAt: Date.now(),
      status: 'pending',
      testId,
      subjectId: viewingModelTest.subjectId || '',
      examId: viewingModelTest.examId || '',
    });
  };

  // Parent approves: filter the question out of the saved questions JSON
  const handleApproveDeleteRequest = async (testId, qId, subjectId, examId) => {
    if (!user || !kid) return;
    const dataOwnerUid = user.uid;
    try {
      const testPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/modelTests/${examId}/${testId}`;
      const snap = await get(ref(database, testPath + '/questions'));
      const rawQuestions = snap.val();
      if (rawQuestions) {
        const parsed = parseQuestionsData(rawQuestions);
        const filtered = parsed.filter(q => String(q.id) !== String(qId));
        await set(ref(database, testPath + '/questions'), JSON.stringify({ questions: filtered }));
      }
      await remove(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/deleteRequests/${testId}/${qId}`));
      if (viewingModelTest && (viewingModelTest.testId === testId || viewingModelTest.id === testId)) {
        const newSnap = await get(ref(database, testPath));
        if (newSnap.exists()) {
          setViewingModelTest(prev => ({ ...prev, questions: newSnap.val().questions }));
        }
      }
    } catch (err) {
      console.error('Error approving delete request:', err);
    }
  };

  // Parent rejects: just remove the request
  const handleRejectDeleteRequest = async (testId, qId) => {
    if (!user || !kid) return;
    await remove(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/deleteRequests/${testId}/${qId}`));
  };

  const handleGlobalAdd = async (e) => {

    e.preventDefault();
    if (!newTitle || !user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;

    if (addType === 'subject') {
      const sRef = ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects`);
      await set(push(sRef), { title: newTitle });
    } else if (addType === 'exam') {
      const eRef = ref(database, `users/${dataOwnerUid}/kids/${kid.id}/exams`);
      await set(push(eRef), { title: newTitle });
    } else if (addType === 'chapter') {
      if (!selectedSubjectId || !selectedExamId) return;
      const cRef = ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${selectedSubjectId}/chapters/${selectedExamId}`);
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
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    
    if (type === 'subject') {
      await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${id}/title`), editTitle);
    } else if (type === 'exam') {
      await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/exams/${id}/title`), editTitle);
    } else if (type === 'chapter') {
      await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}/title`), editTitle);
      await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}/pdfPage`), editPdfPage);
    }
    
    setEditingId(null);
    setEditTitle('');
    setEditPdfPage('');
  };

  const handleSaveSubjectSettings = async () => {
    if (!settingsSubject || !user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${settingsSubject.id}/bookUrl`), subjectBookUrl.trim());
    await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${settingsSubject.id}/examRetentionDays`), Number(subjectExamRetentionDays) || 0);
    setSettingsSubject(null);
    setSubjectBookUrl('');
    setSubjectExamRetentionDays('7');
  };

  const handleSaveExamSettings = async () => {
    if (!settingsExamInfo || !user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${settingsExamInfo.subjectId}/examSettings/${settingsExamInfo.examId}/markDistribution`), examMarkDistribution);
    setSettingsExamInfo(null);
    setExamMarkDistribution('');
  };

  const handleSaveInlineMarkDist = async (subjectId, examId) => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}/markDistribution`), inlineMarkDistValue);
    setEditingMarkDistKey(null);
  };

  const handleToggleChapterComplete = async (subjectId, examId, chapId, currentCompleted) => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    const newCompleted = !currentCompleted;
    const chapPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/chapters/${examId}/${chapId}`;
    await set(ref(database, `${chapPath}/completed`), newCompleted);
    await set(ref(database, `${chapPath}/status`), newCompleted ? 'completed' : 'not_started');
  };

  const handleUpdateExamStatus = async (subjectId, examId, newStatus) => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    const path = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}/status`;
    await set(ref(database, path), newStatus);
  };

  const handleArchiveExam = async (subjectId, examId, examTitle) => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    const basePath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}`;
    
    // Set isArchived flag, archived timestamp, and mark status Completed
    await set(ref(database, `${basePath}/isArchived`), true);
    await set(ref(database, `${basePath}/archivedAt`), Date.now());
    await set(ref(database, `${basePath}/status`), 'Completed');

    setArchiveToast({
      message: `Exam "${examTitle}" was closed and moved to archives.`,
      subjectId,
      examId
    });
    setTimeout(() => {
      setArchiveToast((cur) => cur && cur.examId === examId ? null : cur);
    }, 6000);
  };

  const handleRestoreExam = async (subjectId, examId) => {
    if (!user || !kid) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    const basePath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}`;
    await set(ref(database, `${basePath}/isArchived`), false);
    setArchiveToast(null);
  };

  const handleDelete = async (id, type, parentSubjectId = null, parentExamId = null) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
    const dataOwnerUid = searchParams.get("parentId") || user.uid;
    let path = '';
    if (type === 'subject') path = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${id}`;
    else if (type === 'exam') path = `users/${dataOwnerUid}/kids/${kid.id}/exams/${id}`;
    else if (type === 'chapter') path = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}`;
    
    await remove(ref(database, path));
  };

  // Assign or update student email and sync studentLinks
  const handleSaveStudentEmail = async (e) => {
    e.preventDefault();
    if (!studentEmailInput.trim() || !user || !kid) return;
    const cleanEmail = studentEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setEmailModalError('Please enter a valid email address.');
      return;
    }

    setIsSavingEmail(true);
    setEmailModalError('');
    try {
      const dataOwnerUid = searchParams.get("parentId") || user.uid;
      const safeEmail = cleanEmail.replace(/\./g, ',');

      // Update student's email in their profile record
      await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/email`), cleanEmail);

      // Create / update studentLinks entry for fast search and assignment
      await set(ref(database, `studentLinks/${safeEmail}`), {
        parentId: dataOwnerUid,
        kidId: kid.id,
        name: kid.name,
        grade: kid.grade || '',
        email: cleanEmail,
        color: kid.color || '#3b82f6',
        updatedAt: Date.now()
      });

      // If kid previously had a different email, clean up the old link
      if (kid.email && kid.email.toLowerCase() !== cleanEmail) {
        const oldSafeEmail = kid.email.toLowerCase().replace(/\./g, ',');
        await remove(ref(database, `studentLinks/${oldSafeEmail}`));
      }

      setKid(prev => ({ ...prev, email: cleanEmail }));
      setShowAssignEmailModal(false);
    } catch (err) {
      console.error('Error assigning student email:', err);
      setEmailModalError(err.message || 'Failed to update email. Please try again.');
    } finally {
      setIsSavingEmail(false);
    }
  };

  // Invite teacher or parent by email
  const handleSendTeacherInvite = async (e) => {
    e.preventDefault();
    if (!teacherEmailInput.trim() || !user || !kid) return;
    const cleanTeacherEmail = teacherEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanTeacherEmail)) {
      setInviteModalError('Please enter a valid email address.');
      return;
    }

    setIsSendingInvite(true);
    setInviteModalError('');
    setInviteModalSuccess('');
    try {
      const dataOwnerUid = searchParams.get("parentId") || user.uid;
      const safeTeacherEmail = cleanTeacherEmail.replace(/\./g, ',');

      // Write to teacherInvites
      await set(ref(database, `teacherInvites/${safeTeacherEmail}/${kid.id}`), {
        kidId: kid.id,
        parentId: dataOwnerUid,
        name: kid.name,
        grade: kid.grade || '',
        email: kid.email || '',
        color: kid.color || '#3b82f6',
        invitedBy: user.email || 'Parent/Guardian',
        invitedAt: Date.now()
      });

      setInviteModalSuccess(`Invitation sent to ${cleanTeacherEmail}! When they log in to their dashboard, they can accept this student.`);
      setTimeout(() => {
        setShowInviteTeacherModal(false);
        setTeacherEmailInput('');
        setInviteModalSuccess('');
      }, 2500);
    } catch (err) {
      console.error('Error inviting teacher:', err);
      setInviteModalError(err.message || 'Failed to send invite. Please try again.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  // Helper to extract timestamp from test (handles createdAt or decodes Firebase push ID)
  const getTestCreatedAt = (test, allowDateFallback = false) => {
    if (!test) return 0;
    if (typeof test.createdAt === 'number' && !isNaN(test.createdAt) && test.createdAt > 0) {
      return test.createdAt;
    }
    if (test.createdAt) {
      const parsed = new Date(test.createdAt).getTime();
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    // Fallback: extract millisecond timestamp from Firebase push ID (starts with - and length >= 8)
    if (test.id && typeof test.id === 'string' && test.id.length >= 8 && test.id.startsWith('-')) {
      const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
      let time = 0;
      let valid = true;
      for (let i = 0; i < 8; i++) {
        const c = test.id.charAt(i);
        const val = PUSH_CHARS.indexOf(c);
        if (val === -1) { valid = false; break; }
        time = time * 64 + val;
      }
      if (valid && time > 1577836800000 && time < 2524608000000) {
        return time;
      }
    }
    if (allowDateFallback && test.date) {
      const d = new Date(test.date).getTime();
      if (!isNaN(d) && d > 0) return d;
    }
    return 0;
  };

  // Helper to format human-readable generation time (e.g. "3:45 PM")
  const formatGeneratedTime = (test) => {
    if (!test) return null;
    if (test.generatedTime) return test.generatedTime;
    const ts = getTestCreatedAt(test, false);
    if (ts > 1577836800000) {
      try {
        const d = new Date(ts);
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      } catch (_) {
        return null;
      }
    }
    return null;
  };

  // Helper to auto-number duplicate titles (e.g. "Model Test - Oct 22, 2026 #2")
  const getNextNumberedTitle = (desiredTitle, existingTests = []) => {
    if (!desiredTitle) return '';
    const trimmed = desiredTitle.trim();
    const existingTitles = existingTests.map(t => (t.title || '').trim()).filter(Boolean);

    const hasExact = existingTitles.some(t => t.toLowerCase() === trimmed.toLowerCase());
    if (!hasExact) return trimmed;

    const cleanBase = trimmed.replace(/\s*#\d+$/, '').replace(/\s*\(\d+\)$/, '').trim();
    let countWithBase = 0;
    let maxNum = 1;
    for (const t of existingTitles) {
      const tBase = t.replace(/\s*#\d+$/, '').replace(/\s*\(\d+\)$/, '').trim();
      if (tBase.toLowerCase() === cleanBase.toLowerCase()) {
        countWithBase++;
        const match = t.match(/#(\d+)$/) || t.match(/\((\d+)\)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
    const nextNum = Math.max(maxNum + 1, countWithBase + 1);
    return `${cleanBase} #${nextNum}`;
  };

  // Multi-book helper
  const getSubjectBooks = (subj) => {
    if (!subj) return [];
    if (subj.books && typeof subj.books === 'object' && Object.keys(subj.books).length > 0) {
      const arr = Object.entries(subj.books).map(([id, b]) => ({
        id,
        title: b.title || 'Textbook',
        url: (b.url || '').trim(),
        isGovtTextbook: Boolean(b.isGovtTextbook)
      })).filter(b => b.url);
      if (arr.length > 0) return arr;
    }
    if (subj.bookUrl && typeof subj.bookUrl === 'string' && subj.bookUrl.trim()) {
      return [{
        id: 'default_book',
        title: 'Govt Textbook',
        url: subj.bookUrl.trim(),
        isGovtTextbook: true
      }];
    }
    return [];
  };

  // Target existing model tests & questions count for Anti-Duplication engine transparency
  const targetExistingTests = useMemo(() => {
    if (!modelTestTarget?.subject?.modelTests || !modelTestTarget?.exam?.id) return [];
    const raw = modelTestTarget.subject.modelTests[modelTestTarget.exam.id] || {};
    return Object.entries(raw).map(([id, t]) => ({ id, ...t }));
  }, [modelTestTarget]);

  const targetExistingQuestionsCount = useMemo(() => {
    let count = 0;
    targetExistingTests.forEach(test => {
      const parsed = parseQuestionsData(test.questions);
      count += parsed.length;
    });
    return count;
  }, [targetExistingTests]);

  // Open Popover to generate model test
  const openModelTestGenerator = (subject, exam) => {
    const today = new Date().toISOString().split('T')[0];
    const formattedToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const currentDist = (subject.examSettings && subject.examSettings[exam.id] && subject.examSettings[exam.id].markDistribution) || '';
    
    const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};
    const allChapIds = Object.keys(chaptersObj);
    const existingRaw = (subject.modelTests && subject.modelTests[exam.id]) || {};
    const existingList = Object.entries(existingRaw).map(([id, t]) => ({ id, ...t }));
    const baseTitle = `Model Test - ${formattedToday}`;
    const nextTitle = getNextNumberedTitle(baseTitle, existingList);
    const books = getSubjectBooks(subject);

    setModelTestTarget({ subject, exam });
    setModelTestDate(today);
    setModelTestTitle(nextTitle);
    setModelTestResult('0');
    setSelectedChaptersForTest(allChapIds);
    setSelectedBookIdsForTest(books.map(b => b.id));
    setTestMarkDistribution(currentDist);
    setTestDifficulty('Standard');
    setTestGuidelines(['Follow best practice', 'Standard curriculum']);
    setCustomInstructions('');
    setGenerateError('');
  };

  const toggleGuideline = (guideline) => {
    setTestGuidelines(prev => 
      prev.includes(guideline) ? prev.filter(g => g !== guideline) : [...prev, guideline]
    );
  };

  const toggleChapterSelection = (chapId) => {
    setSelectedChaptersForTest(prev =>
      prev.includes(chapId) ? prev.filter(id => id !== chapId) : [...prev, chapId]
    );
  };

  const handleGenerateModelTest = async () => {
    if (!modelTestTarget || !user || !kid) return;
    if (countWords(customInstructions) > 200) {
      setGenerateError('Custom instructions must not exceed 200 words.');
      return;
    }

    setIsGeneratingTest(true);
    setGenerateError('');

    try {
      const { subject, exam } = modelTestTarget;
      const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};
      const selectedChapterTitles = selectedChaptersForTest.map(id => chaptersObj[id]?.title).filter(Boolean);
      const allSubjectBooks = getSubjectBooks(subject);
      const checkedBooks = allSubjectBooks.filter(b => selectedBookIdsForTest.includes(b.id));
      const govtBook = checkedBooks.find(b => b.isGovtTextbook) || checkedBooks[0] || null;
      const govtTextbookUrl = govtBook ? govtBook.url : (subject?.bookUrl || '').trim();

      // Collect all previously generated questions from existing model tests to strictly avoid similarity & repetition
      const existingRaw = (subject.modelTests && subject.modelTests[exam.id]) || {};
      const existingList = Object.entries(existingRaw).map(([id, t]) => ({ id, ...t }));
      const existingQuestionsList = [];
      const usedPassageSnippets = new Set();

      existingList.forEach(test => {
        const parsed = parseQuestionsData(test.questions);
        parsed.forEach(q => {
          const rawQ = (q.question || '').trim();
          if (rawQ) {
            existingQuestionsList.push({
              testTitle: test.title || test.date || 'Previous Model Test',
              section: q.section || '',
              question: rawQ
            });

            const doubleNewline = rawQ.split(/\n\n+/);
            if (doubleNewline.length > 1 && (doubleNewline[0].toLowerCase().includes('read the') || doubleNewline[0].toLowerCase().includes('passage'))) {
              usedPassageSnippets.add(doubleNewline[0].replace(/\s+/g, ' ').slice(0, 160));
            }
          }
        });
      });

      // Also collect questions from selected chapters practice banks
      selectedChaptersForTest.forEach(chId => {
        const ch = chaptersObj[chId];
        if (ch && Array.isArray(ch.questions)) {
          ch.questions.forEach(cq => {
            const rawQ = cleanText(cq.question || cq.prompt || '');
            if (rawQ) {
              existingQuestionsList.push({
                testTitle: `Chapter: ${ch.title}`,
                section: cq.type || 'Practice Question',
                question: rawQ
              });
            }
          });
        }
      });

      // Format anti-duplication instruction
      const antiDuplicationSection = existingQuestionsList.length > 0 ? `
================================================================================
CRITICAL ANTI-DUPLICATION & ZERO-SIMILARITY MANDATE:
The student has ALREADY taken previous model tests covering this syllabus and has already completed the following ${existingQuestionsList.length} questions.
EVERY SINGLE QUESTION IN THIS NEW MODEL TEST MUST BE COMPLETELY FRESH, UNIQUE, AND UNLIKE ANY OF THE QUESTIONS LISTED BELOW.

STRICT NON-SIMILARITY REQUIREMENTS:
1. ABSOLUTELY NO REPETITION: Do NOT generate any question that is identical, similar, or an obvious variation of any question listed below.
2. NO SHALLOW REPHRASING: Do NOT take an existing question and merely swap names, minor numbers, or synonyms into the same question template.
3. SEEN PASSAGE ROTATION: If this model test has a Seen Passage (Reading Comprehension):
   - You MUST select a COMPLETELY DIFFERENT authentic story/lesson/unit from the official Government Textbook ("${govtBook ? govtBook.title : 'Official Textbook'}") than any passage used in previous tests.
   ${usedPassageSnippets.size > 0 ? `- Previously used passages to strictly avoid:\n${Array.from(usedPassageSnippets).map(p => `     * "${p}..."`).join('\n')}` : ''}
   - For example: if a previous test used Maria ("Life is Beautiful"), YOU ARE STRICTLY FORBIDDEN from using Maria again. Instead, choose from other textbook lessons such as: Raju the Firefighter (Unit 9), Babul and Cyclone Aila (Unit 24), Saikat's Family (Unit 3), A Visit to the Liberation War Museum (Unit 19), The Olympic Games (Unit 17), St. Martin's Island (Unit 12), Eat Healthy (Unit 6), etc.
4. NOVEL GRAMMAR & VOCABULARY:
   - For Fill in the Blanks, Rearrange, WH-questions, Prepositions, Right Form of Verbs, and Punctuation: use brand-new sentence structures, different vocabulary words, and different grammatical contexts.
5. MATHEMATICS & SCIENCE DIVERSITY:
   - Use completely different numerical numbers, different formulas, different scenarios, and different real-world problem settings.
6. FRESH PERSPECTIVES:
   - Explore untested topics, different question angles, and novel problem contexts from the selected chapters.

LIST OF ${existingQuestionsList.length} PREVIOUS QUESTIONS TO STRICTLY EXCLUDE (DO NOT MAKE SIMILAR QUESTIONS):
${existingQuestionsList.map((item, idx) => {
  let text = item.question;
  const parts = text.split(/\n\n+/);
  if (parts.length > 1 && (parts[0].toLowerCase().includes('read the') || parts[0].toLowerCase().includes('passage'))) {
    text = `[Passage: ${parts[0].slice(0, 90)}...] Q: ${parts[parts.length - 1]}`;
  }
  if (text.length > 220) text = text.slice(0, 215) + '...';
  return `${idx + 1}. [${item.section || 'Question'}] "${text}" (${item.testTitle})`;
}).join('\n')}
================================================================================
` : `
NOTE: This is the first model test for this exam. Ensure questions have rich, comprehensive, and balanced coverage across all selected syllabus chapters.
`;

      const prompt = `You are an expert school examiner creating a realistic, high quality Model Test for a student in ${kid.grade || 'Primary / Middle school'}.
Generate a comprehensive Model Test with structured questions strictly formatted according to the syllabus and mark distribution.

Subject: ${subject.title}
Exam Type: ${exam.title}
Model Test Date: ${modelTestDate || 'Today'}
${kid.grade ? `Class / Grade: ${kid.grade}\n` : ''}Selected Reference Books (from Subject Material PDF section):
${checkedBooks.length > 0
  ? checkedBooks.map((b, idx) => `${idx + 1}. ${b.title}${b.isGovtTextbook ? ' [Official Government Textbook]' : ''}: ${b.url}`).join('\n')
  : '- None selected (use standard curriculum)'}

Syllabus Chapters:
${selectedChapterTitles.length > 0 ? selectedChapterTitles.map(t => `- ${t}`).join('\n') : '- Entire course curriculum'}

Mark Distribution (STRICT REQUIREMENT - ALLOCATE MARKS EXACTLY AS SPECIFIED):
${testMarkDistribution || '100 Marks Standard: Section A: 20 MCQs (20 Marks), Section B: Short Questions (30 Marks), Section C: Descriptive / Creative Questions (50 Marks)'}

Difficulty Level: ${testDifficulty}
Guidelines:
${testGuidelines.length > 0 ? testGuidelines.map(g => `- ${g}`).join('\n') : '- Standard school examination best practices'}

${customInstructions.trim() ? `Specific Custom Instructions from Teacher:\n${customInstructions.trim()}\n` : ''}

${antiDuplicationSection}

CRITICAL INSTRUCTION - ZERO MARKDOWN, ZERO LATEX, AND MUST GENERATE ALL PARTS:
1. GOVERNMENT TEXTBOOK MANDATE (FROM SUBJECT MATERIAL PDF SECTION):
   ${checkedBooks.length > 0 ? `You MUST take instructions, content, and lessons from the checked books from the Subject Material (PDF) section:\n${checkedBooks.map(b => `   - "${b.title}"${b.isGovtTextbook ? ' (Official Government Textbook)' : ''}: ${b.url}`).join('\n')}` : ''}
   ${govtBook ? `- Primary Government Textbook: "${govtBook.title}" (URL: ${govtBook.url}).
   - For all reading comprehension sections, Seen Passages, dialogues, lessons, and textbook questions (e.g. Part-A: Seen Passage / Questions 1 to 4 for "English for Today, Class Five"):
     a) The text/dialogue MUST be an authentic passage or dialogue directly taken from the official Government Textbook ("${govtBook.title}").
     b) NEVER fabricate or make up imaginary passages when the syllabus specifies a Seen Passage from the government textbook. Use authentic textbook stories, dialogues, characters, and lessons.
     c) ROTATE LESSONS: Do NOT reuse the same passage or characters as previous tests. Pick a fresh story/unit from the textbook (e.g. Raju the Firefighter, Babul & Cyclone Aila, Saikat's Family, A Visit to the Liberation War Museum, The Olympic Games, St. Martin's Island, Eat Healthy, etc.).
     d) All Seen Passage comprehension questions (MCQs, Fill in the blanks, True/False, and Short Questions) must strictly test the student's understanding of this authentic government textbook passage.
     e) If chapters or syllabus items include "English For Today book of Subject Material (PDF)" or specific chapter units, strictly cover the lessons and vocabulary from this official government textbook.` : ''}
2. MANDATORY - INCLUDE ALL PARTS & SECTIONS: You MUST generate questions for EVERY SINGLE PART / SECTION described in the Mark Distribution above (e.g., Part 1: MCQ, Part 2: Short Questions, Part 3: Short-Answer, Part 4: Competency-Based). NEVER skip or omit Part 1 or Part 2. The output "questions" array MUST include questions for all parts starting from Part 1 to the final part!
3. DO NOT use ANY markdown formatting (NO asterisks like **, NO headers like ####, NO bullet asterisks *, NO backticks).
4. DO NOT use LaTeX formatting (NO dollar signs $, NO \\times, NO \\frac, NO \\div). Use standard plain keyboard symbols: "x", "÷", "+", "-", "/", "%".
5. Every question must be clean, readable plain text for a school student without any code or markdown artifacts.
6. PASSAGE EFFICIENCY: For reading comprehension sections (Seen or Unseen Passages), provide the full reading text in the FIRST question of that passage section. For subsequent questions in that same section, refer to "Based on the passage above" instead of repeating the entire multi-paragraph text.
7. Return strictly a valid JSON object matching this schema:
{
  "title": "${modelTestTitle.trim() || `${subject.title} - ${exam.title} Model Test`}",
  "fullMarks": 100,
  "timeAllowed": "${modelTestDuration || 60} Minutes",
  "questions": [
    {
      "id": 1,
      "section": "1. Multiple Choice Questions (MCQ)",
      "question": "Clear question text without asterisks or markdown",
      "marks": 1,
      "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "answerKey": "Correct option and short explanation"
    },
    {
      "id": 2,
      "section": "2. Short-Answer Questions",
      "question": "Clear question text",
      "marks": 2,
      "options": [],
      "answerKey": "Step-by-step solution"
    },
    {
      "id": 3,
      "section": "3. Competency-Based Questions",
      "question": "Structured problem question",
      "marks": 7,
      "options": [],
      "answerKey": "Detailed solution rubric"
    }
  ]
}
Ensure the "questions" array contains ALL questions across EVERY section described in the Mark Distribution.`;

      const questionsText = await generateGeminiContent(prompt, { temperature: 0.85 });

      // Update exam mark distribution if changed in modal
      if (testMarkDistribution.trim()) {
        await set(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/markDistribution`), testMarkDistribution.trim());
      }

      // Save Model Test in Firebase
      const rawUserTitle = modelTestTitle.trim() || `Model Test - ${modelTestDate || 'Today'}`;
      const finalTitle = getNextNumberedTitle(rawUserTitle, existingList);
      const now = Date.now();
      const generatedTime = new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      const testsRef = ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
      const newTestRef = push(testsRef);
      const testData = {
        title: finalTitle,
        date: modelTestDate,
        generatedTime: generatedTime,
        govtBookUrl: govtTextbookUrl,
        checkedBooks: checkedBooks.map(b => ({ id: b.id, title: b.title, url: b.url, isGovtTextbook: b.isGovtTextbook })),
        result: modelTestResult.trim() || '0',
        duration: Number(modelTestDuration) || 60,
        difficulty: testDifficulty,
        guidelines: testGuidelines,
        chapters: selectedChapterTitles,
        markDistribution: testMarkDistribution.trim(),
        customInstruction: customInstructions.trim(),
        questions: questionsText,
        studentAnswers: {},
        uploadedPages: [],
        examinerGrading: null,
        createdAt: now
      };
      await set(newTestRef, testData);

      setModelTestTarget(null);
      openTestViewer({
        ...testData,
        subjectId: subject.id,
        examId: exam.id,
        testId: newTestRef.key,
        displayTitle: finalTitle
      });
    } catch (err) {
      console.error('Error generating model test:', err);
      let errMsg = err.message || 'Failed to generate model test questions';
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed?.error?.message) {
          errMsg = parsed.error.message;
        }
      } catch (_) {}
      setGenerateError(errMsg);
    } finally {
      setIsGeneratingTest(false);
    }
  };

  const handleSaveManualModelTest = async () => {
    if (!modelTestTarget || !user || !kid) return;
    try {
      const { subject, exam } = modelTestTarget;
      const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};
      const selectedChapterTitles = selectedChaptersForTest.map(id => chaptersObj[id]?.title).filter(Boolean);

      if (testMarkDistribution.trim()) {
        await set(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/markDistribution`), testMarkDistribution.trim());
      }

      const defaultQuestionsJson = JSON.stringify({
        title: modelTestTitle.trim() || `Model Test - ${modelTestDate}`,
        fullMarks: 100,
        questions: [
          {
            id: 1,
            section: 'General Questions',
            question: 'Write solutions to the offline test paper.',
            marks: 100,
            answerKey: 'Check handwritten answer paper.'
          }
        ]
      });

      const testsRef = ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
      const newTestRef = push(testsRef);
      const testData = {
        title: modelTestTitle.trim() || `Model Test - ${modelTestDate}`,
        date: modelTestDate,
        result: modelTestResult.trim() || '0',
        duration: Number(modelTestDuration) || 60,
        difficulty: testDifficulty,
        guidelines: testGuidelines,
        chapters: selectedChapterTitles,
        markDistribution: testMarkDistribution.trim(),
        customInstruction: customInstructions.trim(),
        questions: defaultQuestionsJson,
        studentAnswers: {},
        uploadedPages: [],
        examinerGrading: null,
        createdAt: Date.now()
      };
      await set(newTestRef, testData);
      setModelTestTarget(null);
    } catch (err) {
      setGenerateError(err.message);
    }
  };

  const formatTime = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const formatDuration = (totalSeconds) => {
    const s = Math.max(0, Math.floor(totalSeconds));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  // Timer effect — pauses when isExamPaused is true
  useEffect(() => {
    if (!viewingModelTest || isExamFinished || !isExamStarted || !examStartedAt) return;
    if (isExamPaused) return; // don't tick while paused

    // elapsed = wall-clock time since start minus total paused time
    const computeElapsed = () => Math.max(0, Math.floor((Date.now() - examStartedAt - totalPausedMs) / 1000));
    setTimerSeconds(computeElapsed());
    const interval = setInterval(() => {
      setTimerSeconds(computeElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [viewingModelTest, isExamFinished, isExamStarted, examStartedAt, isExamPaused, totalPausedMs]);

  const openTestViewer = (test) => {
    setViewingModelTest(test);
    setExamDurationMinutes(test.duration ? Number(test.duration) : null);
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

    const finished = Boolean(test.isFinished || test.submittedAt || test.examinerGrading?.evaluatedAt);
    const hasStarted = Boolean(test.startedAt || finished || (test.studentAnswers && Object.keys(test.studentAnswers).length > 0));
    setIsExamFinished(finished);
    setIsExamStarted(hasStarted);
    setExamStartedAt(test.startedAt || (hasStarted ? Date.now() : null));
    setExamSubmittedAt(test.submittedAt || null);

    // Restore pause state
    setIsExamPaused(false);
    setPausedAt(null);
    setTotalPausedMs(test.totalPausedMs || 0);
    setPauseLog(test.pauseLog ? Object.values(test.pauseLog) : []);
    setShowPauseModal(false);
    setPauseReasonInput('');
  };

  const handleUpdateExamDuration = async (newMinutes) => {
    const mins = Math.max(1, Math.min(360, Number(newMinutes) || 60));
    setExamDurationMinutes(mins);
    setViewingModelTest(prev => prev ? ({ ...prev, duration: mins }) : prev);
    if (viewingModelTest && user && kid) {
      try {
        const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId || viewingModelTest.id}`;
        await set(ref(database, `${path}/duration`), mins);
      } catch (err) {
        console.error('Error saving exam duration:', err);
      }
    }
  };

  const handleSaveSpecificTestDuration = async () => {
    if (!editingDurationModal || !user || !kid) return;
    const mins = Math.max(1, Math.min(360, Number(tempDurationValue) || 60));
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${editingDurationModal.subjectId}/modelTests/${editingDurationModal.examId}/${editingDurationModal.testId}/duration`;
      await set(ref(database, path), mins);
      if (viewingModelTest && (viewingModelTest.id === editingDurationModal.testId || viewingModelTest.testId === editingDurationModal.testId)) {
        setViewingModelTest(prev => ({ ...prev, duration: mins }));
        setExamDurationMinutes(mins);
      }
      setEditingDurationModal(null);
    } catch (err) {
      console.error('Error saving test duration:', err);
      alert('Failed to save duration: ' + (err.message || 'Unknown error'));
    }
  };

  const handleStartExam = async () => {
    if (!viewingModelTest || !user || !kid) return;
    const now = Date.now();
    setExamStartedAt(now);
    setIsExamStarted(true);
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId || viewingModelTest.id}`;
      await set(ref(database, `${path}/startedAt`), now);
      await set(ref(database, `${path}/duration`), defaultDurationMinutes);
      setViewingModelTest(prev => ({
        ...prev,
        startedAt: now,
        duration: defaultDurationMinutes
      }));
    } catch (err) {
      console.error('Error starting exam timer:', err);
    }
  };

  // Pause the exam — opens the reason modal
  const handlePauseExam = () => {
    setShowPauseModal(true);
    setPauseReasonInput('');
  };

  // Confirm pause with a reason
  const handleConfirmPause = async (reason) => {
    if (!viewingModelTest || !user || !kid) return;
    const now = Date.now();
    setIsExamPaused(true);
    setPausedAt(now);
    setShowPauseModal(false);
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId || viewingModelTest.id}`;
      const entry = { reason: reason || 'No reason given', pausedAt: now, resumedAt: null };
      await push(ref(database, `${path}/pauseLog`), entry);
      // Save time-of-pause so we can compute elapsed correctly on reload
      await set(ref(database, `${path}/totalPausedMs`), totalPausedMs);
      setPauseLog(prev => [...prev, entry]);
    } catch (err) {
      console.error('Error saving pause:', err);
    }
  };

  // Resume the exam
  const handleResumeExam = async () => {
    if (!viewingModelTest || !user || !kid) return;
    const now = Date.now();
    const additionalPause = pausedAt ? (now - pausedAt) : 0;
    const newTotalPausedMs = totalPausedMs + additionalPause;
    setTotalPausedMs(newTotalPausedMs);
    setPausedAt(null);
    setIsExamPaused(false);
    // Update the last pauseLog entry's resumedAt
    setPauseLog(prev => {
      const updated = [...prev];
      if (updated.length > 0) updated[updated.length - 1] = { ...updated[updated.length - 1], resumedAt: now };
      return updated;
    });
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId || viewingModelTest.id}`;
      await set(ref(database, `${path}/totalPausedMs`), newTotalPausedMs);
    } catch (err) {
      console.error('Error resuming exam:', err);
    }
  };

  const handleFinishAndSubmitExam = async () => {
    if (!viewingModelTest || !user || !kid) return;
    const confirmed = window.confirm("Are you sure you want to finish and submit your exam? Once submitted, the timer will stop and answers will be unlocked for review.");
    if (!confirmed) return;

    try {
      setSavingStatus('saving');
      const now = Date.now();
      const timeSpent = examStartedAt ? Math.max(1, Math.floor((now - examStartedAt) / 1000)) : (viewingModelTest.timeSpentSeconds || 0);

      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/isFinished`), true);
      await set(ref(database, `${path}/submittedAt`), now);
      await set(ref(database, `${path}/timeSpentSeconds`), timeSpent);
      await set(ref(database, `${path}/studentAnswers`), studentAnswers);

      setViewingModelTest(prev => ({
        ...prev,
        isFinished: true,
        submittedAt: now,
        timeSpentSeconds: timeSpent,
        studentAnswers
      }));

      setIsExamFinished(true);
      setExamSubmittedAt(now);
      setNotificationMsg('🎉 Exam completed and submitted successfully! Answer keys and solutions are now unlocked.');
      setTimeout(() => setNotificationMsg(''), 4500);
    } catch (err) {
      alert('Error submitting exam: ' + err.message);
    } finally {
      setSavingStatus('');
    }
  };

  const handleCopyTest = () => {
    if (!viewingModelTest) return;
    if (!isExamFinished && testViewMode === 'student') {
      const questionsOnly = parsedQuestions.map(q => {
        let text = `${q.displayNumber}. ${q.question}`;
        if (q.options && q.options.length > 0) {
          text += '\n' + q.options.join('\n');
        }
        return text;
      }).join('\n\n');
      copyToClipboard(questionsOnly);
    } else {
      copyToClipboard(viewingModelTest.questions);
    }
  };

  // Keyboard arrow navigation for sliding through questions
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

  // Auto-scroll active question pill into center view
  useEffect(() => {
    if (!viewingModelTest || questionDisplayMode !== 'slide') return;
    const activeBtn = document.getElementById(`q-pill-${currentSlideIndex}`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [viewingModelTest, currentSlideIndex, questionDisplayMode, navigatorViewMode]);

  const handleUpdateTestResult = async (subjectId, examId, testId, newResult) => {
    if (!user || !kid) return;
    await set(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subjectId}/modelTests/${examId}/${testId}/result`), newResult);
    if (viewingModelTest && viewingModelTest.testId === testId) {
      setViewingModelTest(prev => ({ ...prev, result: newResult }));
    }
    setEditingResultTestId(null);
  };

  const handleDeleteModelTest = async (subjectId, examId, testId) => {
    if (!window.confirm('Are you sure you want to delete this model test?')) return;
    await remove(ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subjectId}/modelTests/${examId}/${testId}`));
    if (viewingModelTest && viewingModelTest.testId === testId) {
      setViewingModelTest(null);
    }
  };

  // Student answer auto-saving and instant saving
  const saveStudentAnswers = async (updatedAnswers, immediate = false) => {
    if (!viewingModelTest || !user || !kid) return;
    setSavingStatus('saving');

    const executeSave = async () => {
      try {
        const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
        await set(ref(database, `${path}/studentAnswers`), updatedAnswers);
        setViewingModelTest(prev => ({
          ...prev,
          studentAnswers: updatedAnswers
        }));
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
    const updated = { ...studentAnswers };
    if (!text || !text.trim()) {
      delete updated[qId];
    } else {
      updated[qId] = text;
    }
    setStudentAnswers(updated);
    saveStudentAnswers(updated, immediate);
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
    if (viewingModelTest && user && kid) {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const handleDeleteUploadedPage = async (pageId) => {
    const updated = uploadedAnswerPages.filter(p => p.id !== pageId);
    setUploadedAnswerPages(updated);
    if (viewingModelTest && user && kid) {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const handleSaveStudentSubmission = async () => {
    if (!viewingModelTest || !user || !kid) return;
    setIsSavingSubmission(true);
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/studentAnswers`), studentAnswers);
      await set(ref(database, `${path}/uploadedPages`), uploadedAnswerPages);

      setViewingModelTest(prev => ({
        ...prev,
        studentAnswers,
        uploadedPages: uploadedAnswerPages
      }));

      setNotificationMsg('✅ Answer paper & all responses submitted successfully!');
      setTimeout(() => setNotificationMsg(''), 4000);
    } catch (err) {
      alert('Error saving submission: ' + err.message);
    } finally {
      setIsSavingSubmission(false);
    }
  };

  // Examiner checking & per-question saving handlers
  const saveExaminerGrading = async (updatedMarks, updatedNotes, updatedFeedback, qIdConfirmed = null) => {
    if (!viewingModelTest || !user || !kid) return;
    setSavingStatus('saving');

    try {
      const qList = parseQuestionsData(viewingModelTest.questions);
      const totalMax = qList.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
      const totalAwarded = qList.reduce((acc, q) => acc + (Number(updatedMarks[q.id]) || 0), 0);
      const newResult = `${totalAwarded}/${totalMax}`;

      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
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

  const handleAwardMark = (qId, val, maxMarks) => {
    const num = Math.min(Math.max(0, Number(val) || 0), maxMarks);
    setAwardedMarks(prev => ({ ...prev, [qId]: num }));
  };

  const handleAwardMarkAndConfirm = (qId, val, maxMarks, note = null) => {
    const num = Math.min(Math.max(0, Number(val) || 0), maxMarks);
    const updatedMarks = { ...awardedMarks, [qId]: num };
    const updatedNotes = note !== null ? { ...examinerNotes, [qId]: note } : examinerNotes;
    setAwardedMarks(updatedMarks);
    if (note !== null) setExaminerNotes(updatedNotes);
    saveExaminerGrading(updatedMarks, updatedNotes, overallExaminerFeedback, qId);
  };

  // AI Auto Review & Marking for all questions before final teacher review
  const handleAiAutoReview = async () => {
    if (!viewingModelTest) return;
    const qList = parseQuestionsData(viewingModelTest.questions);
    if (!qList || qList.length === 0) {
      alert("No questions found in this model test to evaluate.");
      return;
    }

    if (!isExamFinished) {
      const proceed = window.confirm("The student has not officially submitted this exam yet.\n\nDo you want to submit the exam now and run AI auto-review?");
      if (!proceed) return;
      await handleFinishAndSubmitExam();
    }

    setIsAiReviewing(true);
    setNotificationMsg("🤖 AI is reviewing and marking all answers against the rubric. Please wait...");

    try {
      const subj = subjects.find(s => s.id === viewingModelTest.subjectId);
      const ex = exams.find(e => e.id === viewingModelTest.examId);

      const evaluationResult = await autoReviewExamWithAI({
        questions: qList,
        studentAnswers: studentAnswers,
        subjectTitle: subj?.title || viewingModelTest.subjectTitle || '',
        examTitle: ex?.title || viewingModelTest.title || '',
        kidGrade: kid?.grade || ''
      });

      const newAwardedMarks = { ...awardedMarks };
      const newExaminerNotes = { ...examinerNotes };

      if (Array.isArray(evaluationResult.evaluations)) {
        evaluationResult.evaluations.forEach(ev => {
          const matchedQ = qList.find(q => String(q.id) === String(ev.questionId));
          const max = matchedQ ? (Number(matchedQ.marks) || 5) : 5;
          const mark = Math.min(Math.max(0, Number(ev.awardedMarks) || 0), max);
          newAwardedMarks[ev.questionId] = mark;
          if (ev.feedback) {
            newExaminerNotes[ev.questionId] = ev.feedback;
          }
        });
      }

      const overallFeedback = evaluationResult.overallFeedback || overallExaminerFeedback || '';

      setAwardedMarks(newAwardedMarks);
      setExaminerNotes(newExaminerNotes);
      if (overallFeedback) {
        setOverallExaminerFeedback(overallFeedback);
      }

      // Switch to examiner mode so teacher can review the results immediately
      setTestViewMode('examiner');

      // Save to Firebase
      await saveExaminerGrading(newAwardedMarks, newExaminerNotes, overallFeedback);

      const totalAwarded = Object.values(newAwardedMarks).reduce((a, b) => a + (Number(b) || 0), 0);
      const totalMax = qList.reduce((a, b) => a + (Number(b.marks) || 0), 0) || 100;
      setNotificationMsg(`✓ AI Auto-Marking Complete! Awarded ${totalAwarded}/${totalMax} Marks. Pre-filled for your final review.`);
      setTimeout(() => setNotificationMsg(''), 6000);
    } catch (err) {
      console.error("AI Auto Review Error:", err);
      alert("AI Review Failed: " + (err.message || 'Unknown error. Please check your Gemini API key.'));
      setNotificationMsg('');
    } finally {
      setIsAiReviewing(false);
    }
  };

  // AI evaluation for a single question
  const handleAiGradeSingleQuestion = async (q) => {
    if (!q || !viewingModelTest) return;
    setAiReviewingQId(q.id);
    try {
      const subj = subjects.find(s => s.id === viewingModelTest.subjectId);
      const ex = exams.find(e => e.id === viewingModelTest.examId);

      const res = await autoReviewExamWithAI({
        questions: [q],
        studentAnswers: studentAnswers,
        subjectTitle: subj?.title || viewingModelTest.subjectTitle || '',
        examTitle: ex?.title || viewingModelTest.title || '',
        kidGrade: kid?.grade || ''
      });

      if (res && Array.isArray(res.evaluations) && res.evaluations.length > 0) {
        const ev = res.evaluations[0];
        const max = Number(q.marks) || 5;
        const mark = Math.min(Math.max(0, Number(ev.awardedMarks) || 0), max);
        const feedback = ev.feedback || '';
        
        handleAwardMarkAndConfirm(q.id, mark, max, feedback);
        setNotificationMsg(`✓ AI evaluated Q${q.displayNumber || q.id}: ${mark}/${max} marks awarded.`);
        setTimeout(() => setNotificationMsg(''), 4000);
      }
    } catch (err) {
      console.error('Error in single question AI grade:', err);
      alert('AI Grading failed for this question: ' + (err.message || 'Unknown error'));
    } finally {
      setAiReviewingQId(null);
    }
  };

  const handleSaveExaminerGrading = async (parsedQuestions) => {
    if (!viewingModelTest || !user || !kid) return;
    setIsSavingGrading(true);
    try {
      const totalMax = parsedQuestions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
      const totalAwarded = parsedQuestions.reduce((acc, q) => acc + (Number(awardedMarks[q.id]) || 0), 0);
      const newResult = `${totalAwarded}/${totalMax}`;

      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/result`), newResult);
      const gradingObj = {
        awardedMarks,
        examinerNotes,
        overallFeedback: overallExaminerFeedback,
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

      setNotificationMsg(`🎉 Paper evaluated successfully! Result published: Result ${newResult}`);
      setTimeout(() => setNotificationMsg(''), 4500);
    } catch (err) {
      alert('Error saving grading: ' + err.message);
    } finally {
      setIsSavingGrading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(typeof text === 'string' ? text : JSON.stringify(text, null, 2));
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  if (loading) {
    return <main className="view-container"><div className="card">Loading profile...</div></main>;
  }

  if (!kid) {
    return (
      <main className="view-container">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Kid not found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>We couldn't find a profile for "{searchParams.get("id")}".</p>
          <Link href="/dashboard" style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>← Back to Dashboard</Link>
        </div>
      </main>
    );
  }

  const parsedQuestions = viewingModelTest ? parseQuestionsData(viewingModelTest.questions) : [];
  const totalMaxMarks = parsedQuestions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
  const currentAwardedMarksSum = parsedQuestions.reduce((acc, q) => acc + (Number(awardedMarks[q.id]) || 0), 0);
  const answeredQuestionsCount = parsedQuestions.filter(q => Boolean(studentAnswers[q.id]?.trim())).length;
  const gradedQuestionsCount = parsedQuestions.filter(q => awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '').length;

  const currentDisplayResult = viewingModelTest?.examinerGrading?.evaluatedAt
    ? `${viewingModelTest.examinerGrading.totalAwarded || 0}/${viewingModelTest.examinerGrading.totalMax || totalMaxMarks}`
    : (currentAwardedMarksSum > 0
        ? `${currentAwardedMarksSum}/${totalMaxMarks}`
        : (viewingModelTest?.result && viewingModelTest.result !== '40/100' && viewingModelTest.result !== 'Pending'
            ? viewingModelTest.result
            : `0/${totalMaxMarks}`));

  const defaultDurationMinutes = (examDurationMinutes !== null && !isNaN(examDurationMinutes))
    ? Number(examDurationMinutes)
    : (viewingModelTest?.duration 
        ? Number(viewingModelTest.duration) 
        : (totalMaxMarks <= 20 ? 30 : totalMaxMarks <= 50 ? 60 : totalMaxMarks <= 100 ? 90 : 120));
  const totalDurationSeconds = defaultDurationMinutes * 60;
  const elapsedSeconds = isExamFinished && viewingModelTest?.timeSpentSeconds 
    ? Number(viewingModelTest.timeSpentSeconds) 
    : (examStartedAt ? Math.max(0, Math.floor((Date.now() - examStartedAt) / 1000)) : 0);
  const remainingSeconds = Math.max(0, totalDurationSeconds - elapsedSeconds);
  const isTimeLow = isExamStarted && !isExamFinished && remainingSeconds <= 300 && remainingSeconds > 0;
  const isTimeUp = isExamStarted && !isExamFinished && remainingSeconds === 0;

  // Group questions by set / question type for contained collapsible & filtered navigation
  const questionSets = (() => {
    const map = new Map();
    parsedQuestions.forEach((q, idx) => {
      const setNum = q.setNumber || 1;
      if (!map.has(setNum)) {
        map.set(setNum, {
          setNumber: setNum,
          title: q.cleanSectionTitle || `Set ${setNum}`,
          questions: []
        });
      }
      map.get(setNum).questions.push({ ...q, globalIndex: idx });
    });
    return Array.from(map.values());
  })();

  const isSetCollapsed = (setNum) => {
    if (collapsedSets[setNum] !== undefined) {
      return Boolean(collapsedSets[setNum]);
    }
    // Default: When there are multiple sets, keep only the currently active question's set open, others collapsed!
    const activeSetNum = parsedQuestions[currentSlideIndex]?.setNumber;
    return questionSets.length > 1 ? setNum !== activeSetNum : false;
  };

  const toggleSetCollapse = (setNum) => {
    const currentlyCollapsed = isSetCollapsed(setNum);
    setCollapsedSets(prev => ({
      ...prev,
      [setNum]: !currentlyCollapsed
    }));
  };

  const handleCollapseAllSets = () => {
    const all = {};
    questionSets.forEach(s => { all[s.setNumber] = true; });
    setCollapsedSets(all);
  };

  const handleExpandAllSets = () => {
    const all = {};
    questionSets.forEach(s => { all[s.setNumber] = false; });
    setCollapsedSets(all);
  };

  const handleScrollPills = (direction) => {
    if (!pillsScrollRef.current) return;
    const distance = direction === 'left' ? -260 : 260;
    pillsScrollRef.current.scrollBy({ left: distance, behavior: 'smooth' });
  };

  const getQuestionGradingStatus = (q) => {
    const isAns = Boolean(studentAnswers[q.id]?.trim());
    const isGrd = awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '';
    const qMax = Number(q.marks) || 5;
    const awd = isGrd ? Number(awardedMarks[q.id]) : null;

    if (isGrd) {
      if (awd >= qMax) {
        return {
          isGrd: true,
          isAns,
          awd,
          qMax,
          status: 'correct',
          color: '#34d399',
          bg: 'rgba(16, 185, 129, 0.15)',
          border: 'rgba(16, 185, 129, 0.35)',
          symbol: '✓',
          markText: `[${awd}/${qMax}]`,
          studentTag: `✓ [${awd}/${qMax}]`,
          examinerTag: `[${awd}/${qMax}]`,
          badgeText: `✓ Correct (${awd}/${qMax})`,
          examinerBadgeText: `✓ Awarded: ${awd}/${qMax}`,
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeBorder: 'rgba(16, 185, 129, 0.3)',
          badgeColor: '#34d399'
        };
      } else if (awd > 0) {
        return {
          isGrd: true,
          isAns,
          awd,
          qMax,
          status: 'partial',
          color: '#facc15',
          bg: 'rgba(234, 179, 8, 0.15)',
          border: 'rgba(234, 179, 8, 0.35)',
          symbol: '~',
          markText: `[${awd}/${qMax}]`,
          studentTag: `~ [${awd}/${qMax}]`,
          examinerTag: `[${awd}/${qMax}]`,
          badgeText: `~ Partial (${awd}/${qMax})`,
          examinerBadgeText: `~ Partial: ${awd}/${qMax}`,
          badgeBg: 'rgba(234, 179, 8, 0.15)',
          badgeBorder: 'rgba(234, 179, 8, 0.3)',
          badgeColor: '#facc15'
        };
      } else {
        // awd === 0 -> Incorrect!
        return {
          isGrd: true,
          isAns,
          awd: 0,
          qMax,
          status: 'incorrect',
          color: '#f87171',
          bg: 'rgba(239, 68, 68, 0.15)',
          border: 'rgba(239, 68, 68, 0.35)',
          symbol: '✗',
          markText: `[0/${qMax}]`,
          studentTag: `✗ [0/${qMax}]`,
          examinerTag: `[0/${qMax}]`,
          badgeText: `✗ Incorrect (0/${qMax})`,
          examinerBadgeText: `✗ Incorrect: 0/${qMax}`,
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeBorder: 'rgba(239, 68, 68, 0.3)',
          badgeColor: '#f87171'
        };
      }
    }

    if (isExamFinished) {
      // Check MCQ auto key if available
      const hasOptions = Array.isArray(q.options) && q.options.length > 0;
      if (hasOptions && q.answerKey && isAns) {
        const studentAns = studentAnswers[q.id].trim();
        const matchedOpt = q.options.find(opt => 
          studentAns === opt.trim() || 
          (opt.trim().length >= 2 && studentAns.startsWith(opt.trim().slice(0, 2)))
        );
        const isCorrectKey = matchedOpt && (
          q.answerKey.toLowerCase().includes(matchedOpt.slice(0, 2).toLowerCase()) ||
          q.answerKey.toLowerCase().includes(matchedOpt.toLowerCase())
        );
        if (isCorrectKey) {
          return {
            isGrd: false,
            isAns: true,
            awd: qMax,
            qMax,
            status: 'correct',
            color: '#34d399',
            bg: 'rgba(16, 185, 129, 0.15)',
            border: 'rgba(16, 185, 129, 0.35)',
            symbol: '✓',
            markText: `[${qMax}/${qMax}]`,
            studentTag: `✓ [${qMax}/${qMax}]`,
            examinerTag: `✓ [${qMax}/${qMax}]`,
            badgeText: `✓ Correct (${qMax}/${qMax})`,
            examinerBadgeText: `✓ Key Match (${qMax}/${qMax})`,
            badgeBg: 'rgba(16, 185, 129, 0.15)',
            badgeBorder: 'rgba(16, 185, 129, 0.3)',
            badgeColor: '#34d399'
          };
        } else {
          return {
            isGrd: false,
            isAns: true,
            awd: 0,
            qMax,
            status: 'incorrect',
            color: '#f87171',
            bg: 'rgba(239, 68, 68, 0.15)',
            border: 'rgba(239, 68, 68, 0.35)',
            symbol: '✗',
            markText: `[0/${qMax}]`,
            studentTag: `✗ [0/${qMax}]`,
            examinerTag: `✗ [0/${qMax}]`,
            badgeText: `✗ Incorrect (0/${qMax})`,
            examinerBadgeText: `✗ Wrong Option (0/${qMax})`,
            badgeBg: 'rgba(239, 68, 68, 0.15)',
            badgeBorder: 'rgba(239, 68, 68, 0.3)',
            badgeColor: '#f87171'
          };
        }
      }

      if (isAns) {
        return {
          isGrd: false,
          isAns: true,
          awd: null,
          qMax,
          status: 'pending',
          color: '#38bdf8',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.3)',
          symbol: '•',
          markText: `[Pending]`,
          studentTag: `• [Pending]`,
          examinerTag: `[Pending]`,
          badgeText: `⏳ Under Review`,
          examinerBadgeText: `⏳ Pending Marking`,
          badgeBg: 'rgba(56, 189, 248, 0.15)',
          badgeBorder: 'rgba(56, 189, 248, 0.3)',
          badgeColor: '#38bdf8'
        };
      }

      return {
        isGrd: false,
        isAns: false,
        awd: 0,
        qMax,
        status: 'unanswered',
        color: 'rgba(248, 113, 113, 0.7)',
        bg: 'rgba(239, 68, 68, 0.05)',
        border: 'rgba(239, 68, 68, 0.2)',
        symbol: '○',
        markText: `[0/${qMax}]`,
        studentTag: `○ [0/${qMax}]`,
        examinerTag: `○ [0/${qMax}]`,
        badgeText: `○ Unanswered`,
        examinerBadgeText: `○ Unanswered (0/${qMax})`,
        badgeBg: 'rgba(239, 68, 68, 0.1)',
        badgeBorder: 'rgba(239, 68, 68, 0.25)',
        badgeColor: '#f87171'
      };
    }

    // Active test in progress (!isExamFinished)
    if (isAns) {
      return {
        isGrd: false,
        isAns: true,
        awd: null,
        qMax,
        status: 'answered',
        color: '#34d399',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.3)',
        symbol: '✓',
        markText: `✓`,
        studentTag: `✓`,
        examinerTag: `✓`,
        badgeText: `✓ Answered`,
        examinerBadgeText: `✓ Answered`,
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        badgeColor: '#34d399'
      };
    }

    return {
      isGrd: false,
      isAns: false,
      awd: null,
      qMax,
      status: 'empty',
      color: 'var(--text-secondary)',
      bg: 'rgba(255, 255, 255, 0.03)',
      border: 'rgba(255, 255, 255, 0.08)',
      symbol: '',
      markText: ``,
      studentTag: ``,
      examinerTag: ``,
      badgeText: `○ Not Answered`,
      examinerBadgeText: `⏳ Pending Marking`,
      badgeBg: 'rgba(255, 255, 255, 0.06)',
      badgeBorder: 'rgba(255, 255, 255, 0.08)',
      badgeColor: 'var(--text-secondary)'
    };
  };

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '840px', width: '100%', padding: 'clamp(1rem, 4vw, 2.5rem)' }}>
        
        {/* Header / Back Navigation */}
        <div style={{ marginBottom: '2rem' }}>
          {isStudentView ? (
            <button 
              onClick={async () => {
                await signOut(auth);
                router.push('/');
              }} 
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', transition: 'color 0.2s', padding: 0 }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              Sign Out
            </button>
          ) : (
            <Link href="/dashboard" style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', transition: 'color 0.2s' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Back to Dashboard
            </Link>
          )}
        </div>

        {/* Profile Header */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'clamp(1rem, 4vw, 2rem)', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)' }}>
          {kid.email ? (
            <>
              <img 
                src={`https://unavatar.io/${kid.email}?fallback=false`} 
                alt={kid.name}
                referrerPolicy="no-referrer"
                style={{ width: 'clamp(72px, 18vw, 120px)', height: 'clamp(72px, 18vw, 120px)', borderRadius: '50%', objectFit: 'cover', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, display: 'block' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextElementSibling) {
                    e.target.nextElementSibling.style.display = 'flex';
                  }
                }}
              />
              <div style={{ width: 'clamp(72px, 18vw, 120px)', height: 'clamp(72px, 18vw, 120px)', borderRadius: '50%', background: kid.color, display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 'bold', color: '#fff', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, flexShrink: 0 }}>
                {kid.name?.charAt(0)}
              </div>
            </>
          ) : (
            <div style={{ width: 'clamp(72px, 18vw, 120px)', height: 'clamp(72px, 18vw, 120px)', borderRadius: '50%', background: kid.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 'bold', color: '#fff', boxShadow: `0 8px 24px ${kid.color}40`, border: `4px solid ${kid.color}`, flexShrink: 0 }}>
              {kid.name?.charAt(0)}
            </div>
          )}
          
          <div style={{ textAlign: 'left', flex: '1 1 180px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)', margin: 0, lineHeight: 1.1 }}>{kid.name}</h1>
              {searchParams.get("parentId") && (
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8'
                }}>
                  👨‍🏫 Assigned View
                </span>
              )}
            </div>
            <p style={{ fontSize: '1.15rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0.75rem 0' }}>{kid.grade}</p>

            {/* Email assignment & Teacher invitation bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {kid.email ? (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontSize: '0.86rem',
                  color: '#cbd5e1'
                }}>
                  <span>✉️</span>
                  <span style={{ fontWeight: 600 }}>{kid.email}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStudentEmailInput(kid.email || '');
                      setEmailModalError('');
                      setShowAssignEmailModal(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#a5b4fc',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textDecoration: 'underline',
                      marginLeft: '0.25rem',
                      padding: 0
                    }}
                    title="Change student email address"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setStudentEmailInput('');
                    setEmailModalError('');
                    setShowAssignEmailModal(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.8rem',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(129, 140, 248, 0.4)',
                    color: '#a5b4fc',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>✉️</span>
                  <span>+ Assign Student Email</span>
                </button>
              )}

              {/* Invite Teacher / Parent Action */}
              <button
                type="button"
                onClick={() => {
                  setTeacherEmailInput('');
                  setInviteModalError('');
                  setInviteModalSuccess('');
                  setShowInviteTeacherModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.8rem',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: '#6ee7b7',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                title="Invite a teacher or parent to monitor and assess this student"
              >
                <span>🔗</span>
                <span>Invite Teacher / Parent</span>
              </button>

              {/* Set Password Action */}
              {!isStudentView && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentPasswordInput('');
                    setNewPasswordInput('');
                    setConfirmPasswordInput('');
                    setPasswordModalError('');
                    setPasswordModalSuccess('');
                    setShowCurrentPw(false);
                    setShowNewPw(false);
                    setShowConfirmPw(false);
                    setShowPasswordModal(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.8rem',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    color: '#fcd34d',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  title="Set or change the password for this student's account"
                >
                  <span>🔑</span>
                  <span>Set Password</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Subjects, Exams, and Syllabus Section */}
        <div style={{ marginTop: 'clamp(1.5rem, 4vw, 2.5rem)' }}>
          
          {/* Section Header with View Mode Switcher and Add Subject Action */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h2 style={{ textAlign: 'left', fontSize: 'clamp(1.15rem, 4vw, 1.5rem)', fontWeight: 700, margin: 0, color: '#fff', letterSpacing: '-0.02em' }}>
                  Enrolled Subjects
                </h2>
                <span style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '9999px',
                  background: 'rgba(99, 102, 241, 0.18)',
                  border: '1px solid rgba(129, 140, 248, 0.35)',
                  color: '#a5b4fc'
                }}>
                  {subjects.length} {subjects.length === 1 ? 'Subject' : 'Subjects'}
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Curriculum syllabus readiness, upcoming exam workspaces, and dedicated subject hubs
              </p>
            </div>

            {/* Actions: Responsive View Switcher (Grid vs Horizontal Scroll) + Add Subject */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              
              {/* View Switcher Capsule (Grid vs Carousel) */}
              {subjects.length > 1 && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  background: 'rgba(0, 0, 0, 0.35)',
                  padding: '0.25rem',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <button
                    type="button"
                    onClick={() => setSubjectsLayoutMode('grid')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: 'none',
                      background: subjectsLayoutMode === 'grid' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                      color: subjectsLayoutMode === 'grid' ? '#fff' : '#94a3b8',
                      boxShadow: subjectsLayoutMode === 'grid' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Responsive Grid Layout"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7"></rect>
                      <rect x="14" y="3" width="7" height="7"></rect>
                      <rect x="14" y="14" width="7" height="7"></rect>
                      <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    <span>Grid</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubjectsLayoutMode('carousel')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '7px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      border: 'none',
                      background: subjectsLayoutMode === 'carousel' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                      color: subjectsLayoutMode === 'carousel' ? '#fff' : '#94a3b8',
                      boxShadow: subjectsLayoutMode === 'carousel' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Horizontal Scroll Strip for Mobile & Touch"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2"></rect>
                      <line x1="2" y1="10" x2="22" y2="10"></line>
                    </svg>
                    <span>Carousel</span>
                  </button>
                </div>
              )}

              {/* Add Subject Button */}
              <button
                onClick={() => { setNewTitle(''); setAddType('subject'); setShowAddModal(true); }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 1.15rem',
                  background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(99, 102, 241, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.35)';
                }}
                onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.98)'}
                title="Add Subject / Exam / Chapter"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                <span>Add Subject</span>
              </button>
            </div>
          </div>
          
          {/* Responsive Cards Container: Adaptive Grid or Horizontal Scroll */}
          <div style={subjectsLayoutMode === 'carousel' ? {
            display: 'flex',
            gap: '1.25rem',
            overflowX: 'auto',
            paddingBottom: '1rem',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch'
          } : {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))',
            gridAutoFlow: 'dense',
            gap: '1.25rem',
            alignItems: 'start'
          }}>
            {subjects.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                padding: '2.5rem 1.5rem',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '16px',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}>
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📚</span>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.95rem' }}>No subjects added yet. Click &quot;Add Subject&quot; above to map curriculum.</p>
                <button
                  type="button"
                  onClick={() => { setNewTitle(''); setAddType('subject'); setShowAddModal(true); }}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
                    color: '#fff',
                    borderRadius: '10px',
                    border: 'none',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Add First Subject
                </button>
              </div>
            )}
            {subjects.map(subject => {
              const subjectTitle = subject?.title || subject?.name || subject?.subjectName || '';
              const subjectSlug = subjectTitle ? subjectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : (subject?.id || 'subject');

              // Calculate overall chapters, completed chapters, and model tests for this subject
              let totalChapters = 0;
              let completedChapters = 0;
              let totalTests = 0;

              const subjectExams = exams.map(exam => {
                const chapsObj = (subject.chapters && subject.chapters[exam.id]) || {};
                const chapsList = Object.values(chapsObj);
                const examTotalChaps = chapsList.length;
                const examCompletedChaps = chapsList.filter(c => c.completed || c.status === 'completed').length;
                const examProgress = examTotalChaps > 0 ? Math.round((examCompletedChaps / examTotalChaps) * 100) : 0;

                const examSetting = (subject.examSettings && subject.examSettings[exam.id]) || {};
                const isArchived = Boolean(examSetting.isArchived || examSetting.status === 'Archived' || exam.isArchived);
                const examStatus = examSetting.status || (examProgress === 100 && examTotalChaps > 0 ? 'Completed' : (examProgress > 0 ? 'In Progress' : 'Not Started'));

                const rawTests = (subject.modelTests && subject.modelTests[exam.id]) || {};
                const rawMappedTests = Object.entries(rawTests).map(([tId, t]) => {
                  let scoreDisplay = 'Pending';
                  let percent = null;
                  let isGraded = false;

                  if (t.examinerGrading?.totalAwarded !== undefined) {
                    const awarded = Number(t.examinerGrading.totalAwarded) || 0;
                    const max = Number(t.examinerGrading.totalMax) || 100;
                    percent = Math.round((awarded / max) * 100);
                    scoreDisplay = `${awarded}/${max}`;
                    isGraded = true;
                  } else if (t.result && t.result !== 'Pending' && t.result !== '0') {
                    scoreDisplay = t.result;
                    if (t.result.includes('/')) {
                      const [num, den] = t.result.split('/').map(Number);
                      if (!isNaN(num) && !isNaN(den) && den > 0) {
                        percent = Math.round((num / den) * 100);
                        isGraded = true;
                      }
                    } else if (!isNaN(Number(t.result))) {
                      percent = Number(t.result);
                      isGraded = true;
                    }
                  }

                  return {
                    id: tId,
                    ...t,
                    scoreDisplay,
                    percent,
                    isGraded
                  };
                });

                const titleCounts = {};
                for (const t of rawMappedTests) {
                  const rawTitle = (t.title || `Model Test - ${t.date || 'Practice'}`).trim();
                  titleCounts[rawTitle] = (titleCounts[rawTitle] || 0) + 1;
                }
                const chronological = [...rawMappedTests].sort((a, b) => getTestCreatedAt(a, true) - getTestCreatedAt(b, true));
                const titleSeq = {};
                const displayTitleMap = {};
                for (const t of chronological) {
                  const rawTitle = (t.title || `Model Test - ${t.date || 'Practice'}`).trim();
                  if (titleCounts[rawTitle] > 1) {
                    titleSeq[rawTitle] = (titleSeq[rawTitle] || 0) + 1;
                    displayTitleMap[t.id] = `${rawTitle} #${titleSeq[rawTitle]}`;
                  } else {
                    displayTitleMap[t.id] = rawTitle;
                  }
                }

                const testList = rawMappedTests.map(t => ({
                  ...t,
                  displayTitle: displayTitleMap[t.id] || t.title,
                  genTime: formatGeneratedTime(t)
                })).sort((a, b) => getTestCreatedAt(b, true) - getTestCreatedAt(a, true));

                const testCount = testList.length;
                totalChapters += examTotalChaps;
                completedChapters += examCompletedChaps;
                totalTests += testCount;

                const gradedTests = testList.filter(t => t.isGraded && t.percent !== null);
                const avgTestScore = gradedTests.length > 0
                  ? Math.round(gradedTests.reduce((sum, t) => sum + t.percent, 0) / gradedTests.length)
                  : null;

                return {
                  ...exam,
                  totalChapters: examTotalChaps,
                  completedChapters: examCompletedChaps,
                  progress: examProgress,
                  status: examStatus,
                  isArchived,
                  archivedAt: examSetting.archivedAt || null,
                  testCount,
                  tests: testList,
                  avgTestScore,
                  gradedTestsCount: gradedTests.length
                };
              });

              // Separate active and archived exams
              const activeExams = subjectExams.filter(ex => !ex.isArchived);
              const archivedExams = subjectExams.filter(ex => ex.isArchived);

              const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
              const remainingChapters = Math.max(0, totalChapters - completedChapters);

              // Determine immediate next exam from active (non-archived) exams:
              const nextUpExam = activeExams.find(ex => ex.status === 'In Progress') 
                || activeExams.find(ex => ex.status !== 'Completed')
                || activeExams[0];

              const examsWithModelTests = activeExams.filter(ex => ex.tests && ex.tests.length > 0);

              const queryParentId = searchParams.get("parentId");
              const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
              const subjectHubHref = `/kid/subject?id=${searchParams.get("id")}&subject=${subjectSlug}&subjectId=${subject.id}${parentIdQuery}`;

              const isExpanded = !!expandedSubjects[subject.id];

              return (
                <div 
                  key={subject.id} 
                  style={{ 
                    background: isExpanded
                      ? 'linear-gradient(145deg, rgba(28, 33, 56, 0.98), rgba(16, 20, 38, 0.99))'
                      : 'linear-gradient(145deg, rgba(23, 28, 44, 0.95), rgba(15, 18, 32, 0.98))', 
                    border: isExpanded
                      ? '1px solid rgba(139, 92, 246, 0.45)'
                      : '1px solid rgba(255, 255, 255, 0.08)', 
                    borderRadius: isExpanded ? '22px' : '18px', 
                    padding: isExpanded ? '1.65rem 1.85rem' : '1.35rem 1.45rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isExpanded ? '1.35rem' : '1.1rem',
                    textAlign: 'left',
                    transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                    boxShadow: isExpanded
                      ? '0 24px 60px -12px rgba(0, 0, 0, 0.65), 0 0 36px -4px rgba(139, 92, 246, 0.18)'
                      : '0 8px 32px rgba(0, 0, 0, 0.28)',
                    position: 'relative',
                    ...(subjectsLayoutMode === 'carousel' ? {
                      flex: isExpanded ? '0 0 100%' : '0 0 min(380px, 86vw)',
                      width: isExpanded ? '100%' : 'auto',
                      scrollSnapAlign: 'start'
                    } : {
                      gridColumn: isExpanded ? '1 / -1' : 'auto',
                      width: '100%',
                      minWidth: 0
                    })
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = isExpanded ? 'rgba(139, 92, 246, 0.65)' : 'rgba(139, 92, 246, 0.35)';
                    e.currentTarget.style.boxShadow = isExpanded 
                      ? '0 28px 64px -10px rgba(0, 0, 0, 0.7), 0 0 44px -2px rgba(139, 92, 246, 0.25)' 
                      : '0 12px 36px rgba(139, 92, 246, 0.12)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = isExpanded ? 'rgba(139, 92, 246, 0.45)' : 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.boxShadow = isExpanded 
                      ? '0 24px 60px -12px rgba(0, 0, 0, 0.65), 0 0 36px -4px rgba(139, 92, 246, 0.18)' 
                      : '0 8px 32px rgba(0, 0, 0, 0.28)';
                  }}
                >
                  {/* Subject Header Row: Icon, Title, Textbook Badge & Settings */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                      {/* Subject Icon Badge */}
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.15))',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.3rem',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15)'
                      }}>
                        {getSubjectIcon(subjectTitle)}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: isExpanded ? '1.35rem' : '1.22rem', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {subjectTitle || 'Untitled Subject'}
                          </h3>

                          {isExpanded && (
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '0.14rem 0.55rem',
                              borderRadius: '8px',
                              background: 'rgba(139, 92, 246, 0.2)',
                              border: '1px solid rgba(139, 92, 246, 0.4)',
                              color: '#d8b4fe',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              letterSpacing: '0.02em'
                            }}>
                              <span>✨</span>
                              <span>Full Workspace</span>
                            </span>
                          )}

                          {subject.bookUrl && (
                            <a 
                              href={subject.bookUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              style={{ 
                                fontSize: '0.7rem', 
                                background: 'rgba(59, 130, 246, 0.15)', 
                                color: '#93c5fd', 
                                border: '1px solid rgba(59, 130, 246, 0.3)', 
                                padding: '0.12rem 0.5rem', 
                                borderRadius: '10px',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                transition: 'all 0.2s'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.28)'}
                              onMouseOut={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
                              title="Open Online Textbook / PDF"
                            >
                              <span>📖 Textbook</span>
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            </a>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          <span>{totalChapters} {totalChapters === 1 ? 'Chapter' : 'Chapters'}</span>
                          <span>•</span>
                          <span>{subjectExams.length} {subjectExams.length === 1 ? 'Exam' : 'Exams'}</span>
                          {totalTests > 0 && (
                            <>
                              <span>•</span>
                              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{totalTests} Tests</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Subject Settings Button */}
                    <button 
                      onClick={() => {
                        setSettingsSubject(subject);
                        setSubjectBookUrl(subject.bookUrl || '');
                        setSubjectExamRetentionDays(subject.examRetentionDays !== undefined ? String(subject.examRetentionDays) : '7');
                      }} 
                      style={{ 
                        width: '34px',
                        height: '34px',
                        padding: 0,
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)', 
                        border: '1px solid rgba(255, 255, 255, 0.08)', 
                        color: 'var(--text-secondary)', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        flexShrink: 0
                      }} 
                      onMouseOver={(e) => {
                        e.currentTarget.style.color = '#fff';
                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                        e.currentTarget.style.transform = 'rotate(45deg)';
                      }} 
                      onMouseOut={(e) => {
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.transform = 'rotate(0deg)';
                      }} 
                      title="Subject Settings & Auto-Archive Configuration"
                      aria-label="Subject Settings"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                    </button>
                  </div>

                  {/* Summary Metric Cards: Side-by-Side Responsive Grid when Expanded */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isExpanded ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
                    gap: '0.85rem',
                    alignItems: 'stretch'
                  }}>
                    {/* High-Contrast Circular Progress Ring & Syllabus Mastery */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1.2rem',
                      padding: '0.95rem 1.15rem',
                      background: 'rgba(255, 255, 255, 0.025)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '14px',
                      position: 'relative'
                    }}>
                      {/* SVG Circular Progress Dial */}
                      <div style={{ position: 'relative', width: '74px', height: '74px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
                          <defs>
                            <linearGradient id={`prog-grad-${subject.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="#38bdf8" />
                              <stop offset="50%" stopColor="#818cf8" />
                              <stop offset="100%" stopColor="#34d399" />
                            </linearGradient>
                            <filter id={`glow-${subject.id}`} x="-20%" y="-20%" width="140%" height="140%">
                              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#38bdf8" floodOpacity="0.7" />
                            </filter>
                          </defs>
                          
                          {/* Outer delicate guide track */}
                          <circle
                            cx="37"
                            cy="37"
                            r="33"
                            stroke="rgba(255, 255, 255, 0.04)"
                            strokeWidth="1"
                            strokeDasharray="2 3"
                            fill="transparent"
                          />

                          {/* Background Base Ring */}
                          <circle
                            cx="37"
                            cy="37"
                            r="28"
                            stroke="rgba(255, 255, 255, 0.08)"
                            strokeWidth="5"
                            fill="transparent"
                          />

                          {/* Active Progress or High-Contrast Zero-State Track */}
                          {progressPercent === 0 ? (
                            <>
                              <circle
                                cx="37"
                                cy="37"
                                r="28"
                                stroke="rgba(148, 163, 184, 0.2)"
                                strokeWidth="5"
                                strokeDasharray="2 4"
                                fill="transparent"
                              />
                              {/* Starter 12 o'clock indicator dot for visual feedback at 0% */}
                              <circle
                                cx="37"
                                cy="9"
                                r="3"
                                fill="#38bdf8"
                                filter={`url(#glow-${subject.id})`}
                              />
                            </>
                          ) : (
                            <circle
                              cx="37"
                              cy="37"
                              r="28"
                              stroke={progressPercent === 100 ? '#10b981' : `url(#prog-grad-${subject.id})`}
                              strokeWidth="5"
                              strokeDasharray={175.93}
                              strokeDashoffset={175.93 - (175.93 * progressPercent) / 100}
                              strokeLinecap="round"
                              fill="transparent"
                              style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
                            />
                          )}
                        </svg>

                        {/* Center Dial Mastery Label */}
                        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                          <span style={{ 
                            fontSize: '1.08rem', 
                            fontWeight: 800, 
                            color: progressPercent === 100 ? '#34d399' : progressPercent > 0 ? '#ffffff' : '#38bdf8', 
                            lineHeight: 1,
                            textShadow: progressPercent > 0 ? '0 0 10px rgba(56, 189, 248, 0.3)' : 'none'
                          }}>
                            {progressPercent}%
                          </span>
                          <span style={{ 
                            fontSize: '0.52rem', 
                            color: progressPercent === 0 ? '#38bdf8' : 'var(--text-secondary)', 
                            fontWeight: 700,
                            textTransform: 'uppercase', 
                            letterSpacing: '0.5px', 
                            marginTop: '3px' 
                          }}>
                            {progressPercent === 0 ? 'READY' : progressPercent === 100 ? 'DONE' : 'MASTERY'}
                          </span>
                        </div>
                      </div>

                      {/* Mastery Stats & Breakdown */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '0.16rem 0.55rem',
                            borderRadius: '8px',
                            fontWeight: 700,
                            letterSpacing: '0.3px',
                            textTransform: 'uppercase',
                            background: progressPercent === 100 ? 'rgba(16, 185, 129, 0.15)' : progressPercent > 0 ? 'rgba(139, 92, 246, 0.15)' : 'rgba(56, 189, 248, 0.12)',
                            color: progressPercent === 100 ? '#34d399' : progressPercent > 0 ? '#c084fc' : '#38bdf8',
                            border: `1px solid ${progressPercent === 100 ? 'rgba(16, 185, 129, 0.3)' : progressPercent > 0 ? 'rgba(139, 92, 246, 0.3)' : 'rgba(56, 189, 248, 0.25)'}`
                          }}>
                            {progressPercent === 100 ? 'Mastered' : progressPercent > 0 ? 'In Progress' : totalChapters > 0 ? 'Curriculum Ready' : 'Setup Needed'}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#e2e8f0', fontWeight: 600 }}>
                            {completedChapters}/{totalChapters} Mastered
                          </span>
                        </div>

                        {/* Chips */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: completedChapters > 0 ? '#34d399' : 'var(--text-secondary)' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: completedChapters > 0 ? '#10b981' : 'rgba(255,255,255,0.2)' }}></span>
                            {completedChapters} Done
                          </span>
                          <span style={{ color: 'rgba(255,255,255,0.2)' }}>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: remainingChapters > 0 ? '#f59e0b' : 'rgba(255,255,255,0.2)' }}></span>
                            {remainingChapters} Remaining
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Immediate Next Exam Snapshot Capsule */}
                    {nextUpExam ? (
                      <div style={{
                        padding: '0.75rem 0.95rem',
                        background: 'rgba(245, 158, 11, 0.05)',
                        border: '1px solid rgba(245, 158, 11, 0.22)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                            <span style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24', letterSpacing: '0.5px' }}>
                              ⚡ Next Up Exam
                            </span>
                          </div>
                          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                            {nextUpExam.title}
                          </span>
                        </div>

                        <Link
                          href={`/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${nextUpExam.id}&subjectId=${subject.id}${parentIdQuery}`}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#fbbf24',
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.25)',
                            padding: '0.32rem 0.65rem',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            flexShrink: 0,
                            transition: 'all 0.2s'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)';
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)';
                            e.currentTarget.style.transform = 'translateX(0)';
                          }}
                        >
                          <span>Workspace</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </Link>
                      </div>
                    ) : isExpanded ? (
                      <div style={{
                        padding: '0.75rem 0.95rem',
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                      }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', display: 'block', marginBottom: '0.2rem' }}>
                            📅 Exam Schedule
                          </span>
                          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#e2e8f0' }}>
                            {activeExams.length > 0 ? `${activeExams.length} active exam tracks mapped` : 'No upcoming exams active'}
                          </span>
                        </div>
                        <Link
                          href={subjectHubHref}
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: '#a5b4fc',
                            background: 'rgba(99, 102, 241, 0.12)',
                            border: '1px solid rgba(129, 140, 248, 0.25)',
                            padding: '0.32rem 0.65rem',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            flexShrink: 0
                          }}
                        >
                          <span>Subject Hub</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </Link>
                      </div>
                    ) : null}
                  </div>

                  {/* Collapsible Drawer Toggle Button for Exam Tracks & Tests */}
                  {subjectExams.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleSubject(subject.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.65rem 1rem',
                        background: isExpanded ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255, 255, 255, 0.035)',
                        border: `1px solid ${isExpanded ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.07)'}`,
                        borderRadius: '12px',
                        color: isExpanded ? '#c4b5fd' : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        width: '100%',
                        boxShadow: isExpanded ? '0 4px 14px rgba(139, 92, 246, 0.15)' : 'none'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = isExpanded ? 'rgba(139, 92, 246, 0.26)' : 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.55)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = isExpanded ? 'rgba(139, 92, 246, 0.16)' : 'rgba(255, 255, 255, 0.035)';
                        e.currentTarget.style.borderColor = isExpanded ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255, 255, 255, 0.07)';
                        e.currentTarget.style.color = isExpanded ? '#c4b5fd' : 'var(--text-secondary)';
                      }}
                      aria-expanded={isExpanded}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                        <span>📋</span>
                        <span>
                          {isExpanded 
                            ? 'Collapse Full-Width Workspace' 
                            : `View ${subjectExams.length} Exams & ${totalTests} Model Tests`}
                        </span>
                        {isExpanded && (
                          <span style={{
                            fontSize: '0.66rem',
                            padding: '0.12rem 0.45rem',
                            borderRadius: '6px',
                            background: 'rgba(139, 92, 246, 0.28)',
                            border: '1px solid rgba(139, 92, 246, 0.45)',
                            color: '#ede9fe',
                            fontWeight: 700
                          }}>
                            Full Width
                          </span>
                        )}
                      </div>

                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: isExpanded ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                      </div>
                    </button>
                  )}

                  {/* Expandable Content Area: Detailed Exam Cards & Model Tests */}
                  {isExpanded && subjectExams.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      padding: '1rem 0.2rem 0.4rem 0.2rem',
                      borderTop: '1px dashed rgba(255, 255, 255, 0.08)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#f1f5f9', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                            Exams & Workspaces
                          </span>
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '0.12rem 0.5rem',
                            borderRadius: '9999px',
                            background: 'rgba(99, 102, 241, 0.15)',
                            border: '1px solid rgba(129, 140, 248, 0.3)',
                            color: '#c7d2fe',
                            fontWeight: 600
                          }}>
                            {activeExams.length} Active
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          {archivedExams.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowArchivedExamsMap(prev => ({ ...prev, [subject.id]: !prev[subject.id] }));
                              }}
                              style={{
                                background: showArchivedExamsMap[subject.id] ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                color: showArchivedExamsMap[subject.id] ? '#fff' : 'var(--text-secondary)',
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.22rem 0.55rem',
                                borderRadius: '7px',
                                transition: 'all 0.15s'
                              }}
                            >
                              <span>📦 {showArchivedExamsMap[subject.id] ? 'Hide' : 'Show'} Archived ({archivedExams.length})</span>
                              <span style={{ transform: showArchivedExamsMap[subject.id] ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                            </button>
                          )}
                          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
                            Click exam to enter study workspace
                          </span>
                        </div>
                      </div>

                      {activeExams.length === 0 ? (
                        <div style={{
                          padding: '1.5rem',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px dashed rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: '0.82rem'
                        }}>
                          <span style={{ display: 'block', fontSize: '1.25rem', marginBottom: '0.3rem' }}>🎉</span>
                          All scheduled exams have been completed and archived. Click &quot;Show Archived&quot; to review past workspaces.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: '0.75rem' }}>
                          {activeExams.map(ex => {
                            const examHref = `/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${ex.id}&subjectId=${subject.id}${parentIdQuery}`;
                            const isNextUp = nextUpExam && ex.id === nextUpExam.id && ex.status !== 'Completed';
                            const isMajorExam = /final|term|annual|board|midterm|semester/i.test(ex?.title || '');

                            return (
                              <div
                                key={ex.id}
                                onClick={() => router.push(examHref)}
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  padding: '0.85rem 1rem',
                                  background: isNextUp
                                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(139, 92, 246, 0.08))'
                                    : 'rgba(255, 255, 255, 0.025)',
                                  border: isNextUp
                                    ? '1px solid rgba(245, 158, 11, 0.5)'
                                    : '1px solid rgba(255, 255, 255, 0.06)',
                                  borderRadius: '12px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                  gap: '0.65rem',
                                  position: 'relative',
                                  boxShadow: isNextUp ? '0 4px 18px rgba(245, 158, 11, 0.12)' : 'none'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = isNextUp
                                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.13), rgba(139, 92, 246, 0.13))'
                                    : 'rgba(255, 255, 255, 0.055)';
                                  e.currentTarget.style.borderColor = isNextUp
                                    ? 'rgba(245, 158, 11, 0.75)'
                                    : 'rgba(139, 92, 246, 0.4)';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = isNextUp
                                    ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(139, 92, 246, 0.08))'
                                    : 'rgba(255, 255, 255, 0.025)';
                                  e.currentTarget.style.borderColor = isNextUp
                                    ? 'rgba(245, 158, 11, 0.5)'
                                    : 'rgba(255, 255, 255, 0.06)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                title={`Open ${ex.title} Exam Workspace`}
                              >
                                {/* Top row: Badges, Status, and Manual End/Archive Action */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                    {isNextUp && (
                                      <span style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 700,
                                        letterSpacing: '0.4px',
                                        padding: '0.16rem 0.5rem',
                                        borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                        color: '#ffffff',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                                        textTransform: 'uppercase'
                                      }}>
                                        <span>⚡</span>
                                        <span>Next Up</span>
                                      </span>
                                    )}

                                    {isMajorExam && (
                                      <span style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 600,
                                        padding: '0.15rem 0.45rem',
                                        borderRadius: '8px',
                                        background: 'rgba(168, 85, 247, 0.15)',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        color: '#d8b4fe',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem'
                                      }}>
                                        <span>🏆</span>
                                        <span>Major</span>
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{
                                      fontSize: '0.67rem',
                                      padding: '0.12rem 0.45rem',
                                      borderRadius: '8px',
                                      fontWeight: 600,
                                      background:
                                        ex.status === 'Completed' ? 'rgba(16, 185, 129, 0.15)' :
                                        ex.status === 'In Progress' ? 'rgba(59, 130, 246, 0.15)' :
                                        ex.status === 'Reviewing' ? 'rgba(168, 85, 247, 0.15)' :
                                        'rgba(148, 163, 184, 0.1)',
                                      color:
                                        ex.status === 'Completed' ? '#34d399' :
                                        ex.status === 'In Progress' ? '#60a5fa' :
                                        ex.status === 'Reviewing' ? '#c084fc' :
                                        '#94a3b8'
                                    }}>
                                      {ex.status}
                                    </span>

                                    {/* Manual End / Close / Archive Button */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleArchiveExam(subject.id, ex.id, ex.title);
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.22rem',
                                        padding: '0.12rem 0.48rem',
                                        borderRadius: '7px',
                                        background: ex.status === 'Completed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                                        border: ex.status === 'Completed' ? '1px solid rgba(52, 211, 153, 0.35)' : '1px solid rgba(255, 255, 255, 0.1)',
                                        color: ex.status === 'Completed' ? '#34d399' : '#cbd5e1',
                                        fontSize: '0.66rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(239, 68, 68, 0.18)';
                                        e.currentTarget.style.borderColor = 'rgba(248, 113, 113, 0.45)';
                                        e.currentTarget.style.color = '#f87171';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = ex.status === 'Completed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.borderColor = ex.status === 'Completed' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.color = ex.status === 'Completed' ? '#34d399' : '#cbd5e1';
                                      }}
                                      title="Manually end and archive this completed exam from the active list"
                                    >
                                      <span>📦</span>
                                      <span>{ex.status === 'Completed' ? 'Archive' : 'End Exam'}</span>
                                    </button>
                                  </div>
                                </div>

                                {/* Title & Meta */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  <span style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {ex.title}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                    <span>{ex.completedChapters}/{ex.totalChapters} Chaps</span>
                                    <span>•</span>
                                    <span>{ex.testCount} {ex.testCount === 1 ? 'Test' : 'Tests'}</span>
                                    {ex.avgTestScore !== null && (
                                      <>
                                        <span>•</span>
                                        <span style={{ color: ex.avgTestScore >= 75 ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                                          Avg: {ex.avgTestScore}%
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Mini progress bar */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginTop: '0.15rem' }}>
                                  <div style={{ flex: 1, height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${ex.progress}%`,
                                      background: ex.progress === 100 ? '#10b981' : isNextUp ? '#f59e0b' : '#8b5cf6',
                                      borderRadius: '2px'
                                    }} />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isNextUp ? '#fbbf24' : 'var(--text-secondary)', fontSize: '0.73rem', fontWeight: 600 }}>
                                    <span>Workspace</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Collapsible Archived Workspaces Section */}
                      {showArchivedExamsMap[subject.id] && archivedExams.length > 0 && (
                        <div style={{
                          marginTop: '0.5rem',
                          padding: '0.85rem 1rem',
                          background: 'rgba(0, 0, 0, 0.28)',
                          border: '1px dashed rgba(255, 255, 255, 0.12)',
                          borderRadius: '14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <span>📁</span>
                              <span style={{ fontSize: '0.74rem', color: '#cbd5e1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Archived & Closed Exam Workspaces ({archivedExams.length})
                              </span>
                            </div>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              Removed from active list • Preserved for reference
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.65rem' }}>
                            {archivedExams.map(ex => {
                              const examHref = `/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${ex.id}&subjectId=${subject.id}${parentIdQuery}`;

                              return (
                                <div
                                  key={ex.id}
                                  style={{
                                    padding: '0.75rem 0.95rem',
                                    background: 'rgba(255, 255, 255, 0.025)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.55rem'
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {ex.title}
                                    </span>
                                    <span style={{
                                      fontSize: '0.66rem',
                                      fontWeight: 600,
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '6px',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      color: '#34d399',
                                      border: '1px solid rgba(52, 211, 153, 0.25)',
                                      flexShrink: 0
                                    }}>
                                      Archived ✓
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    <span>{ex.completedChapters}/{ex.totalChapters} Chaps • {ex.testCount} Tests</span>
                                    {ex.avgTestScore !== null && (
                                      <span style={{ color: ex.avgTestScore >= 75 ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                                        Avg: {ex.avgTestScore}%
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '0.45rem', marginTop: '0.1rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => handleRestoreExam(subject.id, ex.id)}
                                      style={{
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        border: '1px solid rgba(129, 140, 248, 0.3)',
                                        color: '#c7d2fe',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        padding: '0.2rem 0.55rem',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        transition: 'all 0.15s'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.3)';
                                        e.currentTarget.style.color = '#fff';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
                                        e.currentTarget.style.color = '#c7d2fe';
                                      }}
                                      title="Restore this exam workspace back to the active list"
                                    >
                                      <span>↺</span>
                                      <span>Restore to Active</span>
                                    </button>

                                    <Link
                                      href={examHref}
                                      style={{
                                        color: 'var(--accent-primary)',
                                        fontSize: '0.72rem',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.2rem'
                                      }}
                                    >
                                      <span>View Records</span>
                                      <span>→</span>
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Model Tests Mastery & Performance Overview (if tests exist) */}
                      {examsWithModelTests.length > 0 && (
                        <div style={{
                          marginTop: '0.4rem',
                          padding: '1rem 1.15rem',
                          background: 'rgba(15, 23, 42, 0.45)',
                          border: '1px solid rgba(139, 92, 246, 0.2)',
                          borderRadius: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.85rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '1rem' }}>📊</span>
                              <span style={{ fontSize: '0.86rem', color: '#fff', fontWeight: 600 }}>
                                Model Test Performance
                              </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.18rem 0.5rem', borderRadius: '10px' }}>
                              {examsWithModelTests.reduce((acc, e) => acc + e.testCount, 0)} Tests Recorded
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {examsWithModelTests.map(ex => (
                              <div 
                                key={ex.id}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  border: '1px solid rgba(255, 255, 255, 0.06)',
                                  borderRadius: '10px',
                                  padding: '0.8rem 0.95rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.6rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                  <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#e2e8f0' }}>
                                    {ex.title}
                                  </span>
                                  {ex.avgTestScore !== null ? (
                                    <span style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      padding: '0.16rem 0.5rem',
                                      borderRadius: '8px',
                                      background: ex.avgTestScore >= 80 ? 'rgba(16, 185, 129, 0.15)' : ex.avgTestScore >= 60 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                      color: ex.avgTestScore >= 80 ? '#34d399' : ex.avgTestScore >= 60 ? '#60a5fa' : '#fbbf24',
                                      border: `1px solid ${ex.avgTestScore >= 80 ? 'rgba(16, 185, 129, 0.3)' : ex.avgTestScore >= 60 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                    }}>
                                      Avg: {ex.avgTestScore}%
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                      Pending Evaluation
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                                  {ex.tests.map(test => {
                                    const hasScore = test.isGraded && test.percent !== null;
                                    return (
                                      <div
                                        key={test.id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '0.6rem 0.75rem',
                                          background: 'rgba(255, 255, 255, 0.025)',
                                          border: '1px solid rgba(255, 255, 255, 0.06)',
                                          borderRadius: '8px',
                                          gap: '0.5rem'
                                        }}
                                      >
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
                                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {test.displayTitle || test.title || `Test - ${test.date || 'Practice'}`}
                                          </span>
                                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                            {test.date ? `📅 ${test.date}` : 'Practice'}
                                            {test.genTime && (
                                              <span style={{ color: '#cbd5e1' }}> • 🕒 {test.genTime}</span>
                                            )}
                                            <span> • </span>
                                            <strong style={{ color: '#38bdf8' }}>⏱️ {test.duration ? `${test.duration}m` : '60m'}</strong>
                                          </span>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                          {/* Quick Set Time Button */}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingDurationModal({
                                                testId: test.id,
                                                subjectId: subject.id,
                                                examId: ex.id,
                                                title: test.displayTitle || test.title || `Model Test - ${test.date || 'Practice'}`,
                                                currentDuration: test.duration || 60
                                              });
                                              setTempDurationValue(test.duration || 60);
                                            }}
                                            style={{
                                              background: 'rgba(56, 189, 248, 0.12)',
                                              border: '1px solid rgba(56, 189, 248, 0.35)',
                                              borderRadius: '6px',
                                              color: '#38bdf8',
                                              padding: '0.22rem 0.45rem',
                                              fontSize: '0.7rem',
                                              cursor: 'pointer',
                                              fontWeight: 600,
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.2rem',
                                              transition: 'all 0.15s ease'
                                            }}
                                            title="Set or customize time limit for this exam"
                                          >
                                            <span>⏱️</span>
                                            <span>{test.duration ? `${test.duration}m` : 'Time'}</span>
                                            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>✏️</span>
                                          </button>
                                          <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            padding: '0.18rem 0.45rem',
                                            borderRadius: '6px',
                                            background: hasScore 
                                              ? (test.percent >= 80 ? 'rgba(16, 185, 129, 0.18)' : test.percent >= 60 ? 'rgba(59, 130, 246, 0.18)' : 'rgba(245, 158, 11, 0.18)')
                                              : 'rgba(234, 179, 8, 0.12)',
                                            color: hasScore 
                                              ? (test.percent >= 80 ? '#34d399' : test.percent >= 60 ? '#60a5fa' : '#fbbf24')
                                              : '#facc15'
                                          }}>
                                            {hasScore ? `${test.scoreDisplay}` : 'Pending'}
                                          </span>

                                          <button
                                            type="button"
                                            onClick={() => openTestViewer({ ...test, subjectId: subject.id, examId: ex.id, testId: test.id, displayTitle: test.displayTitle || test.title, generatedTime: test.genTime || test.generatedTime })}
                                            style={{
                                              background: 'rgba(139, 92, 246, 0.15)',
                                              border: '1px solid rgba(139, 92, 246, 0.3)',
                                              borderRadius: '6px',
                                              color: 'var(--accent-primary)',
                                              padding: '0.22rem 0.45rem',
                                              fontSize: '0.7rem',
                                              cursor: 'pointer',
                                              fontWeight: 600,
                                              transition: 'all 0.2s'
                                            }}
                                            onMouseOver={(e) => {
                                              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
                                              e.currentTarget.style.color = '#fff';
                                            }}
                                            onMouseOut={(e) => {
                                              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
                                              e.currentTarget.style.color = 'var(--accent-primary)';
                                            }}
                                            title="View Test Answers & Grading"
                                          >
                                            View
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bottom Collapse Bar for Full-Width Workspace */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.65rem',
                        paddingTop: '0.95rem',
                        marginTop: '0.4rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          <span>✨</span>
                          <span>Full-width reading & interaction canvas • {activeExams.length} active exam {activeExams.length === 1 ? 'track' : 'tracks'}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleSubject(subject.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.38rem 0.85rem',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#cbd5e1',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
                            e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.5)';
                            e.currentTarget.style.color = '#fff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                            e.currentTarget.style.color = '#cbd5e1';
                          }}
                          title="Collapse this workspace back into the compact grid layout"
                        >
                          <span>▲</span>
                          <span>Collapse Workspace</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Primary Link Button: Open Subject Hub */}
                  <Link
                    href={subjectHubHref}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      padding: '0.68rem 1.1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
                      color: '#ffffff',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      marginTop: 'auto'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.38)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(99, 102, 241, 0.25)';
                    }}
                  >
                    <span>Open {subjectTitle || 'Subject'} Hub</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Model Test Generator Popover Modal */}
      {modelTestTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '680px', width: '100%', height: '80vh', maxHeight: '80vh', display: 'flex', flexDirection: 'column', position: 'relative', animation: 'fadeIn 0.25s ease-out', textAlign: 'left', padding: '1.5rem', overflow: 'hidden' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>Generate Model Test</h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                  {modelTestTarget.subject.title} • {modelTestTarget.exam.title}
                </p>
              </div>
              <button 
                onClick={() => setModelTestTarget(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', paddingRight: '0.35rem' }}>
              {generateError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', fontSize: '0.88rem' }}>
                  {generateError}
                </div>
              )}

              {/* Anti-Duplication Active Banner */}
              {targetExistingTests.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.08) 100%)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '10px',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.78rem',
                  color: '#a7f3d0',
                  lineHeight: 1.45
                }}>
                  <span style={{ fontSize: '1.15rem', flexShrink: 0 }}>🛡️</span>
                  <div>
                    <strong style={{ color: '#34d399' }}>Zero-Duplication Engine Active:</strong>{' '}
                    <span>All {targetExistingQuestionsCount > 0 ? <strong>{targetExistingQuestionsCount}</strong> : ''} previous questions across your <strong>{targetExistingTests.length}</strong> existing model {targetExistingTests.length === 1 ? 'test' : 'tests'} are strictly excluded. Gemini will rotate Seen Passages and generate 100% fresh, non-repetitive questions.</span>
                  </div>
                </div>
              )}

              {/* Reference Books to Include with Interactive Checkboxes */}
              {(() => {
                const books = getSubjectBooks(modelTestTarget?.subject);
                const allSelected = books.length > 0 && books.every(b => selectedBookIdsForTest.includes(b.id));

                return (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span>📚</span>
                        <span>Reference Books for Generation</span>
                        {books.length > 0 && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#a5b4fc', fontWeight: 600 }}>
                            {selectedBookIdsForTest.length} of {books.length} selected
                          </span>
                        )}
                      </label>
                      {books.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setSelectedBookIdsForTest([]);
                            } else {
                              setSelectedBookIdsForTest(books.map(b => b.id));
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--accent-primary, #818cf8)',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '0.1rem 0.3rem',
                            textDecoration: 'underline'
                          }}
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      )}
                    </div>

                    {books.length === 0 ? (
                      <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px', fontSize: '0.75rem', color: '#facc15' }}>
                        No books linked in Subject Material. Generation will use standard curriculum.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                        {books.map(b => {
                          const isChecked = selectedBookIdsForTest.includes(b.id);
                          return (
                            <label
                              key={b.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.45rem 0.7rem',
                                borderRadius: '8px',
                                background: isChecked ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${isChecked ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255,255,255,0.06)'}`,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedBookIdsForTest(prev => [...prev, b.id]);
                                    } else {
                                      setSelectedBookIdsForTest(prev => prev.filter(id => id !== b.id));
                                    }
                                  }}
                                  style={{ width: '15px', height: '15px', accentColor: 'var(--accent-primary, #6366f1)', cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '0.8rem', fontWeight: isChecked ? 600 : 500, color: isChecked ? '#fff' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {b.title}
                                </span>
                                {b.isGovtTextbook && (
                                  <span style={{ fontSize: '0.66rem', padding: '0.08rem 0.4rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600, flexShrink: 0 }}>
                                    🏛️ Govt Textbook (Seen Passage Source)
                                  </span>
                                )}
                              </div>

                              {b.url && (
                                <a
                                  href={b.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    color: '#818cf8',
                                    fontWeight: 500,
                                    fontSize: '0.72rem',
                                    textDecoration: 'underline',
                                    flexShrink: 0,
                                    marginLeft: '0.5rem'
                                  }}
                                >
                                  Open PDF ↗
                                </a>
                              )}
                            </label>
                          );
                        })}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                          💡 Checked books provide passage readings, lessons, and textbook reference for AI question generation.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 1. Syllabus Chapters Selection */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #6366f1)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    1. Syllabus Chapters
                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#a5b4fc', fontWeight: 600 }}>
                      {selectedChaptersForTest.length} selected
                    </span>
                  </label>
                  {modelTestTarget.subject.chapters?.[modelTestTarget.exam.id] && (
                    <button 
                      type="button" 
                      onClick={() => {
                        const allKeys = Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]);
                        setSelectedChaptersForTest(selectedChaptersForTest.length === allKeys.length ? [] : allKeys);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 600 }}
                    >
                      {selectedChaptersForTest.length === Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {modelTestTarget.subject.chapters?.[modelTestTarget.exam.id] && Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.45rem', maxHeight: '160px', overflowY: 'auto', padding: '0.6rem', background: 'rgba(10, 15, 28, 0.65)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)' }}>
                    {Object.entries(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).map(([cId, c]) => {
                      const isSelected = selectedChaptersForTest.includes(cId);
                      return (
                        <div
                          key={cId}
                          onClick={() => toggleChapterSelection(cId)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0.5rem 0.65rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.14) 100%)'
                              : 'rgba(255,255,255,0.025)',
                            border: `1px solid ${isSelected ? 'rgba(129, 140, 248, 0.5)' : 'rgba(255,255,255,0.07)'}`,
                            boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '5px',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isSelected ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(0, 0, 0, 0.4)',
                              border: `1px solid ${isSelected ? '#a5b4fc' : 'rgba(255, 255, 255, 0.22)'}`,
                              boxShadow: isSelected ? '0 0 6px rgba(99, 102, 241, 0.5)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isSelected && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: '0.84rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#f8fafc' : '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.title}>
                            {c.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No chapters in syllabus. Generation will cover general concepts for this subject.</p>
                )}
              </div>

              {/* 2. Mark Distribution */}
              <MarkDistributionField
                value={testMarkDistribution}
                onChange={setTestMarkDistribution}
                label="2. Mark Distribution (Guides Question Breakdown)"
                maxHeight="280px"
              />

              {/* 3. Difficulty & Standard Guidelines */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9' }}>
                  3. Difficulty & Examination Guidelines
                </label>
                
                {/* Difficulty pills */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
                  {['Easy', 'Standard', 'Difficult'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setTestDifficulty(d)}
                      style={{
                        flex: 1,
                        padding: '0.45rem',
                        borderRadius: '6px',
                        background: testDifficulty === d ? (d === 'Difficult' ? 'rgba(239,68,68,0.25)' : d === 'Easy' ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.3)') : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${testDifficulty === d ? (d === 'Difficult' ? '#ef4444' : d === 'Easy' ? '#22c55e' : 'var(--accent-primary)') : 'var(--glass-border)'}`,
                        color: testDifficulty === d ? '#fff' : 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        fontWeight: testDifficulty === d ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                {/* Guideline options */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['Follow best practice', 'Standard curriculum', 'Previous exam pattern'].map(option => {
                    const isChecked = testGuidelines.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleGuideline(option)}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '16px',
                          background: isChecked ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isChecked ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                          color: isChecked ? '#fff' : 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: isChecked ? 600 : 400,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <span>{isChecked ? '✓' : '+'}</span>
                        <span>{option}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Custom Instructions (Max 200 words) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9' }}>
                    4. Custom Instructions (Optional, max 200 words)
                  </label>
                  <span style={{ fontSize: '0.75rem', color: countWords(customInstructions) > 200 ? '#ef4444' : 'var(--text-secondary)', fontWeight: countWords(customInstructions) > 200 ? 600 : 400 }}>
                    {countWords(customInstructions)} / 200 words
                  </span>
                </div>
                <textarea
                  value={customInstructions}
                  onChange={e => setCustomInstructions(e.target.value)}
                  placeholder="Write instructions for the question generator (up to 200 words)... e.g. Focus on word problems, include diagrams or step-by-step proofs, provide a 5-mark challenging problem at the end."
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    background: 'rgba(0,0,0,0.25)',
                    border: `1px solid ${countWords(customInstructions) > 200 ? '#ef4444' : 'var(--glass-border)'}`,
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.88rem',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* 5. Model Test Title, Date & Initial Result */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.8rem', background: 'rgba(0,0,0,0.18)', padding: '0.8rem', borderRadius: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Date</label>
                  <input
                    type="date"
                    value={modelTestDate}
                    onChange={e => setModelTestDate(e.target.value)}
                    style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Title</label>
                  <input
                    type="text"
                    value={modelTestTitle}
                    onChange={e => setModelTestTitle(e.target.value)}
                    placeholder="e.g. Model Test - Oct 6, 2026"
                    style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#38bdf8', marginBottom: '0.2rem', fontWeight: 600 }}>⏱️ Exam Time (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={360}
                    value={modelTestDuration}
                    onChange={e => setModelTestDuration(Math.max(1, Number(e.target.value) || 0))}
                    placeholder="60"
                    style={{ padding: '0.45rem', fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700, border: '1px solid rgba(56, 189, 248, 0.4)' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Initial Result</label>
                  <input
                    type="text"
                    value={modelTestResult}
                    onChange={e => setModelTestResult(e.target.value)}
                    placeholder="e.g. 0"
                    style={{ padding: '0.45rem', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Quick Preset Pills for Duration */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '-0.35rem' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Quick Time:</span>
                {[15, 30, 45, 60, 90, 120, 150, 180].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setModelTestDuration(mins)}
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.72rem',
                      borderRadius: '6px',
                      background: Number(modelTestDuration) === mins ? '#38bdf8' : 'rgba(255,255,255,0.05)',
                      color: Number(modelTestDuration) === mins ? '#0f172a' : '#cbd5e1',
                      border: `1px solid ${Number(modelTestDuration) === mins ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons - Fixed at bottom */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)', flexWrap: 'wrap', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleGenerateModelTest}
                disabled={isGeneratingTest || countWords(customInstructions) > 200}
                className="primary"
                style={{
                  flex: 2,
                  padding: '0.75rem 1.2rem',
                  borderRadius: '8px',
                  border: 'none',
                  fontWeight: 600,
                  cursor: isGeneratingTest ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                {isGeneratingTest ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }}></span>
                    <span>Generating with Gemini AI...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    <span>Generate Model Test</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSaveManualModelTest}
                disabled={isGeneratingTest}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  background: 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
                title="Save manual record with Title & Result 0"
              >
                Save Entry Only
              </button>

              <button
                type="button"
                onClick={() => setModelTestTarget(null)}
                disabled={isGeneratingTest}
                style={{
                  padding: '0.75rem 1rem',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Test Question Paper, Answer Sheet & Grading Full Page */}
      {viewingModelTest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', zIndex: 9999, overflowY: 'auto', background: '#090d16', display: 'flex', flexDirection: 'column' }}>
          
          {/* Top Sticky Header */}
          <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button
                type="button"
                onClick={() => setViewingModelTest(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                ← Exit Exam
              </button>

              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span>{viewingModelTest.displayTitle || viewingModelTest.title || 'Model Test'}</span>
                  {viewingModelTest.difficulty && (
                    <span style={{ padding: '0.1rem 0.5rem', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.72rem' }}>
                      {viewingModelTest.difficulty}
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>📅 {viewingModelTest.date || 'Today'}</span>
                  {(viewingModelTest.generatedTime || formatGeneratedTime(viewingModelTest)) && (
                    <span style={{ color: '#e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      • 🕒 {viewingModelTest.generatedTime || formatGeneratedTime(viewingModelTest)}
                    </span>
                  )}
                  <span>• Total Marks: {totalMaxMarks}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              
              {/* Live Exam Timer Badge */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.35rem 0.8rem',
                borderRadius: '8px',
                background: isExamFinished 
                  ? 'rgba(16, 185, 129, 0.12)' 
                  : (isTimeLow || isTimeUp ? 'rgba(239, 68, 68, 0.18)' : 'rgba(0, 0, 0, 0.45)'),
                border: `1px solid ${isExamFinished 
                  ? 'rgba(16, 185, 129, 0.35)' 
                  : (isTimeLow || isTimeUp ? '#ef4444' : 'rgba(255, 255, 255, 0.12)')}`,
                boxShadow: isTimeLow ? '0 0 10px rgba(239, 68, 68, 0.35)' : 'none'
              }}>
                <span style={{ fontSize: '1rem' }}>
                  {isExamFinished ? '⏱️' : (isTimeLow || isTimeUp ? '⏰' : '⏱️')}
                </span>
                <div style={{ textAlign: 'left', minWidth: '70px' }}>
                  <div style={{
                    fontSize: '0.9rem',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    letterSpacing: '0.5px',
                    color: isExamFinished 
                      ? '#34d399' 
                      : (isTimeLow || isTimeUp ? '#f87171' : '#38bdf8')
                  }}>
                    {isExamFinished 
                      ? formatDuration(elapsedSeconds)
                      : (isExamStarted ? formatTime(remainingSeconds) : `${defaultDurationMinutes}m Limit`)}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    {isExamFinished ? 'Time Taken' : (isExamStarted ? 'Time Left' : 'Duration')}
                  </div>
                </div>

                {/* Adjust or extend timer */}
                {!isExamFinished && (
                  <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.25rem' }}>
                    {isExamStarted ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateExamDuration(defaultDurationMinutes + 5)}
                        title="Add +5 minutes extra time"
                        style={{
                          padding: '0.2rem 0.45rem',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          cursor: 'pointer'
                        }}
                      >
                        +5m
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const val = window.prompt("Set exam duration in minutes:", String(defaultDurationMinutes));
                          if (val !== null) {
                            const parsed = parseInt(val, 10);
                            if (!isNaN(parsed) && parsed > 0) handleUpdateExamDuration(parsed);
                          }
                        }}
                        title="Click to change exam time limit"
                        style={{
                          padding: '0.2rem 0.45rem',
                          fontSize: '0.7rem',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#cbd5e1',
                          cursor: 'pointer'
                        }}
                      >
                        ⚙️ Set
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Pause / Resume Button */}
              {isExamStarted && !isExamFinished && (
                <button
                  type="button"
                  onClick={isExamPaused ? handleResumeExam : handlePauseExam}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.38rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: `1px solid ${isExamPaused ? 'rgba(16,185,129,0.45)' : 'rgba(245,158,11,0.45)'}`,
                    background: isExamPaused ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.12)',
                    color: isExamPaused ? '#34d399' : '#fcd34d',
                    transition: 'all 0.2s',
                  }}
                  title={isExamPaused ? 'Resume the exam — timer will continue' : 'Pause the exam and provide a reason'}
                >
                  <span>{isExamPaused ? '▶️' : '⏸️'}</span>
                  <span>{isExamPaused ? 'Resume Exam' : 'Pause Exam'}</span>
                </button>
              )}

              {/* Mode Switcher */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  onClick={() => setTestViewMode('student')}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: testViewMode === 'student' ? 'var(--accent-gradient)' : 'transparent',
                    color: testViewMode === 'student' ? '#fff' : 'var(--text-secondary)'
                  }}
                >
                  👨‍🎓 Student
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isExamFinished) {
                      const unlock = window.confirm("🔒 Student has not submitted this exam yet. Answers and rubrics are locked.\n\nAre you a teacher/parent who wants to finish the exam now to evaluate?");
                      if (unlock) {
                        handleFinishAndSubmitExam();
                        setTestViewMode('examiner');
                      }
                      return;
                    }
                    setTestViewMode('examiner');
                  }}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: testViewMode === 'examiner' ? 'var(--accent-gradient)' : 'transparent',
                    color: testViewMode === 'examiner' ? '#fff' : (!isExamFinished ? 'rgba(255,255,255,0.45)' : 'var(--text-secondary)')
                  }}
                  title={!isExamFinished ? 'Locked until student finishes the exam' : 'Examiner Mode'}
                >
                  {!isExamFinished ? '🔒 Examiner' : '📝 Examiner'}
                </button>
              </div>

              {/* AI Auto Review & Mark Button */}
              <button
                type="button"
                onClick={handleAiAutoReview}
                disabled={isAiReviewing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  background: isAiReviewing ? 'rgba(168, 85, 247, 0.4)' : 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: '6px',
                  color: '#fff',
                  cursor: isAiReviewing ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 10px rgba(168, 85, 247, 0.35)',
                  transition: 'all 0.2s ease'
                }}
                title="Run AI Auto-Review & Marking across all answers before final teacher review"
              >
                {isAiReviewing ? (
                  <>
                    <span style={{ width: '0.85rem', height: '0.85rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                    <span>AI Reviewing...</span>
                  </>
                ) : (
                  <>
                    <span>🤖</span>
                    <span>AI Auto Review</span>
                  </>
                )}
              </button>

              {/* Current Result Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Current:</span>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.65rem', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  Result {currentDisplayResult}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyTest}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#cbd5e1', cursor: 'pointer' }}
              >
                {copiedSuccess ? '✓ Copied' : '📋 Copy'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#cbd5e1', cursor: 'pointer' }}
              >
                🖨️ Print
              </button>
              <button
                type="button"
                onClick={() => setViewingModelTest(null)}
                style={{ padding: '0.4rem 0.8rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
              >
                ✕ Exit
              </button>
            </div>
          </header>

          {/* Full Page Body */}
          <main style={{ flex: 1, width: '100%', maxWidth: '1020px', margin: '0 auto', padding: 'clamp(0.75rem, 2vw, 1.25rem) clamp(0.5rem, 2.5vw, 1.25rem) clamp(5.5rem, 12vh, 7rem) clamp(0.5rem, 2.5vw, 1.25rem)', boxSizing: 'border-box', textAlign: 'left' }}>

            {/* Paused Exam Overlay */}
            {isExamPaused && (
              <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9998,
                background: 'rgba(5, 10, 25, 0.92)',
                backdropFilter: 'blur(14px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.5rem',
                textAlign: 'center',
                padding: '2rem',
              }}>
                <div style={{ fontSize: '4rem', lineHeight: 1 }}>⏸️</div>
                <div>
                  <h2 style={{ margin: '0 0 0.4rem 0', fontSize: '2rem', color: '#fcd34d', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    Exam Paused
                  </h2>
                  <p style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)', maxWidth: '420px' }}>
                    {pauseLog.length > 0 && pauseLog[pauseLog.length - 1]?.reason
                      ? <><strong style={{ color: '#fff' }}>Reason:</strong> {pauseLog[pauseLog.length - 1].reason}</>
                      : 'The timer is paused. Resume when you are ready.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResumeExam}
                  style={{
                    padding: '0.85rem 2.5rem',
                    borderRadius: '12px',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 6px 24px rgba(16,185,129,0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>▶️</span>
                  <span>Resume Exam</span>
                </button>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Timer is stopped. Questions and answers are hidden while paused.
                </p>
              </div>
            )}

            {/* Notification Banner */}
            {notificationMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 600 }}>
                {notificationMsg}
              </div>
            )}

            {/* Pending Question Delete Requests Panel (Parent only) */}
            {!isStudentView && (() => {
              const testId = viewingModelTest?.testId || viewingModelTest?.id;
              const reqsForTest = deleteRequests[testId] || {};
              const pendingEntries = Object.entries(reqsForTest);
              if (pendingEntries.length === 0) return null;
              return (
                <div style={{
                  background: 'linear-gradient(90deg, rgba(245,158,11,0.1) 0%, rgba(15,23,42,0.85) 100%)',
                  border: '1px solid rgba(245,158,11,0.4)',
                  borderRadius: '12px',
                  padding: '1rem 1.25rem',
                  marginBottom: '1.25rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🗑️</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fcd34d' }}>
                      Question Deletion Requests ({pendingEntries.length})
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.25rem' }}>
                      — Student has requested to remove these questions. Review and decide:
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {pendingEntries.map(([qId, req]) => (
                      <div key={qId} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: '1rem',
                        padding: '0.7rem 0.9rem',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '8px',
                        border: '1px solid rgba(245,158,11,0.2)',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fcd34d', marginBottom: '0.2rem' }}>
                            Q{req.displayNumber} {req.section ? `· ${req.section}` : ''}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#cbd5e1', wordBreak: 'break-word', lineHeight: 1.4 }}>
                            {req.questionText ? `"${req.questionText.slice(0, 120)}${req.questionText.length > 120 ? '…' : ''}"` : 'No preview'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                            Requested {new Date(req.requestedAt).toLocaleString()}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.45rem', flexShrink: 0, alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleApproveDeleteRequest(testId, qId, req.subjectId, req.examId)}
                            style={{
                              padding: '0.35rem 0.8rem',
                              borderRadius: '6px',
                              border: 'none',
                              background: 'rgba(239,68,68,0.2)',
                              color: '#f87171',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: '1px solid rgba(239,68,68,0.4)'
                            }}
                            title="Permanently remove this question from the test"
                          >
                            ✓ Approve Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectDeleteRequest(testId, qId)}
                            style={{
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              border: '1px solid rgba(255,255,255,0.12)',
                              background: 'rgba(255,255,255,0.05)',
                              color: '#94a3b8',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title="Dismiss this request — keep the question"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Exam Finished & Submitted Review Banner */}
            {isExamFinished && (
              <div style={{
                background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.15) 0%, rgba(59, 130, 246, 0.1) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '12px',
                padding: '1rem 1.4rem',
                marginBottom: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.8rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.6rem' }}>🎉</span>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>Exam Completed & Submitted</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Review mode unlocked. Correct answers, solution rubrics, and detailed breakdowns are visible below.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleAiAutoReview}
                    disabled={isAiReviewing}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.45rem 1.05rem',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      background: isAiReviewing ? 'rgba(139, 92, 246, 0.4)' : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.3)',
                      color: '#fff',
                      borderRadius: '8px',
                      cursor: isAiReviewing ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
                      transition: 'all 0.2s ease'
                    }}
                    title="Auto-evaluate all student answers with AI before final teacher review"
                  >
                    {isAiReviewing ? (
                      <>
                        <span style={{ width: '0.8rem', height: '0.8rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                        <span>AI Reviewing & Marking...</span>
                      </>
                    ) : (
                      <>
                        <span>🤖</span>
                        <span>AI Auto Review & Mark</span>
                      </>
                    )}
                  </button>
                  <span style={{ fontSize: '0.85rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.2)', padding: '0.3rem 0.8rem', borderRadius: '12px', fontWeight: 700 }}>
                    ⏱️ Time Taken: {formatDuration(elapsedSeconds)}
                  </span>
                </div>
              </div>
            )}

            {/* Student Exam Not Started Screen / Banner */}
            {testViewMode === 'student' && !isExamStarted && !isExamFinished && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(56, 189, 248, 0.12) 100%)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                borderRadius: '14px',
                padding: '1.25rem 1.6rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1.2rem',
                boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
              }}>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📝</span>
                    <h2 style={{ fontSize: '1.2rem', color: '#fff', margin: 0, fontWeight: 700 }}>
                      Ready to take {viewingModelTest.title || 'Model Test'}?
                    </h2>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', margin: 0, lineHeight: 1.5 }}>
                    Contains <strong>{parsedQuestions.length} Questions</strong> ({totalMaxMarks} Marks). You can browse and navigate the question sets below, adjust your exam duration, and start when ready!
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
                  {/* Duration Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,0,0,0.4)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                    <span style={{ fontSize: '0.85rem' }}>⏱️</span>
                    <select
                      value={defaultDurationMinutes}
                      onChange={(e) => handleUpdateExamDuration(e.target.value)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#38bdf8',
                        fontSize: '0.86rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      {[15, 20, 30, 45, 60, 90, 120, 150, 180].map(mins => (
                        <option key={mins} value={mins} style={{ background: '#0f172a', color: '#fff' }}>
                          {mins} Mins
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartExam}
                    style={{
                      padding: '0.7rem 1.6rem',
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 20px rgba(139, 92, 246, 0.45)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <span>🚀</span>
                    <span>Start Exam Timer</span>
                  </button>
                </div>
              </div>
            )}
            {/* EXAMINER MODE: Student's Uploaded Answer Paper Gallery (Top Inspection Strip) */}
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
                        style={{
                          flexShrink: 0,
                          cursor: 'pointer',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.15)',
                          background: 'rgba(0,0,0,0.4)',
                          width: '120px',
                          textAlign: 'center',
                          transition: 'transform 0.15s, border-color 0.15s'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                        title="Click to Zoom Fullscreen"
                      >
                        <img 
                          src={page.dataUrl} 
                          alt={page.name || `Page ${idx + 1}`} 
                          style={{ width: '100%', height: '95px', objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{ padding: '0.25rem', fontSize: '0.72rem', color: '#fff', background: 'rgba(0,0,0,0.6)' }}>
                          Page {idx + 1} 🔍
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                    Student has not uploaded photos of handwritten answer sheets yet. You can still grade typed answers below.
                  </p>
                )}
              </div>
            )}

            {/* STUDENT MODE: Upload Handwritten Answer Paper Section */}
            {testViewMode === 'student' && (
              <div style={{ background: 'rgba(0,0,0,0.22)', border: '1px dashed var(--glass-border)', borderRadius: '12px', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.15rem 0', fontSize: '0.98rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>📸</span>
                      <span>Handwritten Answer Paper ({uploadedAnswerPages.length} Pages Attached)</span>
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Take photos of your physical answer sheets (Page 1, Page 2, etc.) and attach here.
                    </p>
                  </div>

                  <label style={{ background: 'var(--accent-gradient)', color: '#fff', padding: '0.4rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <span>Upload Photo(s)</span>
                    <input type="file" accept="image/*" multiple onChange={handleUploadAnswerSheet} style={{ display: 'none' }} />
                  </label>
                </div>

                {uploadedAnswerPages.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))', gap: '0.65rem', marginTop: '0.75rem' }}>
                    {uploadedAnswerPages.map((page, idx) => (
                      <div
                        key={page.id || idx}
                        style={{
                          position: 'relative',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: 'rgba(0,0,0,0.5)'
                        }}
                      >
                        <img
                          src={page.dataUrl}
                          alt={page.name || `Page ${idx + 1}`}
                          onClick={() => setZoomedImageUrl(page.dataUrl)}
                          style={{ width: '100%', height: '90px', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                        />
                        <div style={{ padding: '0.25rem 0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.7)', fontSize: '0.72rem' }}>
                          <span style={{ color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            Page {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteUploadedPage(page.id)}
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem 0.2rem', fontSize: '0.75rem' }}
                            title="Delete this page"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Slide Navigation Header Bar (Question Counter, Live Saving Indicator, Mode Switcher) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  {questionDisplayMode === 'slide' 
                    ? `Question ${parsedQuestions[currentSlideIndex]?.displayNumber || currentSlideIndex + 1} of ${parsedQuestions.length}` 
                    : `All Questions (${parsedQuestions.length})`}
                </span>
                {questionDisplayMode === 'slide' && parsedQuestions[currentSlideIndex] && (
                  <span style={{ fontSize: '0.8rem', color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                    Set {parsedQuestions[currentSlideIndex].setNumber}: {parsedQuestions[currentSlideIndex].cleanSectionTitle}
                  </span>
                )}
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.15rem 0.6rem', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
                  {testViewMode === 'student' 
                    ? `${answeredQuestionsCount}/${parsedQuestions.length} Answered` 
                    : `${gradedQuestionsCount}/${parsedQuestions.length} Graded • Total Awarded: ${currentAwardedMarksSum}/${totalMaxMarks}`}
                </span>
                <button
                  type="button"
                  onClick={handleAiAutoReview}
                  disabled={isAiReviewing}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.2rem 0.65rem',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    background: isAiReviewing ? 'rgba(168, 85, 247, 0.4)' : 'linear-gradient(135deg, #9333ea 0%, #db2777 100%)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: '12px',
                    color: '#fff',
                    cursor: isAiReviewing ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 8px rgba(147, 51, 234, 0.3)'
                  }}
                  title="Run AI Auto-Review & Marking across all questions before final teacher review"
                >
                  {isAiReviewing ? '⏳ AI Marking...' : '🤖 AI Review & Mark'}
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                {/* Real-time Saving Status */}
                {savingStatus === 'saving' && (
                  <span style={{ fontSize: '0.78rem', color: '#facc15', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '50%', background: '#facc15' }}></span>
                    <span>Saving...</span>
                  </span>
                )}
                {savingStatus === 'saved' && (
                  <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                    ✓ Saved
                  </span>
                )}

                {/* View Mode Toggle: Slide vs List */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <button
                    type="button"
                    onClick={() => setQuestionDisplayMode('slide')}
                    style={{
                      padding: '0.22rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: '4px',
                      background: questionDisplayMode === 'slide' ? 'var(--accent-primary)' : 'transparent',
                      color: questionDisplayMode === 'slide' ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    ◫ Slide View
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestionDisplayMode('list')}
                    style={{
                      padding: '0.22rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: '4px',
                      background: questionDisplayMode === 'list' ? 'var(--accent-primary)' : 'transparent',
                      color: questionDisplayMode === 'list' ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    ☰ All List
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsNavigatorCollapsed(prev => !prev)}
                  style={{
                    padding: '0.22rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    border: '1px solid ' + (isNavigatorCollapsed ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255,255,255,0.12)'),
                    borderRadius: '6px',
                    background: isNavigatorCollapsed ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.06)',
                    color: isNavigatorCollapsed ? '#d8b4fe' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem'
                  }}
                  title="Toggle Question Sets Navigator visibility"
                >
                  🧭 {isNavigatorCollapsed ? '▼ Show Sets' : '▲ Hide Sets'}
                </button>
              </div>
            </div>

            {/* Slide Progress Bar (Slide Mode) */}
            {questionDisplayMode === 'slide' && parsedQuestions.length > 0 && (
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div
                  style={{
                    width: `${((currentSlideIndex + 1) / Math.max(1, parsedQuestions.length)) * 100}%`,
                    height: '100%',
                    background: 'var(--accent-gradient)',
                    transition: 'width 0.25s ease-out'
                  }}
                />
              </div>
            )}

            {/* Contained Question Navigator: Collapsed Single-Line View */}
            {parsedQuestions.length > 0 && isNavigatorCollapsed && (
              <div
                onClick={() => setIsNavigatorCollapsed(false)}
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '10px',
                  padding: '0.5rem 0.85rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.9rem' }}>🧭</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                    Question Navigator ({parsedQuestions.length} Questions • {questionSets.length} Sets)
                  </span>
                  {parsedQuestions[currentSlideIndex] && (
                    <span style={{ fontSize: '0.74rem', color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.25)', padding: '0.12rem 0.5rem', borderRadius: '6px' }}>
                      Current: Q{parsedQuestions[currentSlideIndex].displayNumber} (Set {parsedQuestions[currentSlideIndex].setNumber})
                    </span>
                  )}
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {testViewMode === 'student' ? `${answeredQuestionsCount}/${parsedQuestions.length} Answered` : `${gradedQuestionsCount}/${parsedQuestions.length} Graded`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIsNavigatorCollapsed(false); }}
                  style={{
                    padding: '0.22rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    background: 'rgba(139, 92, 246, 0.2)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: '6px',
                    color: '#d8b4fe',
                    cursor: 'pointer'
                  }}
                >
                  ▼ Show Sets
                </button>
              </div>
            )}

            {/* Contained Question Navigator: Expanded View (Collapsible by Question Type & Contained Scroller Strip) */}
            {parsedQuestions.length > 0 && !isNavigatorCollapsed && (
              <div style={{
                width: '100%',
                maxWidth: '100%',
                boxSizing: 'border-box',
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '0.75rem',
                marginBottom: '1.25rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
              }}>
                {/* Navigator Header Controls: Set Filter Tabs + View Mode Toggles */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.6rem',
                  marginBottom: '0.65rem',
                  flexWrap: 'wrap'
                }}>
                  {/* Set Tabs / Filter */}
                  <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', maxWidth: '100%', paddingBottom: '2px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginRight: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Sets:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedSetFilter('all')}
                      style={{
                        padding: '0.22rem 0.6rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: selectedSetFilter === 'all' ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                        background: selectedSetFilter === 'all' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                        color: selectedSetFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      All ({parsedQuestions.length})
                    </button>
                    {questionSets.map(s => {
                      const isFilterActive = selectedSetFilter === s.setNumber;
                      const isCurrentActive = parsedQuestions[currentSlideIndex]?.setNumber === s.setNumber;
                      const sAnswered = s.questions.filter(q => Boolean(studentAnswers[q.id]?.trim())).length;
                      const sGraded = s.questions.filter(q => awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '').length;
                      const sAwarded = s.questions.reduce((sum, q) => sum + (Number(awardedMarks[q.id]) || 0), 0);
                      const sTotalMarks = s.questions.reduce((sum, q) => sum + (Number(q.marks) || 5), 0);
                      const setScoreColor = sAwarded === 0 ? '#f87171' : (sAwarded < sTotalMarks ? '#facc15' : '#34d399');

                      return (
                        <button
                          key={s.setNumber}
                          type="button"
                          onClick={() => {
                            setSelectedSetFilter(s.setNumber);
                            if (!isCurrentActive && s.questions.length > 0) {
                              setCurrentSlideIndex(s.questions[0].globalIndex);
                            }
                          }}
                          style={{
                            padding: '0.22rem 0.6rem',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: isFilterActive ? '1px solid var(--accent-primary)' : (isCurrentActive ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid rgba(255,255,255,0.08)'),
                            background: isFilterActive ? 'rgba(139, 92, 246, 0.25)' : (isCurrentActive ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255,255,255,0.03)'),
                            color: isFilterActive || isCurrentActive ? '#fff' : 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem'
                          }}
                        >
                          <span>Set {s.setNumber}: {s.title}</span>
                          <span style={{
                            fontSize: '0.68rem',
                            opacity: 0.9,
                            fontWeight: 700,
                            color: testViewMode === 'examiner'
                              ? (sGraded === s.questions.length ? setScoreColor : (sGraded > 0 ? '#38bdf8' : 'inherit'))
                              : (isExamFinished && sGraded > 0 ? setScoreColor : (sAnswered === s.questions.length ? '#34d399' : 'inherit'))
                          }}>
                            {testViewMode === 'examiner' ? `(${sGraded}/${s.questions.length})` : `(${sAnswered}/${s.questions.length})`}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mode Selector & Collapse All/Expand All & Scroller Arrow Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', padding: '2px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button
                        type="button"
                        onClick={() => setNavigatorViewMode('collapsible')}
                        style={{
                          padding: '0.22rem 0.55rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          background: navigatorViewMode === 'collapsible' ? 'var(--accent-primary)' : 'transparent',
                          color: navigatorViewMode === 'collapsible' ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                        title="Group questions by type with collapsible sections"
                      >
                        📁 By Question Type
                      </button>
                      <button
                        type="button"
                        onClick={() => setNavigatorViewMode('scroller')}
                        style={{
                          padding: '0.22rem 0.55rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          background: navigatorViewMode === 'scroller' ? 'var(--accent-primary)' : 'transparent',
                          color: navigatorViewMode === 'scroller' ? '#fff' : 'var(--text-secondary)',
                          cursor: 'pointer'
                        }}
                        title="Horizontal scroll strip with navigation arrows"
                      >
                        ↔ Scroller Strip
                      </button>
                    </div>

                    {navigatorViewMode === 'collapsible' && (
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={handleCollapseAllSets}
                          style={{
                            padding: '0.22rem 0.55rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '5px',
                            color: '#cbd5e1',
                            cursor: 'pointer'
                          }}
                          title="Collapse all question sets"
                        >
                          ▲ Collapse All
                        </button>
                        <button
                          type="button"
                          onClick={handleExpandAllSets}
                          style={{
                            padding: '0.22rem 0.55rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '5px',
                            color: '#cbd5e1',
                            cursor: 'pointer'
                          }}
                          title="Expand all question sets"
                        >
                          ▼ Expand All
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsNavigatorCollapsed(true)}
                      style={{
                        padding: '0.22rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '5px',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                      title="Collapse entire Question Navigator box"
                    >
                      ▲ Hide Sets
                    </button>

                    {navigatorViewMode === 'scroller' && (
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={() => handleScrollPills('left')}
                          style={{
                            padding: '0.22rem 0.5rem',
                            fontSize: '0.75rem',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '5px',
                            color: '#fff',
                            cursor: 'pointer'
                          }}
                          title="Scroll left"
                        >
                          ◀
                        </button>
                        <button
                          type="button"
                          onClick={() => handleScrollPills('right')}
                          style={{
                            padding: '0.22rem 0.5rem',
                            fontSize: '0.75rem',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '5px',
                            color: '#fff',
                            cursor: 'pointer'
                          }}
                          title="Scroll right"
                        >
                          ▶
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* CONTENT AREA */}
                {navigatorViewMode === 'collapsible' ? (
                  /* Collapsible Sets View (flexWrap: wrap ensures zero overflow) */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {questionSets
                      .filter(s => selectedSetFilter === 'all' || selectedSetFilter === s.setNumber)
                      .map(s => {
                        const isCollapsed = isSetCollapsed(s.setNumber);
                        const isSetCurrent = parsedQuestions[currentSlideIndex]?.setNumber === s.setNumber;
                        const sAnswered = s.questions.filter(q => Boolean(studentAnswers[q.id]?.trim())).length;
                        const sGraded = s.questions.filter(q => awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '').length;
                        const sAwarded = s.questions.reduce((sum, q) => sum + (Number(awardedMarks[q.id]) || 0), 0);
                        const sTotalMarks = s.questions.reduce((sum, q) => sum + (Number(q.marks) || 5), 0);
                        const setScoreColor = sAwarded === 0 ? '#f87171' : (sAwarded < sTotalMarks ? '#facc15' : '#34d399');

                        return (
                          <div
                            key={s.setNumber}
                            style={{
                              background: isSetCurrent ? 'rgba(139, 92, 246, 0.08)' : 'rgba(0,0,0,0.22)',
                              border: isSetCurrent ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                              borderRadius: '8px',
                              overflow: 'hidden'
                            }}
                          >
                            {/* Set Collapsible Header */}
                            <div
                              onClick={() => toggleSetCollapse(s.setNumber)}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.45rem 0.75rem',
                                cursor: 'pointer',
                                background: isSetCurrent ? 'rgba(139, 92, 246, 0.14)' : 'rgba(255,255,255,0.02)',
                                userSelect: 'none',
                                transition: 'background 0.15s ease'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isSetCurrent ? '#fff' : '#e2e8f0' }}>
                                  Set {s.setNumber}: {s.title}
                                </span>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  color: testViewMode === 'examiner'
                                    ? (sGraded === s.questions.length ? setScoreColor : (sGraded > 0 ? '#38bdf8' : 'var(--text-secondary)'))
                                    : (isExamFinished && sGraded > 0 ? setScoreColor : (sAnswered === s.questions.length ? '#34d399' : 'var(--text-secondary)')),
                                  background: 'rgba(255,255,255,0.06)',
                                  padding: '0.1rem 0.45rem',
                                  borderRadius: '10px'
                                }}>
                                  {testViewMode === 'examiner'
                                    ? `${sGraded}/${s.questions.length} Graded • ${sAwarded}/${sTotalMarks} Marks`
                                    : (isExamFinished && sGraded > 0
                                        ? `${sAwarded}/${sTotalMarks} Marks (${sAnswered}/${s.questions.length} Ans)`
                                        : `${sAnswered}/${s.questions.length} Answered`)}
                                </span>
                                {isSetCurrent && (
                                  <span style={{ fontSize: '0.65rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>
                                    ● Current Set
                                  </span>
                                )}
                              </div>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                color: isCollapsed ? '#cbd5e1' : 'var(--accent-primary)',
                                background: isCollapsed ? 'rgba(255,255,255,0.06)' : 'rgba(139, 92, 246, 0.15)',
                                border: '1px solid ' + (isCollapsed ? 'rgba(255,255,255,0.1)' : 'rgba(139, 92, 246, 0.3)'),
                                padding: '0.18rem 0.55rem',
                                borderRadius: '6px',
                                fontSize: '0.72rem',
                                fontWeight: 600
                              }}>
                                <span>{isCollapsed ? '▼ Expand' : '▲ Collapse'}</span>
                              </div>
                            </div>

                            {/* Set Questions Grid (Wrapped inside container) */}
                            {!isCollapsed && (
                              <div style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '0.35rem',
                                padding: '0.55rem 0.75rem'
                              }}>
                                {s.questions.map(q => {
                                  const isActive = q.globalIndex === currentSlideIndex;
                                  const stat = getQuestionGradingStatus(q);

                                  return (
                                    <button
                                      key={q.id || q.globalIndex}
                                      id={`q-pill-${q.globalIndex}`}
                                      type="button"
                                      onClick={() => {
                                        if (testViewMode === 'student') saveStudentAnswers(studentAnswers, true);
                                        else saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                                        setCurrentSlideIndex(q.globalIndex);
                                      }}
                                      style={{
                                        padding: '0.32rem 0.6rem',
                                        borderRadius: '7px',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        border: isActive
                                          ? '1.5px solid var(--accent-primary)'
                                          : `1px solid ${stat.border}`,
                                        background: isActive
                                          ? 'rgba(139, 92, 246, 0.35)'
                                          : stat.bg,
                                        color: isActive ? '#fff' : stat.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.3rem',
                                        boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.35)' : 'none',
                                        transition: 'all 0.12s ease'
                                      }}
                                      title={`Question ${q.displayNumber} (${q.cleanSectionTitle || cleanText(q.section)}) - ${stat.badgeText}`}
                                    >
                                      <span>{q.displayNumber || `Q${q.globalIndex + 1}`}</span>
                                      {testViewMode === 'examiner' ? (
                                        stat.examinerTag ? (
                                          <span style={{ fontSize: '0.68rem', color: stat.color, fontWeight: 700 }}>
                                            {stat.examinerTag}
                                          </span>
                                        ) : null
                                      ) : (
                                        isExamFinished ? (
                                          stat.studentTag ? (
                                            <span style={{ fontSize: '0.7rem', color: stat.color, fontWeight: 700 }}>
                                              {stat.studentTag}
                                            </span>
                                          ) : null
                                        ) : (
                                          stat.isAns && <span style={{ fontSize: '0.72rem', color: '#34d399' }}>✓</span>
                                        )
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  /* Contained Scroller Strip View */
                  <div
                    ref={pillsScrollRef}
                    style={{
                      display: 'flex',
                      gap: '0.4rem',
                      overflowX: 'auto',
                      scrollBehavior: 'smooth',
                      padding: '0.2rem 0.2rem 0.4rem 0.2rem',
                      width: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box'
                    }}
                  >
                    {(selectedSetFilter === 'all'
                      ? parsedQuestions
                      : parsedQuestions.filter(q => q.setNumber === selectedSetFilter)
                    ).map((q, filteredIdx) => {
                      const originalIdx = parsedQuestions.findIndex(orig => orig.id === q.id);
                      const qIdx = originalIdx !== -1 ? originalIdx : filteredIdx;
                      const isActive = qIdx === currentSlideIndex;
                      const stat = getQuestionGradingStatus(q);

                      return (
                        <button
                          key={q.id || qIdx}
                          id={`q-pill-${qIdx}`}
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
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: isActive
                              ? '1.5px solid var(--accent-primary)'
                              : `1px solid ${stat.border}`,
                            background: isActive
                              ? 'rgba(139, 92, 246, 0.35)'
                              : stat.bg,
                            color: isActive ? '#fff' : stat.color,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.35)' : 'none',
                            transition: 'all 0.12s ease'
                          }}
                          title={`Question ${q.displayNumber} (${q.cleanSectionTitle || cleanText(q.section)}) - ${stat.badgeText}`}
                        >
                          <span>{q.displayNumber || `Q${qIdx + 1}`}</span>
                          {testViewMode === 'examiner' ? (
                            stat.examinerTag ? (
                              <span style={{ fontSize: '0.68rem', color: stat.color, fontWeight: 700 }}>
                                {stat.examinerTag}
                              </span>
                            ) : null
                          ) : (
                            isExamFinished ? (
                              stat.studentTag ? (
                                <span style={{ fontSize: '0.7rem', color: stat.color, fontWeight: 700 }}>
                                  {stat.studentTag}
                                </span>
                              ) : null
                            ) : (
                              stat.isAns && <span style={{ fontSize: '0.72rem', color: '#34d399' }}>✓</span>
                            )
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Questions Container (Slide Mode or All List Mode) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
              
              {(questionDisplayMode === 'slide' 
                ? (parsedQuestions[currentSlideIndex] ? [parsedQuestions[currentSlideIndex]] : [])
                : parsedQuestions
              ).map((q, idx) => {
                const actualIndex = questionDisplayMode === 'slide' ? currentSlideIndex : idx;
                const qMarks = Number(q.marks) || 5;
                const awarded = awardedMarks[q.id] !== undefined ? awardedMarks[q.id] : '';
                const studentAns = studentAnswers[q.id] || '';
                const hasKey = Boolean(q.answerKey);
                const isAns = Boolean(studentAns.trim());
                const isGrd = awardedMarks[q.id] !== undefined && awardedMarks[q.id] !== '';

                return (
                  <div key={q.id || actualIndex} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {/* Set Divider in All List Mode */}
                    {questionDisplayMode === 'list' && (idx === 0 || q.setNumber !== parsedQuestions[idx - 1]?.setNumber) && (
                      <div style={{
                        padding: '0.6rem 1rem',
                        borderRadius: '8px',
                        background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.18) 0%, rgba(59, 130, 246, 0.08) 100%)',
                        borderLeft: '4px solid var(--accent-primary)',
                        marginTop: idx > 0 ? '0.75rem' : '0',
                        marginBottom: '0.25rem'
                      }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                          Set {q.setNumber}: {q.cleanSectionTitle || q.section || 'Questions'}
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.45) 0%, rgba(15, 23, 42, 0.65) 100%)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '16px',
                        padding: 'clamp(1rem, 2.5vw, 1.45rem)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.36)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        textAlign: 'left',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Question Header: Section & Marks */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.95rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 'clamp(0.85rem, 1.8vw, 0.95rem)',
                            fontWeight: 800,
                            color: '#fff',
                            background: 'var(--accent-gradient)',
                            padding: '0.28rem 0.8rem',
                            borderRadius: '9999px',
                            letterSpacing: '0.3px',
                            boxShadow: '0 2px 10px rgba(139,92,246,0.35)',
                            flexShrink: 0
                          }}>
                            Question {q.displayNumber || q.id || actualIndex + 1}
                          </span>
                          {(q.cleanSectionTitle || q.section) && (
                            <span style={{
                              fontSize: 'clamp(0.75rem, 1.5vw, 0.82rem)',
                              fontWeight: 600,
                              color: '#c4b5fd',
                              background: 'rgba(139, 92, 246, 0.12)',
                              border: '1px solid rgba(139, 92, 246, 0.25)',
                              padding: '0.24rem 0.65rem',
                              borderRadius: '8px',
                              maxWidth: '100%',
                              wordBreak: 'break-word'
                            }}>
                              Set {q.setNumber}: {q.cleanSectionTitle || q.section}
                            </span>
                          )}
                        </div>
                      
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {/* Student: Request Question Deletion */}
                          {testViewMode === 'student' && !isExamFinished && (() => {
                            const testId = viewingModelTest?.testId || viewingModelTest?.id;
                            const reqForTest = deleteRequests[testId] || {};
                            const alreadyRequested = reqForTest[q.id];
                            return (
                              <button
                                type="button"
                                title={alreadyRequested ? 'Deletion already requested — waiting for parent approval' : 'Request this question to be deleted (parent must approve)'}
                                disabled={!!alreadyRequested}
                                onClick={async () => {
                                  if (!alreadyRequested) {
                                    await handleRequestQuestionDelete(testId, q);
                                  }
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  fontSize: '0.73rem',
                                  fontWeight: 600,
                                  cursor: alreadyRequested ? 'not-allowed' : 'pointer',
                                  border: `1px solid ${alreadyRequested ? 'rgba(245,158,11,0.45)' : 'rgba(239,68,68,0.35)'}`,
                                  background: alreadyRequested ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.08)',
                                  color: alreadyRequested ? '#fcd34d' : '#f87171',
                                  transition: 'all 0.2s',
                                  flexShrink: 0,
                                  opacity: alreadyRequested ? 0.8 : 1
                                }}
                              >
                                <span>{alreadyRequested ? '⏳' : '🗑️'}</span>
                                <span>{alreadyRequested ? 'Awaiting Approval' : 'Request Delete'}</span>
                              </button>
                            );
                          })()}
                          {(() => {
                            const currentQStat = getQuestionGradingStatus(q);
                            return testViewMode === 'student' ? (
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: currentQStat.badgeColor,
                                background: currentQStat.badgeBg,
                                border: `1px solid ${currentQStat.badgeBorder}`,
                                padding: '0.2rem 0.65rem',
                                borderRadius: '9999px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                <span>{currentQStat.symbol || '○'}</span>
                                <span>{currentQStat.badgeText}</span>
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: currentQStat.badgeColor,
                                background: currentQStat.badgeBg,
                                border: `1px solid ${currentQStat.badgeBorder}`,
                                padding: '0.2rem 0.65rem',
                                borderRadius: '9999px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}>
                                <span>{currentQStat.symbol || '⏳'}</span>
                                <span>{currentQStat.examinerBadgeText}</span>
                              </span>
                            );
                          })()}
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f1f5f9', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.2rem 0.65rem', borderRadius: '9999px' }}>
                            [{qMarks} Marks]
                          </span>
                        </div>
                      </div>

                      {/* Question Prompt */}
                      <div style={{ fontSize: 'clamp(0.98rem, 1.8vw, 1.1rem)', color: '#f8fafc', lineHeight: 1.65, marginBottom: '1rem', whiteSpace: 'pre-line', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {cleanText(q.question)}
                      </div>

                      {/* Multiple Choice Options (if present) */}
                      {q.options && q.options.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '0.65rem', marginBottom: '0.4rem' }}>
                            {q.options.map((opt, optIdx) => {
                              const isPicked = Boolean(studentAns?.trim()) && (
                                studentAns.trim() === opt.trim() || 
                                (opt.trim().length >= 2 && studentAns.trim().startsWith(opt.trim().slice(0, 2)))
                              );
                              const isCorrectKey = hasKey && (q.answerKey.toLowerCase().includes(opt.slice(0, 2).toLowerCase()) || q.answerKey.toLowerCase().includes(opt.toLowerCase()));

                              let btnBg = 'rgba(255,255,255,0.03)';
                              let btnBorder = 'rgba(255,255,255,0.08)';
                              let btnColor = 'var(--text-secondary)';

                              if (!isExamFinished) {
                                if (isPicked) {
                                  btnBg = 'rgba(139, 92, 246, 0.22)';
                                  btnBorder = 'var(--accent-primary)';
                                  btnColor = '#fff';
                                }
                              } else {
                                if (isPicked && isCorrectKey) {
                                  btnBg = 'rgba(16, 185, 129, 0.22)';
                                  btnBorder = '#10b981';
                                  btnColor = '#fff';
                                } else if (isPicked && !isCorrectKey) {
                                  btnBg = 'rgba(239, 68, 68, 0.22)';
                                  btnBorder = '#ef4444';
                                  btnColor = '#fff';
                                } else if (!isPicked && isCorrectKey) {
                                  btnBg = 'rgba(16, 185, 129, 0.1)';
                                  btnBorder = 'rgba(16, 185, 129, 0.5)';
                                  btnColor = '#34d399';
                                }
                              }

                              return (
                                <button
                                  key={optIdx}
                                  type="button"
                                  onClick={() => {
                                    if (testViewMode === 'student' && !isExamFinished) {
                                      if (isPicked) {
                                        handleStudentAnswerChange(q.id, '', true);
                                      } else {
                                        handleStudentAnswerChange(q.id, opt, true);
                                      }
                                    }
                                  }}
                                  disabled={testViewMode === 'examiner' || isExamFinished}
                                  title={testViewMode === 'student' && !isExamFinished && isPicked ? 'Click again to unselect' : ''}
                                  style={{
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '10px',
                                    textAlign: 'left',
                                    fontSize: '0.88rem',
                                    background: btnBg,
                                    border: `1px solid ${btnBorder}`,
                                    color: btnColor,
                                    cursor: testViewMode === 'student' && !isExamFinished ? 'pointer' : 'default',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    transition: 'all 0.18s ease',
                                    boxSizing: 'border-box',
                                    width: '100%'
                                  }}
                                >
                                  <span
                                    style={{
                                      width: '24px',
                                      height: '24px',
                                      borderRadius: '50%',
                                      background: isPicked ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
                                      color: isPicked ? '#fff' : 'var(--text-secondary)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      flexShrink: 0
                                    }}
                                  >
                                    {String.fromCharCode(65 + optIdx)}
                                  </span>
                                  <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.45 }}>{opt}</span>
                                  {!isExamFinished && testViewMode === 'student' && isPicked && (
                                    <span style={{ fontSize: '0.75rem', color: '#c4b5fd', fontWeight: 600, flexShrink: 0 }}>✓ Picked</span>
                                  )}
                                  {isExamFinished && isPicked && isCorrectKey && (
                                    <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 700, flexShrink: 0 }}>✓ Correct</span>
                                  )}
                                  {isExamFinished && isPicked && !isCorrectKey && (
                                    <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, flexShrink: 0 }}>✕ Your Answer</span>
                                  )}
                                  {isExamFinished && !isPicked && isCorrectKey && (
                                    <span style={{ fontSize: '0.72rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.2)', padding: '0.1rem 0.4rem', borderRadius: '4px', flexShrink: 0 }}>✓ Key</span>
                                  )}
                                  {testViewMode === 'examiner' && !isExamFinished && isCorrectKey && (
                                    <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.1rem 0.4rem', borderRadius: '4px', flexShrink: 0 }}>Key ✓</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {!isExamFinished && testViewMode === 'student' && Boolean(studentAns?.trim()) && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.3rem' }}>
                              <button
                                type="button"
                                onClick={() => handleStudentAnswerChange(q.id, '', true)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#f87171',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.15rem 0.4rem',
                                  borderRadius: '4px'
                                }}
                                title="Clear selection for this question"
                              >
                                ✕ Clear Option Selection
                              </button>
                            </div>
                          )}

                          {/* AFTER FINISH: Show Explanation/Solution for MCQ */}
                          {isExamFinished && hasKey && (
                            <div style={{ marginTop: '0.65rem', padding: '0.6rem 0.9rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', borderLeft: '3px solid #10b981', fontSize: '0.84rem', color: '#cbd5e1' }}>
                              💡 <strong style={{ color: '#34d399' }}>Answer Key / Solution:</strong> {q.answerKey}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Student Answer Space */}
                      <div style={{
                        marginTop: '1rem',
                        background: 'rgba(10, 15, 29, 0.55)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '12px',
                        padding: 'clamp(0.75rem, 2vw, 1.1rem)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span>✍️</span>
                              <span>Student's Answer / Solution Workspace</span>
                            </label>
                            {q.options && q.options.length > 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '0.12rem 0.45rem', borderRadius: '4px' }}>
                                Optional note / steps
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {studentAns ? (
                              <span style={{ fontSize: '0.74rem', color: '#34d399', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                                <span>Response Saved</span>
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                ○ No answer entered yet
                              </span>
                            )}

                            {!isExamFinished && testViewMode === 'student' && Boolean(studentAns?.trim()) && (
                              <button
                                type="button"
                                onClick={() => handleStudentAnswerChange(q.id, '', true)}
                                style={{
                                  padding: '0.2rem 0.5rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 500,
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  color: '#f87171',
                                  borderRadius: '5px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  transition: 'all 0.15s ease'
                                }}
                                title="Clear answer for this question"
                              >
                                ✕ Clear
                              </button>
                            )}
                          </div>
                        </div>

                        {testViewMode === 'student' ? (
                          <div>
                            <textarea
                              value={studentAns}
                              onChange={(e) => handleStudentAnswerChange(q.id, e.target.value)}
                              disabled={isExamFinished}
                              placeholder={isExamFinished ? "No response entered." : "Write your step-by-step solution, calculations, or answer here..."}
                              rows={4}
                              style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '0.75rem 0.95rem',
                                background: isExamFinished ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: '8px',
                                color: isExamFinished ? '#cbd5e1' : '#fff',
                                fontSize: '0.92rem',
                                lineHeight: 1.6,
                                fontFamily: 'inherit',
                                minHeight: 'clamp(100px, 16vh, 160px)',
                                maxHeight: '380px',
                                resize: isExamFinished ? 'none' : 'vertical',
                                outline: 'none',
                                transition: 'border-color 0.2s, box-shadow 0.2s'
                              }}
                              onFocus={(e) => {
                                if (!isExamFinished) {
                                  e.target.style.borderColor = 'var(--accent-primary)';
                                  e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.2)';
                                }
                              }}
                              onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(255,255,255,0.12)';
                                e.target.style.boxShadow = 'none';
                              }}
                            />
                            {!isExamFinished && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                  ⚡ Answers auto-save as you type or click Next Question
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  {Boolean(studentAns?.trim()) && (
                                    <button
                                      type="button"
                                      onClick={() => handleStudentAnswerChange(q.id, '', true)}
                                      style={{
                                        padding: '0.32rem 0.75rem',
                                        fontSize: '0.78rem',
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: '#f87171',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      ✕ Clear
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => saveStudentAnswers(studentAnswers, true)}
                                    style={{
                                      padding: '0.32rem 0.85rem',
                                      fontSize: '0.78rem',
                                      fontWeight: 600,
                                      background: 'rgba(139, 92, 246, 0.25)',
                                      border: '1px solid var(--accent-primary)',
                                      color: '#fff',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.35rem'
                                    }}
                                  >
                                    💾 Save Answer
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{
                            padding: '0.75rem 0.95rem',
                            background: 'rgba(0,0,0,0.3)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            color: studentAns ? '#e2e8f0' : 'var(--text-secondary)',
                            fontStyle: studentAns ? 'normal' : 'italic',
                            minHeight: '48px',
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word'
                          }}>
                            {studentAns || 'No typed answer. (Check student\'s uploaded handwritten answer sheets above)'}
                          </div>
                        )}
                      </div>

                      {/* AFTER FINISH: Show Rubric / Model Solution for Descriptive Questions */}
                      {isExamFinished && hasKey && (
                        <div style={{ marginTop: '0.85rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#34d399', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span>💡 Official Model Answer & Rubric:</span>
                          </div>
                          <div style={{ fontSize: '0.88rem', color: '#e2e8f0', lineHeight: 1.6, whiteSpace: 'pre-line', wordBreak: 'break-word' }}>
                            {q.answerKey}
                          </div>
                        </div>
                      )}

                      {/* AFTER FINISH: Show Score & Teacher's Note to Student */}
                      {isExamFinished && testViewMode === 'student' && isGrd && (
                        <div style={{
                          marginTop: '0.85rem',
                          background: Number(awarded) === 0 ? 'rgba(239, 68, 68, 0.08)' : (Number(awarded) < qMarks ? 'rgba(234, 179, 8, 0.08)' : 'rgba(16, 185, 129, 0.08)'),
                          border: `1px solid ${Number(awarded) === 0 ? 'rgba(239, 68, 68, 0.25)' : (Number(awarded) < qMarks ? 'rgba(234, 179, 8, 0.25)' : 'rgba(16, 185, 129, 0.25)')}`,
                          borderRadius: '10px',
                          padding: '0.85rem 1rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                            <div style={{
                              fontSize: '0.88rem',
                              fontWeight: 700,
                              color: Number(awarded) === 0 ? '#f87171' : (Number(awarded) < qMarks ? '#facc15' : '#34d399'),
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem'
                            }}>
                              <span>{Number(awarded) === 0 ? '✗' : (Number(awarded) < qMarks ? '~' : '✓')}</span>
                              <span>Score: {awarded} / {qMarks} Marks</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 500, opacity: 0.85 }}>
                                ({Number(awarded) === 0 ? 'Incorrect' : (Number(awarded) < qMarks ? 'Partially Correct' : 'Full Marks')})
                              </span>
                            </div>
                          </div>
                          {examinerNotes[q.id] && (
                            <div style={{ fontSize: '0.82rem', color: '#cbd5e1', marginTop: '0.4rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.4rem' }}>
                              💬 <strong style={{ color: '#fff' }}>Teacher's Note:</strong> {examinerNotes[q.id]}
                            </div>
                          )}
                        </div>
                      )}

                      {/* EXAMINER EVALUATION BLOCK FOR THIS QUESTION */}
                      {testViewMode === 'examiner' && (
                        <div style={{ marginTop: '0.95rem', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
                          
                          {/* Toggle Marking Key */}
                          {hasKey && (
                            <div style={{ marginBottom: '0.65rem' }}>
                              <button
                                type="button"
                                onClick={() => setShowAnswerKeys(prev => ({ ...prev, [q.id]: !prev[q.id] }))}
                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                              >
                                <span>{showAnswerKeys[q.id] ? '▲ Hide Answer Key / Rubric' : '▼ View Marking Answer Key'}</span>
                              </button>
                              {showAnswerKeys[q.id] && (
                                <div style={{ marginTop: '0.35rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', fontSize: '0.82rem', color: '#cbd5e1', borderLeft: '3px solid var(--accent-primary)', whiteSpace: 'pre-line' }}>
                                  💡 <strong>Official Rubric / Key:</strong> {q.answerKey}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Marks & Quick Scoring & Confirm Button */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9' }}>Give Number / Marks:</span>
                              <input
                                type="number"
                                min={0}
                                max={qMarks}
                                value={awarded}
                                onChange={(e) => handleAwardMark(q.id, e.target.value, qMarks)}
                                placeholder="0"
                                style={{
                                  width: '60px',
                                  padding: '0.3rem 0.5rem',
                                  fontSize: '0.88rem',
                                  fontWeight: 700,
                                  color: isGrd ? (Number(awarded) === 0 ? '#f87171' : (Number(awarded) < qMarks ? '#facc15' : '#34d399')) : 'var(--text-secondary)',
                                  textAlign: 'center',
                                  background: 'rgba(0,0,0,0.5)',
                                  border: `1px solid ${isGrd ? (Number(awarded) === 0 ? 'rgba(239, 68, 68, 0.5)' : (Number(awarded) < qMarks ? 'rgba(234, 179, 8, 0.5)' : 'rgba(16, 185, 129, 0.5)')) : 'var(--accent-primary)'}`,
                                  borderRadius: '6px'
                                }}
                              />
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ {qMarks} Marks</span>
                            </div>

                            {/* Quick award shortcuts */}
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => handleAiGradeSingleQuestion(q)}
                                disabled={aiReviewingQId === q.id || isAiReviewing}
                                style={{
                                  padding: '0.22rem 0.65rem',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background: 'rgba(168, 85, 247, 0.2)',
                                  border: '1px solid rgba(168, 85, 247, 0.45)',
                                  color: '#d8b4fe',
                                  borderRadius: '4px',
                                  cursor: (aiReviewingQId === q.id || isAiReviewing) ? 'not-allowed' : 'pointer'
                                }}
                                title="Use AI to check this specific question and suggest marks & note"
                              >
                                {aiReviewingQId === q.id ? '⏳ Checking...' : '🤖 AI Mark Q'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAwardMarkAndConfirm(q.id, qMarks, qMarks)}
                                style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', borderRadius: '4px', cursor: 'pointer' }}
                                title="Award full marks and confirm"
                              >
                                Full ({qMarks})
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAwardMarkAndConfirm(q.id, Math.round(qMarks / 2), qMarks)}
                                style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#facc15', borderRadius: '4px', cursor: 'pointer' }}
                                title="Award half marks and confirm"
                              >
                                Half ({Math.round(qMarks / 2)})
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAwardMarkAndConfirm(q.id, 0, qMarks)}
                                style={{ padding: '0.22rem 0.6rem', fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '4px', cursor: 'pointer' }}
                                title="Award 0 marks and confirm"
                              >
                                0
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAwardMarkAndConfirm(q.id, awardedMarks[q.id] !== undefined ? awardedMarks[q.id] : 0, qMarks)}
                                style={{ padding: '0.22rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(16, 185, 129, 0.25)', border: '1px solid #34d399', color: '#34d399', borderRadius: '4px', cursor: 'pointer' }}
                                title="Confirm and save this mark"
                              >
                                ✓ Confirm Mark
                              </button>
                            </div>
                          </div>

                          {/* Examiner specific note for this question */}
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
                              style={{ width: '100%', boxSizing: 'border-box', padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#cbd5e1' }}
                            />
                          </div>

                        </div>
                      )}

                    </div>
                  </div>
                );
              })}

            </div>

            {/* Docked Sticky Slide Navigation Controls */}
            {questionDisplayMode === 'slide' && parsedQuestions.length > 0 && (
              <div style={{
                position: 'sticky',
                bottom: 'clamp(0.5rem, 2vh, 1rem)',
                zIndex: 35,
                background: 'rgba(15, 23, 42, 0.95)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 12px 35px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                borderRadius: '16px',
                padding: 'clamp(0.6rem, 1.8vw, 0.85rem) clamp(0.75rem, 2.5vw, 1.25rem)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.65rem',
                marginTop: '1.5rem',
                boxSizing: 'border-box',
                width: '100%'
              }}>
                {/* Previous Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (currentSlideIndex > 0) {
                      if (testViewMode === 'student') {
                        saveStudentAnswers(studentAnswers, true);
                      } else {
                        saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                      }
                      setCurrentSlideIndex(prev => prev - 1);
                    }
                  }}
                  disabled={currentSlideIndex === 0}
                  style={{
                    padding: 'clamp(0.5rem, 1.5vw, 0.65rem) clamp(0.75rem, 2vw, 1.2rem)',
                    borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: currentSlideIndex === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                    color: currentSlideIndex === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                    cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 'clamp(0.78rem, 1.5vw, 0.86rem)',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    flexShrink: 0,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>←</span>
                  <span>Previous</span>
                </button>

                {/* Center Slide Indicator & Keyboard Hint */}
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 'clamp(0.8rem, 1.6vw, 0.9rem)', fontWeight: 700, color: '#f1f5f9' }}>
                      Question {parsedQuestions[currentSlideIndex]?.displayNumber || currentSlideIndex + 1}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      of {parsedQuestions.length}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
                    Tip: Use ← → keys to slide
                  </div>
                </div>

                {/* Next Button / Final Action */}
                {currentSlideIndex < parsedQuestions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (testViewMode === 'student') {
                        saveStudentAnswers(studentAnswers, true);
                      } else {
                        saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                      }
                      setCurrentSlideIndex(prev => prev + 1);
                    }}
                    style={{
                      padding: 'clamp(0.5rem, 1.5vw, 0.65rem) clamp(0.85rem, 2vw, 1.3rem)',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 'clamp(0.78rem, 1.5vw, 0.86rem)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      flexShrink: 0,
                      boxShadow: '0 3px 12px rgba(139, 92, 246, 0.35)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>Next</span>
                    <span>→</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (testViewMode === 'student') {
                        if (isExamFinished) {
                          setNotificationMsg('✅ Exam is already submitted! You are reviewing the answers.');
                          setTimeout(() => setNotificationMsg(''), 2500);
                        } else {
                          handleFinishAndSubmitExam();
                        }
                      } else {
                        handleSaveExaminerGrading(parsedQuestions);
                      }
                    }}
                    className="primary"
                    style={{
                      padding: 'clamp(0.5rem, 1.5vw, 0.65rem) clamp(0.85rem, 2vw, 1.3rem)',
                      borderRadius: '10px',
                      fontSize: 'clamp(0.78rem, 1.5vw, 0.86rem)',
                      fontWeight: 700,
                      flexShrink: 0,
                      boxShadow: '0 3px 14px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    {testViewMode === 'student' 
                      ? (isExamFinished ? '✅ Exam Completed' : '🚀 Finish & Submit') 
                      : `✅ Finish Checking (${currentAwardedMarksSum}/${totalMaxMarks})`}
                  </button>
                )}
              </div>
            )}

            {/* EXAMINER MODE: Grading Evaluation Summary & Overall Feedback */}
            {testViewMode === 'examiner' && (
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '1.15rem', marginTop: '1.25rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.2rem 0', fontSize: '1.05rem', color: '#fff' }}>
                      Examiner Grading Summary
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      Awarded total: <strong style={{ color: '#34d399', fontSize: '1rem' }}>{currentAwardedMarksSum}</strong> / {totalMaxMarks} Marks
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={handleAiAutoReview}
                      disabled={isAiReviewing}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        padding: '0.55rem 1rem',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        background: isAiReviewing ? 'rgba(147, 51, 234, 0.4)' : 'linear-gradient(135deg, #7c3aed 0%, #db2777 100%)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        borderRadius: '8px',
                        color: '#fff',
                        cursor: isAiReviewing ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 12px rgba(124, 58, 237, 0.35)',
                        transition: 'all 0.2s ease'
                      }}
                      title="Run or re-run AI auto-marking on all questions"
                    >
                      {isAiReviewing ? (
                        <>
                          <span style={{ width: '0.8rem', height: '0.8rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                          <span>AI Marking in Progress...</span>
                        </>
                      ) : (
                        <>
                          <span>🤖</span>
                          <span>Re-Run AI Auto-Review</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSaveExaminerGrading(parsedQuestions)}
                      disabled={isSavingGrading}
                      className="primary"
                      style={{ padding: '0.6rem 1.3rem', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: isSavingGrading ? 'not-allowed' : 'pointer' }}
                    >
                      <span>✅</span>
                      <span>{isSavingGrading ? 'Publishing Result...' : `Finish Checking & Set Result (${currentAwardedMarksSum}/${totalMaxMarks})`}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Examiner Overall Feedback / Remarks:</label>
                  <input
                    type="text"
                    value={overallExaminerFeedback}
                    onChange={(e) => {
                      const fb = e.target.value;
                      setOverallExaminerFeedback(fb);
                      saveExaminerGrading(awardedMarks, examinerNotes, fb);
                    }}
                    placeholder="e.g. Good mastery of multiples, review word problems in percentage."
                    style={{ width: '100%', padding: '0.55rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid var(--glass-border)', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleCopyTest}
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

              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                {testViewMode === 'student' && !isExamFinished && (
                  <button
                    type="button"
                    onClick={handleFinishAndSubmitExam}
                    style={{
                      padding: '0.55rem 1.2rem',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600
                    }}
                  >
                    🚀 Finish & Submit Paper
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setViewingModelTest(null)}
                  style={{ padding: '0.55rem 1.4rem', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem' }}
                >
                  Close
                </button>
              </div>
            </div>

          </main>
        </div>
      )}

      {/* Fullscreen Image Zoom Modal for Student's Uploaded Answer Sheet */}
      {zoomedImageUrl && (
        <div 
          onClick={() => setZoomedImageUrl(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img 
              src={zoomedImageUrl} 
              alt="Zoomed Answer Sheet" 
              style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} 
            />
            <button 
              onClick={() => setZoomedImageUrl(null)}
              style={{ position: 'absolute', top: '-40px', right: 0, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Global Add Subject / Exam / Chapter Modal */}
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

      {/* Universal Subject Settings Modal */}
      {settingsSubject && (
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
            zIndex: 100, 
            padding: '1.25rem' 
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsSubject(null);
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
                  {settingsSubject.title}
                </h2>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Applies to all exams, chapters, and resources for this subject
                </p>
              </div>
              <button 
                onClick={() => setSettingsSubject(null)}
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
                  {subjectBookUrl.trim() && (
                    <a 
                      href={subjectBookUrl.trim()} 
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
                  value={subjectBookUrl} 
                  onChange={e => setSubjectBookUrl(e.target.value)} 
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
                    const isSelected = String(subjectExamRetentionDays) === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setSubjectExamRetentionDays(preset.value)}
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
                      value={subjectExamRetentionDays} 
                      onChange={(e) => setSubjectExamRetentionDays(e.target.value)} 
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
                  <div style={{ fontSize: '0.78rem', color: subjectExamRetentionDays === '0' || Number(subjectExamRetentionDays) === 0 ? '#34d399' : '#94a3b8', lineHeight: 1.3, flex: 1 }}>
                    {subjectExamRetentionDays === '0' || Number(subjectExamRetentionDays) === 0 ? (
                      <span>🛡️ <strong>Permanent</strong> — exams will never auto-archive and stay visible until manually removed.</span>
                    ) : (
                      <span>⏳ Retained for <strong>{subjectExamRetentionDays || 0} day{Number(subjectExamRetentionDays) === 1 ? '' : 's'}</strong> post-deadline for parent & kid review before auto-archival.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button 
                  type="button" 
                  onClick={() => setSettingsSubject(null)} 
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

      {/* Archive / Close Floating Notification Toast */}
      {archiveToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(52, 211, 153, 0.4)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(16, 185, 129, 0.2)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px',
          padding: '0.75rem 1.15rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          color: '#f8fafc',
          fontSize: '0.86rem',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.95rem'
          }}>
            📦
          </div>
          <span style={{ fontWeight: 500 }}>{archiveToast.message}</span>
          <button
            type="button"
            onClick={() => handleRestoreExam(archiveToast.subjectId, archiveToast.examId)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#34d399',
              fontWeight: 700,
              fontSize: '0.78rem',
              padding: '0.3rem 0.65rem',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(52, 211, 153, 0.2)';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = '#34d399';
            }}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setArchiveToast(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              padding: '0.2rem'
            }}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modal to Set/Edit Exam Duration */}
      {editingDurationModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e1b4b 0%, #0f172a 100%)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>⏱️</span>
                  <span>Set Exam Time Limit</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {editingDurationModal.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDurationModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.5rem' }}>
                Quick Presets:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {[15, 20, 30, 45, 60, 90, 120, 150, 180].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setTempDurationValue(mins)}
                    style={{
                      padding: '0.4rem 0.8rem',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: Number(tempDurationValue) === mins ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                      color: Number(tempDurationValue) === mins ? '#0f172a' : '#cbd5e1',
                      border: `1px solid ${Number(tempDurationValue) === mins ? '#38bdf8' : 'rgba(255,255,255,0.12)'}`,
                      boxShadow: Number(tempDurationValue) === mins ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {mins < 60 ? `${mins}m` : `${mins / 60}h${mins % 60 ? ` ${mins % 60}m` : ''}`}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.45rem' }}>
                Custom Duration (Minutes):
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <input
                  type="number"
                  min={1}
                  max={360}
                  value={tempDurationValue}
                  onChange={(e) => setTempDurationValue(Math.max(1, Number(e.target.value) || 0))}
                  style={{
                    width: '120px',
                    padding: '0.55rem 0.8rem',
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    borderRadius: '8px',
                    color: '#38bdf8',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textAlign: 'center'
                  }}
                />
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontWeight: 500 }}>minutes</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditingDurationModal(null)}
                style={{
                  padding: '0.6rem 1.2rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#cbd5e1',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSpecificTestDuration}
                style={{
                  padding: '0.6rem 1.4rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1 0%, #a855f7 100%))',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
                }}
              >
                Save Time Limit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign / Edit Student Email Modal */}
      {showAssignEmailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1e1b4b 0%, #0f172a 100%)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>✉️</span>
                  <span>{kid?.email ? 'Edit Student Email' : 'Assign Student Email'}</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Assigning an email enables student direct login and allows teachers to assign this student by email.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignEmailModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveStudentEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.86rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Student Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. student@school.edu or student@gmail.com"
                  value={studentEmailInput}
                  onChange={(e) => setStudentEmailInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                  autoFocus
                />
              </div>

              {emailModalError && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.84rem'
                }}>
                  {emailModalError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAssignEmailModal(false)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#cbd5e1',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEmail}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1 0%, #a855f7 100%))',
                    color: '#fff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: isSavingEmail ? 'not-allowed' : 'pointer',
                    opacity: isSavingEmail ? 0.7 : 1,
                    boxShadow: '0 4px 15px rgba(99, 102, 241, 0.4)'
                  }}
                >
                  {isSavingEmail ? 'Saving...' : 'Save Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Teacher / Parent Modal */}
      {showInviteTeacherModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #064e3b 0%, #0f172a 100%)',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🔗</span>
                  <span>Invite Teacher or Parent</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Invite a teacher or parent using their email. When they sign in, they will receive an invite to assign {kid?.name} to their dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInviteTeacherModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSendTeacherInvite} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.86rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Teacher / Parent Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. teacher@school.edu or parent@example.com"
                  value={teacherEmailInput}
                  onChange={(e) => setTeacherEmailInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'rgba(0, 0, 0, 0.35)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                  autoFocus
                />
              </div>

              {inviteModalError && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.84rem'
                }}>
                  {inviteModalError}
                </div>
              )}

              {inviteModalSuccess && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#6ee7b7',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span>✅</span>
                  <span>{inviteModalSuccess}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowInviteTeacherModal(false)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#cbd5e1',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingInvite}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: isSendingInvite ? 'not-allowed' : 'pointer',
                    opacity: isSendingInvite ? 0.7 : 1,
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  {isSendingInvite ? 'Sending Invite...' : 'Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #1c1a10 0%, #0f172a 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: '16px',
            padding: '1.75rem',
            width: '100%',
            maxWidth: '480px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            textAlign: 'left'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>🔑</span>
                  <span>Set Student Password</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Set or update the login password for <strong style={{ color: '#fcd34d' }}>{kid?.name}</strong>'s account.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.5rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '0.2rem'
                }}
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordModalError('');
                setPasswordModalSuccess('');

                if (newPasswordInput.length < 6) {
                  setPasswordModalError('Password must be at least 6 characters.');
                  return;
                }
                if (newPasswordInput !== confirmPasswordInput) {
                  setPasswordModalError('Passwords do not match.');
                  return;
                }

                setIsSavingPassword(true);
                try {
                  const currentUser = auth.currentUser;
                  if (!currentUser) throw new Error('No authenticated user found.');

                  // Re-authenticate first if a current password was provided
                  if (currentPasswordInput) {
                    const credential = EmailAuthProvider.credential(
                      currentUser.email,
                      currentPasswordInput
                    );
                    await reauthenticateWithCredential(currentUser, credential);
                  }

                  await updatePassword(currentUser, newPasswordInput);
                  setPasswordModalSuccess('Password updated successfully! ✅');
                  setCurrentPasswordInput('');
                  setNewPasswordInput('');
                  setConfirmPasswordInput('');
                  setTimeout(() => {
                    setShowPasswordModal(false);
                    setPasswordModalSuccess('');
                  }, 2000);
                } catch (err) {
                  if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                    setPasswordModalError('Current password is incorrect.');
                  } else if (err.code === 'auth/requires-recent-login') {
                    setPasswordModalError('Session expired. Please sign out and sign back in, then try again.');
                  } else {
                    setPasswordModalError(err.message || 'Failed to update password.');
                  }
                } finally {
                  setIsSavingPassword(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Current Password */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.86rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Current Password <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>(required if already set)</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    placeholder="Enter current password"
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 2.75rem 0.75rem 1rem',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.95rem',
                      boxSizing: 'border-box'
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(p => !p)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: 0,
                      lineHeight: 1
                    }}
                    tabIndex={-1}
                  >{showCurrentPw ? '🙈' : '👁️'}</button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.86rem', color: '#cbd5e1', fontWeight: 600 }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    required
                    placeholder="Min. 6 characters"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 2.75rem 0.75rem 1rem',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.95rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(p => !p)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: 0,
                      lineHeight: 1
                    }}
                    tabIndex={-1}
                  >{showNewPw ? '🙈' : '👁️'}</button>
                </div>
                {/* Strength indicator */}
                {newPasswordInput && (
                  <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {[6, 10, 16].map((threshold, i) => (
                      <div key={i} style={{
                        height: '3px',
                        flex: 1,
                        borderRadius: '99px',
                        background: newPasswordInput.length >= threshold
                          ? i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#10b981'
                          : 'rgba(255,255,255,0.1)',
                        transition: 'background 0.3s'
                      }} />
                    ))}
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '0.4rem', whiteSpace: 'nowrap' }}>
                      {newPasswordInput.length < 6 ? 'Too short' : newPasswordInput.length < 10 ? 'Weak' : newPasswordInput.length < 16 ? 'Good' : 'Strong'}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.86rem', color: '#cbd5e1', fontWeight: 600 }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirmPw ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 2.75rem 0.75rem 1rem',
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: `1px solid ${confirmPasswordInput && confirmPasswordInput !== newPasswordInput ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '0.95rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw(p => !p)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: 0,
                      lineHeight: 1
                    }}
                    tabIndex={-1}
                  >{showConfirmPw ? '🙈' : '👁️'}</button>
                </div>
                {confirmPasswordInput && confirmPasswordInput !== newPasswordInput && (
                  <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.78rem', color: '#fca5a5' }}>Passwords don't match</p>
                )}
              </div>

              {/* Error */}
              {passwordModalError && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: '0.84rem'
                }}>
                  {passwordModalError}
                </div>
              )}

              {/* Success */}
              {passwordModalSuccess && (
                <div style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  color: '#6ee7b7',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {passwordModalSuccess}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    padding: '0.6rem 1.2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#cbd5e1',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPassword}
                  style={{
                    padding: '0.6rem 1.4rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#fff',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: isSavingPassword ? 'not-allowed' : 'pointer',
                    opacity: isSavingPassword ? 0.7 : 1,
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.4)'
                  }}
                >
                  {isSavingPassword ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default function KidProfile() {
  return (
    <Suspense fallback={<div className="view-container" style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>Loading student profile...</div>}>
      <KidProfileContent />
    </Suspense>
  );
}
