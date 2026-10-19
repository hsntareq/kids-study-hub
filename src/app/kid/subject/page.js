"use client";

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { generateGeminiContent } from '../../../lib/gemini';
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

  // Accordion state for exams within this subject
  const [expandedExams, setExpandedExams] = useState({});

  // Chapter filter tab state: 'all' | 'completed' | 'in_progress' | 'not_started'
  const [chapterStatusFilter, setChapterStatusFilter] = useState('all');

  // Modals & settings state
  const [showSubjectSettings, setShowSubjectSettings] = useState(false);
  const [tempBookUrl, setTempBookUrl] = useState('');
  const [examRetentionDays, setExamRetentionDays] = useState(7);
  const [tempRetentionDays, setTempRetentionDays] = useState('7');
  const [showAddExamModal, setShowAddExamModal] = useState(false);
  const [newExamTitle, setNewExamTitle] = useState('');

  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [targetExamForChapter, setTargetExamForChapter] = useState(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterPdfPage, setNewChapterPdfPage] = useState('');

  // Inline mark distribution editing
  const [editingMarkDistExamId, setEditingMarkDistExamId] = useState(null);
  const [inlineMarkDistValue, setInlineMarkDistValue] = useState('');

  // Model test popover / generator state
  const [modelTestTargetExam, setModelTestTargetExam] = useState(null);
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
  const [testViewMode, setTestViewMode] = useState('student');
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
  const [editingResultTestId, setEditingResultTestId] = useState(null);
  const [tempResultInput, setTempResultInput] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  const saveDebounceTimer = useRef(null);

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

  const countWords = (text) => {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  // Image compressor for answer sheets
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

  // Auth & Data fetching
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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

  // Calculate overall subject progress & aggregated chapters across all exams
  let totalSubjectChapters = 0;
  let completedSubjectChapters = 0;
  let inProgressSubjectChapters = 0;
  let notStartedSubjectChapters = 0;
  let totalSubjectModelTests = 0;

  const allSubjectChapters = [];

  if (subject && exams.length > 0) {
    exams.forEach(ex => {
      const chaps = (subject.chapters && subject.chapters[ex.id]) || {};
      const chapsEntries = Object.entries(chaps);
      totalSubjectChapters += chapsEntries.length;

      chapsEntries.forEach(([cId, c]) => {
        const isCompleted = Boolean(c.completed || c.status === 'completed');
        const status = isCompleted ? 'completed' : (c.status === 'in_progress' ? 'in_progress' : 'not_started');
        if (isCompleted) {
          completedSubjectChapters++;
        } else if (status === 'in_progress') {
          inProgressSubjectChapters++;
        } else {
          notStartedSubjectChapters++;
        }

        allSubjectChapters.push({
          id: cId,
          examId: ex.id,
          examTitle: ex.title,
          ...c,
          isCompleted,
          status
        });
      });

      const tests = (subject.modelTests && subject.modelTests[ex.id]) || {};
      totalSubjectModelTests += Object.keys(tests).length;
    });
  }

  const subjectProgressPercent = totalSubjectChapters > 0
    ? Math.round((completedSubjectChapters / totalSubjectChapters) * 100)
    : 0;

  const filteredChapters = allSubjectChapters.filter(ch => {
    if (chapterStatusFilter === 'all') return true;
    if (chapterStatusFilter === 'completed') return ch.isCompleted;
    if (chapterStatusFilter === 'in_progress') return ch.status === 'in_progress';
    if (chapterStatusFilter === 'not_started') return ch.status === 'not_started';
    return true;
  });

  // Identify next upcoming exam
  const nextUpExam = exams.find(ex => {
    const examSetting = (subject && subject.examSettings && subject.examSettings[ex.id]) || {};
    return examSetting.status === 'In Progress';
  }) || exams.find(ex => {
    const examSetting = (subject && subject.examSettings && subject.examSettings[ex.id]) || {};
    return examSetting.status !== 'Completed';
  }) || exams[0];

  // Toggle exam accordion
  const toggleExam = (examId) => {
    setExpandedExams(prev => ({
      ...prev,
      [examId]: prev[examId] !== undefined ? !prev[examId] : false
    }));
  };

  // Chapter toggle
  const handleToggleChapterComplete = async (examId, chapId, currentCompleted) => {
    if (!user || !kid || !subject) return;
    const newCompleted = !currentCompleted;
    const chapPath = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/chapters/${examId}/${chapId}`;
    await set(ref(database, `${chapPath}/completed`), newCompleted);
    await set(ref(database, `${chapPath}/status`), newCompleted ? 'completed' : 'not_started');
  };

  // Exam status update
  const handleUpdateExamStatus = async (examId, newStatus) => {
    if (!user || !kid || !subject) return;
    const path = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${examId}/status`;
    await set(ref(database, path), newStatus);
  };

  // Save mark distribution inline
  const handleSaveInlineMarkDist = async (examId) => {
    if (!user || !kid || !subject) return;
    const path = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${examId}/markDistribution`;
    await set(ref(database, path), inlineMarkDistValue.trim());
    setEditingMarkDistExamId(null);
  };

  // Save universal subject settings (Textbook URL & Exam Retention Window)
  const handleSaveSubjectSettings = async () => {
    if (!user || !kid || !subject) return;
    const retentionNum = Number(tempRetentionDays) || 0;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/bookUrl`), tempBookUrl.trim());
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examRetentionDays`), retentionNum);
    setBookUrl(tempBookUrl.trim());
    setExamRetentionDays(retentionNum);
    setShowSubjectSettings(false);
  };

  // Add chapter to exam
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

  // Add new exam
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

  // Open model test generator popover
  const openModelTestGenerator = (exam) => {
    const today = new Date().toISOString().split('T')[0];
    const formattedToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const currentDist = (subject.examSettings && subject.examSettings[exam.id] && subject.examSettings[exam.id].markDistribution) || '';
    const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};

    setModelTestTargetExam(exam);
    setModelTestDate(today);
    setModelTestTitle(`Model Test - ${formattedToday}`);
    setModelTestResult('0');
    setSelectedChaptersForTest(Object.keys(chaptersObj));
    setTestMarkDistribution(currentDist);
    setTestDifficulty('Standard');
    setTestGuidelines(['Follow best practice', 'Standard curriculum']);
    setCustomInstructions('');
    setGenerateError('');
  };

  // Toggle test guideline
  const toggleGuideline = (guideline) => {
    setTestGuidelines(prev =>
      prev.includes(guideline) ? prev.filter(g => g !== guideline) : [...prev, guideline]
    );
  };

  // Generate Model Test via Gemini API
  const handleGenerateModelTest = async () => {
    if (!modelTestTargetExam || !user || !kid || !subject) return;
    if (countWords(customInstructions) > 200) {
      setGenerateError('Custom instructions must not exceed 200 words.');
      return;
    }

    setIsGeneratingTest(true);
    setGenerateError('');

    try {
      const exam = modelTestTargetExam;
      const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};
      const selectedChapterTitles = selectedChaptersForTest.map(id => chaptersObj[id]?.title).filter(Boolean);

      const prompt = `You are an expert school examiner creating a realistic, high quality Model Test for a student in ${kid.grade || 'Primary / Middle school'}.
Generate a comprehensive Model Test with structured questions strictly formatted according to the syllabus and mark distribution.

Subject: ${subject.title}
Exam Type: ${exam.title}
Model Test Date: ${modelTestDate || 'Today'}

Syllabus Chapters:
${selectedChapterTitles.length > 0 ? selectedChapterTitles.map(t => `- ${t}`).join('\n') : '- Entire course curriculum'}

Mark Distribution (STRICT REQUIREMENT - ALLOCATE MARKS EXACTLY AS SPECIFIED):
${testMarkDistribution || '100 Marks Standard: Section A: 20 MCQs (20 Marks), Section B: Short Questions (30 Marks), Section C: Descriptive / Creative Questions (50 Marks)'}

Difficulty Level: ${testDifficulty}
Guidelines:
${testGuidelines.length > 0 ? testGuidelines.map(g => `- ${g}`).join('\n') : '- Standard school examination best practices'}

${customInstructions.trim() ? `Specific Custom Instructions from Teacher:\n${customInstructions.trim()}\n` : ''}

CRITICAL INSTRUCTION - ZERO MARKDOWN AND ZERO LATEX:
1. DO NOT use ANY markdown formatting (NO asterisks like **, NO headers like ####, NO bullet asterisks *, NO backticks).
2. DO NOT use LaTeX formatting (NO dollar signs $, NO \\times, NO \\frac, NO \\div). Use standard plain keyboard symbols: "x", "÷", "+", "-", "/", "%".
3. Every question must be clean, readable plain text for a school student without any code or markdown artifacts.
4. Return strictly a valid JSON object matching this schema:
{
  "title": "${modelTestTitle.trim() || `${subject.title} - ${exam.title} Model Test`}",
  "fullMarks": 100,
  "timeAllowed": "2 Hours",
  "questions": [
    {
      "id": 1,
      "section": "Section A: Multiple Choice Questions",
      "question": "Clear question text without asterisks or markdown",
      "marks": 5,
      "options": ["A) option 1", "B) option 2", "C) option 3", "D) option 4"],
      "answerKey": "Correct option and short explanation"
    },
    {
      "id": 2,
      "section": "Section B: Short / Creative Questions",
      "question": "Question requiring calculation or written steps",
      "marks": 10,
      "options": [],
      "answerKey": "Step-by-step solution"
    }
  ]
}`;

      const questionsText = await generateGeminiContent(prompt);
      let parsedQuestions = parseQuestionsData(questionsText);
      if (!parsedQuestions || parsedQuestions.length === 0) {
        throw new Error('Failed to parse generated questions');
      }

      const testsRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
      const newTestRef = push(testsRef);
      await set(newTestRef, {
        date: modelTestDate || new Date().toISOString().split('T')[0],
        title: modelTestTitle.trim() || `Model Test - ${modelTestDate}`,
        result: modelTestResult.trim() || '0',
        markDistribution: testMarkDistribution,
        difficulty: testDifficulty,
        guidelines: testGuidelines,
        customInstructions: customInstructions.trim(),
        selectedChapters: selectedChaptersForTest,
        questions: parsedQuestions,
        createdAt: Date.now()
      });

      setModelTestTargetExam(null);
    } catch (err) {
      console.error(err);
      setGenerateError(err.message || 'Error creating model test');
    } finally {
      setIsGeneratingTest(false);
    }
  };

  // Open test viewer
  const openTestViewer = (test) => {
    setViewingModelTest(test);
    setTestViewMode('student');
    setCurrentSlideIndex(0);
    setQuestionDisplayMode('slide');
    setStudentAnswers(test.submittedAnswers || {});
    setUploadedAnswerPages(test.uploadedPages || []);
    setAwardedMarks(test.marksAwarded || {});
    setExaminerNotes(test.examinerFeedback || {});
    setOverallExaminerFeedback(test.overallEvaluationFeedback || '');
    setShowAnswerKeys({});
  };

  // Save student answer sheet
  const handleSaveStudentSubmission = async () => {
    if (!viewingModelTest || !user || !kid || !subject) return;
    setIsSavingSubmission(true);
    try {
      const { examId, id: testId } = viewingModelTest;
      const testPath = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${examId}/${testId}`;
      await set(ref(database, `${testPath}/submittedAnswers`), studentAnswers);
      await set(ref(database, `${testPath}/uploadedPages`), uploadedAnswerPages);
      await set(ref(database, `${testPath}/submittedAt`), Date.now());

      setNotificationMsg('Student answers saved successfully!');
      setTimeout(() => setNotificationMsg(''), 3000);
    } catch (err) {
      alert('Error saving submission: ' + err.message);
    } finally {
      setIsSavingSubmission(false);
    }
  };

  // Save examiner grading
  const handleSaveGrading = async () => {
    if (!viewingModelTest || !user || !kid || !subject) return;
    setIsSavingGrading(true);
    try {
      const { examId, id: testId } = viewingModelTest;
      const questionsList = parseQuestionsData(viewingModelTest.questions);
      let calculatedTotal = 0;
      questionsList.forEach(q => {
        const mark = parseFloat(awardedMarks[q.id]);
        if (!isNaN(mark)) calculatedTotal += mark;
      });

      const fullMarks = questionsList.reduce((acc, q) => acc + (q.marks || 0), 0) || 100;
      const resultString = `${calculatedTotal}/${fullMarks}`;

      const testPath = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${examId}/${testId}`;
      await set(ref(database, `${testPath}/marksAwarded`), awardedMarks);
      await set(ref(database, `${testPath}/examinerFeedback`), examinerNotes);
      await set(ref(database, `${testPath}/overallEvaluationFeedback`), overallExaminerFeedback);
      await set(ref(database, `${testPath}/result`), resultString);
      await set(ref(database, `${testPath}/evaluated`), true);
      await set(ref(database, `${testPath}/evaluatedAt`), Date.now());

      setViewingModelTest(prev => ({
        ...prev,
        result: resultString,
        evaluated: true,
        marksAwarded: awardedMarks,
        examinerFeedback: examinerNotes,
        overallEvaluationFeedback: overallExaminerFeedback
      }));

      setNotificationMsg('Grading & scores saved successfully!');
      setTimeout(() => setNotificationMsg(''), 3000);
    } catch (err) {
      alert('Error saving grading: ' + err.message);
    } finally {
      setIsSavingGrading(false);
    }
  };

  // Upload photo of written paper
  const handleUploadPaperPhoto = async (e) => {
    const files = Array.from(e.target.files);
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const compressedBase64 = await compressImage(file);
        const newPage = {
          id: Date.now() + Math.random().toString(36).substring(2, 6),
          dataUrl: compressedBase64,
          name: file.name,
          uploadedAt: Date.now()
        };
        setUploadedAnswerPages(prev => [...prev, newPage]);
      } catch (err) {
        console.error('Failed to process image:', err);
      }
    }
  };

  // Delete uploaded sheet
  const handleDeleteUploadedPage = (pageId) => {
    setUploadedAnswerPages(prev => prev.filter(p => p.id !== pageId));
  };

  // Update test result manually
  const handleUpdateTestResult = async (examId, testId, newScore) => {
    if (!user || !kid || !subject) return;
    const testPath = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${examId}/${testId}/result`;
    await set(ref(database, testPath), newScore.trim());
    setEditingResultTestId(null);
  };

  // Delete model test
  const handleDeleteModelTest = async (examId, testId) => {
    if (!window.confirm('Are you sure you want to delete this Model Test?')) return;
    const path = `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${examId}/${testId}`;
    await remove(ref(database, path));
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading subject hub...</p>
      </div>
    );
  }

  if (!kid || !subject) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <h2>Subject Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Could not find subject or kid record.</p>
        <Link href={`/kid/profile?id=${searchParams.get("id")}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to Student Profile
        </Link>
      </div>
    );
  }

  const subjectSlug = subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <main className="container" style={{ paddingBottom: '5rem', maxWidth: '1060px' }}>
      {/* 1. Breadcrumbs */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Home</Link>
        <span>›</span>
        <Link href={`/kid/profile?id=${searchParams.get("id")}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{kid.name}</Link>
        <span>›</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{subject.title}</span>
      </nav>

      {/* 2. Hero Subject Header Card */}
      <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '20px', padding: '1.8rem 2rem', marginBottom: '1.75rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', fontWeight: 600 }}>
                🎓 {kid.grade || 'Grade Syllabus'}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Student: <strong style={{ color: '#fff' }}>{kid.name}</strong>
              </span>
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {exams.length} {exams.length === 1 ? 'Exam' : 'Exams'}
              </span>
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                {totalSubjectChapters} {totalSubjectChapters === 1 ? 'Chapter' : 'Chapters'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.65rem' }}>
              <h1 style={{ margin: 0, fontSize: '2.3rem', fontWeight: 700, color: '#fff' }}>
                {subject.title} Hub
              </h1>
              <button
                onClick={() => {
                  setTempBookUrl(bookUrl || '');
                  setTempRetentionDays(String(examRetentionDays !== undefined ? examRetentionDays : 7));
                  setShowSubjectSettings(true);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
                title="Universal Subject Settings"
                onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
            </div>

            <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
              Comprehensive syllabus workspace, chapter tracking, learning resources, and related examinations.
            </p>
          </div>

          {/* Quick Actions Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {bookUrl && (
              <a
                href={bookUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.55rem 1rem',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  borderRadius: '10px',
                  color: '#93c5fd',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)'}
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
                  padding: '0.55rem 1rem',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  color: '#f8fafc',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.09)'}
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
                padding: '0.55rem 1.15rem',
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 3px 12px rgba(139, 92, 246, 0.35)',
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

        {/* Overall Subject Progress with SVG Circular Progress Ring */}
        <div style={{
          marginTop: '1.75rem',
          paddingTop: '1.4rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          flexWrap: 'wrap'
        }}>
          {/* Circular SVG Ring */}
          <div style={{ position: 'relative', width: '92px', height: '92px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="92" height="92" viewBox="0 0 92 92" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="subj-hub-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#8b5cf6" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              {/* Background Ring Track */}
              <circle
                cx="46"
                cy="46"
                r="36"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="6.5"
                fill="transparent"
              />
              {/* Dynamic Progress Stroke */}
              <circle
                cx="46"
                cy="46"
                r="36"
                stroke={subjectProgressPercent === 100 ? '#10b981' : subjectProgressPercent > 0 ? 'url(#subj-hub-ring-grad)' : 'rgba(255, 255, 255, 0.12)'}
                strokeWidth="6.5"
                strokeDasharray={226.19}
                strokeDashoffset={226.19 - (226.19 * subjectProgressPercent) / 100}
                strokeLinecap="round"
                fill="transparent"
                style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            </svg>
            <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: '1.35rem', fontWeight: 700, color: subjectProgressPercent === 100 ? '#34d399' : '#fff', lineHeight: 1 }}>
                {subjectProgressPercent}%
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '3px' }}>
                Mastery
              </span>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 600, color: '#f8fafc' }}>
                Overall Subject Syllabus Mastery
              </span>
              <span style={{ fontSize: '0.84rem', color: subjectProgressPercent === 100 ? '#34d399' : 'var(--accent-primary)', fontWeight: 700 }}>
                {completedSubjectChapters} of {totalSubjectChapters} Chapters Completed
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#34d399' }}>{completedSubjectChapters}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  ✓ Mastered
                </div>
              </div>

              <div style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fbbf24' }}>{inProgressSubjectChapters}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  ⏳ In Progress
                </div>
              </div>

              <div style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#94a3b8' }}>{notStartedSubjectChapters}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  📖 Not Started
                </div>
              </div>

              <div style={{ padding: '0.85rem 1rem', background: 'rgba(0,0,0,0.25)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c084fc' }}>{totalSubjectModelTests}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  📝 Model Tests
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Subject Resources & Learning Materials Section */}
      <div style={{ marginBottom: '2.5rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📚</span>
              <span>Subject Resources & Materials</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Curriculum reference materials, digital textbooks, and study tools for {subject.title}
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {/* Resource 1: Digital Textbook */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '14px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
            transition: 'border-color 0.2s'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.3rem' }}>📖</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: bookUrl ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: bookUrl ? '#34d399' : '#facc15', fontWeight: 600 }}>
                  {bookUrl ? 'Linked' : 'Not Set'}
                </span>
              </div>
              <h3 style={{ margin: '0.3rem 0 0 0', fontSize: '1.02rem', fontWeight: 600, color: '#fff' }}>
                Digital Textbook
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {bookUrl ? 'Official online reader and PDF study book' : 'Attach Google Drive or PDF textbook URL for 1-click access'}
              </p>
            </div>

            <div>
              {bookUrl ? (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <a
                    href={bookUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '0.45rem 0.75rem',
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '8px',
                      color: '#93c5fd',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none'
                    }}
                  >
                    Open Book ↗
                  </a>
                  <button
                    onClick={() => {
                      setTempBookUrl(bookUrl || '');
                      setTempRetentionDays(String(examRetentionDays !== undefined ? examRetentionDays : 7));
                      setShowSubjectSettings(true);
                    }}
                    style={{ padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.8rem', cursor: 'pointer' }}
                    title="Universal Subject Settings"
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
                    background: 'rgba(139, 92, 246, 0.18)',
                    border: '1px solid rgba(139, 92, 246, 0.35)',
                    borderRadius: '8px',
                    color: 'var(--accent-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  + Add Book Link
                </button>
              )}
            </div>
          </div>

          {/* Resource 2: Examination Mark Distribution */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '14px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.3rem' }}>📐</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe', fontWeight: 600 }}>
                  Curriculum
                </span>
              </div>
              <h3 style={{ margin: '0.3rem 0 0 0', fontSize: '1.02rem', fontWeight: 600, color: '#fff' }}>
                Mark Distribution Guide
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Review syllabus weightage, question distribution (MCQs, Short, Creative) across exams.
              </p>
            </div>

            <button
              onClick={() => {
                if (exams.length > 0) {
                  setEditingMarkDistExamId(exams[0].id);
                  setInlineMarkDistValue((subject.examSettings && subject.examSettings[exams[0].id]?.markDistribution) || '');
                }
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
              Configure Mark Schemes
            </button>
          </div>

          {/* Resource 3: AI Model Test Bank */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '14px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.3rem' }}>⚡</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontWeight: 600 }}>
                  AI Powered
                </span>
              </div>
              <h3 style={{ margin: '0.3rem 0 0 0', fontSize: '1.02rem', fontWeight: 600, color: '#fff' }}>
                Practice Test Generator
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Generate customized model test papers based on selected syllabus chapters and mark rules.
              </p>
            </div>

            <button
              onClick={() => {
                if (exams.length > 0) {
                  openModelTestGenerator(exams[0]);
                } else {
                  setShowAddExamModal(true);
                }
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
              + Generate Practice Test
            </button>
          </div>

          {/* Resource 4: Revision & Chapter Workspaces */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.025)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '14px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.3rem' }}>🎯</span>
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.45rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 600 }}>
                  Focused Study
                </span>
              </div>
              <h3 style={{ margin: '0.3rem 0 0 0', fontSize: '1.02rem', fontWeight: 600, color: '#fff' }}>
                Chapter Study Workspaces
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Dive into single chapter workspaces with formula sheets, question generation, and revision trackers.
              </p>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span>Tip: Select any chapter below to launch its workspace</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Chapters Categorized by Status & Chapter-Level Progress */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid var(--glass-border)',
        borderRadius: '18px',
        padding: '1.6rem',
        marginBottom: '2.5rem',
        textAlign: 'left'
      }}>
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📑</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 600, color: '#fff', margin: 0 }}>
                Chapters & Syllabus Curriculum
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Filtered by mastery status with instant chapter completion toggles
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            padding: '0.25rem',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.06)',
            gap: '0.25rem',
            flexWrap: 'wrap'
          }}>
            {[
              { id: 'all', label: 'All', count: allSubjectChapters.length },
              { id: 'completed', label: 'Mastered', count: completedSubjectChapters, color: '#34d399' },
              { id: 'in_progress', label: 'In Progress', count: inProgressSubjectChapters, color: '#fbbf24' },
              { id: 'not_started', label: 'Not Started', count: notStartedSubjectChapters, color: '#94a3b8' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setChapterStatusFilter(tab.id)}
                style={{
                  background: chapterStatusFilter === tab.id ? 'var(--accent-gradient)' : 'transparent',
                  color: chapterStatusFilter === tab.id ? '#fff' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: '7px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s'
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: '0.68rem',
                  background: chapterStatusFilter === tab.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                  padding: '0.05rem 0.35rem',
                  borderRadius: '6px',
                  color: tab.color || '#fff'
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chapter-Level Progress Metric Bar */}
        <div style={{ marginBottom: '1.4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            <span>Curriculum Completion Breakdown</span>
            <span style={{ fontWeight: 600, color: subjectProgressPercent === 100 ? '#34d399' : '#c4b5fd' }}>
              {completedSubjectChapters} of {totalSubjectChapters} Chapters Mastered ({subjectProgressPercent}%)
            </span>
          </div>
          {/* Segmented Progress Bar */}
          <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            {totalSubjectChapters > 0 ? (
              <>
                <div style={{ width: `${(completedSubjectChapters / totalSubjectChapters) * 100}%`, background: '#10b981', transition: 'width 0.4s' }} title={`Mastered: ${completedSubjectChapters}`} />
                <div style={{ width: `${(inProgressSubjectChapters / totalSubjectChapters) * 100}%`, background: '#f59e0b', transition: 'width 0.4s' }} title={`In Progress: ${inProgressSubjectChapters}`} />
              </>
            ) : null}
          </div>
        </div>

        {/* Chapters Cards Grid */}
        {filteredChapters.length === 0 ? (
          <div style={{ padding: '2rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.08)' }}>
            <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              {chapterStatusFilter === 'all' 
                ? 'No syllabus chapters created yet for this subject.' 
                : `No chapters found with status "${chapterStatusFilter.replace('_', ' ')}".`}
            </p>
            {exams.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTargetExamForChapter(exams[0]);
                  setNewChapterTitle('');
                  setNewChapterPdfPage('');
                  setShowAddChapterModal(true);
                }}
                className="primary"
                style={{ padding: '0.45rem 1.1rem', borderRadius: '8px', fontSize: '0.82rem' }}
              >
                + Add Chapter to {exams[0].title}
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.75rem' }}>
            {filteredChapters.map(chap => {
              const queryParentId = searchParams.get("parentId");
              const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
              const chapterHref = `/kid/chapter?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${chap.examId}&chapterId=${chap.id}${parentIdQuery}`;

              return (
                <div
                  key={`${chap.examId}-${chap.id}`}
                  style={{
                    background: chap.isCompleted ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255, 255, 255, 0.025)',
                    border: chap.isCompleted ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '0.9rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = chap.isCompleted ? 'rgba(16, 185, 129, 0.07)' : 'rgba(255, 255, 255, 0.05)';
                    e.currentTarget.style.borderColor = chap.isCompleted ? 'rgba(16, 185, 129, 0.4)' : 'rgba(139, 92, 246, 0.35)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = chap.isCompleted ? 'rgba(16, 185, 129, 0.04)' : 'rgba(255, 255, 255, 0.025)';
                    e.currentTarget.style.borderColor = chap.isCompleted ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.06)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    {/* Chapter Completion Toggle Checkbox */}
                    <button
                      type="button"
                      onClick={() => handleToggleChapterComplete(chap.examId, chap.id, chap.isCompleted)}
                      style={{
                        background: chap.isCompleted ? '#10b981' : 'rgba(255,255,255,0.06)',
                        border: `2px solid ${chap.isCompleted ? '#10b981' : 'rgba(255,255,255,0.25)'}`,
                        borderRadius: '6px',
                        width: '22px',
                        height: '22px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 0,
                        marginTop: '2px',
                        flexShrink: 0,
                        transition: 'all 0.2s'
                      }}
                      title={chap.isCompleted ? "Mark incomplete" : "Mark as mastered"}
                    >
                      {chap.isCompleted && (
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                      )}
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0, flex: 1 }}>
                      <span style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: chap.isCompleted ? '#e2e8f0' : '#fff',
                        textDecoration: chap.isCompleted ? 'line-through' : 'none',
                        opacity: chap.isCompleted ? 0.85 : 1
                      }}>
                        {chap.title}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                          🎯 {chap.examTitle}
                        </span>
                        {chap.pdfPage && (
                          <span style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#93c5fd', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                            📄 Page {chap.pdfPage}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                    <span style={{
                      fontSize: '0.67rem',
                      fontWeight: 600,
                      padding: '0.12rem 0.45rem',
                      borderRadius: '8px',
                      background: chap.isCompleted ? 'rgba(16, 185, 129, 0.15)' : chap.status === 'in_progress' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                      color: chap.isCompleted ? '#34d399' : chap.status === 'in_progress' ? '#fbbf24' : '#94a3b8'
                    }}>
                      {chap.isCompleted ? 'Mastered' : chap.status === 'in_progress' ? 'In Progress' : 'Not Started'}
                    </span>

                    <Link
                      href={chapterHref}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.74rem',
                        color: 'var(--accent-primary)',
                        textDecoration: 'none',
                        fontWeight: 600
                      }}
                    >
                      <span>Study Chapter</span>
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Related Exams & Workspaces */}
      <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📝</span>
              <span>Related Exams & Workspaces</span>
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Click any exam card to enter its workspace or toggle accordion for mark distribution and chapter management.
            </p>
          </div>

          <button
            onClick={() => { setNewExamTitle(''); setShowAddExamModal(true); }}
            style={{
              padding: '0.45rem 0.9rem',
              background: 'rgba(139, 92, 246, 0.18)',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              borderRadius: '8px',
              color: 'var(--accent-primary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            + Add Exam
          </button>
        </div>

        {/* Quick Related Exam Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem', marginBottom: '1.5rem' }}>
          {exams.map(ex => {
            const queryParentId = searchParams.get("parentId");
            const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
            const examHref = `/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${ex.id}&subjectId=${subject.id}${parentIdQuery}`;
            
            const isNextUp = nextUpExam && ex.id === nextUpExam.id;
            const isMajor = /final|term|annual|board|midterm|semester/i.test(ex.title);
            
            const chapsObj = (subject.chapters && subject.chapters[ex.id]) || {};
            const chapsList = Object.values(chapsObj);
            const exTotal = chapsList.length;
            const exDone = chapsList.filter(c => c.completed || c.status === 'completed').length;
            const exProgress = exTotal > 0 ? Math.round((exDone / exTotal) * 100) : 0;
            const tests = (subject.modelTests && subject.modelTests[ex.id]) || {};
            const testCount = Object.keys(tests).length;

            return (
              <div
                key={ex.id}
                style={{
                  background: isNextUp ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.07), rgba(139, 92, 246, 0.07))' : 'rgba(255, 255, 255, 0.025)',
                  border: isNextUp ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.8rem',
                  transition: 'all 0.2s'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {isNextUp && (
                        <span style={{ fontSize: '0.64rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>
                          ⚡ Next Up
                        </span>
                      )}
                      {isMajor && (
                        <span style={{ fontSize: '0.64rem', padding: '0.15rem 0.45rem', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', fontWeight: 600 }}>
                          🏆 Major
                        </span>
                      )}
                    </div>

                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {exDone}/{exTotal} Chaps • {testCount} Tests
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 600, color: '#fff' }}>
                    {ex.title}
                  </h3>

                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${exProgress}%`, height: '100%', background: exProgress === 100 ? '#10b981' : isNextUp ? '#f59e0b' : '#8b5cf6', borderRadius: '2px' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <Link
                    href={examHref}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '0.45rem 0.75rem',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>Enter Workspace</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </Link>

                  <button
                    type="button"
                    onClick={() => toggleExam(ex.id)}
                    style={{
                      padding: '0.45rem 0.65rem',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      color: 'var(--text-secondary)',
                      fontSize: '0.74rem',
                      cursor: 'pointer'
                    }}
                    title="Toggle Exam Accordion Details"
                  >
                    {expandedExams[ex.id] ? 'Hide Details' : 'Details ▾'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {exams.length === 0 ? (
          <div style={{ padding: '2.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>No exams created for this subject yet.</p>
            <button onClick={() => setShowAddExamModal(true)} className="primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '8px' }}>
              + Add First Exam
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {exams.map(exam => {
              const currentMarkDist = (subject.examSettings && subject.examSettings[exam.id] && subject.examSettings[exam.id].markDistribution) || '';
              const examChaptersMap = (subject.chapters && subject.chapters[exam.id]) || {};
              const examChaptersList = Object.entries(examChaptersMap).map(([cId, chap]) => ({ id: cId, ...chap }));
              const totalChapters = examChaptersList.length;
              const completedChapters = examChaptersList.filter(c => c.completed || c.status === 'completed').length;
              const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;

              const examSetting = (subject.examSettings && subject.examSettings[exam.id]) || {};
              const examStatus = examSetting.status || (progressPercent === 100 && totalChapters > 0 ? 'Completed' : (progressPercent > 0 ? 'In Progress' : 'Not Started'));

              const isExamExpanded = expandedExams[exam.id] !== undefined ? expandedExams[exam.id] : true;
              const isEditingMarkDist = editingMarkDistExamId === exam.id;
              const queryParentId = searchParams.get("parentId");
              const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
              const examPageHref = `/kid/exam?id=${searchParams.get("id")}&subject=${subjectSlug}&examId=${exam.id}&subjectId=${subject.id}${parentIdQuery}`;

              const rawModelTests = (subject.modelTests && subject.modelTests[exam.id]) || {};
              const testsList = Object.entries(rawModelTests)
                .map(([tId, test]) => ({ id: tId, ...test }))
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

              return (
                <div
                  key={exam.id}
                  style={{
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '14px',
                    overflow: 'hidden',
                    textAlign: 'left',
                    transition: 'border-color 0.2s'
                  }}
                >
                  {/* Accordion Header */}
                  <div
                    onClick={() => toggleExam(exam.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      padding: '1.1rem 1.25rem',
                      cursor: 'pointer',
                      background: isExamExpanded ? 'rgba(255,255,255,0.035)' : 'transparent',
                      transition: 'background 0.2s',
                      borderBottom: isExamExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none'
                    }}
                    onMouseOver={(e) => { if (!isExamExpanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseOut={(e) => { if (!isExamExpanded) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{
                          transform: isExamExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.25s ease',
                          display: 'flex',
                          alignItems: 'center',
                          color: 'var(--accent-primary)'
                        }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                        <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 600 }}>{exam.title}</h3>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                        {/* Status selector */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <select
                            value={examStatus}
                            onChange={(e) => handleUpdateExamStatus(exam.id, e.target.value)}
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              padding: '0.28rem 0.65rem',
                              borderRadius: '16px',
                              border: `1px solid ${
                                examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.4)' :
                                examStatus === 'Reviewing' ? 'rgba(168, 85, 247, 0.4)' :
                                examStatus === 'In Progress' ? 'rgba(59, 130, 246, 0.4)' :
                                'rgba(148, 163, 184, 0.3)'
                              }`,
                              background:
                                examStatus === 'Completed' ? 'rgba(16, 185, 129, 0.15)' :
                                examStatus === 'Reviewing' ? 'rgba(168, 85, 247, 0.15)' :
                                examStatus === 'In Progress' ? 'rgba(59, 130, 246, 0.15)' :
                                'rgba(148, 163, 184, 0.1)',
                              color:
                                examStatus === 'Completed' ? '#34d399' :
                                examStatus === 'Reviewing' ? '#c084fc' :
                                examStatus === 'In Progress' ? '#60a5fa' :
                                '#94a3b8',
                              cursor: 'pointer',
                              outline: 'none',
                              appearance: 'none',
                              paddingRight: '1.4rem'
                            }}
                          >
                            <option value="Not Started" style={{ background: '#1e1b4b', color: '#94a3b8' }}>Not Started</option>
                            <option value="In Progress" style={{ background: '#1e1b4b', color: '#60a5fa' }}>In Progress</option>
                            <option value="Reviewing" style={{ background: '#1e1b4b', color: '#c084fc' }}>Reviewing</option>
                            <option value="Completed" style={{ background: '#1e1b4b', color: '#34d399' }}>Completed</option>
                          </select>
                          <span style={{ position: 'absolute', right: '0.5rem', pointerEvents: 'none', fontSize: '0.65rem', opacity: 0.7 }}>▼</span>
                        </div>

                        {/* Badges */}
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.04)', padding: '0.25rem 0.65rem', borderRadius: '12px' }}>
                          {totalChapters} {totalChapters === 1 ? 'Chapter' : 'Chapters'}
                        </span>
                        {testsList.length > 0 && (
                          <span style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.15)', padding: '0.25rem 0.65rem', borderRadius: '12px', fontWeight: 600 }}>
                            {testsList.length} {testsList.length === 1 ? 'Model Test' : 'Model Tests'}
                          </span>
                        )}

                        {/* Open Dedicated Exam Page Link */}
                        <Link
                          href={examPageHref}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.3rem 0.75rem',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: 'rgba(139, 92, 246, 0.18)',
                            border: '1px solid rgba(139, 92, 246, 0.35)',
                            borderRadius: '16px',
                            color: '#c4b5fd',
                            textDecoration: 'none'
                          }}
                          title="Open dedicated page for this exam"
                        >
                          <span>Open Exam Page</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </Link>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.1rem' }}>
                      <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${progressPercent}%`,
                          background: progressPercent === 100
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : 'linear-gradient(90deg, #8b5cf6, #ec4899)',
                          borderRadius: '3px',
                          transition: 'width 0.4s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {progressPercent}% Complete ({completedChapters}/{totalChapters} Chapters)
                      </span>
                    </div>
                  </div>

                  {/* Accordion Body */}
                  {isExamExpanded && (
                    <div style={{ padding: '1.25rem' }}>
                      {/* Mark Distribution */}
                      <div style={{ marginBottom: '1.25rem', background: 'rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.9rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isEditingMarkDist ? '0.6rem' : (currentMarkDist ? '0.4rem' : '0') }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"></path><path d="M12 20V4"></path><path d="M6 20v-6"></path></svg>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Mark Distribution</span>
                          </div>
                          {!isEditingMarkDist && (
                            <button
                              onClick={() => {
                                setEditingMarkDistExamId(exam.id);
                                setInlineMarkDistValue(currentMarkDist);
                              }}
                              style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', cursor: 'pointer', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                              <span>{currentMarkDist ? 'Edit' : 'Set Mark Distribution'}</span>
                            </button>
                          )}
                        </div>

                        {isEditingMarkDist ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.4rem' }}>
                            <textarea
                              value={inlineMarkDistValue}
                              onChange={(e) => setInlineMarkDistValue(e.target.value)}
                              placeholder={`e.g.\nMCQ: 20 marks\nShort Questions: 30 marks\nCreative Questions: 50 marks\nTotal: 100 marks`}
                              style={{ width: '100%', minHeight: '90px', padding: '0.7rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--accent-primary)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem', resize: 'vertical' }}
                            />
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setInlineMarkDistValue("MCQ: 20 marks\nShort Questions: 30 marks\nCreative/Descriptive: 50 marks\nTotal: 100 marks")}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                              >
                                + 100 Marks Standard
                              </button>
                              <button
                                type="button"
                                onClick={() => setInlineMarkDistValue("MCQ: 15 marks\nShort Questions: 15 marks\nCreative Questions: 20 marks\nTotal: 50 marks")}
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                              >
                                + 50 Marks CT
                              </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                              <button onClick={() => setEditingMarkDistExamId(null)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: '#fff' }}>Cancel</button>
                              <button onClick={() => handleSaveInlineMarkDist(exam.id)} className="primary" style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem', border: 'none', borderRadius: '6px', color: '#fff' }}>Save</button>
                            </div>
                          </div>
                        ) : currentMarkDist ? (
                          <p style={{ margin: 0, fontSize: '0.9rem', color: '#cbd5e1', whiteSpace: 'pre-line', lineHeight: '1.45' }}>
                            {currentMarkDist}
                          </p>
                        ) : (
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                            No mark distribution configured yet. Click "Set Mark Distribution" above.
                          </p>
                        )}
                      </div>

                      {/* Chapters Syllabus */}
                      <div style={{ marginBottom: '1.25rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '10px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                              Syllabus Chapters ({completedChapters}/{totalChapters} Completed)
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setTargetExamForChapter(exam);
                              setNewChapterTitle('');
                              setNewChapterPdfPage('');
                              setShowAddChapterModal(true);
                            }}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', cursor: 'pointer', padding: '0.2rem 0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            <span>Add Chapter</span>
                          </button>
                        </div>

                        {totalChapters > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {examChaptersList.map(chap => {
                              const isDone = chap.completed || chap.status === 'completed';
                              const chapSlug = chap.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                              const queryParentId = searchParams.get("parentId");
                              const parentIdQuery = queryParentId ? `?parentId=${queryParentId}` : '';
                              const linkHref = `/kid/chapter?id=${searchParams.get("id")}&subject=${subjectSlug}&chapter=${chapSlug}${parentIdQuery.replace('?', '&')}`;

                              return (
                                <div
                                  key={chap.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.65rem 0.9rem',
                                    borderRadius: '8px',
                                    background: isDone ? 'rgba(16, 185, 129, 0.06)' : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isDone ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.05)'}`,
                                    gap: '0.75rem'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                                    <input
                                      type="checkbox"
                                      checked={isDone}
                                      onChange={() => handleToggleChapterComplete(exam.id, chap.id, chap.completed)}
                                      style={{ width: '17px', height: '17px', cursor: 'pointer', accentColor: '#10b981', flexShrink: 0 }}
                                      title={isDone ? 'Mark as Incomplete' : 'Mark as Completed'}
                                    />
                                    <Link
                                      href={linkHref}
                                      style={{
                                        fontSize: '0.93rem',
                                        color: isDone ? '#e2e8f0' : 'var(--text-secondary)',
                                        textDecoration: isDone ? 'line-through' : 'none',
                                        opacity: isDone ? 0.85 : 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {chap.title}
                                    </Link>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                    {chap.pdfPage && (
                                      <span style={{ fontSize: '0.72rem', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                        p. {chap.pdfPage}
                                      </span>
                                    )}
                                    <span style={{
                                      fontSize: '0.7rem',
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '10px',
                                      fontWeight: 600,
                                      background: isDone ? 'rgba(16, 185, 129, 0.18)' : 'rgba(234, 179, 8, 0.15)',
                                      color: isDone ? '#34d399' : '#facc15'
                                    }}>
                                      {isDone ? 'Completed' : 'Pending'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.6 }}>No chapters added to this syllabus yet.</p>
                        )}
                      </div>

                      {/* Model Tests */}
                      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                              Model Tests
                            </span>
                            {testsList.length > 0 && (
                              <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.5rem', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', borderRadius: '10px', fontWeight: 600 }}>
                                {testsList.length}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => openModelTestGenerator(exam)}
                            style={{
                              background: 'var(--accent-gradient)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '20px',
                              padding: '0.4rem 0.9rem',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              cursor: 'pointer',
                              boxShadow: '0 3px 10px rgba(139, 92, 246, 0.3)'
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            <span>Generate Model Test</span>
                          </button>
                        </div>

                        {testsList.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {testsList.map(test => {
                              const isEditingScore = editingResultTestId === test.id;
                              return (
                                <div
                                  key={test.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.8rem 1rem',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    gap: '0.75rem',
                                    flexWrap: 'wrap'
                                  }}
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '180px', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                      <span style={{ fontWeight: 600, fontSize: '0.94rem', color: '#fff' }}>
                                        {test.title || `Model Test - ${test.date}`}
                                      </span>
                                      {test.difficulty && (
                                        <span style={{
                                          fontSize: '0.68rem',
                                          padding: '0.12rem 0.5rem',
                                          borderRadius: '10px',
                                          fontWeight: 600,
                                          background: test.difficulty === 'Difficult' ? 'rgba(239,68,68,0.18)' : test.difficulty === 'Easy' ? 'rgba(34,197,94,0.18)' : 'rgba(59,130,246,0.18)',
                                          color: test.difficulty === 'Difficult' ? '#f87171' : test.difficulty === 'Easy' ? '#4ade80' : '#60a5fa'
                                        }}>
                                          {test.difficulty}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.8rem' }}>
                                      <span>Date: {test.date || 'N/A'}</span>
                                      {test.questions && Array.isArray(test.questions) && (
                                        <span>• {test.questions.length} Questions</span>
                                      )}
                                      {test.evaluated && (
                                        <span style={{ color: '#34d399', fontWeight: 500 }}>• Graded</span>
                                      )}
                                      {!test.evaluated && test.submittedAnswers && (
                                        <span style={{ color: '#60a5fa', fontWeight: 500 }}>• Answers Submitted</span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                    {(() => {
                                      const displayScore = test.result !== undefined && test.result !== null ? test.result : '0';
                                      const isGraded = test.evaluated || (test.result && test.result !== '0' && test.result !== 0);

                                      return isEditingScore ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                          <input
                                            type="text"
                                            value={tempResultInput}
                                            onChange={(e) => setTempResultInput(e.target.value)}
                                            style={{ width: '85px', padding: '0.3rem 0.5rem', fontSize: '0.82rem', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent-primary)', borderRadius: '6px', color: '#fff' }}
                                            autoFocus
                                          />
                                          <button onClick={() => handleUpdateTestResult(exam.id, test.id, tempResultInput)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem', background: 'var(--accent-primary)', border: 'none', borderRadius: '4px', color: '#fff' }}>Save</button>
                                          <button onClick={() => setEditingResultTestId(null)} style={{ padding: '0.3rem 0.4rem', fontSize: '0.78rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}>✕</button>
                                        </div>
                                      ) : (
                                        <div
                                          onClick={() => { setEditingResultTestId(test.id); setTempResultInput(displayScore); }}
                                          title="Click to edit score result"
                                          style={{
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.35rem',
                                            padding: '0.3rem 0.75rem',
                                            borderRadius: '20px',
                                            fontSize: '0.83rem',
                                            fontWeight: 600,
                                            background: isGraded ? 'rgba(16, 185, 129, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                                            border: `1px solid ${isGraded ? 'rgba(16, 185, 129, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                                            color: isGraded ? '#34d399' : '#facc15'
                                          }}
                                        >
                                          <span>Result {displayScore}</span>
                                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                        </div>
                                      );
                                    })()}

                                    <button
                                      onClick={() => openTestViewer({ examId: exam.id, testId: test.id, ...test })}
                                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', background: 'rgba(139, 92, 246, 0.15)', color: 'var(--accent-primary)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}
                                      title="Open Questions, Answer Space & Evaluation"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                      <span>Open Test</span>
                                    </button>

                                    <button
                                      onClick={() => handleDeleteModelTest(exam.id, test.id)}
                                      style={{ padding: '0.35rem', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                      title="Delete Test"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div style={{ padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px dashed rgba(255,255,255,0.06)' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                              No model tests yet. Click <strong>Generate Model Test</strong> to create one.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Standalone Exam Page Banner */}
                      <div style={{
                        marginTop: '1.25rem',
                        padding: '0.85rem 1.1rem',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))',
                        border: '1px solid rgba(139, 92, 246, 0.22)',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                            Dedicated {exam.title} Workspace
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                            Open this specific exam's page for full screen grading and preparation mode.
                          </div>
                        </div>
                        <Link
                          href={examPageHref}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.45rem 1rem',
                            background: 'var(--accent-gradient)',
                            color: '#fff',
                            borderRadius: '8px',
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                          }}
                        >
                          <span>Enter Exam Workspace</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                        </Link>
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Model Test Generator Popover Modal */}
      {modelTestTargetExam && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', textAlign: 'left', padding: '1.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <div style={{ background: 'var(--accent-gradient)', padding: '0.4rem', borderRadius: '8px', display: 'flex' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Generate Model Test</h3>
              </div>
              <button onClick={() => setModelTestTargetExam(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {generateError && (
              <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {generateError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Test Title</label>
                <input
                  type="text"
                  value={modelTestTitle}
                  onChange={(e) => setModelTestTitle(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Exam Date</label>
                <input
                  type="date"
                  value={modelTestDate}
                  onChange={(e) => setModelTestDate(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Mark Distribution (Mandatory Structure)</label>
                <textarea
                  value={testMarkDistribution}
                  onChange={(e) => setTestMarkDistribution(e.target.value)}
                  rows={3}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>Difficulty Level</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {['Easy', 'Standard', 'Difficult'].map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTestDifficulty(lvl)}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '8px',
                        border: '1px solid',
                        borderColor: testDifficulty === lvl ? 'var(--accent-primary)' : 'var(--glass-border)',
                        background: testDifficulty === lvl ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                        color: testDifficulty === lvl ? '#fff' : 'var(--text-secondary)',
                        fontWeight: testDifficulty === lvl ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>
                  Custom Teacher Instructions (max 200 words)
                </label>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. Include 2 challenging word problems on geometry and real-world calculation questions."
                  rows={3}
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem' }}
                />
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: countWords(customInstructions) > 200 ? '#f87171' : 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  {countWords(customInstructions)} / 200 words
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button onClick={() => setModelTestTargetExam(null)} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleGenerateModelTest}
                disabled={isGeneratingTest}
                className="primary"
                style={{ padding: '0.6rem 1.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isGeneratingTest ? 0.7 : 1 }}
              >
                {isGeneratingTest ? 'Generating with AI...' : 'Generate Model Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Test Full Sliding Viewer & Evaluator Modal */}
      {viewingModelTest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', zIndex: 120 }}>
          {/* Viewer Top Nav */}
          <div style={{ padding: '0.85rem 1.5rem', background: 'rgba(15, 12, 34, 0.95)', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff' }}>{viewingModelTest.title}</h3>
              <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', borderRadius: '10px' }}>
                {viewingModelTest.result ? `Score: ${viewingModelTest.result}` : 'Result: 0'}
              </span>
            </div>

            {/* Mode switch */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', padding: '0.2rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                <button
                  onClick={() => setTestViewMode('student')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: testViewMode === 'student' ? 'var(--accent-primary)' : 'transparent',
                    color: '#fff'
                  }}
                >
                  Student Workspace
                </button>
                <button
                  onClick={() => setTestViewMode('examiner')}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: testViewMode === 'examiner' ? 'var(--accent-primary)' : 'transparent',
                    color: '#fff'
                  }}
                >
                  Teacher Evaluation
                </button>
              </div>

              <button
                onClick={() => setViewingModelTest(null)}
                style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', borderRadius: '6px', padding: '0.4rem 0.8rem', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Viewer Main Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
            {notificationMsg && (
              <div style={{ padding: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.5)', borderRadius: '8px', color: '#34d399', marginBottom: '1rem', textAlign: 'center' }}>
                {notificationMsg}
              </div>
            )}

            {/* Questions Presentation */}
            {(() => {
              const qList = parseQuestionsData(viewingModelTest.questions);
              if (qList.length === 0) {
                return <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No structured questions available.</p>;
              }

              const currentQ = qList[currentSlideIndex] || qList[0];

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  {/* Slide controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1rem', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Question <strong>{currentSlideIndex + 1}</strong> of <strong>{qList.length}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setCurrentSlideIndex(prev => Math.max(prev - 1, 0))}
                        disabled={currentSlideIndex === 0}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer', opacity: currentSlideIndex === 0 ? 0.4 : 1 }}
                      >
                        ← Prev
                      </button>
                      <button
                        onClick={() => setCurrentSlideIndex(prev => Math.min(prev + 1, qList.length - 1))}
                        disabled={currentSlideIndex === qList.length - 1}
                        style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: currentSlideIndex === qList.length - 1 ? 'not-allowed' : 'pointer', opacity: currentSlideIndex === qList.length - 1 ? 0.4 : 1 }}
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  {/* Question Card */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1.5rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                      <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {currentQ.section || `Question ${currentSlideIndex + 1}`}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: '#facc15', fontWeight: 600 }}>
                        [{currentQ.marks || 5} Marks]
                      </span>
                    </div>

                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.15rem', color: '#fff', lineHeight: 1.5, fontWeight: 500 }}>
                      {currentQ.question}
                    </h4>

                    {currentQ.options && currentQ.options.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem', marginBottom: '1.25rem' }}>
                        {currentQ.options.map((opt, oIdx) => (
                          <div key={oIdx} style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.9rem', color: '#e2e8f0' }}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Student Answer Space */}
                    <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
                        Student Written Answer:
                      </label>
                      <textarea
                        value={studentAnswers[currentQ.id] || ''}
                        onChange={(e) => setStudentAnswers(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                        placeholder="Write or calculate your answer steps here..."
                        rows={4}
                        style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.9rem' }}
                      />
                    </div>

                    {/* Teacher grading controls in examiner mode */}
                    {testViewMode === 'examiner' && (
                      <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.25)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#c4b5fd' }}>Teacher Grading & Awarded Mark:</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <input
                              type="number"
                              min="0"
                              max={currentQ.marks || 100}
                              value={awardedMarks[currentQ.id] || ''}
                              onChange={(e) => setAwardedMarks(prev => ({ ...prev, [currentQ.id]: e.target.value }))}
                              placeholder="0"
                              style={{ width: '60px', padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent-primary)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', textAlign: 'center' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ {currentQ.marks || 5}</span>
                          </div>
                        </div>

                        {currentQ.answerKey && (
                          <div style={{ fontSize: '0.82rem', color: '#94a3b8', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '6px', marginTop: '0.4rem' }}>
                            <strong style={{ color: '#34d399' }}>Answer Key / Solution:</strong> {currentQ.answerKey}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Uploaded Answer Paper Sheets */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '1.25rem', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
                        Physical Handwritten Answer Sheets ({uploadedAnswerPages.length} Pages)
                      </span>
                      <label style={{ cursor: 'pointer', padding: '0.35rem 0.85rem', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '6px', fontSize: '0.8rem', color: '#fff', fontWeight: 500 }}>
                        <span>Upload Photos</span>
                        <input type="file" accept="image/*" multiple onChange={handleUploadPaperPhoto} style={{ display: 'none' }} />
                      </label>
                    </div>

                    {uploadedAnswerPages.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.75rem' }}>
                        {uploadedAnswerPages.map(page => (
                          <div key={page.id} style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <img
                              src={page.dataUrl}
                              alt="Answer sheet"
                              onClick={() => setZoomedImageUrl(page.dataUrl)}
                              style={{ width: '100%', height: '150px', objectFit: 'cover', cursor: 'pointer' }}
                            />
                            <button
                              onClick={() => handleDeleteUploadedPage(page.id)}
                              style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#ef4444', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontSize: '0.75rem' }}
                              title="Delete Page"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        No paper sheets uploaded yet. Click "+ Upload Photos" to attach student's handwritten papers.
                      </p>
                    )}
                  </div>

                  {/* Actions: Save Submission or Save Grading */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                    {testViewMode === 'student' ? (
                      <button
                        onClick={handleSaveStudentSubmission}
                        disabled={isSavingSubmission}
                        className="primary"
                        style={{ padding: '0.65rem 1.4rem', borderRadius: '8px', fontSize: '0.9rem' }}
                      >
                        {isSavingSubmission ? 'Saving Answers...' : 'Save Student Submission'}
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveGrading}
                        disabled={isSavingGrading}
                        className="primary"
                        style={{ padding: '0.65rem 1.4rem', borderRadius: '8px', fontSize: '0.9rem' }}
                      >
                        {isSavingGrading ? 'Saving Evaluation...' : 'Save Grading & Finalize Score'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Universal Subject Settings Modal */}
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

      {/* Modal: Add Exam */}
      {showAddExamModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <form onSubmit={handleAddExam} className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Exam to {subject.title}</h3>
            <input
              type="text"
              value={newExamTitle}
              onChange={(e) => setNewExamTitle(e.target.value)}
              placeholder="e.g. Midterm Examination / CT-4"
              required
              style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', marginBottom: '1.25rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setShowAddExamModal(false)} style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: '#fff' }}>Cancel</button>
              <button type="submit" className="primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '6px' }}>Add Exam</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Add Chapter */}
      {showAddChapterModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <form onSubmit={handleAddChapter} className="card" style={{ maxWidth: '440px', width: '100%', textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Add Chapter ({targetExamForChapter?.title})</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Chapter Title</label>
              <input
                type="text"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                placeholder="e.g. Chapter 4: Fractions"
                required
                style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.3rem' }}>Textbook Page (Optional)</label>
              <input
                type="text"
                value={newChapterPdfPage}
                onChange={(e) => setNewChapterPdfPage(e.target.value)}
                placeholder="e.g. 52"
                style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button type="button" onClick={() => setShowAddChapterModal(false)} style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: '#fff' }}>Cancel</button>
              <button type="submit" className="primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '6px' }}>Save Chapter</button>
            </div>
          </form>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomedImageUrl && (
        <div onClick={() => setZoomedImageUrl(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: '1rem', cursor: 'zoom-out' }}>
          <img src={zoomedImageUrl} alt="Zoomed sheet" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '8px' }} />
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
