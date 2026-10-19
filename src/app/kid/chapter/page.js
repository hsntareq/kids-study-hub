"use client";

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { generateGeminiContent } from '../../../lib/gemini';
import Link from 'next/link';

// Interactive Student Exercise Viewer supporting MCQs, Short Questions, Matching, and Fill-in-the-Blanks
const ExerciseViewer = ({ ex }) => {
  // Extract and normalize questions array
  const allQuestions = useMemo(() => {
    // If questions are already structured in an array
    if (Array.isArray(ex.questions) && ex.questions.length > 0) {
      return ex.questions;
    }

    let parsed = null;
    try {
      let rawStr = ex.question || '';
      if (typeof rawStr === 'string') {
        const match = rawStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const cleanStr = match ? match[1].trim() : rawStr.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanStr);
      }
    } catch (e) {
      // JSON parse fallback
    }

    if (parsed) {
      if (Array.isArray(parsed.questions)) {
        return parsed.questions;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }

    // Fallback: check manual block regex
    let rawText = ex.question || '';
    let extracted = [];
    const questionBlocks = rawText.match(/{\s*"question"[\s\S]*?(?=\s*{\s*"question"|\s*]\s*})/g) || [];
    if (questionBlocks.length > 0) {
      questionBlocks.forEach((block, i) => {
        try {
          const qMatch = block.match(/"question"\s*:\s*"([^"]+)"/);
          const aMatch = block.match(/"answer"\s*:\s*"([^"]+)"/);
          const tMatch = block.match(/"type"\s*:\s*"([^"]+)"/);
          let options = [];
          const optBlock = block.match(/"options"\s*:\s*\[([\s\S]*?)\]/);
          if (optBlock) {
            const optMatches = optBlock[1].match(/"([^"]+)"/g);
            if (optMatches) options = optMatches.map(o => o.replace(/"/g, ''));
          }
          if (qMatch) {
            extracted.push({
              id: i + 1,
              type: tMatch ? tMatch[1] : (options.length > 0 ? 'mcq' : 'short'),
              question: qMatch[1],
              options,
              answer: aMatch ? aMatch[1] : ''
            });
          }
        } catch (err) {}
      });
    }

    return extracted;
  }, [ex]);

  const [slideIdx, setSlideIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submittedAnswers, setSubmittedAnswers] = useState({});

  const handleSelectOption = (opt) => {
    if (submittedAnswers[slideIdx]) return;
    setSelectedAnswers(prev => ({ ...prev, [slideIdx]: opt }));
  };

  const handleTextAnswerChange = (val) => {
    if (submittedAnswers[slideIdx]) return;
    setSelectedAnswers(prev => ({ ...prev, [slideIdx]: val }));
  };

  const handleSubmitCurrent = () => {
    setSubmittedAnswers(prev => ({ ...prev, [slideIdx]: true }));
  };

  if (allQuestions.length > 0) {
    const q = allQuestions[slideIdx] || allQuestions[0];
    const qType = (q.type || (q.options && q.options.length > 0 ? 'mcq' : 'short')).toLowerCase();
    const isSubmitted = Boolean(submittedAnswers[slideIdx]);
    const currentAns = selectedAnswers[slideIdx] || '';

    // Check correctness for MCQs & fill-in-blanks
    let isCorrect = false;
    let isWrong = false;
    if (isSubmitted) {
      const cleanTarget = String(q.answer || '').trim().toLowerCase();
      const cleanUser = String(currentAns).trim().toLowerCase();
      if (cleanTarget && cleanUser) {
        if (cleanTarget === cleanUser || cleanTarget.includes(cleanUser) || cleanUser.includes(cleanTarget)) {
          isCorrect = true;
        } else {
          isWrong = true;
        }
      }
    }

    return (
      <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.25)', position: 'relative', overflow: 'hidden' }}>
        {/* Progress Bar Line */}
        <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', background: 'rgba(255,255,255,0.06)', width: '100%' }}>
          <div style={{ width: `${((slideIdx + 1) / allQuestions.length) * 100}%`, height: '100%', background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))', transition: 'width 0.3s ease-out' }}></div>
        </div>

        {/* Top Header: Question Type Badge & Counter */}
        <div style={{ marginTop: '0.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            padding: '0.2rem 0.6rem',
            borderRadius: '12px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: qType === 'mcq' ? 'rgba(56, 189, 248, 0.15)' :
                        qType === 'matching' ? 'rgba(168, 85, 247, 0.15)' :
                        qType === 'fill_in_the_blanks' ? 'rgba(245, 158, 11, 0.15)' :
                        'rgba(16, 185, 129, 0.15)',
            color: qType === 'mcq' ? '#38bdf8' :
                   qType === 'matching' ? '#c084fc' :
                   qType === 'fill_in_the_blanks' ? '#fbbf24' :
                   '#34d399',
            border: `1px solid ${
              qType === 'mcq' ? 'rgba(56, 189, 248, 0.3)' :
              qType === 'matching' ? 'rgba(168, 85, 247, 0.3)' :
              qType === 'fill_in_the_blanks' ? 'rgba(245, 158, 11, 0.3)' :
              'rgba(16, 185, 129, 0.3)'
            }`
          }}>
            {qType === 'mcq' ? 'Multiple Choice' :
             qType === 'matching' ? 'Pair Matching' :
             qType === 'fill_in_the_blanks' ? 'Fill In The Blank' :
             'Short Answer'}
          </span>

          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Question {slideIdx + 1} of {allQuestions.length}
          </span>
        </div>

        {/* Question Prompt */}
        <h4 style={{ color: '#fff', fontSize: '1.15rem', margin: '1.2rem 0 1.4rem 0', lineHeight: 1.5, fontWeight: 600 }}>
          {q.id ? `${q.id}. ` : `${slideIdx + 1}. `}{q.question}
        </h4>

        {/* 1. MCQ OPTIONS RENDERER */}
        {qType === 'mcq' && q.options && Array.isArray(q.options) && (
          <div style={{ display: 'grid', gap: '0.65rem', marginBottom: '1.5rem' }}>
            {q.options.map((opt, i) => {
              const isSelected = currentAns === opt;
              let bg = 'rgba(255,255,255,0.03)';
              let border = '1px solid rgba(255,255,255,0.1)';
              let textColor = '#e2e8f0';

              if (isSubmitted) {
                const isThisCorrect = String(q.answer || '').toLowerCase().includes(opt.toLowerCase());
                if (isThisCorrect) {
                  bg = 'rgba(16, 185, 129, 0.15)';
                  border = '1px solid #10b981';
                  textColor = '#34d399';
                } else if (isSelected && !isThisCorrect) {
                  bg = 'rgba(239, 68, 68, 0.15)';
                  border = '1px solid #ef4444';
                  textColor = '#f87171';
                }
              } else if (isSelected) {
                bg = 'rgba(99, 102, 241, 0.2)';
                border = '1px solid var(--accent-primary, #6366f1)';
                textColor = '#fff';
              }

              return (
                <div
                  key={i}
                  onClick={() => handleSelectOption(opt)}
                  style={{
                    padding: '0.85rem 1.1rem',
                    background: bg,
                    borderRadius: '10px',
                    border,
                    color: textColor,
                    fontSize: '0.95rem',
                    cursor: isSubmitted ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: isSelected ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. FILL-IN-THE-BLANKS RENDERER */}
        {qType === 'fill_in_the_blanks' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
              Your Answer for the Blank:
            </label>
            <input
              type="text"
              value={currentAns}
              onChange={(e) => handleTextAnswerChange(e.target.value)}
              disabled={isSubmitted}
              placeholder="Type missing term / number here..."
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                background: 'rgba(0,0,0,0.35)',
                border: isSubmitted
                  ? (isCorrect ? '1px solid #10b981' : '1px solid #ef4444')
                  : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: isSubmitted ? (isCorrect ? '#34d399' : '#f87171') : '#fff',
                fontSize: '1rem',
                outline: 'none'
              }}
            />
          </div>
        )}

        {/* 3. MATCHING PAIRS RENDERER */}
        {qType === 'matching' && q.pairs && Array.isArray(q.pairs) && (
          <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem', fontSize: '0.8rem', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase' }}>
              <div>Column A</div>
              <div>Column B</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {q.pairs.map((p, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.55rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '0.88rem' }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>• {p.left}</div>
                  <div style={{ color: isSubmitted ? '#34d399' : '#cbd5e1' }}>→ {p.right}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. SHORT QUESTION RENDERER */}
        {qType === 'short' && (
          <div style={{ marginBottom: '1.5rem' }}>
            <textarea
              value={currentAns}
              onChange={(e) => handleTextAnswerChange(e.target.value)}
              disabled={isSubmitted}
              placeholder="Write your explanation or step-by-step solution here..."
              rows={4}
              style={{
                width: '100%',
                padding: '0.85rem 1rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.95rem',
                resize: 'vertical',
                outline: 'none'
              }}
            />
          </div>
        )}

        {/* Check Answer Button */}
        {!isSubmitted && (
          <button
            onClick={handleSubmitCurrent}
            disabled={!currentAns && qType !== 'matching'}
            style={{
              padding: '0.7rem 1.4rem',
              background: 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: 600,
              cursor: (!currentAns && qType !== 'matching') ? 'not-allowed' : 'pointer',
              opacity: (!currentAns && qType !== 'matching') ? 0.5 : 1,
              width: '100%',
              marginBottom: '1rem',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
            }}
          >
            {qType === 'matching' ? 'Reveal Matching Pairs' : 'Check Answer & Solution'}
          </button>
        )}

        {/* Post-Submit Feedback: Correct Answer & Explanation */}
        {isSubmitted && (
          <div style={{
            background: isCorrect ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
            border: `1px solid ${isCorrect ? 'rgba(52, 211, 153, 0.35)' : 'rgba(165, 180, 252, 0.35)'}`,
            padding: '1.1rem',
            borderRadius: '10px',
            marginBottom: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '1rem' }}>{isCorrect ? '✅' : '💡'}</span>
              <strong style={{ color: isCorrect ? '#34d399' : '#a5b4fc', fontSize: '0.92rem' }}>
                {isCorrect ? 'Great Job! Correct Answer:' : 'Model Answer / Solution:'}
              </strong>
            </div>
            <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.45rem' }}>
              {q.answer}
            </div>
            {q.explanation && (
              <div style={{ fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.45, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.45rem' }}>
                <strong style={{ color: 'var(--text-secondary)' }}>Explanation: </strong>
                {q.explanation}
              </div>
            )}
          </div>
        )}

        {/* Navigation buttons: Previous & Next */}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))}
            disabled={slideIdx === 0}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: slideIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: slideIdx === 0 ? 0.4 : 1,
              fontWeight: 500
            }}
          >
            ← Previous
          </button>
          <button
            onClick={() => setSlideIdx(Math.min(allQuestions.length - 1, slideIdx + 1))}
            disabled={slideIdx === allQuestions.length - 1}
            style={{
              padding: '0.6rem 1.4rem',
              background: 'var(--accent-primary, #6366f1)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: slideIdx === allQuestions.length - 1 ? 'not-allowed' : 'pointer',
              opacity: slideIdx === allQuestions.length - 1 ? 0.4 : 1,
              fontWeight: 600
            }}
          >
            Next Question →
          </button>
        </div>
      </div>
    );
  }

  // Fallback raw text render
  return (
    <div style={{ padding: '1.5rem', textAlign: 'left' }}>
      <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1.2rem', borderRadius: '12px', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
        <strong style={{ color: '#fff', display: 'block', marginBottom: '0.5rem' }}>Assessment Content:</strong>
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
          {ex.question}
        </div>
      </div>
    </div>
  );
};

function ChapterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [kidData, setKidData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfPage, setPdfPage] = useState('');
  const [exercises, setExercises] = useState([]);
  const [isStudentView, setIsStudentView] = useState(false);
  const [isChapterMastered, setIsChapterMastered] = useState(false);

  // Chapter Topics Overview state
  const [chapterContext, setChapterContext] = useState(null);
  const [topicsOverview, setTopicsOverview] = useState('');
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [tempOverviewInput, setTempOverviewInput] = useState('');
  const [isSavingOverview, setIsSavingOverview] = useState(false);

  // AI Question Generator Configuration states
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState({
    mcq: true,
    short: true,
    matching: true,
    fill_in_the_blanks: true
  });
  const [targetQuestionCount, setTargetQuestionCount] = useState(6);
  const [selectedDifficulty, setSelectedDifficulty] = useState('Standard');
  const [customInstructions, setCustomInstructions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState('');

  // Pre-Publish Review & Staging Step state
  const [stagedAssessment, setStagedAssessment] = useState(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccessNotice, setPublishSuccessNotice] = useState('');

  // Extract query params
  const paramSubject = searchParams.get("subject") || "";
  const paramSubjectId = searchParams.get("subjectId") || "";
  const paramChapter = searchParams.get("chapter") || "";
  const paramChapterId = searchParams.get("chapterId") || "";
  const paramExamId = searchParams.get("examId") || "";
  const paramId = searchParams.get("id") || "";
  const queryParentId = searchParams.get("parentId");

  // Fetch Kid, Subject, Exam, and Chapter
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        if (queryParentId) {
          setIsStudentView(true);
        }

        const dataOwnerUid = queryParentId || currentUser.uid;
        const kidsRef = ref(database, `users/${dataOwnerUid}/kids`);

        onValue(kidsRef, (snap) => {
          const kidsData = snap.val() || {};
          let foundKidId, foundSubjId, foundExamId, foundChapId, foundPdfUrl, foundPdfPage;
          let ctxSubjectTitle = '', ctxExamTitle = '', ctxChapterTitle = '', ctxMarkDist = '', chapMastered = false;
          let chapterExercises = [];
          let loadedOverview = '';

          for (const kId in kidsData) {
            const k = kidsData[kId];
            if ((k.name && k.name.toLowerCase() === decodeURIComponent(paramId).toLowerCase()) || kId === paramId) {
              foundKidId = kId;
              if (k.subjects) {
                for (const sId in k.subjects) {
                  const s = k.subjects[sId];
                  const sSlug = s.title ? s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';
                  
                  if (sId === paramSubjectId || sSlug === paramSubject || sId === paramSubject) {
                    foundSubjId = sId;
                    if (s.chapters) {
                      for (const eId in s.chapters) {
                        if (paramExamId && eId !== paramExamId) continue;

                        for (const cId in s.chapters[eId]) {
                          const c = s.chapters[eId][cId];
                          const cSlug = c.title ? c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : '';

                          if (cId === paramChapterId || cSlug === paramChapter || cId === paramChapter) {
                            foundExamId = eId;
                            foundChapId = cId;
                            foundPdfUrl = s.bookUrl || '';
                            foundPdfPage = c.pdfPage || '';
                            ctxSubjectTitle = s.title || '';
                            ctxChapterTitle = c.title || '';
                            chapMastered = Boolean(c.completed || c.status === 'completed');
                            ctxExamTitle = (k.exams && k.exams[eId]) ? k.exams[eId].title : '';
                            ctxMarkDist = (s.examSettings && s.examSettings[eId] && s.examSettings[eId].markDistribution) ? s.examSettings[eId].markDistribution : '';
                            loadedOverview = c.overview || '';

                            const rawExercises = c.exercises || {};
                            chapterExercises = Object.keys(rawExercises)
                              .map(key => ({ id: key, ...rawExercises[key] }))
                              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }

          if (foundChapId) {
            setKidData({ kidId: foundKidId, subjectId: foundSubjId, examId: foundExamId, chapterId: foundChapId });
            setPdfUrl(foundPdfUrl);
            setPdfPage(foundPdfPage);
            setIsChapterMastered(chapMastered);
            setTopicsOverview(loadedOverview);
            setTempOverviewInput(loadedOverview);
            setChapterContext({
              subjectTitle: ctxSubjectTitle,
              examTitle: ctxExamTitle,
              chapterTitle: ctxChapterTitle,
              pdfUrl: foundPdfUrl,
              pdfPage: foundPdfPage,
              markDistribution: ctxMarkDist
            });
            setExercises(chapterExercises);
          } else {
            setChapterContext(null);
            setExercises([]);
          }
          setLoading(false);
        });
      } else {
        router.push('/');
      }
    });

    return () => unsubscribe();
  }, [router, searchParams, paramChapter, paramChapterId, paramExamId, paramId, paramSubject, paramSubjectId, queryParentId]);

  // Toggle chapter mastery status
  const handleToggleChapterMastery = async () => {
    if (!user || !kidData) return;
    const newMastered = !isChapterMastered;
    const chapPath = `users/${user.uid}/kids/${kidData.kidId}/subjects/${kidData.subjectId}/chapters/${kidData.examId}/${kidData.chapterId}`;
    await set(ref(database, `${chapPath}/completed`), newMastered);
    await set(ref(database, `${chapPath}/status`), newMastered ? 'completed' : 'in_progress');
    setIsChapterMastered(newMastered);
  };

  // Save Topics Overview to Firebase
  const handleSaveTopicsOverview = async () => {
    if (!user || !kidData) return;
    setIsSavingOverview(true);
    const chapPath = `users/${user.uid}/kids/${kidData.kidId}/subjects/${kidData.subjectId}/chapters/${kidData.examId}/${kidData.chapterId}/overview`;
    await set(ref(database, chapPath), tempOverviewInput.trim());
    setTopicsOverview(tempOverviewInput.trim());
    setIsEditingOverview(false);
    setIsSavingOverview(false);
  };

  // AI Generator: Generate Question Set based on selected types
  const handleGenerateQuestions = async () => {
    const activeTypes = Object.entries(selectedQuestionTypes)
      .filter(([_, enabled]) => enabled)
      .map(([type]) => type);

    if (activeTypes.length === 0) {
      setAiError('Please select at least one question type (MCQ, Short, Matching, or Fill-in-the-Blanks).');
      return;
    }

    setIsGenerating(true);
    setAiError('');
    setPublishSuccessNotice('');

    try {
      const typeLabels = activeTypes.map(t => {
        if (t === 'mcq') return 'Multiple Choice (MCQ with 4 options)';
        if (t === 'short') return 'Short Answer (Conceptual / Problem solving)';
        if (t === 'matching') return 'Pair Matching (Column A to Column B)';
        if (t === 'fill_in_the_blanks') return 'Fill-in-the-Blanks (with a clear missing keyword or number)';
        return t;
      }).join(', ');

      const prompt = `You are a master teacher and curriculum assessment expert.
Generate a high quality assessment for this chapter:
Subject: ${chapterContext?.subjectTitle || 'Mathematics'}
Exam Type: ${chapterContext?.examTitle || 'Exam Preparation'}
Chapter: ${chapterContext?.chapterTitle || 'Chapter Syllabus'}
Textbook Page Reference: ${chapterContext?.pdfPage ? `Starting from page ${chapterContext.pdfPage}` : 'Standard syllabus'}
Difficulty Level: ${selectedDifficulty}
Target Question Count: ${targetQuestionCount}
Selected Question Types to include: ${typeLabels}
Custom Teacher Guidelines: ${customInstructions || 'Cover fundamental principles, analytical thinking, and practical applications.'}

STRICT JSON OUTPUT FORMAT REQUIRED:
Return ONLY a valid JSON object matching this exact schema:
{
  "title": "${chapterContext?.chapterTitle || 'Chapter'} Assessment (${selectedDifficulty})",
  "questions": [
    {
      "id": 1,
      "type": "mcq", // MUST be one of: "mcq", "short", "matching", "fill_in_the_blanks"
      "question": "Clear, precise question statement",
      "options": ["Option A", "Option B", "Option C", "Option D"], // Provide only for "mcq"
      "pairs": [ // Provide only for "matching": 3 to 4 pairs
        { "left": "Item A", "right": "Corresponding match" },
        { "left": "Item B", "right": "Corresponding match" }
      ],
      "answer": "Accurate correct answer or matched summary",
      "explanation": "Concise step-by-step reasoning or formula used"
    }
  ]
}

Include balanced questions from the selected types. Ensure math expressions are cleanly written in plain readable text (e.g. 3/4, 25%, x = 5).`;

      const jsonResponseText = await generateGeminiContent(prompt);
      
      let parsed = null;
      try {
        const match = jsonResponseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const cleanJson = match ? match[1].trim() : jsonResponseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsed = JSON.parse(cleanJson);
      } catch (e) {
        throw new Error('AI response was not in expected JSON format. Please try generating again.');
      }

      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        throw new Error('No structured questions could be extracted. Please try again.');
      }

      // Populate into Staged Review state (NOT published yet!)
      setStagedAssessment({
        title: parsed.title || `${chapterContext?.chapterTitle} Assessment`,
        questions: parsed.questions.map((q, idx) => ({
          id: q.id || idx + 1,
          type: q.type || 'mcq',
          question: q.question || '',
          options: q.options || [],
          pairs: q.pairs || [],
          answer: q.answer || '',
          explanation: q.explanation || ''
        }))
      });

    } catch (err) {
      setAiError(err.message || 'Failed to generate questions. Please check your connection and prompt settings.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Review & Approval: Edit a question in the draft
  const handleEditStagedQuestion = (qIndex, field, value) => {
    if (!stagedAssessment) return;
    const updated = [...stagedAssessment.questions];
    updated[qIndex] = { ...updated[qIndex], [field]: value };
    setStagedAssessment({ ...stagedAssessment, questions: updated });
  };

  // Review & Approval: Delete a question from the draft
  const handleDeleteStagedQuestion = (qIndex) => {
    if (!stagedAssessment) return;
    const updated = stagedAssessment.questions.filter((_, idx) => idx !== qIndex);
    setStagedAssessment({ ...stagedAssessment, questions: updated });
  };

  // Review & Approval: Add a blank question to draft
  const handleAddQuestionToStaged = () => {
    if (!stagedAssessment) return;
    const newQ = {
      id: stagedAssessment.questions.length + 1,
      type: 'short',
      question: 'New custom question...',
      options: [],
      pairs: [],
      answer: '',
      explanation: ''
    };
    setStagedAssessment({ ...stagedAssessment, questions: [...stagedAssessment.questions, newQ] });
  };

  // Publish / Approve Staged Assessment to Students
  const handleApproveAndPublish = async () => {
    if (!user || !kidData || !stagedAssessment) return;
    setIsPublishing(true);
    try {
      const exercisesRef = ref(database, `users/${user.uid}/kids/${kidData.kidId}/subjects/${kidData.subjectId}/chapters/${kidData.examId}/${kidData.chapterId}/exercises`);
      await push(exercisesRef, {
        title: stagedAssessment.title,
        questions: stagedAssessment.questions,
        question: JSON.stringify(stagedAssessment),
        status: 'published',
        approvedBy: 'parent_teacher',
        createdAt: Date.now()
      });

      setPublishSuccessNotice('🎉 Assessment successfully approved and published to the student workspace!');
      setStagedAssessment(null);
    } catch (err) {
      setAiError('Failed to publish assessment: ' + err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // Delete an existing exercise
  const handleDeleteExercise = async (exerciseId) => {
    if (!user || !kidData) return;
    const exRef = ref(database, `users/${user.uid}/kids/${kidData.kidId}/subjects/${kidData.subjectId}/chapters/${kidData.examId}/${kidData.chapterId}/exercises/${exerciseId}`);
    await remove(exRef);
  };

  if (loading) {
    return (
      <main className="view-container" style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <p>Loading Chapter Study Desk...</p>
      </main>
    );
  }

  if (!chapterContext) {
    return (
      <main className="view-container" style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>
        <h2>Chapter Workspace Not Found</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Unable to locate this chapter syllabus record.</p>
        <button onClick={() => router.back()} className="button primary" style={{ marginTop: '1rem' }}>
          ← Back to Subject Hub
        </button>
      </main>
    );
  }

  const defaultOverview = `This chapter explores the core conceptual fundamentals and analytical problem-solving techniques for ${chapterContext.chapterTitle}. Students will develop mastery in key formulas, mathematical reasoning, step-by-step problem deconstruction, and practical applications.`;

  return (
    <main className="view-container" style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem', color: '#fff' }}>
      
      {/* 1. Breadcrumb Navigation */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
        <Link href="/" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Dashboard</Link>
        <span>›</span>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0, font: 'inherit' }}>
          {chapterContext.subjectTitle} Hub
        </button>
        <span>›</span>
        <span style={{ color: '#fff', fontWeight: 600 }}>{chapterContext.chapterTitle}</span>
      </nav>

      {/* 2. TOP IDENTIFICATION & TOPICS OVERVIEW SECTION */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(23, 28, 44, 0.95), rgba(15, 18, 30, 0.98))',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '20px',
        padding: '1.75rem 2rem',
        marginBottom: '2rem',
        boxShadow: '0 16px 36px -10px rgba(0, 0, 0, 0.6)',
        textAlign: 'left'
      }}>
        {/* Identification Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            {/* Meta Tags: Subject • Exam • Textbook Page */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.76rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', fontWeight: 600 }}>
                📐 {chapterContext.subjectTitle}
              </span>
              {chapterContext.examTitle && (
                <span style={{ fontSize: '0.76rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.18)', color: '#fbbf24', fontWeight: 600 }}>
                  🎯 {chapterContext.examTitle}
                </span>
              )}
              {pdfPage && (
                <span style={{ fontSize: '0.76rem', padding: '0.2rem 0.65rem', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600 }}>
                  📖 Textbook Page {pdfPage}
                </span>
              )}
            </div>

            {/* Chapter Title */}
            <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
              {chapterContext.chapterTitle}
            </h1>
          </div>

          {/* Quick Actions: Textbook Reader Link + Mastery Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {pdfUrl && (
              <a
                href={pdfPage ? `${pdfUrl}#page=${pdfPage}` : pdfUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.1rem',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '10px',
                  color: '#38bdf8',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <span>Open Reader 📖</span>
              </a>
            )}

            {!isStudentView && (
              <button
                type="button"
                onClick={handleToggleChapterMastery}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.6rem 1.2rem',
                  background: isChapterMastered ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: isChapterMastered ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '10px',
                  color: isChapterMastered ? '#34d399' : '#fff',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <span>{isChapterMastered ? '✓ Mastered' : '○ Mark as Mastered'}</span>
              </button>
            )}
          </div>
        </div>

        {/* TOPICS OVERVIEW CARD */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '1.25rem 1.4rem',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.1rem' }}>📋</span>
              <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.02em' }}>
                Chapter Overview & Key Curriculum Objectives
              </h3>
            </div>

            {!isStudentView && !isEditingOverview && (
              <button
                onClick={() => setIsEditingOverview(true)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-primary, #a5b4fc)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <span>✏️ Edit Overview</span>
              </button>
            )}
          </div>

          {/* Inline Edit View for Overview */}
          {isEditingOverview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                value={tempOverviewInput}
                onChange={(e) => setTempOverviewInput(e.target.value)}
                placeholder="Write a brief overview of topics, core formulas, and practice goals covered in this chapter..."
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.8rem 1rem',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid var(--accent-primary, #6366f1)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button
                  type="button"
                  onClick={() => { setTempOverviewInput(topicsOverview); setIsEditingOverview(false); }}
                  style={{ padding: '0.45rem 0.9rem', background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTopicsOverview}
                  disabled={isSavingOverview}
                  className="primary"
                  style={{ padding: '0.45rem 1.1rem', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {isSavingOverview ? 'Saving...' : 'Save Overview'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: 0, fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.55 }}>
                {topicsOverview || defaultOverview}
              </p>

              {/* Topic Breakdown Pills */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                  💡 Core Theory & Definitions
                </span>
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                  📐 Formula Rules & Derivations
                </span>
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                  ⚡ Conceptual Problem Solving
                </span>
                <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0' }}>
                  🎯 Practice Assessments
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. GEMINI AI QUESTION GENERATOR WITH QUESTION TYPE SELECTION */}
      {!isStudentView && (
        <div style={{
          background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.4), rgba(15, 23, 42, 0.75))',
          border: '1px solid rgba(129, 140, 248, 0.3)',
          borderRadius: '18px',
          padding: '1.75rem',
          marginBottom: '2rem',
          textAlign: 'left',
          boxShadow: '0 12px 30px -8px rgba(0,0,0,0.5)'
        }}>
          {/* Section Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.6rem', borderRadius: '20px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                AI Assessment Studio
              </div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#fff' }}>
                Gemini AI Question Generator
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Select required question formats, configure difficulty, and generate staged questions for your approval.
              </p>
            </div>
          </div>

          {/* Interactive Question Type Selector Grid */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>
              Select Question Types to Generate:
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
              {[
                { key: 'mcq', label: 'MCQs', desc: '4-choice multiple choice with instant feedback', icon: '🔘' },
                { key: 'short', label: 'Short Questions', desc: 'Conceptual explanations & step-by-step math', icon: '📝' },
                { key: 'matching', label: 'Matching Pairs', desc: 'Column A to Column B relation pairing', icon: '🔗' },
                { key: 'fill_in_the_blanks', label: 'Fill-in-the-Blanks', desc: 'Sentence with missing keywords or values', icon: '✏️' }
              ].map((item) => {
                const isChecked = selectedQuestionTypes[item.key];
                return (
                  <div
                    key={item.key}
                    onClick={() => setSelectedQuestionTypes(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '12px',
                      background: isChecked ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.03)',
                      border: isChecked ? '1px solid rgba(129, 140, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.65rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ marginTop: '2px', cursor: 'pointer', accentColor: '#6366f1' }}
                    />
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, color: isChecked ? '#fff' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.15rem', lineHeight: 1.3 }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generation Controls: Count • Difficulty • Custom Focus */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
            
            {/* Number of Questions */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Question Count
              </label>
              <select
                value={targetQuestionCount}
                onChange={(e) => setTargetQuestionCount(Number(e.target.value))}
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value={4} style={{ background: '#1e1b4b' }}>4 Questions (Quick Check)</option>
                <option value={6} style={{ background: '#1e1b4b' }}>6 Questions (Standard)</option>
                <option value={8} style={{ background: '#1e1b4b' }}>8 Questions (Comprehensive)</option>
                <option value={10} style={{ background: '#1e1b4b' }}>10 Questions (Full Test)</option>
              </select>
            </div>

            {/* Difficulty Level */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Difficulty Level
              </label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="Foundational" style={{ background: '#1e1b4b' }}>Foundational (Basics & Definitions)</option>
                <option value="Standard" style={{ background: '#1e1b4b' }}>Standard (Balanced Curriculum)</option>
                <option value="Challenging" style={{ background: '#1e1b4b' }}>Challenging (Advanced Word Problems)</option>
              </select>
            </div>

            {/* Custom Guidelines / Focus */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Specific Focus Instructions (Optional)
              </label>
              <input
                type="text"
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g. Focus on word problems involving percentage discounts and real life examples"
                style={{ width: '100%', padding: '0.55rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', color: '#fff', fontSize: '0.85rem', outline: 'none' }}
              />
            </div>
          </div>

          {/* AI Error display */}
          {aiError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚠️</span>
              <span>{aiError}</span>
            </div>
          )}

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleGenerateQuestions}
            disabled={isGenerating}
            style={{
              width: '100%',
              padding: '0.85rem 1.5rem',
              background: isGenerating ? 'rgba(99, 102, 241, 0.5)' : 'var(--accent-gradient, linear-gradient(135deg, #6366f1, #8b5cf6))',
              border: 'none',
              borderRadius: '10px',
              color: '#fff',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isGenerating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.6rem',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.15s ease'
            }}
          >
            {isGenerating ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                Generating Questions with Gemini AI...
              </>
            ) : (
              <>
                <span>✨ Generate Question Draft</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 4. PRE-PUBLISH STAGING & REVIEW WORKSPACE (TEACHER/PARENT APPROVAL) */}
      {stagedAssessment && !isStudentView && (
        <div style={{
          background: 'linear-gradient(145deg, rgba(30, 27, 75, 0.85), rgba(15, 23, 42, 0.95))',
          border: '2px solid #818cf8',
          borderRadius: '18px',
          padding: '1.75rem',
          marginBottom: '2.5rem',
          textAlign: 'left',
          boxShadow: '0 20px 48px -10px rgba(99, 102, 241, 0.4)'
        }}>
          {/* Staging Top Banner */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.2rem 0.65rem', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid rgba(251, 191, 36, 0.4)', color: '#fbbf24', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                🔒 Review Step • Pending Teacher / Parent Approval
              </div>
              <h3 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>
                {stagedAssessment.title}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
                Review, edit, or adjust questions below. Students cannot see this assessment until you click <strong>Approve & Publish</strong>.
              </p>
            </div>

            {/* Approval Action Buttons */}
            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStagedAssessment(null)}
                style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Discard Draft
              </button>
              <button
                type="button"
                onClick={handleAddQuestionToStaged}
                style={{ padding: '0.6rem 1rem', background: 'rgba(99, 102, 241, 0.18)', border: '1px solid rgba(99, 102, 241, 0.35)', borderRadius: '8px', color: '#a5b4fc', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                + Add Question
              </button>
              <button
                type="button"
                onClick={handleApproveAndPublish}
                disabled={isPublishing}
                style={{
                  padding: '0.65rem 1.4rem',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  cursor: isPublishing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                }}
              >
                {isPublishing ? 'Publishing...' : '✓ Approve & Publish to Students'}
              </button>
            </div>
          </div>

          {/* Staged Questions Editable Review Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {stagedAssessment.questions.map((q, idx) => (
              <div
                key={idx}
                style={{
                  background: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}
              >
                {/* Question Header: Type selector + Delete button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#a5b4fc' }}>
                      Q{idx + 1}.
                    </span>
                    <select
                      value={q.type || 'mcq'}
                      onChange={(e) => handleEditStagedQuestion(idx, 'type', e.target.value)}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        borderRadius: '6px',
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#fff'
                      }}
                    >
                      <option value="mcq" style={{ background: '#1e1b4b' }}>Multiple Choice (MCQ)</option>
                      <option value="short" style={{ background: '#1e1b4b' }}>Short Question</option>
                      <option value="matching" style={{ background: '#1e1b4b' }}>Pair Matching</option>
                      <option value="fill_in_the_blanks" style={{ background: '#1e1b4b' }}>Fill in the Blanks</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteStagedQuestion(idx)}
                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#f87171', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    🗑️ Remove
                  </button>
                </div>

                {/* Question Statement Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Question Statement:</label>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => handleEditStagedQuestion(idx, 'question', e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.8rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff', fontSize: '0.92rem' }}
                  />
                </div>

                {/* MCQ Options Editor */}
                {q.type === 'mcq' && q.options && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Options (comma separated or individual):</label>
                    <input
                      type="text"
                      value={Array.isArray(q.options) ? q.options.join(', ') : q.options}
                      onChange={(e) => handleEditStagedQuestion(idx, 'options', e.target.value.split(',').map(s => s.trim()))}
                      style={{ width: '100%', padding: '0.55rem 0.8rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem' }}
                    />
                  </div>
                )}

                {/* Answer Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Correct Answer / Expected Solution:</label>
                  <input
                    type="text"
                    value={q.answer}
                    onChange={(e) => handleEditStagedQuestion(idx, 'answer', e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.8rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '6px', color: '#34d399', fontSize: '0.88rem', fontWeight: 600 }}
                  />
                </div>

                {/* Explanation Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Explanation / Formula hint:</label>
                  <input
                    type="text"
                    value={q.explanation || ''}
                    onChange={(e) => handleEditStagedQuestion(idx, 'explanation', e.target.value)}
                    style={{ width: '100%', padding: '0.55rem 0.8rem', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#cbd5e1', fontSize: '0.82rem' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bottom Bar Publish Button */}
          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleApproveAndPublish}
              disabled={isPublishing}
              style={{
                padding: '0.75rem 1.8rem',
                background: '#10b981',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.92rem',
                fontWeight: 700,
                cursor: isPublishing ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
              }}
            >
              {isPublishing ? 'Publishing to Students...' : '✓ Approve & Publish All to Student Workspace'}
            </button>
          </div>
        </div>
      )}

      {/* Success Notification Banner */}
      {publishSuccessNotice && (
        <div style={{ padding: '1rem 1.25rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(52, 211, 153, 0.4)', borderRadius: '12px', color: '#34d399', fontSize: '0.92rem', fontWeight: 600, marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{publishSuccessNotice}</span>
          <button onClick={() => setPublishSuccessNotice('')} style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
        </div>
      )}

      {/* 5. PUBLISHED ASSESSMENTS & EXERCISES SECTION (STUDENT & TEACHER ACTIVE WORKSPACE) */}
      <div style={{ textAlign: 'left', marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontSize: '1.2rem' }}>📝</span>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#fff' }}>
                Published Chapter Exercises & Practice Tests
              </h2>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {isStudentView 
                ? 'Solve the exercises below to test your mastery of this chapter.' 
                : 'Active exercises accessible to students. Click questions to inspect answers and solutions.'}
            </p>
          </div>

          <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '0.25rem 0.65rem', borderRadius: '12px', color: 'var(--text-secondary)' }}>
            {exercises.length} {exercises.length === 1 ? 'Exercise' : 'Exercises'}
          </span>
        </div>

        {/* Exercises List */}
        {exercises.length === 0 ? (
          <div style={{ padding: '2.75rem 1rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0, fontSize: '0.92rem' }}>
              {isStudentView 
                ? "Your teacher or parent hasn't published any exercises for this chapter yet." 
                : "No assessments published yet. Use the Gemini AI Question Generator above to create and approve questions."}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {exercises.map((ex, idx) => (
              <div key={ex.id} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', overflow: 'hidden' }}>
                
                {/* Exercise Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.1rem 1.4rem', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '0.78rem', padding: '0.15rem 0.5rem', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 700 }}>
                      ✓ Published
                    </span>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                      {ex.title || `Exercise ${idx + 1}`}
                    </h3>
                  </div>

                  {!isStudentView && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <button
                        onClick={() => handleDeleteExercise(ex.id)}
                        title="Delete this exercise"
                        style={{ padding: '0.35rem 0.65rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: '6px', color: '#f87171', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {/* Interactive Exercise Viewer */}
                <ExerciseViewer ex={ex} />
              </div>
            ))}
          </div>
        )}
      </div>

    </main>
  );
}

export default function ChapterPage() {
  return (
    <Suspense fallback={<div className="view-container" style={{ padding: '2rem', color: '#fff', textAlign: 'center' }}>Loading workspace...</div>}>
      <ChapterPageContent />
    </Suspense>
  );
}
