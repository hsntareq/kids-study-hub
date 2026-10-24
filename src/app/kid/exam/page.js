"use client";

import { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { generateGeminiContent, organizeMarkDistributionWithAI, autoReviewExamWithAI } from '../../../lib/gemini';
import Link from 'next/link';
import MarkDistributionField, { cleanAndFormatMarkDistribution } from '../../../components/MarkDistributionField';
import MarkDistributionView from '../../../components/MarkDistributionView';

function ExamPageContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const isStudentView = !!searchParams.get('parentId');

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [kid, setKid] = useState(null);
  const [subject, setSubject] = useState(null);
  const [exam, setExam] = useState(null);
  const [bookUrl, setBookUrl] = useState('');

  // PDF Viewer state: single page fit, scaling, and active page
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [pdfScale, setPdfScale] = useState(1);
  const [pdfViewMode, setPdfViewMode] = useState('single'); // 'single' (fits single page) | 'wide' (full width)

  // Mark Distribution state
  const [isEditingMarkDist, setIsEditingMarkDist] = useState(false);
  const [markDistValue, setMarkDistValue] = useState('');
  const [isCleaningMarkDistAI, setIsCleaningMarkDistAI] = useState(false);

  const handleCleanMarkDistWithAI = async () => {
    if (!markDistValue || !markDistValue.trim() || isCleaningMarkDistAI) return;
    setIsCleaningMarkDistAI(true);
    try {
      const organized = await organizeMarkDistributionWithAI(markDistValue);
      if (organized) {
        setMarkDistValue(organized);
      } else {
        setMarkDistValue(cleanAndFormatMarkDistribution(markDistValue));
      }
    } catch (err) {
      console.warn('AI clean failed, falling back to rule cleaner:', err);
      setMarkDistValue(cleanAndFormatMarkDistribution(markDistValue));
    } finally {
      setIsCleaningMarkDistAI(false);
    }
  };

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
  const [modelTestDuration, setModelTestDuration] = useState(60);
  const [examDurationMinutes, setExamDurationMinutes] = useState(null);
  const [editingDurationModal, setEditingDurationModal] = useState(null);
  const [tempDurationValue, setTempDurationValue] = useState(60);

  // Multi-book & Collapsible Subject Material state
  const [isPdfSectionCollapsed, setIsPdfSectionCollapsed] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [selectedBookIdsForTest, setSelectedBookIdsForTest] = useState([]);
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBookData, setEditingBookData] = useState({ id: null, title: '', url: '', isGovtTextbook: false });
  const [bookSaveLoading, setBookSaveLoading] = useState(false);

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
  const [isAiReviewing, setIsAiReviewing] = useState(false);
  const [aiReviewingQId, setAiReviewingQId] = useState(null);

  // Chapter & Topics state
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterPdfPage, setNewChapterPdfPage] = useState('');
  const [chapterTopics, setChapterTopics] = useState([]); // Array of { id, title, page }
  const [showBulkTopicInput, setShowBulkTopicInput] = useState(false);
  const [bulkTopicText, setBulkTopicText] = useState('');

  // Timer & Exam completion state
  const [isExamStarted, setIsExamStarted] = useState(false);
  const [isExamFinished, setIsExamFinished] = useState(false);
  const [examStartedAt, setExamStartedAt] = useState(null);
  const [examSubmittedAt, setExamSubmittedAt] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Question Navigator State (Scroller vs Collapsible by Question Type)
  const [navigatorViewMode, setNavigatorViewMode] = useState('collapsible'); // 'collapsible' or 'scroller'
  const [selectedSetFilter, setSelectedSetFilter] = useState('all');
  const [collapsedSets, setCollapsedSets] = useState({});
  const [isNavigatorCollapsed, setIsNavigatorCollapsed] = useState(false);
  const pillsScrollRef = useRef(null);

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

  // Parser for questions
  const parseQuestionsData = (raw) => {
    if (!raw) return [];

    const normalize = (q, i, defaultSec = 'General Section') => ({
      ...q,
      id: q.id || i + 1,
      section: cleanText(q.section || q.category || q.type || defaultSec),
      question: cleanText(q.question || q.prompt || q.text || q.questionText || ''),
      options: (q.options || q.choices || []).map(opt => cleanText(opt)),
      answerKey: cleanText(q.answerKey || q.correctAnswer || q.solution || q.answer || ''),
      marks: q.marks !== undefined ? Number(q.marks) : undefined
    });

    const extractArray = (data) => {
      if (!data) return [];
      if (Array.isArray(data)) return data.map((q, i) => normalize(q, i));
      if (typeof data !== 'object') return [];

      if (Array.isArray(data.questions)) {
        return data.questions.map((q, i) => normalize(q, i));
      }
      if (data.modelTest && Array.isArray(data.modelTest.questions)) {
        return data.modelTest.questions.map((q, i) => normalize(q, i));
      }
      if (data.model_test && Array.isArray(data.model_test.questions)) {
        return data.model_test.questions.map((q, i) => normalize(q, i));
      }
      if (data.exam && Array.isArray(data.exam.questions)) {
        return data.exam.questions.map((q, i) => normalize(q, i));
      }
      if (Array.isArray(data.sections)) {
        const collected = [];
        data.sections.forEach((sec, sIdx) => {
          const secQuestions = sec.questions || sec.items || [];
          if (Array.isArray(secQuestions)) {
            secQuestions.forEach(q => {
              collected.push(normalize(q, collected.length, sec.title || sec.name || `Section ${sIdx + 1}`));
            });
          }
        });
        if (collected.length > 0) return collected;
      }
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key]) && data[key].length > 0 && typeof data[key][0] === 'object') {
          if (data[key][0].question || data[key][0].prompt || data[key][0].text) {
            return data[key].map((q, i) => normalize(q, i, key));
          }
        }
      }
      return [];
    };

    let result = [];
    if (Array.isArray(raw)) result = extractArray(raw);
    else if (typeof raw === 'object') result = extractArray(raw);
    else if (typeof raw === 'string') {
      try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        const parsed = JSON.parse(clean);
        result = extractArray(parsed);
      } catch (_) {
        // Robust recovery for truncated JSON (e.g. cut off at max output tokens)
        try {
          const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
          let lastIdx = clean.lastIndexOf('},');
          if (lastIdx === -1) lastIdx = clean.lastIndexOf('}');
          while (lastIdx > 50) {
            const slice = clean.slice(0, lastIdx + 1);
            const candidates = [
              slice + '\n]}',
              slice + ']}',
              slice + '\n}',
              slice + '}'
            ];
            for (const att of candidates) {
              try {
                const repaired = JSON.parse(att);
                const salvaged = extractArray(repaired);
                if (salvaged && salvaged.length > 0) {
                  result = salvaged;
                  break;
                }
              } catch (_) {}
            }
            if (result && result.length > 0) break;
            lastIdx = clean.lastIndexOf('}', lastIdx - 1);
          }
        } catch (_) {}
      }

      if (!result || result.length === 0) {
        // Fallback robust line-by-line parser (handles text/markdown-formatted responses)
        const lines = raw.split('\n');
        const questions = [];
        let currentQ = null;
        let currentSection = 'General Section';

        for (let line of lines) {
          let trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.match(/^(?:#+\s*)?(?:\*\*)?(?:section|part)\s+[a-z0-9]/i)) {
            currentSection = cleanText(trimmed);
            continue;
          }

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

          const optMatch = trimmed.match(/^(?:[\*\-]\s*)?(?:\()?\s*([a-d])(?:\)|\.)\s+(.*)/i);
          if (currentQ && optMatch) {
            currentQ.options.push(optMatch[1].toUpperCase() + ') ' + cleanText(optMatch[2]));
            continue;
          }

          if (currentQ && (trimmed.toLowerCase().startsWith('answer:') || trimmed.toLowerCase().startsWith('ans:') || trimmed.toLowerCase().startsWith('**answer:'))) {
            currentQ.answerKey = cleanText(trimmed.replace(/^(?:\*\*answer:\*\*|answer:|ans:?)\s*/i, ''));
            continue;
          }

          if (currentQ && !currentQ.options.length) {
            currentQ.question += ' ' + cleanText(trimmed);
          }
        }
        if (currentQ) questions.push(currentQ);
        result = questions;
      }
    }

    return enrichWithSetNumbers(result);
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

  // Auto-scroll active question pill into center view
  useEffect(() => {
    if (!viewingModelTest || questionDisplayMode !== 'slide') return;
    const activeBtn = document.getElementById(`q-pill-${currentSlideIndex}`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [viewingModelTest, currentSlideIndex, questionDisplayMode, navigatorViewMode]);

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

            // Find exam
            let matchedEx = null;
            let matchedExId = null;
            if (matchedKid.exams) {
              for (const eId in matchedKid.exams) {
                const ex = matchedKid.exams[eId];
                const eSlug = ex.title ? ex.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
                const paramExamId = searchParams.get("examId") || "";
                if (eId === paramExamId || eSlug === paramExamId) {
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
  }, [searchParams, router]);

  // Exam status and progress calculations
  const chaptersMap = (subject && exam && subject.chapters && subject.chapters[exam.id]) || {};
  const chaptersList = Object.entries(chaptersMap).map(([cId, chap]) => ({ id: cId, ...chap }));
  const completedChaptersCount = chaptersList.filter(c => c.completed || c.status === 'completed').length;
  const totalChaptersCount = chaptersList.length;
  const progressPercent = totalChaptersCount > 0 ? Math.round((completedChaptersCount / totalChaptersCount) * 100) : 0;

  const examSetting = (subject && exam && subject.examSettings && subject.examSettings[exam.id]) || {};
  const examStatus = examSetting.status || (progressPercent === 100 && totalChaptersCount > 0 ? 'Completed' : (progressPercent > 0 ? 'In Progress' : 'Not Started'));

  const rawModelTests = (subject && exam && subject.modelTests && subject.modelTests[exam.id]) || {};
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

  const modelTestsList = Object.entries(rawModelTests)
    .map(([tId, test]) => ({ id: tId, ...test }))
    .sort((a, b) => getTestCreatedAt(b, true) - getTestCreatedAt(a, true));

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

  // Map duplicate titles across existing tests to chronologically numbered display titles
  const numberedTitleMap = useMemo(() => {
    const titleCounts = {};
    for (const t of modelTestsList) {
      const rawTitle = (t.title || `Model Test - ${t.date || ''}`).trim();
      titleCounts[rawTitle] = (titleCounts[rawTitle] || 0) + 1;
    }

    const chronological = [...modelTestsList].sort((a, b) => getTestCreatedAt(a, true) - getTestCreatedAt(b, true));
    const titleSeq = {};
    const map = {};

    for (const t of chronological) {
      const rawTitle = (t.title || `Model Test - ${t.date || ''}`).trim();
      if (titleCounts[rawTitle] > 1) {
        titleSeq[rawTitle] = (titleSeq[rawTitle] || 0) + 1;
        map[t.id] = `${rawTitle} #${titleSeq[rawTitle]}`;
      } else {
        map[t.id] = rawTitle;
      }
    }
    return map;
  }, [modelTestsList]);

  // Count existing questions across all prior model tests for zero-duplication transparency
  const totalExistingQuestionsCount = useMemo(() => {
    let count = 0;
    (modelTestsList || []).forEach(test => {
      const parsed = parseQuestionsData(test.questions);
      count += parsed.length;
    });
    return count;
  }, [modelTestsList]);

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

  const handleSaveBook = async (bookData) => {
    if (!user || !kid || !subject) return;
    setBookSaveLoading(true);
    try {
      const dataOwnerUid = searchParams.get("parentId") || user.uid;
      const booksBasePath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/books`;
      
      let bookId = bookData.id;
      if (!bookId || bookId === 'default_book') {
        const newRef = push(ref(database, booksBasePath));
        bookId = newRef.key;
      }
      
      const toSave = {
        title: (bookData.title || '').trim() || 'Textbook',
        url: (bookData.url || '').trim(),
        isGovtTextbook: Boolean(bookData.isGovtTextbook),
        updatedAt: Date.now()
      };
      
      await set(ref(database, `${booksBasePath}/${bookId}`), toSave);

      if (toSave.isGovtTextbook || !subject.bookUrl) {
        await set(ref(database, `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/bookUrl`), toSave.url);
      }

      setSubject(prev => {
        if (!prev) return prev;
        const currentBooks = prev.books && typeof prev.books === 'object' ? { ...prev.books } : {};
        currentBooks[bookId] = { id: bookId, ...toSave };
        return {
          ...prev,
          books: currentBooks,
          bookUrl: toSave.isGovtTextbook ? toSave.url : (prev.bookUrl || toSave.url)
        };
      });

      setSelectedBookId(bookId);
      setShowBookModal(false);
      setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: false });
    } catch (err) {
      console.error('Error saving book:', err);
    } finally {
      setBookSaveLoading(false);
    }
  };

  const handleDeleteBook = async (bookId) => {
    if (!user || !kid || !subject || !bookId) return;
    if (!window.confirm('Are you sure you want to remove this book reference?')) return;
    try {
      const dataOwnerUid = searchParams.get("parentId") || user.uid;
      const bookPath = `users/${dataOwnerUid}/kids/${kid.id}/subjects/${subject.id}/books/${bookId}`;
      await remove(ref(database, bookPath));

      setSubject(prev => {
        if (!prev || !prev.books) return prev;
        const copy = { ...prev.books };
        delete copy[bookId];
        return { ...prev, books: copy };
      });

      setSelectedBookId(null);
    } catch (err) {
      console.error('Error deleting book:', err);
    }
  };

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
    let toSave = (markDistValue || '').trim();
    // Auto-clean if raw markdown / LaTeX artifacts are detected
    if (/\\times|\\text|\$|###|^\s*[-*•]\s*\*\*/m.test(toSave)) {
      toSave = cleanAndFormatMarkDistribution(toSave);
      setMarkDistValue(toSave);
    }
    await set(ref(database, path), toSave);
    setIsEditingMarkDist(false);
  };

  // Parse topics from multi-line or delimited text e.g. "(i) ... (ii) ..." or line-by-line
  const parseTopicsFromText = (text) => {
    if (!text || typeof text !== 'string') return [];
    const trimmed = text.trim();
    if (!trimmed) return [];

    // Check if it uses Roman numerals or letter markers like (i), (ii), (a), (b), (1), (2)
    if (/\([ivxlcdm0-9a-z]+\)/i.test(trimmed)) {
      const parts = trimmed.split(/(?=\([ivxlcdm0-9a-z]+\))/i).map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        return parts.map((part, idx) => {
          const pageMatch = part.match(/(?:p\.?|page)\s*([0-9]+(?:-[0-9]+)?)/i);
          const title = pageMatch ? part.replace(pageMatch[0], '').replace(/[()\-–—]+$/, '').trim() : part;
          return {
            id: `top_${Date.now()}_${idx}`,
            title: title || part,
            page: pageMatch ? pageMatch[1] : ''
          };
        });
      }
    }

    // Otherwise split by newlines or semicolons
    const lines = trimmed.split(/[\n;]+/).map(l => l.trim()).filter(Boolean);
    return lines.map((line, idx) => {
      const pageMatch = line.match(/(?:p\.?|page)\s*([0-9]+(?:-[0-9]+)?)/i);
      let title = line;
      let page = '';
      if (pageMatch) {
        page = pageMatch[1];
        title = line.replace(pageMatch[0], '').replace(/[()\-–—:,]+$/, '').trim();
      }
      title = title.replace(/^([0-9]+[.)\]]\s*|[-*•]\s*)/, '').trim();
      return {
        id: `top_${Date.now()}_${idx}`,
        title: title || line,
        page
      };
    });
  };

  // Helper to extract clean topics and pdfPage from a chapter object
  const parseChapterTopicsAndPage = (chap) => {
    let topics = [];
    if (Array.isArray(chap.topics) && chap.topics.length > 0) {
      topics = chap.topics.map((t, i) => (typeof t === 'string' ? { id: `top_${i}`, title: t, page: '' } : { id: t.id || `top_${i}`, title: t.title || '', page: t.page || '' }));
    }
    let pdfPage = chap.pdfPage || '';

    // If no explicit topics array, but pdfPage has long text or Roman numerals (e.g. user entered topics in page field)
    if (topics.length === 0 && pdfPage) {
      const isActuallyTopics = pdfPage.length > 20 || /\([ivx0-9a-z]+\)/i.test(pdfPage) || pdfPage.includes('\n');
      if (isActuallyTopics) {
        topics = parseTopicsFromText(pdfPage);
        pdfPage = ''; // Don't show long text in page pill
      }
    }

    return { topics, pdfPage };
  };

  const handleOpenAddChapter = () => {
    setEditingChapterId(null);
    setNewChapterTitle('');
    setNewChapterPdfPage('');
    setChapterTopics([]);
    setShowBulkTopicInput(false);
    setBulkTopicText('');
    setShowAddChapterModal(true);
  };

  const handleOpenEditChapter = (chap) => {
    setEditingChapterId(chap.id);
    setNewChapterTitle(chap.title || '');
    const { topics, pdfPage } = parseChapterTopicsAndPage(chap);
    setNewChapterPdfPage(pdfPage || '');
    setChapterTopics(topics);
    setShowBulkTopicInput(false);
    setBulkTopicText('');
    setShowAddChapterModal(true);
  };

  const handleDeleteChapter = async (chapId, chapTitle) => {
    if (!window.confirm(`Are you sure you want to delete "${chapTitle || 'this chapter'}" from the syllabus?`)) return;
    if (!user || !kid || !subject || !exam) return;
    const chapRef = ref(database, `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${exam.id}/${chapId}`);
    await remove(chapRef);
  };

  const handleSaveChapter = async (e) => {
    e.preventDefault();
    if (!newChapterTitle.trim() || !user || !kid || !subject || !exam) return;

    const cleanTopics = chapterTopics
      .map(t => ({
        id: t.id || `top_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: (t.title || '').trim(),
        page: (t.page || '').trim()
      }))
      .filter(t => t.title.length > 0);

    const basePath = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${exam.id}`;

    if (editingChapterId) {
      const targetChap = chaptersMap[editingChapterId] || {};
      const targetRef = ref(database, `${basePath}/${editingChapterId}`);
      await set(targetRef, {
        ...targetChap,
        title: newChapterTitle.trim(),
        pdfPage: newChapterPdfPage.trim(),
        topics: cleanTopics,
        updatedAt: Date.now()
      });
    } else {
      const chapRef = ref(database, basePath);
      const newChap = push(chapRef);
      await set(newChap, {
        title: newChapterTitle.trim(),
        pdfPage: newChapterPdfPage.trim(),
        topics: cleanTopics,
        completed: false,
        status: 'not_started',
        createdAt: Date.now()
      });
    }

    setEditingChapterId(null);
    setNewChapterTitle('');
    setNewChapterPdfPage('');
    setChapterTopics([]);
    setShowBulkTopicInput(false);
    setBulkTopicText('');
    setShowAddChapterModal(false);
  };

  // Open generator modal
  const handleOpenGenerator = () => {
    const today = new Date().toISOString().split('T')[0];
    const formattedToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const baseTitle = `Model Test - ${formattedToday}`;
    const nextTitle = getNextNumberedTitle(baseTitle, modelTestsList);
    const books = getSubjectBooks(subject);
    setModelTestDate(today);
    setModelTestTitle(nextTitle);
    setModelTestResult('0');
    setSelectedChaptersForTest(chaptersList.map(c => c.id));
    setSelectedBookIdsForTest(books.map(b => b.id));
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
      const selectedChapterTitles = selectedChaptersForTest.map(id => {
        const c = chaptersMap[id];
        if (!c) return '';
        const { topics } = parseChapterTopicsAndPage(c);
        if (topics && topics.length > 0) {
          return `${c.title} (Topics: ${topics.map(t => t.title + (t.page ? ` [p. ${t.page}]` : '')).join(', ')})`;
        }
        return c.title;
      }).filter(Boolean);

      const allSubjectBooks = getSubjectBooks(subject);
      const checkedBooks = allSubjectBooks.filter(b => selectedBookIdsForTest.includes(b.id));
      const govtBook = checkedBooks.find(b => b.isGovtTextbook) || checkedBooks[0] || null;
      const govtTextbookUrl = govtBook ? govtBook.url : (subject?.bookUrl || bookUrl || '').trim();

      // Collect all previously generated questions from existing model tests to strictly avoid similarity & repetition
      const existingQuestionsList = [];
      const usedPassageSnippets = new Set();

      (modelTestsList || []).forEach(test => {
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
      (selectedChaptersForTest || []).forEach(chId => {
        const ch = chaptersMap[chId];
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

      const promptText = `You are an expert school examiner creating a realistic, high quality Model Test for student: ${kid.name || 'Student'}.
Generate a comprehensive Model Test with structured questions strictly formatted according to the syllabus and mark distribution.

Subject: ${subject.title}
Exam Type: ${exam.title}
Model Test Date: ${modelTestDate || 'Today'}
${kid.grade ? `Class / Grade: ${kid.grade}\n` : ''}
Selected Reference Books (from Subject Material PDF section):
${checkedBooks.length > 0
  ? checkedBooks.map((b, idx) => `${idx + 1}. ${b.title}${b.isGovtTextbook ? ' [Official Government Textbook]' : ''}: ${b.url}`).join('\n')
  : '- None selected (use standard curriculum)'}

Syllabus Chapters to cover:
${selectedChapterTitles.length > 0 ? selectedChapterTitles.map(t => `- ${t}`).join('\n') : '- Entire course curriculum'}

Mark Distribution Pattern (STRICT REQUIREMENT - ALLOCATE MARKS AND GENERATE QUESTIONS EXACTLY AS SPECIFIED IN EACH PART):
${testMarkDistribution ? testMarkDistribution : '100 Marks Standard: Section A: 20 MCQs (20 Marks), Section B: Short Questions (30 Marks), Section C: Descriptive / Creative Questions (50 Marks)'}

Difficulty Level: ${testDifficulty}
Guidelines to strictly follow:
${testGuidelines.length > 0 ? testGuidelines.map(g => `- ${g}`).join('\n') : '- Standard school examination best practices'}

${customInstructions ? `Additional Custom Instructions:\n${customInstructions}\n` : ''}

${antiDuplicationSection}

CRITICAL RULES FOR GENERATION:
1. GOVERNMENT TEXTBOOK & REFERENCE BOOKS MANDATE (FROM SUBJECT MATERIAL PDF SECTION):
   ${checkedBooks.length > 0 ? `You MUST take instructions, content, and lessons from the checked books from the Subject Material (PDF) section:\n${checkedBooks.map(b => `   - "${b.title}"${b.isGovtTextbook ? ' (Official Government Textbook)' : ''}: ${b.url}`).join('\n')}` : ''}
   ${govtBook ? `- Primary Government Textbook: "${govtBook.title}" (URL: ${govtBook.url}).
   - For all reading comprehension sections, Seen Passages, dialogues, lessons, and textbook questions (e.g. Part-A: Seen Passage / Questions 1 to 4 for "English for Today, Class Five"):
     a) The text/dialogue MUST be an authentic passage or dialogue directly taken from this official Government Textbook ("${govtBook.title}").
     b) NEVER fabricate or make up imaginary passages when the syllabus specifies a Seen Passage from the government textbook. Use authentic textbook stories, dialogues, characters, and lessons.
     c) ROTATE LESSONS: Do NOT reuse the same passage or characters as previous tests. Pick a fresh story/unit from the textbook (e.g. Raju the Firefighter, Babul & Cyclone Aila, Saikat's Family, A Visit to the Liberation War Museum, The Olympic Games, St. Martin's Island, Eat Healthy, etc.).
     d) All Seen Passage comprehension questions (MCQs, Fill in the blanks, True/False, and Short Questions) must strictly test the student's understanding of this authentic government textbook passage.` : ''}
   - For grammar, vocabulary, or composition questions, align them with the exercises, question patterns, and syllabus items in the selected reference books.
2. MANDATORY - INCLUDE ALL PARTS & SECTIONS: You MUST generate individual question items for EVERY section and question count specified in the Mark Distribution above (e.g. Part 1: MCQ, Part 2: Short Questions, Part 3: Short-Answer, Part 4: Competency-Based / Creative). DO NOT skip or omit Part 1 or Part 2. The output "questions" array MUST include questions for all parts starting from Part 1 to the final part!
3. STRICT ADHERENCE TO MARK DISTRIBUTION: For instance, if a section specifies "8 questions x 7 marks = 56 Marks from chapters 3, 6, 7, 8, 10", generate all individual questions covering those specific chapters with 7 marks each!
4. ZERO MARKDOWN AND ZERO LATEX: DO NOT use markdown bold (**), headers (###), backticks (\`), or LaTeX ($). Use standard plain keyboard symbols: "x", "÷", "+", "-", "/", "%". Every question and answer must be clean, readable text.
5. Return STRICTLY a valid JSON object matching this schema:
{
  "title": "${modelTestTitle.trim() || `${subject.title} - ${exam.title} Model Test`}",
  "fullMarks": 100,
  "timeAllowed": "${modelTestDuration || 60} Minutes",
  "questions": [
    {
      "id": 1,
      "section": "1. Multiple Choice Questions (MCQ)",
      "question": "Clear, complete question text without asterisks or markdown",
      "marks": 1,
      "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "answerKey": "Accurate step-by-step solution or answer key"
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
Ensure the "questions" array contains ALL the individual generated questions covering the required mark distribution without skipping any section.
5. PASSAGE EFFICIENCY: For reading comprehension sections (Seen or Unseen Passages), provide the full reading text in the FIRST question of that passage section (e.g. Question 1 or Question 5). For subsequent questions in that same section, refer to "Based on the passage above" instead of repeating the entire multi-paragraph text.
6. CONCISE ANSWER KEYS: Keep answer keys clear, correct, and succinct.`;

      const questionsText = await generateGeminiContent(promptText, { temperature: 0.85 });

      const rawUserTitle = modelTestTitle.trim() || `Model Test - ${modelTestDate || 'Today'}`;
      const finalTitle = getNextNumberedTitle(rawUserTitle, modelTestsList);
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
        duration: Number(modelTestDuration) || 60,
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
        createdAt: now
      };
      await set(newTestRef, testData);

      setShowGeneratorModal(false);
      openTestViewer({
        subjectId: subject.id,
        examId: exam.id,
        testId: newTestRef.key,
        displayTitle: finalTitle,
        ...testData
      });
    } catch (err) {
      console.error('Error generating test:', err);
      setGenerateError(err.message || 'Failed to generate model test');
    } finally {
      setIsGeneratingTest(false);
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

  // Timer effect
  useEffect(() => {
    if (!viewingModelTest || isExamFinished || !isExamStarted || !examStartedAt) return;

    setTimerSeconds(Math.floor((Date.now() - examStartedAt) / 1000));
    const interval = setInterval(() => {
      setTimerSeconds(Math.floor((Date.now() - examStartedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [viewingModelTest, isExamFinished, isExamStarted, examStartedAt]);

  // Open test viewer modal
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
  };

  const handleUpdateExamDuration = async (newMinutes) => {
    const mins = Math.max(1, Math.min(360, Number(newMinutes) || 60));
    setExamDurationMinutes(mins);
    setViewingModelTest(prev => prev ? ({ ...prev, duration: mins }) : prev);
    if (viewingModelTest && user && kid && subject && exam) {
      try {
        const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
        await set(ref(database, `${path}/duration`), mins);
      } catch (err) {
        console.error('Error saving exam duration:', err);
      }
    }
  };

  const handleSaveSpecificTestDuration = async () => {
    if (!editingDurationModal || !user || !kid || !subject || !exam) return;
    const mins = Math.max(1, Math.min(360, Number(tempDurationValue) || 60));
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${editingDurationModal.testId}/duration`;
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
    if (!viewingModelTest || !user || !kid || !subject || !exam) return;
    const now = Date.now();
    setExamStartedAt(now);
    setIsExamStarted(true);
    try {
      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
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

  const handleFinishAndSubmitExam = async () => {
    if (!viewingModelTest || !user || !kid || !subject || !exam) return;
    const confirmed = window.confirm("Are you sure you want to finish and submit your exam? Once submitted, the timer will stop and answers will be unlocked for review.");
    if (!confirmed) return;

    try {
      setSavingStatus('saving');
      const now = Date.now();
      const timeSpent = examStartedAt ? Math.max(1, Math.floor((now - examStartedAt) / 1000)) : (viewingModelTest.timeSpentSeconds || 0);

      const path = `users/${searchParams.get("parentId") || user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}/${viewingModelTest.testId || viewingModelTest.id}`;
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
      const questionsOnly = modalQuestions.map(q => {
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
    const updated = { ...studentAnswers };
    if (!text || !text.trim()) {
      delete updated[qId];
    } else {
      updated[qId] = text;
    }
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
      const evaluationResult = await autoReviewExamWithAI({
        questions: qList,
        studentAnswers: studentAnswers,
        subjectTitle: subject?.title || '',
        examTitle: exam?.title || '',
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
      const res = await autoReviewExamWithAI({
        questions: [q],
        studentAnswers: studentAnswers,
        subjectTitle: subject?.title || '',
        examTitle: exam?.title || '',
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

  const getEmbedUrl = (url, page) => {
    if (!url) return '';
    let processed = url.trim();
    if (processed.includes('drive.google.com')) {
      processed = processed.replace(/\/view(\?.*)?$/, '/preview');
      if (!processed.includes('/preview')) {
        processed = processed.replace(/\/edit(\?.*)?$/, '/preview');
      }
      if (page) {
        processed += `#page=${page}`;
      }
    } else {
      const hashParams = [];
      if (page) hashParams.push(`page=${page}`);
      hashParams.push('view=Fit');
      hashParams.push('toolbar=0');
      hashParams.push('navpanes=0');
      hashParams.push('scrollbar=0');
      hashParams.push('pagemode=none');
      const cleanUrl = processed.split('#')[0];
      processed = `${cleanUrl}#${hashParams.join('&')}`;
    }
    return processed;
  };

  if (loading) {
    return (
      <main className="view-container" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.5rem clamp(1.25rem, 4vw, 2.5rem)', boxSizing: 'border-box' }}>
        <div className="card" style={{ maxWidth: '900px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>Loading exam workspace...</p>
        </div>
      </main>
    );
  }

  if (!kid || !subject || !exam) {
    return (
      <main className="view-container" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '1.5rem clamp(1.25rem, 4vw, 2.5rem)', boxSizing: 'border-box' }}>
        <div className="card" style={{ maxWidth: '900px', width: '100%', padding: '2.5rem', textAlign: 'center' }}>
          <h2>Exam or Subject not found</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            We couldn't locate the requested exam workspace.
          </p>
          <Link href={`/kid/profile?id=${searchParams.get("id")}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
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

  const defaultDurationMinutes = examDurationMinutes || (viewingModelTest?.duration 
    ? Number(viewingModelTest.duration) 
    : (modalTotalMax <= 20 ? 30 : modalTotalMax <= 50 ? 60 : modalTotalMax <= 100 ? 90 : 120));
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
    modalQuestions.forEach((q, idx) => {
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
    const activeSetNum = modalQuestions[currentSlideIndex]?.setNumber;
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
    <main
      className="view-container"
      style={{
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        padding: '1.5rem clamp(1.25rem, 4vw, 2.5rem)',
        boxSizing: 'border-box'
      }}
    >
      <div className="card" style={{ maxWidth: '100%', width: '100%', padding: 0, margin: 0, background: 'none', border: 'none', borderRadius: 0, boxShadow: 'none', boxSizing: 'border-box' }}>
        
        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: '0.6rem', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            <Link href={`/kid/profile?id=${searchParams.get("id")}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'color 0.2s' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              <span>{kid.name || 'Kid Profile'}</span>
            </Link>
            <span>/</span>
            <span style={{ color: 'var(--text-secondary)' }}>{subject.title}</span>
            <span>/</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{exam.title}</span>
          </div>

          <Link href={`/kid/profile?id=${searchParams.get("id")}`} style={{ padding: '0.24rem 0.6rem', fontSize: '0.74rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-secondary)', textDecoration: 'none', transition: 'all 0.15s ease' }}>
            ← All Subjects
          </Link>
        </div>

        {/* Exam Title & Status Overview Hero */}
        <div
          style={{
            background: 'none',
            border: 'none',
            borderRadius: 0,
            width: '100%',
            padding: 0,
            marginBottom: '3rem',
            paddingBottom: '2.25rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--accent-primary)', fontWeight: 700 }}>
                  Subject Exam Workspace
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>•</span>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{subject.title}</span>
              </div>
              <h1 style={{ margin: 0, fontSize: '2.1rem', color: '#fff', fontWeight: 700, letterSpacing: '-0.5px' }}>
                {exam.title}
              </h1>
            </div>

            {/* Status Selector Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Status:</span>
              <select
                value={examStatus}
                onChange={(e) => handleUpdateExamStatus(e.target.value)}
                style={{
                  padding: '0.24rem 0.65rem',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  border: `1px solid ${examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.4)' : examStatus === 'In Progress' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(234, 179, 8, 0.4)'}`,
                  background: examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.18)' : examStatus === 'In Progress' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(234, 179, 8, 0.18)',
                  color: examStatus === 'Completed' ? '#34d399' : examStatus === 'In Progress' ? '#c084fc' : '#facc15',
                  cursor: 'pointer',
                  outline: 'none',
                  width: 'auto'
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0 }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chapters in Syllabus</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#fff', marginTop: '0.25rem' }}>
                  {totalChaptersCount}
                </div>
              </div>

              <div style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0 }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Model Tests Generated</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent-primary)', marginTop: '0.25rem' }}>
                  {modelTestsList.length}
                </div>
              </div>

              <div style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0 }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Preparation Status</span>
                <div style={{ fontSize: '1.3rem', fontWeight: 600, color: examStatus === 'Completed' ? '#34d399' : '#c084fc', marginTop: '0.35rem' }}>
                  {examStatus}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 0. Subject Material Section (Textbook) */}
        {(() => {
          const subjectBooks = getSubjectBooks(subject);
          const activeBook = subjectBooks.find(b => b.id === selectedBookId) || subjectBooks[0] || null;
          const activeBookUrl = activeBook ? activeBook.url : (subject?.bookUrl || '');

          return (
            <div id="subject-pdf-section" style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0, marginBottom: '2.5rem', width: '100%' }}>
              {/* Header Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"></path></svg>
                  <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 600 }}>Subject Material (PDF)</h2>
                  
                  {subjectBooks.length > 0 && (
                    <span style={{ fontSize: '0.72rem', padding: '0.12rem 0.55rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)', fontWeight: 600 }}>
                      {subjectBooks.length} {subjectBooks.length === 1 ? 'Book' : 'Books'}
                    </span>
                  )}

                  {!isPdfSectionCollapsed && (
                    <span style={{ fontSize: '0.72rem', padding: '0.12rem 0.5rem', borderRadius: '12px', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      {pdfViewMode === 'single' ? 'Single Page View' : 'Full Width View'}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  {/* Collapsible toggle button */}
                  <button
                    type="button"
                    onClick={() => setIsPdfSectionCollapsed(prev => !prev)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: isPdfSectionCollapsed ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.06)',
                      color: isPdfSectionCollapsed ? '#a5b4fc' : 'var(--text-secondary)',
                      border: `1px solid ${isPdfSectionCollapsed ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.1)'}`,
                      padding: '0.24rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title={isPdfSectionCollapsed ? 'Expand PDF section' : 'Collapse PDF section to save space'}
                  >
                    <span>{isPdfSectionCollapsed ? '▼' : '▲'}</span>
                    <span>{isPdfSectionCollapsed ? 'Expand Reader' : 'Collapse'}</span>
                  </button>

                  {/* Add Book Button in Header */}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: false });
                      setShowBookModal(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      background: 'rgba(99, 102, 241, 0.18)',
                      color: '#c7d2fe',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      padding: '0.24rem 0.6rem',
                      borderRadius: '6px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                    title="Add a new reference book or material"
                  >
                    <span>+</span>
                    <span>Add Book</span>
                  </button>

                  {activeBookUrl && !isPdfSectionCollapsed && (
                    <>
                      {/* View Mode Toggle */}
                      <div style={{ display: 'inline-flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '2px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <button
                          type="button"
                          onClick={() => setPdfViewMode('single')}
                          style={{
                            padding: '0.2rem 0.55rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            background: pdfViewMode === 'single' ? 'var(--accent-primary)' : 'transparent',
                            color: pdfViewMode === 'single' ? '#fff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease'
                          }}
                          title="Single Page Mode (fits exactly 1 page in viewport)"
                        >
                          <span>📄</span>
                          <span>Single Page</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPdfViewMode('wide')}
                          style={{
                            padding: '0.2rem 0.55rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: 'none',
                            background: pdfViewMode === 'wide' ? 'var(--accent-primary)' : 'transparent',
                            color: pdfViewMode === 'wide' ? '#fff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            transition: 'all 0.15s ease'
                          }}
                          title="Full Width Mode"
                        >
                          <span>↔️</span>
                          <span>Full Width</span>
                        </button>
                      </div>

                      {/* Scale buttons */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '2px 5px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <button
                          type="button"
                          onClick={() => setPdfScale(prev => Math.max(0.7, parseFloat((prev - 0.1).toFixed(1))))}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.78rem', fontWeight: 700 }}
                          title="Zoom Out"
                        >
                          −
                        </button>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', minWidth: '34px', textAlign: 'center' }}>
                          {Math.round(pdfScale * 100)}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setPdfScale(prev => Math.min(1.4, parseFloat((prev + 0.1).toFixed(1))))}
                          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0.1rem 0.3rem', fontSize: '0.78rem', fontWeight: 700 }}
                          title="Zoom In"
                        >
                          +
                        </button>
                        {pdfScale !== 1 && (
                          <button
                            type="button"
                            onClick={() => setPdfScale(1)}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.68rem', padding: '0 0.15rem' }}
                            title="Reset Zoom"
                          >
                            Reset
                          </button>
                        )}
                      </div>

                      {/* Pop out link */}
                      <a
                        href={getEmbedUrl(activeBookUrl, currentPdfPage)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          textDecoration: 'none',
                          padding: '0.22rem 0.55rem',
                          borderRadius: '6px',
                          fontSize: '0.74rem',
                          fontWeight: 500,
                          border: '1px solid rgba(255,255,255,0.1)',
                          transition: 'all 0.15s ease'
                        }}
                        title="Open Active Book in New Tab"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        <span>Pop Out</span>
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* Book Switcher Pills / Tabs Bar */}
              {subjectBooks.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                  {subjectBooks.map((b) => {
                    const isCurrent = activeBook?.id === b.id;
                    return (
                      <div
                        key={b.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.28rem 0.65rem',
                          borderRadius: '8px',
                          background: isCurrent ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${isCurrent ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.08)'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onClick={() => setSelectedBookId(b.id)}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{b.isGovtTextbook ? '🏛️' : '📖'}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: isCurrent ? 600 : 500, color: isCurrent ? '#fff' : 'var(--text-secondary)' }}>
                          {b.title}
                        </span>
                        {b.isGovtTextbook && (
                          <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600 }}>
                            Govt
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBookData({ id: b.id, title: b.title, url: b.url, isGovtTextbook: b.isGovtTextbook });
                            setShowBookModal(true);
                          }}
                          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '0 0.15rem', fontSize: '0.72rem', marginLeft: '0.2rem' }}
                          title="Edit book details"
                        >
                          ✏️
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: false });
                      setShowBookModal(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.28rem 0.65rem',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px dashed rgba(255,255,255,0.2)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    <span>+</span>
                    <span>Add Another Book</span>
                  </button>
                </div>
              )}

              {/* Collapsed State Summary */}
              {isPdfSectionCollapsed ? (
                <div style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>📚</span>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                        {activeBook ? activeBook.title : 'No Book Selected'}
                        {activeBook?.isGovtTextbook && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.68rem', padding: '0.08rem 0.4rem', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 600 }}>
                            Govt Textbook
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        PDF reader collapsed to save screen space. Click &quot;Expand Reader&quot; to view pages.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {activeBookUrl && (
                      <a
                        href={getEmbedUrl(activeBookUrl, currentPdfPage)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.76rem',
                          color: '#818cf8',
                          padding: '0.3rem 0.6rem',
                          background: 'rgba(99, 102, 241, 0.1)',
                          borderRadius: '6px',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                          textDecoration: 'none'
                        }}
                      >
                        Pop Out ↗
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsPdfSectionCollapsed(false)}
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        color: '#fff',
                        padding: '0.3rem 0.75rem',
                        background: 'var(--accent-primary, #6366f1)',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      ▼ Expand Reader
                    </button>
                  </div>
                </div>
              ) : (
                /* Expanded State: Empty card or Iframe viewer */
                !activeBookUrl ? (
                  <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>📚</span>
                    <span style={{ fontSize: '1rem', fontWeight: '500', color: '#fff', marginBottom: '0.35rem' }}>No Books Configured</span>
                    <span style={{ fontSize: '0.85rem', opacity: 0.7, textAlign: 'center', maxWidth: '340px', marginBottom: '1rem' }}>
                      Add your Government Textbook or Reference PDFs to view lessons here and auto-populate AI question generation.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: true });
                        setShowBookModal(true);
                      }}
                      className="primary"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.82rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      + Add First Book
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      width: '100%',
                      background: 'none',
                      borderRadius: 0,
                      padding: 0,
                      border: 'none'
                    }}
                  >
                    {/* Single page viewport-optimized frame */}
                    <div
                      style={{
                        position: 'relative',
                        width: pdfViewMode === 'single' ? 'min(100%, calc(82vh * 0.73))' : '100%',
                        height: 'clamp(520px, 82vh, 880px)',
                        maxHeight: '85vh',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        background: '#121214',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        transition: 'width 0.25s ease'
                      }}
                    >
                      <iframe
                        key={`${getEmbedUrl(activeBookUrl, currentPdfPage)}-${pdfScale}`}
                        src={getEmbedUrl(activeBookUrl, currentPdfPage)}
                        width="100%"
                        height="100%"
                        title="Subject PDF Viewer"
                        style={{
                          width: pdfScale === 1 ? '100%' : `${100 / pdfScale}%`,
                          height: pdfScale === 1 ? '100%' : `${100 / pdfScale}%`,
                          transform: pdfScale === 1 ? 'none' : `scale(${pdfScale})`,
                          transformOrigin: 'top center',
                          border: 'none',
                          background: '#fff'
                        }}
                      />
                    </div>

                    {/* Informative footer */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginTop: '0.65rem', padding: '0 0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Currently viewing: <strong style={{ color: '#fff' }}>{activeBook?.title}</strong> ({pdfViewMode === 'single' ? 'Single page' : 'Full width'}). Use scale controls or click chapter pages below to navigate.
                      </span>
                      {currentPdfPage > 1 && (
                        <button
                          type="button"
                          onClick={() => setCurrentPdfPage(1)}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.74rem', cursor: 'pointer', padding: 0 }}
                        >
                          Jump to Cover (p. 1)
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          );
        })()}

        {/* 1. Mark Distribution Section */}
        <div style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0, marginBottom: '3rem', width: '100%', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 600 }}>Mark Distribution</h2>
            </div>

            {!isEditingMarkDist && (
              <button
                type="button"
                onClick={() => setIsEditingMarkDist(true)}
                title={markDistValue ? 'Edit Distribution' : 'Set Mark Distribution'}
                style={{
                  width: '26px',
                  height: '26px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(139, 92, 246, 0.12)',
                  color: 'var(--accent-primary)',
                  border: '1px solid rgba(139, 92, 246, 0.28)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.25)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.55)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.28)'; }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
            )}
          </div>

          {isEditingMarkDist ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Enter or paste syllabus mark distribution (Markdown and LaTeX are auto-cleaned)
                </span>
                <button
                  type="button"
                  onClick={handleCleanMarkDistWithAI}
                  disabled={isCleaningMarkDistAI}
                  style={{
                    padding: '0.24rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    background: isCleaningMarkDistAI
                      ? 'rgba(139, 92, 246, 0.4)'
                      : 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                    border: '1px solid rgba(139, 92, 246, 0.45)',
                    borderRadius: '5px',
                    color: '#c4b5fd',
                    cursor: isCleaningMarkDistAI ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    opacity: isCleaningMarkDistAI ? 0.75 : 1,
                    transition: 'all 0.15s ease'
                  }}
                  title="Use AI to structure syllabus by Part, standardize question numbers, and clean mark formulas"
                >
                  {isCleaningMarkDistAI ? (
                    <>
                      <span>⏳</span>
                      <span>Structuring with AI...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Clean & Organize</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                value={markDistValue}
                onChange={(e) => setMarkDistValue(e.target.value)}
                placeholder={`e.g.\nPart-A: Reading Test (25 Marks)\n1. Matching Words: 1 × 5 = 5 marks\n   - Match words from Column A with meanings in Column B\n2. True or False: 1 × 5 = 5 marks\nTotal: 100 marks`}
                rows={9}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid var(--accent-primary)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '0.82rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  lineHeight: 1.5,
                  resize: 'vertical'
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCleanMarkDistWithAI}
                    disabled={isCleaningMarkDistAI}
                    style={{
                      padding: '0.22rem 0.6rem',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      background: isCleaningMarkDistAI
                        ? 'rgba(139, 92, 246, 0.4)'
                        : 'rgba(139, 92, 246, 0.2)',
                      border: '1px solid rgba(139, 92, 246, 0.4)',
                      borderRadius: '5px',
                      color: '#c4b5fd',
                      cursor: isCleaningMarkDistAI ? 'wait' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      opacity: isCleaningMarkDistAI ? 0.75 : 1
                    }}
                  >
                    {isCleaningMarkDistAI ? (
                      <>
                        <span>⏳</span>
                        <span>Structuring with AI...</span>
                      </>
                    ) : (
                      <>
                        <span>✨</span>
                        <span>Clean & Organize</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMarkDistValue(`Part\u2013A: Seen Passage (25 Marks)\n   - Read the text/dialogue and answer questions 1, 2, 3 and 4. (This text/dialogue will be taken from English for Today, Class Five.)\n1. Multiple Choice Questions (MCQ): 1 \u00d7 5 = 5 marks\n2. Fill in the Blanks: 1 \u00d7 5 = 5 marks\n3. Write True/False for each statement: 1 \u00d7 5 = 5 marks\n4. Answering Short Questions: 2 \u00d7 5 = 10 marks\n   - Five questions will be set based on the text. Students must answer them in complete sentences demonstrating understanding of the passage.\n\nPart\u2013B: Unseen Passage (10 Marks)\n   - Read the text/dialogue and answer the questions 5 and 6.\n5. Matching words with their meanings: 1 \u00d7 5 = 5 marks\n6. Writing question answers in short: 1 + 2 + 2 = 5 marks\n   - Three (3) short questions will be given covering knowledge, understanding, and higher-order thinking.\n\nPart\u2013C: Grammar & Vocabulary (35 Marks)\n7. Rearranging words to make meaningful sentences: 1 \u00d7 5 = 5 marks\n8. WH-Questions: 2 \u00d7 5 = 10 marks\n   - Five statements will be provided. Students will frame WH-questions (Who, What, When, Where, Why, How).\n9. Use of Punctuation and Capital Letters: 1 \u00d7 5 = 5 marks\n10. Complete the sentences with the correct form of verbs in brackets: 1 \u00d7 5 = 5 marks\n11. Using correct prepositions (Filling in the blanks): 1 \u00d7 5 = 5 marks\n12. Articles (Filling in the blanks): 1 \u00d7 5 = 5 marks\n\nPart\u2013D: Writing Part (30 Marks)\n13. Writing a Short Composition with or without clues: 10 marks\n14. Writing informal/formal letter with or without clues: 10 marks\n15. Writing an email with or without clues: 10 marks\n\nTotal: 100 Marks`)}
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.18))', border: '1px solid rgba(99,102,241,0.45)', borderRadius: '4px', color: '#c7d2fe', cursor: 'pointer', fontWeight: 600 }}
                  >
                    📚 Class 5 English (100M)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkDistValue("MCQ: 20 marks\nShort Questions: 30 marks\nCreative/Descriptive: 50 marks\nTotal: 100 marks")}
                    style={{ padding: '0.2rem 0.52rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    + 100 Marks Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarkDistValue("MCQ: 15 marks\nShort Questions: 15 marks\nCreative Questions: 20 marks\nTotal: 50 marks")}
                    style={{ padding: '0.2rem 0.52rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  >
                    + 50 Marks CT
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.45rem' }}>
                  <button
                    type="button"
                    onClick={() => setIsEditingMarkDist(false)}
                    style={{ padding: '0.26rem 0.65rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveMarkDistribution}
                    className="primary"
                    style={{ padding: '0.26rem 0.75rem', fontSize: '0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Save Distribution
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <MarkDistributionView
              value={markDistValue}
              onEdit={() => setIsEditingMarkDist(true)}
              defaultLayout="cards"
              showWeightageBar={true}
            />
          )}
        </div>

        {/* 2. Syllabus & Chapters Section */}
        <div style={{ marginBottom: '2.5rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.6rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 600 }}>
                Syllabus & Chapters ({totalChaptersCount})
              </h2>
            </div>

            <button
              type="button"
              onClick={handleOpenAddChapter}
              style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 500, transition: 'all 0.15s ease' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Chapter</span>
            </button>
          </div>

          {chaptersList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {chaptersList.map((chap, idx) => {
                const isCompleted = chap.completed || chap.status === 'completed';
                const chapSlug = chap.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const queryParentId = searchParams.get("parentId");
                const parentIdQuery = queryParentId ? `?parentId=${queryParentId}` : '';
                const readHref = `/kid/chapter?id=${searchParams.get("id")}&subject=${subjectSlug}&chapter=${chapSlug}${parentIdQuery.replace('?', '&')}`;
                const { topics: displayTopics, pdfPage: displayPdfPage } = parseChapterTopicsAndPage(chap);

                return (
                  <div
                    key={chap.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      padding: '0.85rem 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: idx === chaptersList.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      gap: '0.75rem',
                      width: '100%',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                      {/* Checkbox for chapter completion */}
                      <button
                        type="button"
                        onClick={() => handleToggleChapterComplete(chap.id, isCompleted)}
                        style={{
                          width: '20px',
                          height: '20px',
                          marginTop: '2px',
                          borderRadius: '5px',
                          border: `1.5px solid ${isCompleted ? '#10b981' : 'rgba(255,255,255,0.28)'}`,
                          background: isCompleted ? '#10b981' : 'transparent',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          transition: 'all 0.2s',
                          padding: 0
                        }}
                        title={isCompleted ? 'Mark as incomplete' : 'Mark as completed'}
                      >
                        {isCompleted && '✓'}
                      </button>

                      <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.94rem', fontWeight: 600, color: isCompleted ? '#34d399' : '#fff' }}>
                            {chap.title}
                          </span>
                          {displayPdfPage && (
                            <button
                              type="button"
                              onClick={() => {
                                const cleanNum = parseInt(String(displayPdfPage).match(/\d+/)?.[0] || '1', 10);
                                setCurrentPdfPage(cleanNum);
                                const pdfEl = document.getElementById('subject-pdf-section');
                                if (pdfEl) pdfEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              style={{
                                fontSize: '0.68rem',
                                color: 'var(--accent-primary)',
                                background: 'rgba(139, 92, 246, 0.12)',
                                border: '1px solid rgba(139, 92, 246, 0.28)',
                                padding: '0.1rem 0.42rem',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                transition: 'all 0.15s ease'
                              }}
                              title={`Jump PDF viewer to page ${displayPdfPage}`}
                            >
                              <span>📄 p. {displayPdfPage}</span>
                            </button>
                          )}
                        </div>

                        {/* Topics / Subtopics list if any */}
                        {displayTopics && displayTopics.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.45rem' }}>
                            {displayTopics.map((top, tIdx) => (
                              <span
                                key={top.id || tIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontSize: '0.74rem',
                                  padding: '0.18rem 0.48rem',
                                  borderRadius: '5px',
                                  background: 'rgba(255, 255, 255, 0.05)',
                                  border: '1px solid rgba(255, 255, 255, 0.1)',
                                  color: '#e2e8f0',
                                  lineHeight: 1.3
                                }}
                              >
                                <span style={{ opacity: 0.85 }}>{top.title}</span>
                                {top.page && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const cleanNum = parseInt(String(top.page).match(/\d+/)?.[0] || '1', 10);
                                      setCurrentPdfPage(cleanNum);
                                      const pdfEl = document.getElementById('subject-pdf-section');
                                      if (pdfEl) pdfEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }}
                                    title={`Jump PDF to page ${top.page}`}
                                    style={{
                                      fontSize: '0.65rem',
                                      padding: '0.05rem 0.32rem',
                                      borderRadius: '3px',
                                      background: 'rgba(139, 92, 246, 0.28)',
                                      color: '#d8b4fe',
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontWeight: 600,
                                      lineHeight: 1.2
                                    }}
                                  >
                                    p. {top.page}
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}

                        <span style={{ fontSize: '0.74rem', color: isCompleted ? '#34d399' : 'var(--text-secondary)', opacity: 0.85, marginTop: '0.3rem', display: 'block' }}>
                          {isCompleted ? 'Status: Mastered & Completed' : 'Status: To Study / In Progress'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      {/* Edit Chapter Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenEditChapter(chap)}
                        style={{
                          padding: '0.24rem 0.55rem',
                          fontSize: '0.72rem',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#e2e8f0',
                          border: '1px solid rgba(255,255,255,0.12)',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          transition: 'all 0.15s'
                        }}
                        title="Edit chapter title, page and topics"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        <span>Edit</span>
                      </button>

                      {/* Delete Chapter Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteChapter(chap.id, chap.title)}
                        style={{
                          padding: '0.24rem 0.45rem',
                          fontSize: '0.72rem',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#f87171',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.15s'
                        }}
                        title="Delete chapter"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>

                      <Link
                        href={readHref}
                        style={{
                          padding: '0.26rem 0.65rem',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: 'var(--accent-primary)',
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{isStudentView ? 'Study' : 'Questions'}</span>
                        <span>{isStudentView ? '📖' : '⚡'}</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                No chapters added to this syllabus yet. Click <strong>Add Chapter</strong> to organize the exam curriculum.
              </p>
            </div>
          )}
        </div>

        {/* 3. Model Tests Workspace */}
        <div style={{ background: 'none', border: 'none', borderRadius: 0, padding: 0, marginBottom: '3rem', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 600 }}>
                Model Tests ({modelTestsList.length})
              </h2>
            </div>

            <button
              type="button"
              onClick={handleOpenGenerator}
              className="primary"
              style={{ padding: '0.28rem 0.72rem', fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Generate Model Test</span>
            </button>
          </div>

          {modelTestsList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
              {modelTestsList.map((test, idx) => {
                const displayTitle = numberedTitleMap[test.id] || test.title || `Model Test - ${test.date}`;
                const genTime = formatGeneratedTime(test);
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
                      padding: '0.85rem 0',
                      background: 'none',
                      border: 'none',
                      borderBottom: idx === modelTestsList.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 0,
                      flexWrap: 'wrap',
                      gap: '0.65rem',
                      width: '100%'
                    }}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.94rem', fontWeight: 600, color: '#fff' }}>
                          {displayTitle}
                        </span>
                        {test.difficulty && (
                          <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                            {test.difficulty}
                          </span>
                        )}
                        {test.uploadedPages && test.uploadedPages.length > 0 && (
                          <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(59,130,246,0.18)', color: '#60a5fa', fontWeight: 600 }}>
                            📄 {test.uploadedPages.length} {test.uploadedPages.length === 1 ? 'Page' : 'Pages'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span>📅 {test.date || 'No date'}</span>
                        {genTime && (
                          <span style={{ color: '#cbd5e1', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            • 🕒 {genTime}
                          </span>
                        )}
                        {test.chapters && test.chapters.length > 0 && (
                          <span>• {test.chapters.length} chapters covered</span>
                        )}
                        <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                          • ⏱️ {test.duration ? `${test.duration}m limit` : '60m limit'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {/* Interactive Time Limit Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDurationModal({
                            testId: test.id,
                            title: displayTitle,
                            currentDuration: test.duration || 60
                          });
                          setTempDurationValue(test.duration || 60);
                        }}
                        style={{
                          padding: '0.24rem 0.58rem',
                          fontSize: '0.74rem',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          fontWeight: 600,
                          transition: 'all 0.15s ease'
                        }}
                        title="Set or customize exam time limit"
                      >
                        <span>⏱️</span>
                        <span>{test.duration ? `${test.duration}m` : 'Set Time'}</span>
                        <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>✏️</span>
                      </button>

                      {/* Result Badge */}
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 600,
                          padding: '0.2rem 0.58rem',
                          borderRadius: '16px',
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
                        onClick={() => openTestViewer({ ...test, subjectId: subject.id, examId: exam.id, testId: test.id, displayTitle, generatedTime: genTime || test.generatedTime })}
                        style={{ padding: '0.25rem 0.65rem', fontSize: '0.74rem', background: 'rgba(139, 92, 246, 0.18)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.35)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        <span>Open Test</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteModelTest(test.id)}
                        style={{ padding: '0.25rem 0.35rem', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                        title="Delete test"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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

      {/* Add / Edit Chapter & Topics Modal */}
      {showAddChapterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '580px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '1.4rem', textAlign: 'left', borderRadius: '12px', background: '#131127', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 50px rgba(0,0,0,0.7)' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.65rem', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>
                  {editingChapterId ? 'Edit Chapter & Topics' : 'Add Chapter / Unit'}
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                  Organize syllabus units, subtopics, and textbook pages
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddChapterModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem 0.4rem', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Form Scrollable Body */}
            <form onSubmit={handleSaveChapter} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto', gap: '1rem', paddingRight: '0.2rem' }}>
              
              {/* Chapter Title & Page Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Chapter / Unit Title *
                  </label>
                  <input
                    type="text"
                    value={newChapterTitle}
                    onChange={(e) => setNewChapterTitle(e.target.value)}
                    placeholder="e.g. Grammar, Paragraph, Unit 11-20"
                    required
                    style={{ width: '100%', padding: '0.55rem 0.7rem', fontSize: '0.88rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                    autoFocus
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                    Page Range (Opt.)
                  </label>
                  <input
                    type="text"
                    value={newChapterPdfPage}
                    onChange={(e) => setNewChapterPdfPage(e.target.value)}
                    placeholder="e.g. 54-106"
                    style={{ width: '100%', padding: '0.55rem 0.7rem', fontSize: '0.88rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff' }}
                  />
                </div>
              </div>

              {/* Topics / Subtopics Section */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0' }}>
                      Topics & Syllabus Items ({chapterTopics.length})
                    </label>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Add individual topics, essays, or rules with their own page numbers
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => setShowBulkTopicInput(!showBulkTopicInput)}
                      style={{
                        padding: '0.24rem 0.55rem',
                        fontSize: '0.72rem',
                        background: showBulkTopicInput ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.06)',
                        color: showBulkTopicInput ? 'var(--accent-primary)' : '#e2e8f0',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span>📋</span>
                      <span>{showBulkTopicInput ? 'Hide Bulk' : 'Bulk Paste'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setChapterTopics([
                          ...chapterTopics,
                          { id: `top_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, title: '', page: '' }
                        ]);
                      }}
                      style={{
                        padding: '0.24rem 0.6rem',
                        fontSize: '0.72rem',
                        background: 'rgba(139, 92, 246, 0.15)',
                        color: 'var(--accent-primary)',
                        border: '1px solid rgba(139, 92, 246, 0.3)',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.2rem'
                      }}
                    >
                      <span>+</span>
                      <span>Add Topic</span>
                    </button>
                  </div>
                </div>

                {/* Bulk Paste Box */}
                {showBulkTopicInput && (
                  <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px dashed rgba(139, 92, 246, 0.4)', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.74rem', color: '#c4b5fd', marginBottom: '0.4rem', lineHeight: 1.4 }}>
                      💡 Paste multiple topics or Roman numeral lists (e.g. <code>(i) Parts of Speech (ii) Tense p. 54</code> or each topic on a new line). We will auto-extract titles and page numbers.
                    </div>
                    <textarea
                      rows={3}
                      value={bulkTopicText}
                      onChange={(e) => setBulkTopicText(e.target.value)}
                      placeholder="(i) Parts of Speech with classifications (ii) Tense p. 54 (iii) Prepositions p. 58"
                      style={{ width: '100%', padding: '0.5rem', fontSize: '0.82rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#fff', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setBulkTopicText('');
                          setShowBulkTopicInput(false);
                        }}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!bulkTopicText.trim()) return;
                          const parsed = parseTopicsFromText(bulkTopicText);
                          if (parsed.length > 0) {
                            setChapterTopics([...chapterTopics, ...parsed]);
                            setBulkTopicText('');
                            setShowBulkTopicInput(false);
                          }
                        }}
                        style={{ padding: '0.22rem 0.65rem', fontSize: '0.72rem', background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Parse & Append Topics
                      </button>
                    </div>
                  </div>
                )}

                {/* Topic Items List */}
                {chapterTopics.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '240px', overflowY: 'auto', paddingRight: '0.2rem' }}>
                    {chapterTopics.map((top, tIdx) => (
                      <div
                        key={top.id || tIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          padding: '0.35rem 0.5rem'
                        }}
                      >
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '22px', textAlign: 'center', flexShrink: 0, fontWeight: 600 }}>
                          #{tIdx + 1}
                        </span>

                        <input
                          type="text"
                          value={top.title}
                          onChange={(e) => {
                            const updated = [...chapterTopics];
                            updated[tIdx] = { ...updated[tIdx], title: e.target.value };
                            setChapterTopics(updated);
                          }}
                          placeholder="Topic / item title (e.g. Tense and Verb forms)"
                          style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.82rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff' }}
                        />

                        <input
                          type="text"
                          value={top.page || ''}
                          onChange={(e) => {
                            const updated = [...chapterTopics];
                            updated[tIdx] = { ...updated[tIdx], page: e.target.value };
                            setChapterTopics(updated);
                          }}
                          placeholder="p. 54"
                          style={{ width: '70px', padding: '0.35rem 0.4rem', fontSize: '0.82rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: '#fff', textAlign: 'center' }}
                          title="Textbook page number for this topic"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            const updated = chapterTopics.filter((_, i) => i !== tIdx);
                            setChapterTopics(updated);
                          }}
                          style={{ padding: '0.25rem 0.4rem', background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1 }}
                          title="Remove topic"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: '1rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    No topics added yet. Click <strong>+ Add Topic</strong> or <strong>📋 Bulk Paste</strong> to include specific syllabus items.
                  </div>
                )}
              </div>

              {/* Modal Actions Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  type="button"
                  onClick={() => setShowAddChapterModal(false)}
                  style={{ padding: '0.38rem 0.85rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary"
                  style={{ padding: '0.38rem 1rem', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {editingChapterId ? 'Save Changes' : 'Add Chapter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Book Modal */}
      {showBookModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '1.5rem', textAlign: 'left', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>📚</span>
                <span>{editingBookData.id ? 'Edit Book / Material' : 'Add Book / Material'}</span>
              </h3>
              <button
                type="button"
                onClick={() => { setShowBookModal(false); setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: false }); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              handleSaveBook(editingBookData);
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 500 }}>
                  Book / Material Title <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. English for Today (Govt Textbook) or Grammar Guide"
                  value={editingBookData.title}
                  onChange={(e) => setEditingBookData(prev => ({ ...prev, title: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem', fontWeight: 500 }}>
                  PDF URL or Link <span style={{ color: '#f87171' }}>*</span>
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://... (Google Drive preview, direct PDF, or web link)"
                  value={editingBookData.url}
                  onChange={(e) => setEditingBookData(prev => ({ ...prev, url: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                />
                <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                  Supports Google Drive PDF links (e.g. drive.google.com/file/d/.../view) and direct .pdf links.
                </span>
              </div>

              <div style={{ marginBottom: '1.25rem', padding: '0.75rem', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem', cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={editingBookData.isGovtTextbook}
                    onChange={(e) => setEditingBookData(prev => ({ ...prev, isGovtTextbook: e.target.checked }))}
                    style={{ width: '16px', height: '16px', marginTop: '2px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                  />
                  <div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#c7d2fe', display: 'block' }}>
                      ⭐ Official Government Textbook
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.35, display: 'block', marginTop: '0.15rem' }}>
                      Mark this as the official board textbook. The AI question generator will strictly use it as the source for Seen Passages and curriculum lessons.
                    </span>
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: editingBookData.id ? 'space-between' : 'flex-end', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.08)', gap: '0.5rem' }}>
                {editingBookData.id && (
                  <button
                    type="button"
                    onClick={() => {
                      handleDeleteBook(editingBookData.id);
                      setShowBookModal(false);
                    }}
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.78rem', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Delete Book
                  </button>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => { setShowBookModal(false); setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: false }); }}
                    style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bookSaveLoading}
                    className="primary"
                    style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    {bookSaveLoading ? 'Saving...' : (editingBookData.id ? 'Save Changes' : 'Add Book')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Model Test Generator Modal */}
      {showGeneratorModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '680px', width: '100%', height: '80vh', maxHeight: '80vh', display: 'flex', flexDirection: 'column', textAlign: 'left', padding: '1.5rem', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem', flexShrink: 0 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#fff' }}>Generate Model Test</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{subject?.title} • {exam?.title}</span>
              </div>
              <button
                onClick={() => setShowGeneratorModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.3rem', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '4px' }}
              >
                ✕
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem', paddingRight: '0.35rem' }}>
              {generateError && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                  {generateError}
                </div>
              )}

              {/* Anti-Duplication Active Banner */}
              {modelTestsList.length > 0 && (
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
                    <span>All {totalExistingQuestionsCount > 0 ? <strong>{totalExistingQuestionsCount}</strong> : ''} previous questions across your <strong>{modelTestsList.length}</strong> existing model {modelTestsList.length === 1 ? 'test' : 'tests'} are strictly excluded. Gemini will rotate Seen Passages and generate 100% fresh, non-repetitive questions.</span>
                  </div>
                </div>
              )}

              {/* Title, Date & Time Limit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500 }}>Test Title</label>
                  <input
                    type="text"
                    value={modelTestTitle}
                    onChange={(e) => setModelTestTitle(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.65rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500 }}>Date</label>
                  <input
                    type="date"
                    value={modelTestDate}
                    onChange={(e) => setModelTestDate(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.65rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#38bdf8', marginBottom: '0.25rem', fontWeight: 600 }}>⏱️ Exam Time (Mins)</label>
                  <input
                    type="number"
                    min={5}
                    max={360}
                    value={modelTestDuration}
                    onChange={(e) => setModelTestDuration(Math.max(1, Number(e.target.value) || 0))}
                    placeholder="60"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.65rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: '8px', color: '#38bdf8', fontSize: '0.88rem', fontWeight: 700 }}
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

              {/* Reference Books to Include with Interactive Checkboxes */}
              {(() => {
                const books = getSubjectBooks(subject);
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
                      <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: '8px', fontSize: '0.75rem', color: '#facc15', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>No books added in Subject Material. Generation will use general syllabus curriculum.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingBookData({ id: null, title: '', url: '', isGovtTextbook: true });
                            setShowBookModal(true);
                          }}
                          style={{ background: 'rgba(234, 179, 8, 0.2)', border: '1px solid rgba(234, 179, 8, 0.35)', color: '#fff', fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: '5px', cursor: 'pointer', fontWeight: 600 }}
                        >
                          + Add Book
                        </button>
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

              {/* Syllabus Chapters to Cover with Modern Styled Checkboxes */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #6366f1)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                    Chapters to Include
                    <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#a5b4fc', fontWeight: 600 }}>
                      {selectedChaptersForTest.length} of {chaptersList.length} selected
                    </span>
                  </label>
                  {chaptersList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedChaptersForTest.length === chaptersList.length) {
                          setSelectedChaptersForTest([]);
                        } else {
                          setSelectedChaptersForTest(chaptersList.map(c => c.id));
                        }
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary, #818cf8)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: '0.1rem 0.3rem',
                        textDecoration: 'underline',
                        textUnderlineOffset: '2px'
                      }}
                    >
                      {selectedChaptersForTest.length === chaptersList.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {chaptersList.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '0.45rem',
                      maxHeight: '170px',
                      overflowY: 'auto',
                      background: 'rgba(10, 15, 28, 0.65)',
                      padding: '0.6rem',
                      borderRadius: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)'
                    }}
                  >
                    {chaptersList.map(chap => {
                      const isSel = selectedChaptersForTest.includes(chap.id);
                      return (
                        <div
                          key={chap.id}
                          onClick={() => {
                            if (isSel) setSelectedChaptersForTest(prev => prev.filter(id => id !== chap.id));
                            else setSelectedChaptersForTest(prev => [...prev, chap.id]);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            padding: '0.5rem 0.65rem',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            background: isSel
                              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.14) 100%)'
                              : 'rgba(255, 255, 255, 0.025)',
                            border: `1px solid ${isSel ? 'rgba(129, 140, 248, 0.5)' : 'rgba(255, 255, 255, 0.07)'}`,
                            boxShadow: isSel ? '0 2px 8px rgba(99, 102, 241, 0.15)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {/* Modern Custom Checkbox Box */}
                          <div
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '5px',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isSel ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(0, 0, 0, 0.4)',
                              border: `1px solid ${isSel ? '#a5b4fc' : 'rgba(255, 255, 255, 0.22)'}`,
                              boxShadow: isSel ? '0 0 6px rgba(99, 102, 241, 0.5)' : 'none',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {isSel && (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: isSel ? 600 : 400,
                              color: isSel ? '#f8fafc' : '#cbd5e1',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                            title={chap.title}
                          >
                            {chap.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No syllabus chapters. General subject concepts will be covered.</p>
                )}
              </div>

              {/* Mark Distribution Preview */}
              <MarkDistributionField
                value={testMarkDistribution}
                onChange={setTestMarkDistribution}
                label="Mark Distribution Pattern"
                maxHeight="280px"
              />

              {/* Difficulty & Guidelines */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500 }}>Difficulty</label>
                  <select
                    value={testDifficulty}
                    onChange={(e) => setTestDifficulty(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.65rem', background: '#1e1b4b', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="Easy">Easy (Foundation)</option>
                    <option value="Standard">Standard (Board level)</option>
                    <option value="Difficult">Difficult (Challenging)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem', fontWeight: 500 }}>Custom Instruction (Max 200 words)</label>
                  <input
                    type="text"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Focus on word problems and LCM/HCF concepts"
                    style={{ width: '100%', padding: '0.55rem 0.65rem', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>

            {/* Actions Footer - Fixed at bottom */}
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleGenerateModelTest}
                disabled={isGeneratingTest}
                className="primary"
                style={{ flex: 1, padding: '0.45rem 1rem', fontSize: '0.82rem', borderRadius: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: isGeneratingTest ? 'not-allowed' : 'pointer' }}
              >
                {isGeneratingTest ? 'Generating with Gemini AI...' : '✨ Generate Model Test'}
              </button>
              <button
                type="button"
                onClick={() => setShowGeneratorModal(false)}
                style={{ padding: '0.45rem 1.1rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Test Question Paper, Answer Sheet & Grading - FULL PAGE VIEW */}
      {viewingModelTest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          background: '#090d16',
          zIndex: 9999,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Top Sticky Header */}
          <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: 'rgba(15, 23, 42, 0.96)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0.8rem 1.75rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.8rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <button
                type="button"
                onClick={() => setViewingModelTest(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#fff',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>←</span>
                <span>Exit Exam</span>
              </button>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h1 style={{ margin: 0, fontSize: '1.2rem', color: '#fff', fontWeight: 700 }}>
                    {viewingModelTest.displayTitle || viewingModelTest.title || 'Model Test'}
                  </h1>
                  {viewingModelTest.difficulty && (
                    <span style={{ padding: '0.1rem 0.5rem', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#c4b5fd', fontWeight: 600, fontSize: '0.72rem' }}>
                      {viewingModelTest.difficulty}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                  <span>📅 {viewingModelTest.date || 'Today'}</span>
                  {(viewingModelTest.generatedTime || formatGeneratedTime(viewingModelTest)) && (
                    <span style={{ color: '#e2e8f0', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      • 🕒 {viewingModelTest.generatedTime || formatGeneratedTime(viewingModelTest)}
                    </span>
                  )}
                  <span>•</span>
                  <span>Total Marks: <strong style={{ color: '#fff' }}>{modalTotalMax}</strong></span>
                  <span>•</span>
                  <span style={{ color: '#34d399', fontWeight: 600 }}>Result {currentModalDisplayResult}</span>
                </div>
                {viewingModelTest.checkedBooks && viewingModelTest.checkedBooks.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Reference Books:</span>
                    {viewingModelTest.checkedBooks.map((b, bIdx) => (
                      <a
                        key={b.id || bIdx}
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          color: '#c7d2fe',
                          fontSize: '0.7rem',
                          textDecoration: 'none',
                          fontWeight: 500
                        }}
                        title={`Open ${b.title} in new tab`}
                      >
                        <span>{b.isGovtTextbook ? '🏛️' : '📖'}</span>
                        <span>{b.title}</span>
                        <span>↗</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              
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

              {/* Mode Switcher */}
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', padding: '0.2rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
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

            {/* Notification Banner */}
            {notificationMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#34d399', padding: '0.6rem 1rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem', fontWeight: 600 }}>
                {notificationMsg}
              </div>
            )}

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
                    Contains <strong>{modalQuestions.length} Questions</strong> ({modalTotalMax} Marks). You can browse and navigate the question sets below, adjust your exam duration, and start when ready!
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                  {questionDisplayMode === 'slide' 
                    ? `Question ${modalQuestions[currentSlideIndex]?.displayNumber || currentSlideIndex + 1} of ${modalQuestions.length}`
                    : `All Questions (${modalQuestions.length})`}
                </span>
                {questionDisplayMode === 'slide' && modalQuestions[currentSlideIndex] && (
                  <span style={{ fontSize: '0.8rem', color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.25)', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                    Set {modalQuestions[currentSlideIndex].setNumber}: {modalQuestions[currentSlideIndex].cleanSectionTitle}
                  </span>
                )}
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.15rem 0.6rem', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
                  {testViewMode === 'student' ? `${modalAnsweredCount}/${modalQuestions.length} Answered` : `${modalGradedCount}/${modalQuestions.length} Graded • Awarded: ${modalAwardedSum}/${modalTotalMax}`}
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

            {/* Slide Progress Bar */}
            {questionDisplayMode === 'slide' && modalQuestions.length > 0 && (
              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.75rem' }}>
                <div style={{ width: `${((currentSlideIndex + 1) / Math.max(1, modalQuestions.length)) * 100}%`, height: '100%', background: 'var(--accent-gradient)', transition: 'width 0.25s ease-out' }} />
              </div>
            )}

            {/* Contained Question Navigator: Collapsed Single-Line View */}
            {modalQuestions.length > 0 && isNavigatorCollapsed && (
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
                    Question Navigator ({modalQuestions.length} Questions • {questionSets.length} Sets)
                  </span>
                  {modalQuestions[currentSlideIndex] && (
                    <span style={{ fontSize: '0.74rem', color: '#c4b5fd', background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.25)', padding: '0.12rem 0.5rem', borderRadius: '6px' }}>
                      Current: Q{modalQuestions[currentSlideIndex].displayNumber} (Set {modalQuestions[currentSlideIndex].setNumber})
                    </span>
                  )}
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    {testViewMode === 'student' ? `${modalAnsweredCount}/${modalQuestions.length} Answered` : `${modalGradedCount}/${modalQuestions.length} Graded`}
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
            {modalQuestions.length > 0 && !isNavigatorCollapsed && (
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
                      All ({modalQuestions.length})
                    </button>
                    {questionSets.map(s => {
                      const isFilterActive = selectedSetFilter === s.setNumber;
                      const isCurrentActive = modalQuestions[currentSlideIndex]?.setNumber === s.setNumber;
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
                        const isSetCurrent = modalQuestions[currentSlideIndex]?.setNumber === s.setNumber;
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
                      ? modalQuestions
                      : modalQuestions.filter(q => q.setNumber === selectedSetFilter)
                    ).map((q, filteredIdx) => {
                      const originalIdx = modalQuestions.findIndex(orig => orig.id === q.id);
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
                  <div key={q.id || actualIndex}>
                    {/* Set Divider in List View */}
                    {questionDisplayMode !== 'slide' && (idx === 0 || modalQuestions[idx - 1]?.setNumber !== q.setNumber) && (
                      <div style={{
                        marginTop: idx > 0 ? '1.5rem' : '0.5rem',
                        marginBottom: '0.75rem',
                        padding: '0.75rem 1.1rem',
                        background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.18), rgba(0,0,0,0.25))',
                        borderLeft: '4px solid var(--accent-primary)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Set {q.setNumber}
                          </span>
                          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                            {q.cleanSectionTitle || cleanText(q.section)}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Questions {q.setNumber}.1 – {q.setNumber}.{modalQuestions.filter(x => x.setNumber === q.setNumber).length}
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
                      {/* Question Meta Header */}
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
                            Question {q.displayNumber || actualIndex + 1}
                          </span>
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
                            Set {q.setNumber}: {q.cleanSectionTitle || cleanText(q.section)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
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

                      {/* Multiple Choice Options */}
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
                            {studentAns || 'No typed answer provided by student.'}
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

                      {/* Examiner Evaluation Space */}
                      {testViewMode === 'examiner' && (
                        <div style={{ marginTop: '0.95rem', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '10px', padding: '0.85rem 1rem' }}>
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
            {questionDisplayMode === 'slide' && modalQuestions.length > 0 && (
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

                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: 'clamp(0.8rem, 1.6vw, 0.9rem)', fontWeight: 700, color: '#f1f5f9' }}>
                      Question {modalQuestions[currentSlideIndex]?.displayNumber || currentSlideIndex + 1}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      of {modalQuestions.length}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.85 }}>
                    Tip: Use ← → keys to slide
                  </div>
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
                        saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                        setNotificationMsg(`🎉 Paper evaluated successfully! Result published: Result ${modalAwardedSum}/${modalTotalMax}`);
                        setTimeout(() => setNotificationMsg(''), 4000);
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
                      : `✅ Finish Checking (${modalAwardedSum}/${modalTotalMax})`}
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
                  <button
                    type="button"
                    onClick={handleAiAutoReview}
                    disabled={isAiReviewing}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.45rem 1rem',
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
                        <span>Re-Run AI Auto-Review & Marking</span>
                      </>
                    )}
                  </button>
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

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditingDurationModal(null)}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#cbd5e1',
                  fontSize: '0.8rem',
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
                  padding: '0.35rem 1rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1 0%, #a855f7 100%))',
                  color: '#fff',
                  fontSize: '0.8rem',
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

    </main>
  );
}

export default function ExamPage() {
  return (
    <Suspense fallback={<div className="view-container" style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>Loading exam workspace...</div>}>
      <ExamPageContent />
    </Suspense>
  );
}
