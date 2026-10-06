"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { generateGeminiContent } from '../../../../lib/gemini';
import Link from 'next/link';

export default function SubjectPage() {
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

  // Modals & settings state
  const [showSubjectSettings, setShowSubjectSettings] = useState(false);
  const [tempBookUrl, setTempBookUrl] = useState('');
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
            setTempBookUrl(matchedSubj.bookUrl || '');
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
  }, [params.id, params.subject, searchParams, router]);

  // Calculate overall subject progress
  let totalSubjectChapters = 0;
  let completedSubjectChapters = 0;
  let totalSubjectModelTests = 0;

  if (subject && exams.length > 0) {
    exams.forEach(ex => {
      const chaps = (subject.chapters && subject.chapters[ex.id]) || {};
      const chapsList = Object.values(chaps);
      totalSubjectChapters += chapsList.length;
      completedSubjectChapters += chapsList.filter(c => c.completed || c.status === 'completed').length;

      const tests = (subject.modelTests && subject.modelTests[ex.id]) || {};
      totalSubjectModelTests += Object.keys(tests).length;
    });
  }

  const subjectProgressPercent = totalSubjectChapters > 0
    ? Math.round((completedSubjectChapters / totalSubjectChapters) * 100)
    : 0;

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

  // Save subject book settings
  const handleSaveSubjectSettings = async () => {
    if (!user || !kid || !subject) return;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/bookUrl`), tempBookUrl.trim());
    setBookUrl(tempBookUrl.trim());
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
        <Link href={`/kid/${params.id}`} style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600 }}>
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
        <Link href={`/kid/${params.id}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{kid.name}</Link>
        <span>›</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{subject.title}</span>
      </nav>

      {/* 2. Hero Subject Header Card */}
      <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '20px', padding: '2rem', marginBottom: '2rem', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.18)', color: '#818cf8', fontWeight: 600 }}>
                {kid.grade || 'Grade Syllabus'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Student: <strong>{kid.name}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.6rem' }}>
              <h1 style={{ margin: 0, fontSize: '2.4rem', fontWeight: 700, color: '#fff' }}>
                {subject.title}
              </h1>
              <button
                onClick={() => setShowSubjectSettings(true)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.3rem', display: 'flex', alignItems: 'center' }}
                title="Subject Settings (Textbook URL)"
                onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-primary)'}
                onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              </button>
            </div>

            <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Complete curriculum, exams breakdown, syllabus chapters, and AI model tests.
            </p>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <span>Read Textbook 📖</span>
              </a>
            )}
            <button
              onClick={() => { setNewExamTitle(''); setShowAddExamModal(true); }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 1.1rem',
                background: 'var(--accent-gradient)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 3px 12px rgba(139, 92, 246, 0.35)'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Exam</span>
            </button>
          </div>
        </div>

        {/* Overall Subject Progress & Metrics */}
        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f1f5f9' }}>
              Overall Subject Syllabus Mastery
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
              {subjectProgressPercent}% ({completedSubjectChapters}/{totalSubjectChapters} Chapters Completed)
            </span>
          </div>

          <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${subjectProgressPercent}%`,
              background: subjectProgressPercent === 100
                ? 'linear-gradient(90deg, #10b981, #059669)'
                : 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
              borderRadius: '4px',
              transition: 'width 0.4s ease'
            }} />
          </div>

          {/* Quick Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#fff' }}>{exams.length}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Exams</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#34d399' }}>{completedSubjectChapters}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mastered Chapters</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#60a5fa' }}>{totalSubjectChapters}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Chapters</div>
            </div>
            <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#c084fc' }}>{totalSubjectModelTests}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Model Tests</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Exams in Accordion View */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', textAlign: 'left' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#fff', margin: 0 }}>
              Exams of {subject.title}
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Click any exam to toggle its syllabus chapters, mark distribution, and model tests.
            </p>
          </div>
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
              const examPageHref = `/kid/${params.id}/${subjectSlug}/exam/${exam.id}?subjectId=${subject.id}${parentIdQuery}`;

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
                              const linkHref = `/kid/${params.id}/${subjectSlug}/${chapSlug}${parentIdQuery}`;

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

      {/* Modal: Subject Settings (Textbook URL) */}
      {showSubjectSettings && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '480px', width: '100%', textAlign: 'left', padding: '1.5rem' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>{subject.title} Settings</h3>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
              Online Textbook / PDF URL:
            </label>
            <input
              type="url"
              value={tempBookUrl}
              onChange={(e) => setTempBookUrl(e.target.value)}
              placeholder="https://example.com/textbook.pdf"
              style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', marginBottom: '1.25rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button onClick={() => setShowSubjectSettings(false)} style={{ padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', color: '#fff' }}>Cancel</button>
              <button onClick={handleSaveSubjectSettings} className="primary" style={{ padding: '0.5rem 1.2rem', borderRadius: '6px' }}>Save</button>
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
