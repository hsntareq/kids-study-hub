"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { generateGeminiContent } from '../../../lib/gemini';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { ref, get, push, set, onValue, remove } from 'firebase/database';
import Link from 'next/link';

export default function KidProfile() {
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
  const [expandedExams, setExpandedExams] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  
  const [newPdfPage, setNewPdfPage] = useState('');
  const [editPdfPage, setEditPdfPage] = useState('');
  const [settingsSubject, setSettingsSubject] = useState(null);
  const [subjectBookUrl, setSubjectBookUrl] = useState('');
  
  const [settingsExamInfo, setSettingsExamInfo] = useState(null);
  const [examMarkDistribution, setExamMarkDistribution] = useState('');

  // Mark Distribution inline edit state
  const [editingMarkDistKey, setEditingMarkDistKey] = useState(null); // `${subjectId}_${examId}`
  const [inlineMarkDistValue, setInlineMarkDistValue] = useState('');

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

  const [editingResultTestId, setEditingResultTestId] = useState(null);
  const [tempResultInput, setTempResultInput] = useState('');
  const [copiedSuccess, setCopiedSuccess] = useState(false);

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

  // Parser to convert questions into structured clean array without any markdown
  const parseQuestionsData = (raw) => {
    if (!raw) return [];

    // If already an array of question objects
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

    // If an object with a .questions array
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
      if (questions.length > 0) return questions;

      return [
        {
          id: 1,
          number: 1,
          section: 'General Section',
          question: cleanText(raw),
          marks: 10,
          options: [],
          answerKey: ''
        }
      ];
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
            const foundKid = kidsList.find(k => k.name.toLowerCase() === decodeURIComponent(params.id).toLowerCase() || k.id === params.id);
            
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
  }, [router, params.id, searchParams]);

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

  const handleSaveInlineMarkDist = async (subjectId, examId) => {
    if (!user || !kid) return;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}/markDistribution`), inlineMarkDistValue);
    setEditingMarkDistKey(null);
  };

  const handleToggleChapterComplete = async (subjectId, examId, chapId, currentCompleted) => {
    if (!user || !kid) return;
    const newCompleted = !currentCompleted;
    const chapPath = `users/${user.uid}/kids/${kid.id}/subjects/${subjectId}/chapters/${examId}/${chapId}`;
    await set(ref(database, `${chapPath}/completed`), newCompleted);
    await set(ref(database, `${chapPath}/status`), newCompleted ? 'completed' : 'not_started');
  };

  const handleUpdateExamStatus = async (subjectId, examId, newStatus) => {
    if (!user || !kid) return;
    const path = `users/${user.uid}/kids/${kid.id}/subjects/${subjectId}/examSettings/${examId}/status`;
    await set(ref(database, path), newStatus);
  };

  const handleDelete = async (id, type, parentSubjectId = null, parentExamId = null) => {
    if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
    let path = '';
    if (type === 'subject') path = `users/${user.uid}/kids/${kid.id}/subjects/${id}`;
    else if (type === 'exam') path = `users/${user.uid}/kids/${kid.id}/exams/${id}`;
    else if (type === 'chapter') path = `users/${user.uid}/kids/${kid.id}/subjects/${parentSubjectId}/chapters/${parentExamId}/${id}`;
    
    await remove(ref(database, path));
  };

  // Open Popover to generate model test
  const openModelTestGenerator = (subject, exam) => {
    const today = new Date().toISOString().split('T')[0];
    const formattedToday = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const currentDist = (subject.examSettings && subject.examSettings[exam.id] && subject.examSettings[exam.id].markDistribution) || '';
    
    const chaptersObj = (subject.chapters && subject.chapters[exam.id]) || {};
    const allChapIds = Object.keys(chaptersObj);

    setModelTestTarget({ subject, exam });
    setModelTestDate(today);
    setModelTestTitle(`Model Test - ${formattedToday}`);
    setModelTestResult('0');
    setSelectedChaptersForTest(allChapIds);
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

      // Update exam mark distribution if changed in modal
      if (testMarkDistribution.trim()) {
        await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/markDistribution`), testMarkDistribution.trim());
      }

      // Save Model Test in Firebase
      const testsRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
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

      setModelTestTarget(null);
      openTestViewer({
        subjectId: subject.id,
        examId: exam.id,
        testId: newTestRef.key,
        ...testData
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
        await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/examSettings/${exam.id}/markDistribution`), testMarkDistribution.trim());
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

      const testsRef = ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subject.id}/modelTests/${exam.id}`);
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

  const handleUpdateTestResult = async (subjectId, examId, testId, newResult) => {
    if (!user || !kid) return;
    await set(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subjectId}/modelTests/${examId}/${testId}/result`), newResult);
    if (viewingModelTest && viewingModelTest.testId === testId) {
      setViewingModelTest(prev => ({ ...prev, result: newResult }));
    }
    setEditingResultTestId(null);
  };

  const handleDeleteModelTest = async (subjectId, examId, testId) => {
    if (!window.confirm('Are you sure you want to delete this model test?')) return;
    await remove(ref(database, `users/${user.uid}/kids/${kid.id}/subjects/${subjectId}/modelTests/${examId}/${testId}`));
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
        const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
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
    const updated = { ...studentAnswers, [qId]: text };
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
      const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const handleDeleteUploadedPage = async (pageId) => {
    const updated = uploadedAnswerPages.filter(p => p.id !== pageId);
    setUploadedAnswerPages(updated);
    if (viewingModelTest && user && kid) {
      const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
      await set(ref(database, `${path}/uploadedPages`), updated);
      setViewingModelTest(prev => ({ ...prev, uploadedPages: updated }));
    }
  };

  const handleSaveStudentSubmission = async () => {
    if (!viewingModelTest || !user || !kid) return;
    setIsSavingSubmission(true);
    try {
      const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
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

      const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
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

  const handleSaveExaminerGrading = async (parsedQuestions) => {
    if (!viewingModelTest || !user || !kid) return;
    setIsSavingGrading(true);
    try {
      const totalMax = parsedQuestions.reduce((acc, q) => acc + (Number(q.marks) || 0), 0) || 100;
      const totalAwarded = parsedQuestions.reduce((acc, q) => acc + (Number(awardedMarks[q.id]) || 0), 0);
      const newResult = `${totalAwarded}/${totalMax}`;

      const path = `users/${user.uid}/kids/${kid.id}/subjects/${viewingModelTest.subjectId}/modelTests/${viewingModelTest.examId}/${viewingModelTest.testId}`;
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
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>We couldn't find a profile for "{params.id}".</p>
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

  return (
    <main className="view-container">
      <div className="card" style={{ maxWidth: '840px', width: '100%', padding: '2.5rem' }}>
        
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
        <div style={{ marginTop: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ textAlign: 'left', fontSize: '1.5rem', margin: 0 }}>Subjects</h2>
            <button onClick={() => { setNewTitle(''); setAddType('subject'); setShowAddModal(true); }} style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '50%', width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }} title="Add Subject / Exam / Chapter">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {subjects.length === 0 && <p style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>No subjects added yet. Click the + icon to add one.</p>}
            {subjects.map(subject => {
              const subjectSlug = subject.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
                const examStatus = examSetting.status || (examProgress === 100 && examTotalChaps > 0 ? 'Completed' : (examProgress > 0 ? 'In Progress' : 'Not Started'));

                const rawTests = (subject.modelTests && subject.modelTests[exam.id]) || {};
                const testCount = Object.keys(rawTests).length;

                totalChapters += examTotalChaps;
                completedChapters += examCompletedChaps;
                totalTests += testCount;

                return {
                  ...exam,
                  totalChapters: examTotalChaps,
                  completedChapters: examCompletedChaps,
                  progress: examProgress,
                  status: examStatus,
                  testCount
                };
              });

              const progressPercent = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
              const queryParentId = searchParams.get("parentId");
              const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
              const subjectHubHref = `/kid/${params.id}/${subjectSlug}?subjectId=${subject.id}${parentIdQuery}`;

              return (
                <div 
                  key={subject.id} 
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px solid var(--glass-border)', 
                    borderRadius: '16px', 
                    padding: '1.4rem 1.6rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.1rem',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
                  }}
                >
                  {/* Subject Header Row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.35rem', color: '#fff', fontWeight: 600 }}>
                        {subject.title}
                      </h3>

                      <button 
                        onClick={() => { setSettingsSubject(subject); setSubjectBookUrl(subject.bookUrl || ''); }} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} 
                        onMouseOver={(e) => e.currentTarget.style.color = 'var(--accent-primary)'} 
                        onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-secondary)'} 
                        title="Subject Settings (Book URL)"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                      </button>

                      {subject.bookUrl && (
                        <span style={{ fontSize: '0.74rem', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '10px' }}>
                          📖 Textbook
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.65rem', borderRadius: '12px' }}>
                        {totalChapters} {totalChapters === 1 ? 'Chapter' : 'Chapters'}
                      </span>

                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.65rem', borderRadius: '12px' }}>
                        {subjectExams.length} {subjectExams.length === 1 ? 'Exam' : 'Exams'}
                      </span>

                      {totalTests > 0 && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', background: 'rgba(139, 92, 246, 0.15)', padding: '0.25rem 0.65rem', borderRadius: '12px', fontWeight: 600 }}>
                          {totalTests} {totalTests === 1 ? 'Test' : 'Tests'}
                        </span>
                      )}

                      {/* Primary Link Button to Subject Detail Page */}
                      <Link
                        href={subjectHubHref}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '0.42rem 1rem',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          background: 'var(--accent-gradient)',
                          color: '#fff',
                          borderRadius: '16px',
                          textDecoration: 'none',
                          boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)',
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        <span>Open Subject Hub</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                      </Link>
                    </div>
                  </div>

                  {/* Syllabus Progress Bar */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <span>Syllabus Mastery</span>
                      <span style={{ fontWeight: 600, color: progressPercent === 100 ? '#34d399' : '#c4b5fd' }}>
                        {progressPercent}% Complete ({completedChapters}/{totalChapters} Chapters Mastered)
                      </span>
                    </div>
                    <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPercent}%`,
                        background: progressPercent === 100
                          ? 'linear-gradient(90deg, #10b981, #059669)'
                          : 'linear-gradient(90deg, #6366f1, #a855f7)',
                        borderRadius: '4px',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>
                  </div>

                  {/* Quick Access to Exams (Progressive Disclosure) */}
                  {subjectExams.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
                      <span style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Exams & Workspace
                      </span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.6rem' }}>
                        {subjectExams.map(ex => {
                          const queryParentId = searchParams.get("parentId");
                          const parentIdQuery = queryParentId ? `&parentId=${queryParentId}` : '';
                          const examHref = `/kid/${params.id}/${subjectSlug}/exam/${ex.id}?subjectId=${subject.id}${parentIdQuery}`;
                          return (
                            <Link
                              key={ex.id}
                              href={examHref}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '0.65rem 0.85rem',
                                background: 'rgba(255, 255, 255, 0.025)',
                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                borderRadius: '10px',
                                textDecoration: 'none',
                                transition: 'all 0.2s',
                                gap: '0.6rem'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.35)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.025)';
                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                              }}
                              title={`Open ${ex.title} Exam Workspace`}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ex.title}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  {ex.completedChapters}/{ex.totalChapters} Chaps • {ex.testCount} Tests
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                <span style={{
                                  fontSize: '0.68rem',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '10px',
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
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}><polyline points="9 18 15 12 9 6"></polyline></svg>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* Model Test Generator Popover Modal */}
      {modelTestTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative', animation: 'fadeIn 0.25s ease-out', textAlign: 'left', padding: '1.8rem' }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.4rem' }}>Generate Model Test</h2>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
                  {modelTestTarget.subject.title} • {modelTestTarget.exam.title}
                </p>
              </div>
              <button 
                onClick={() => setModelTestTarget(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            {generateError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.88rem' }}>
                {generateError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              
              {/* 1. Syllabus Chapters Selection */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9' }}>
                    1. Syllabus Chapters ({selectedChaptersForTest.length} selected)
                  </label>
                  {modelTestTarget.subject.chapters?.[modelTestTarget.exam.id] && (
                    <button 
                      type="button" 
                      onClick={() => {
                        const allKeys = Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]);
                        setSelectedChaptersForTest(selectedChaptersForTest.length === allKeys.length ? [] : allKeys);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', padding: 0 }}
                    >
                      {selectedChaptersForTest.length === Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>

                {modelTestTarget.subject.chapters?.[modelTestTarget.exam.id] && Object.keys(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.4rem', maxHeight: '130px', overflowY: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    {Object.entries(modelTestTarget.subject.chapters[modelTestTarget.exam.id]).map(([cId, c]) => {
                      const isSelected = selectedChaptersForTest.includes(cId);
                      return (
                        <div
                          key={cId}
                          onClick={() => toggleChapterSelection(cId)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.35rem 0.6rem',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)'}`,
                            transition: 'all 0.15s'
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={() => {}} 
                            style={{ width: 'auto', margin: 0, cursor: 'pointer' }} 
                          />
                          <span style={{ fontSize: '0.85rem', color: isSelected ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.88rem', fontWeight: 600, color: '#f1f5f9' }}>
                  2. Mark Distribution (Guides Question Breakdown)
                </label>
                <textarea 
                  value={testMarkDistribution} 
                  onChange={e => setTestMarkDistribution(e.target.value)} 
                  placeholder={`e.g.\nMCQ: 20 marks\nShort Questions: 30 marks\nCreative Questions: 50 marks\nTotal: 100 marks`} 
                  style={{ width: '100%', padding: '0.65rem', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)', borderRadius: '8px', color: '#fff', fontSize: '0.88rem', minHeight: '80px', resize: 'vertical' }} 
                />
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
                  <button 
                    type="button" 
                    onClick={() => setTestMarkDistribution("MCQ: 20 marks\nShort Questions: 30 marks\nCreative/Descriptive: 50 marks\nTotal: 100 marks")}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                  >
                    Preset: 100 Marks Standard
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTestMarkDistribution("MCQ: 15 marks\nShort Questions: 15 marks\nCreative Questions: 20 marks\nTotal: 50 marks")}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--glass-border)', borderRadius: '4px', color: 'var(--text-secondary)' }}
                  >
                    Preset: 50 Marks CT
                  </button>
                </div>
              </div>

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

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
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
        </div>
      )}

      {/* Model Test Question Paper, Answer Sheet & Grading Modal */}
      {viewingModelTest && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '820px', width: '100%', maxHeight: '94vh', overflowY: 'auto', position: 'relative', animation: 'fadeIn 0.25s ease-out', textAlign: 'left', padding: '1.8rem' }}>
            
            {/* Viewer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.8rem' }}>
              <div>
                <h2 style={{ margin: '0 0 0.3rem 0', fontSize: '1.45rem', color: '#fff' }}>
                  {viewingModelTest.title || 'Model Test'}
                </h2>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <span>📅 {viewingModelTest.date || 'Today'}</span>
                  <span>• Total Marks: {totalMaxMarks}</span>
                  {viewingModelTest.difficulty && (
                    <span style={{ padding: '0.1rem 0.5rem', borderRadius: '10px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.72rem' }}>
                      {viewingModelTest.difficulty}
                    </span>
                  )}
                </div>
              </div>

              {/* Close Button */}
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

            {/* Mode Selector Tab Bar */}
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
                    color: testViewMode === 'student' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
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
                    color: testViewMode === 'examiner' ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
                  }}
                >
                  📝 Examiner: Check & Give Number
                </button>
              </div>

              {/* Current Result Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Current:</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '0.2rem 0.65rem', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                  Result {currentDisplayResult}
                </span>
              </div>
            </div>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  {questionDisplayMode === 'slide' ? `Question ${currentSlideIndex + 1} of ${parsedQuestions.length}` : `All Questions (${parsedQuestions.length})`}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '0.15rem 0.6rem', borderRadius: '12px', background: 'rgba(255,255,255,0.06)' }}>
                  {testViewMode === 'student' 
                    ? `${answeredQuestionsCount}/${parsedQuestions.length} Answered` 
                    : `${gradedQuestionsCount}/${parsedQuestions.length} Graded • Total Awarded: ${currentAwardedMarksSum}/${totalMaxMarks}`}
                </span>
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

            {/* Question Jump Pills Carousel (Slide Mode) */}
            {questionDisplayMode === 'slide' && parsedQuestions.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.1rem' }}>
                {parsedQuestions.map((q, qIdx) => {
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
                        // Auto-save before changing slide
                        if (testViewMode === 'student') {
                          saveStudentAnswers(studentAnswers, true);
                        } else {
                          saveExaminerGrading(awardedMarks, examinerNotes, overallExaminerFeedback);
                        }
                        setCurrentSlideIndex(qIdx);
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '0.35rem 0.65rem',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: isActive ? '1.5px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                        background: isActive 
                          ? 'rgba(139, 92, 246, 0.25)' 
                          : (testViewMode === 'student'
                              ? (isAns ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)')
                              : (isGrd ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.03)')),
                        color: isActive 
                          ? '#fff' 
                          : (testViewMode === 'student'
                              ? (isAns ? '#34d399' : 'var(--text-secondary)')
                              : (isGrd ? '#34d399' : 'var(--text-secondary)')),
                        boxShadow: isActive ? '0 0 10px rgba(139, 92, 246, 0.35)' : 'none',
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
                  <div
                    key={q.id || actualIndex}
                    style={{
                      background: 'rgba(0,0,0,0.28)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '12px',
                      padding: '1.3rem',
                      textAlign: 'left',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.25)'
                    }}
                  >
                    {/* Question Header: Section & Marks */}
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

                    {/* Question Prompt */}
                    <div style={{ fontSize: '1.02rem', color: '#f8fafc', lineHeight: 1.6, marginBottom: '0.9rem', whiteSpace: 'pre-line' }}>
                      {cleanText(q.question)}
                    </div>

                    {/* Multiple Choice Options (if present) */}
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
                                if (testViewMode === 'student') {
                                  handleStudentAnswerChange(q.id, opt, true);
                                }
                              }}
                              disabled={testViewMode === 'examiner'}
                              style={{
                                padding: '0.55rem 0.85rem',
                                borderRadius: '8px',
                                textAlign: 'left',
                                justifyContent: 'flex-start',
                                fontSize: '0.88rem',
                                background: isPicked ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isPicked ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)'}`,
                                color: isPicked ? '#fff' : 'var(--text-secondary)',
                                cursor: testViewMode === 'student' ? 'pointer' : 'default',
                                transition: 'all 0.15s',
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

                    {/* SPACE FOR STUDENT ANSWER & SAVING */}
                    <div style={{ marginTop: '0.65rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          ✍️ Student's Answer / Solution:
                        </label>
                        {studentAns && (
                          <span style={{ fontSize: '0.72rem', color: '#34d399' }}>✓ Response entered & saved</span>
                        )}
                      </div>

                      {testViewMode === 'student' ? (
                        <div>
                          <textarea
                            value={studentAns}
                            onChange={(e) => handleStudentAnswerChange(q.id, e.target.value)}
                            placeholder="Write your step-by-step solution or answer here (answers save automatically)..."
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '0.65rem',
                              background: 'rgba(0,0,0,0.35)',
                              border: '1px solid var(--glass-border)',
                              borderRadius: '6px',
                              color: '#fff',
                              fontSize: '0.9rem',
                              resize: 'vertical',
                              lineHeight: 1.5
                            }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => saveStudentAnswers(studentAnswers, true)}
                              style={{
                                padding: '0.3rem 0.75rem',
                                fontSize: '0.78rem',
                                background: 'rgba(139, 92, 246, 0.2)',
                                border: '1px solid var(--accent-primary)',
                                color: '#fff',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.35rem'
                              }}
                            >
                              <span>💾 Save Answer</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.25)', borderRadius: '6px', fontSize: '0.88rem', color: studentAns ? '#e2e8f0' : 'var(--text-secondary)', fontStyle: studentAns ? 'normal' : 'italic', minHeight: '40px', whiteSpace: 'pre-line' }}>
                          {studentAns || 'No typed answer. (Check student\'s uploaded handwritten answer sheets above)'}
                        </div>
                      )}
                    </div>

                    {/* EXAMINER EVALUATION BLOCK FOR THIS QUESTION */}
                    {testViewMode === 'examiner' && (
                      <div style={{ marginTop: '0.85rem', background: 'rgba(139, 92, 246, 0.06)', border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '8px', padding: '0.85rem' }}>
                        
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
                              style={{ width: '60px', padding: '0.3rem 0.5rem', fontSize: '0.88rem', fontWeight: 700, color: '#34d399', textAlign: 'center', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent-primary)', borderRadius: '6px' }}
                            />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>/ {qMarks} Marks</span>
                          </div>

                          {/* Quick award shortcuts */}
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
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
                            style={{ width: '100%', padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', color: '#cbd5e1' }}
                          />
                        </div>

                      </div>
                    )}

                  </div>
                );
              })}

            </div>

            {/* Slide Navigation Controls (Slide Mode Bottom Bar) */}
            {questionDisplayMode === 'slide' && parsedQuestions.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: '0.8rem' }}>
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
                    padding: '0.55rem 1.2rem',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: currentSlideIndex === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)',
                    color: currentSlideIndex === 0 ? 'rgba(255,255,255,0.25)' : '#fff',
                    cursor: currentSlideIndex === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s'
                  }}
                >
                  <span>←</span>
                  <span>Previous Question</span>
                </button>

                {/* Center Slide Indicator & Keyboard Hint */}
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '0.83rem', fontWeight: 600, color: '#f1f5f9' }}>
                    Question {currentSlideIndex + 1} of {parsedQuestions.length}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                    Tip: Use ← → keyboard arrow keys to slide
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
                      padding: '0.55rem 1.2rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--accent-gradient)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 2px 10px rgba(139, 92, 246, 0.35)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <span>Next Question</span>
                    <span>→</span>
                  </button>
                ) : (
                  testViewMode === 'student' ? (
                    <button
                      type="button"
                      onClick={handleSaveStudentSubmission}
                      disabled={isSavingSubmission}
                      className="primary"
                      style={{ padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <span>🚀</span>
                      <span>{isSavingSubmission ? 'Submitting...' : 'Finish & Submit Paper'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSaveExaminerGrading(parsedQuestions)}
                      disabled={isSavingGrading}
                      className="primary"
                      style={{ padding: '0.55rem 1.2rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                      <span>✅</span>
                      <span>{isSavingGrading ? 'Publishing...' : `Finish Checking (${currentAwardedMarksSum}/${totalMaxMarks})`}</span>
                    </button>
                  )
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
