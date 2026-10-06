"use client";

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { auth, database } from '../../../../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set, push, update } from 'firebase/database';
import { generateGeminiContent } from '../../../../../lib/gemini';

const ExerciseViewer = ({ ex }) => {
  let parsed = null;
  try {
    let rawStr = ex.question || '';
    if (typeof rawStr === 'string') {
      const match = rawStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleanStr = match ? match[1].trim() : rawStr.replace(/```json/gi, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleanStr);
    }
  } catch(e) {
    console.warn("JSON parse failed for exercise:", e);
  }

  const extractQuestions = (obj, sectionName = 'Question') => {
    let qs = [];
    if (!obj) return qs;
    
    if (Array.isArray(obj)) {
      obj.forEach(item => qs.push(...extractQuestions(item, sectionName)));
    } else if (typeof obj === 'object') {
      // If it looks like a question object (has options or answer and a question text)
      if (obj.question && typeof obj.question === 'string') {
        // Only consider it a question if it has typical question fields like options or answer
        if (obj.options || obj.answer || obj.question_no || obj.type) {
           qs.push({ section: obj.section_name || sectionName, ...obj });
           return qs; // Don't recurse deeper if we found a question
        }
      }
      
      const currentSection = obj.section_name || obj.section || sectionName;
      for (const key in obj) {
        qs.push(...extractQuestions(obj[key], currentSection));
      }
    }
    return qs;
  };

  let allQuestions = [];
  if (parsed) {
    allQuestions = extractQuestions(parsed);
    // Remove duplicates just in case
    allQuestions = allQuestions.filter((v,i,a)=>a.findIndex(t=>(t.question === v.question))===i);
  }

  // Robust Fallback: If JSON is permanently truncated or malformed in the database, extract questions manually via regex
  if (allQuestions.length === 0) {
    let rawText = ex.question || '';
    
    // Try to match question blocks manually
    const questionBlocks = rawText.match(/{\s*"question_no"[\s\S]*?(?=\s*{\s*"question_no"|\s*]\s*})/g) || [];
    
    if (questionBlocks.length > 0) {
       questionBlocks.forEach(block => {
          const qMatch = block.match(/"question"\s*:\s*"([^"]+)"/);
          const aMatch = block.match(/"answer"\s*:\s*"([^"]+)"/);
          const numMatch = block.match(/"question_no"\s*:\s*(\d+)/);
          
          let options = [];
          const optBlock = block.match(/"options"\s*:\s*\[([\s\S]*?)\]/);
          if (optBlock) {
             const optMatches = optBlock[1].match(/"([^"]+)"/g);
             if (optMatches) {
                options = optMatches.map(o => o.replace(/"/g, ''));
             }
          }
          
          if (qMatch) {
             allQuestions.push({
                question_no: numMatch ? parseInt(numMatch[1]) : '',
                question: qMatch[1],
                options: options,
                answer: aMatch ? aMatch[1] : '',
                section: 'Recovered Questions'
             });
          }
       });
    } else {
       // Super basic fallback if even the block regex fails
       const qMatches = [...rawText.matchAll(/"question"\s*:\s*"([^"]+)"/g)];
       if (qMatches.length > 0) {
          qMatches.forEach((m, i) => {
             allQuestions.push({
                question_no: i + 1,
                question: m[1],
                options: [],
                answer: '',
                section: 'Recovered Questions'
             });
          });
       }
    }
  }

  const [slideIdx, setSlideIdx] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submittedAnswers, setSubmittedAnswers] = useState({});

  const handleSelect = (opt) => {
    if (submittedAnswers[slideIdx]) return;
    setSelectedAnswers(prev => ({ ...prev, [slideIdx]: opt }));
  };

  const handleSubmit = () => {
    if (!selectedAnswers[slideIdx]) return;
    setSubmittedAnswers(prev => ({ ...prev, [slideIdx]: true }));
  };

  if (allQuestions.length > 0) {
    const q = allQuestions[slideIdx];
    return (
      <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.2)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '3px', background: 'rgba(255,255,255,0.05)', width: '100%' }}>
           <div style={{ width: `${((slideIdx + 1) / allQuestions.length) * 100}%`, height: '100%', background: 'var(--accent-gradient)', transition: 'width 0.3s ease-out' }}></div>
        </div>
        
        <div style={{ marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', color: 'var(--accent-primary)', fontSize: '0.85rem', fontWeight: 600 }}>
          <span>{q.section || 'Question'}</span>
          <span>Question {slideIdx + 1} of {allQuestions.length}</span>
        </div>

        <h4 style={{ color: '#fff', fontSize: '1.15rem', margin: '1.25rem 0', lineHeight: 1.5 }}>
          {q.question_no ? `${q.question_no}. ` : ''}{q.question}
        </h4>

        {q.options && Array.isArray(q.options) && (
           <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {q.options.map((opt, i) => {
                 const isSelected = selectedAnswers[slideIdx] === opt;
                 const isSubmitted = submittedAnswers[slideIdx];
                 
                 // If submitted, check if this option is the correct answer
                 // Simple string matching. Often AI adds "A) ", so check if q.answer contains it.
                 let isCorrect = false;
                 let isWrong = false;
                 if (isSubmitted) {
                    const cleanAns = (q.answer || '').toLowerCase();
                    const cleanOpt = opt.toLowerCase();
                    if (cleanAns === cleanOpt || cleanAns.includes(cleanOpt) || cleanOpt.includes(cleanAns)) {
                       isCorrect = true;
                    }
                    if (isSelected && !isCorrect) {
                       isWrong = true;
                    }
                 }

                 let bg = 'rgba(255,255,255,0.03)';
                 let border = '1px solid rgba(255,255,255,0.08)';
                 let color = '#e2e8f0';

                 if (isSubmitted) {
                    if (isCorrect) {
                       bg = 'rgba(16, 185, 129, 0.15)';
                       border = '1px solid rgba(16, 185, 129, 0.4)';
                       color = '#34d399';
                    } else if (isWrong) {
                       bg = 'rgba(239, 68, 68, 0.15)';
                       border = '1px solid rgba(239, 68, 68, 0.4)';
                       color = '#f87171';
                    }
                 } else if (isSelected) {
                    bg = 'rgba(139, 92, 246, 0.15)';
                    border = '1px solid var(--accent-primary)';
                 }

                 return (
                   <div 
                     key={i} 
                     onClick={() => handleSelect(opt)}
                     style={{ 
                       padding: '0.8rem 1rem', 
                       background: bg, 
                       borderRadius: '8px', 
                       border: border, 
                       color: color, 
                       fontSize: '0.95rem',
                       cursor: isSubmitted ? 'default' : 'pointer',
                       transition: 'all 0.2s ease'
                     }}
                   >
                      {opt}
                   </div>
                 );
              })}
           </div>
        )}

        {!submittedAnswers[slideIdx] && q.options && q.options.length > 0 && (
           <button 
             onClick={handleSubmit} 
             disabled={!selectedAnswers[slideIdx]}
             style={{ 
               padding: '0.65rem 1.25rem', 
               background: selectedAnswers[slideIdx] ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.1)', 
               border: 'none', 
               borderRadius: '8px', 
               color: '#fff', 
               fontWeight: 600,
               cursor: selectedAnswers[slideIdx] ? 'pointer' : 'not-allowed',
               opacity: selectedAnswers[slideIdx] ? 1 : 0.5,
               marginBottom: '1rem',
               display: 'block',
               width: '100%'
             }}
           >
             Check Answer
           </button>
        )}

        {(submittedAnswers[slideIdx] || (!q.options || q.options.length === 0)) && q.answer && (
           <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1rem', borderRadius: '8px', color: '#34d399', fontSize: '0.95rem', marginTop: '1rem' }}>
             <strong style={{ display: 'block', marginBottom: '0.3rem' }}>Correct Answer:</strong> {q.answer}
             {q.explanation && (
                <div style={{ marginTop: '0.5rem', color: '#9ca3af', fontSize: '0.88rem' }}>
                  <strong>Explanation:</strong> {q.explanation}
                </div>
             )}
           </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
           <button onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))} disabled={slideIdx === 0} style={{ padding: '0.6rem 1.2rem', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: '#fff', cursor: slideIdx === 0 ? 'not-allowed' : 'pointer', opacity: slideIdx === 0 ? 0.4 : 1, fontWeight: 500 }}>← Previous</button>
           <button onClick={() => setSlideIdx(Math.min(allQuestions.length - 1, slideIdx + 1))} disabled={slideIdx === allQuestions.length - 1} style={{ padding: '0.6rem 1.2rem', background: 'var(--accent-primary)', border: 'none', borderRadius: '8px', color: '#fff', cursor: slideIdx === allQuestions.length - 1 ? 'not-allowed' : 'pointer', opacity: slideIdx === allQuestions.length - 1 ? 0.4 : 1, fontWeight: 600 }}>Next →</button>
        </div>
      </div>
    );
  }

  // Fallback to normal rendering, but format it better if it looks like raw JSON
  let displayText = ex.question;
  if (typeof displayText === 'string' && (displayText.trim().startsWith('{') || displayText.trim().startsWith('['))) {
    try {
       // Attempt to format it beautifully even if we couldn't parse the specific schema
       const match = displayText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
       const clean = match ? match[1].trim() : displayText.replace(/```json/gi, '').replace(/```/g, '').trim();
       const testObj = JSON.parse(clean);
       displayText = JSON.stringify(testObj, null, 2);
    } catch(e) {}
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.2rem', borderRadius: '12px', marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.95rem', borderLeft: '3px solid #6b7280' }}>
        <strong style={{ color: '#fff', display: 'block', marginBottom: '0.5rem' }}>Generated Content:</strong> 
        <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', fontFamily: (typeof displayText === 'string' && (displayText.includes('{') || displayText.includes('['))) ? 'monospace' : 'inherit', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
          {displayText}
        </div>
      </div>
      
      {ex.solution && (
        <div style={{ background: 'rgba(124, 58, 237, 0.1)', border: '1px solid rgba(124, 58, 237, 0.2)', padding: '1.2rem', borderRadius: '12px', color: '#fff', fontSize: '0.95rem', borderLeft: '3px solid var(--accent-primary)' }}>
          <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '0.5rem' }}>Solution:</strong> 
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{ex.solution}</div>
        </div>
      )}
    </div>
  );
};

export default function ChapterPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [kidData, setKidData] = useState(null);
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfPage, setPdfPage] = useState('');
  const [exercises, setExercises] = useState([]);
  const [isStudentView, setIsStudentView] = useState(false);
  
  // AI Feature States
  const [chapterContext, setChapterContext] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatedQuestions, setGeneratedQuestions] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPromptArea, setShowPromptArea] = useState(false);
  const [aiError, setAiError] = useState('');
  
  // Extract route params and format them nicely for display
  const formattedSubject = params.subject ? params.subject.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
  const formattedChapter = params.chapter ? params.chapter.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';
  const kidName = params.id ? params.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '';

  useEffect(() => {
    // Basic auth check
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch kids data to find the exact chapter by slug
        const queryParentId = searchParams.get("parentId");
        if (queryParentId) {
          setIsStudentView(true);
        }
        
        const kidsRef = ref(database, `users/${queryParentId || currentUser.uid}/kids`);
        onValue(kidsRef, (snap) => {
          const kidsData = snap.val() || {};
          let foundKidId, foundSubjId, foundExamId, foundChapId, foundPdfUrl, foundPdfPage;
          let ctxSubjectTitle = '', ctxExamTitle = '', ctxChapterTitle = '', ctxMarkDist = '';
          let chapterExercises = [];
          
          for (const kId in kidsData) {
             const k = kidsData[kId];
             if ((k.name && k.name.toLowerCase() === decodeURIComponent(params.id).toLowerCase()) || kId === params.id) {
                foundKidId = kId;
                if (k.subjects) {
                   for (const sId in k.subjects) {
                      const s = k.subjects[sId];
                      const sSlug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      if (sSlug === params.subject) {
                         foundSubjId = sId;
                         if (s.chapters) {
                            for (const eId in s.chapters) {
                               for (const cId in s.chapters[eId]) {
                                  const c = s.chapters[eId][cId];
                                  const cSlug = c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                                  if (cSlug === params.chapter) {
                                     foundExamId = eId;
                                     foundChapId = cId;
                                     foundPdfUrl = s.bookUrl || '';
                                     foundPdfPage = c.pdfPage || '';
                                     ctxSubjectTitle = s.title || '';
                                     ctxChapterTitle = c.title || '';
                                     ctxExamTitle = (k.exams && k.exams[eId]) ? k.exams[eId].title : '';
                                     ctxMarkDist = (s.examSettings && s.examSettings[eId] && s.examSettings[eId].markDistribution) ? s.examSettings[eId].markDistribution : '';
                                     const rawExercises = c.exercises || {};
                                     chapterExercises = Object.keys(rawExercises).map(key => ({ id: key, ...rawExercises[key] })).sort((a, b) => b.createdAt - a.createdAt);
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
             setPdfUrl('');
             setPdfPage('');
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
  }, [router, params.id, params.subject, params.chapter, searchParams]);

  // Pre-fill the AI Prompt when context is loaded
  useEffect(() => {
    if (chapterContext && !aiPrompt) {
      setAiPrompt(`Please generate an exam questionnaire for the following chapter:
Subject: ${chapterContext.subjectTitle}
Exam Type: ${chapterContext.examTitle}
Chapter: ${chapterContext.chapterTitle}
Book URL: ${chapterContext.pdfUrl || 'Not provided'}
Starting Page: ${chapterContext.pdfPage || 'Not specified'}

Mark Distribution:
${chapterContext.markDistribution || 'Standard distribution'}

Please generate questions covering the core concepts of this chapter according to the mark distribution provided. Format the questions clearly.`);
    }
  }, [chapterContext, aiPrompt]);

  if (loading) {
    return <main className="view-container"><div className="card">Loading chapter...</div></main>;
  }

  const handleGenerateQuestions = async () => {
    setIsGenerating(true);
    setAiError('');
    setGeneratedQuestions('');
    try {
      const questionsText = await generateGeminiContent(aiPrompt);
      setGeneratedQuestions(questionsText);

      // Save to Firebase
      if (user && kidData) {
        const exercisesRef = ref(database, `users/${user.uid}/kids/${kidData.kidId}/subjects/${kidData.subjectId}/chapters/${kidData.examId}/${kidData.chapterId}/exercises`);
        await push(exercisesRef, {
          title: `Generated Questions - ${new Date().toLocaleDateString()}`,
          question: questionsText,
          solution: '', // Empty solution by default
          createdAt: Date.now()
        });
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // The URL is now managed in the Subject settings.
  const getEmbedUrl = (url, page) => {
    if (!url) return '';
    let processed = url;
    if (processed.includes('drive.google.com')) {
      processed = processed.replace(/\/view.*$/, '/preview');
    }
    if (page) {
      processed += `#page=${page}`;
    }
    return processed;
  };

  return (
    <main className="view-container" style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '1000px', width: '100%', margin: '0 auto' }}>
        
        {/* Header / Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem', textAlign: 'left' }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: '#fff', width: '44px', height: '44px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0 }} onMouseOver={(e) => e.currentTarget.style.background='rgba(255,255,255,0.1)'} onMouseOut={(e) => e.currentTarget.style.background='rgba(255,255,255,0.05)'}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </button>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{kidName} <span style={{ opacity: 0.5 }}>/</span> {formattedSubject}</p>
            <h1 style={{ margin: 0, fontSize: '2.2rem', color: '#fff', lineHeight: 1.2 }}>{formattedChapter}</h1>
          </div>
        </div>

        {/* Content Layout */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Chapter Material Section */}
          <div className="card" style={{ padding: '2rem', textAlign: 'left' }}>
            <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6z"></path><path d="M14 3v5h5M16 13H8M16 17H8M10 9H8"></path></svg>
              Chapter Material (PDF)
            </h2>
            
            {/* PDF View or Input */}
            {!pdfUrl && (
              <div style={{ background: 'rgba(0,0,0,0.2)', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '16px', padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <div style={{ background: 'var(--accent-primary)', color: '#fff', borderRadius: '50%', padding: '12px', marginBottom: '1rem', display: 'flex' }}>
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
                </div>
                <span style={{ fontSize: '1.1rem', fontWeight: '500', color: '#fff' }}>No Book Configured</span>
                <span style={{ fontSize: '0.9rem', opacity: 0.7, marginTop: '0.5rem', textAlign: 'center', maxWidth: '300px' }}>Please go back to the Subject list and click the Settings icon next to the Subject name to configure the Book URL.</span>
              </div>
            )}

            {pdfUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Embedded PDF {pdfPage ? `(Page ${pdfPage})` : ''}</span>
                </div>
                <iframe src={getEmbedUrl(pdfUrl, pdfPage)} width="100%" height="700px" style={{ border: 'none', borderRadius: '12px', background: '#fff' }} title="Chapter PDF"></iframe>
              </div>
            )}

          </div>

          {/* Exercises Section */}
          <div className="card" style={{ padding: '2rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                Exercises & Solutions
              </h2>
              {!isStudentView && (
                <button style={{ background: 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.95rem', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)', transition: 'transform 0.2s' }} onMouseOver={(e) => e.currentTarget.style.transform='translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform='translateY(0)'}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Add Exercise
                </button>
              )}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {exercises.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                  {isStudentView ? "Your parent hasn't added any exercises for this chapter yet." : "No exercises added yet. Use the generator below to create some."}
                </div>
              ) : (
                exercises.map((ex, idx) => (
                  <div key={ex.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>{ex.title || `Exercise ${idx + 1}`}</h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button title="Edit" style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '0.4rem', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                        </button>
                      </div>
                    </div>
                    
                    <ExerciseViewer ex={ex} />
                  </div>
                ))
              )}

            </div>
          </div>

          {/* AI Question Generator Section */}
          {!isStudentView && (
            <div className="card" style={{ padding: '2rem', textAlign: 'left', background: 'linear-gradient(to bottom right, rgba(20, 20, 30, 0.8), rgba(30, 20, 40, 0.8))', border: '1px solid rgba(124, 58, 237, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                Gemini AI Question Generator
              </h2>
              <button onClick={() => setShowPromptArea(!showPromptArea)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '0.6rem 1rem', fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }} onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--glass-border)'; }}>
                {showPromptArea ? 'Hide Prompt Settings' : 'Configure Prompt'}
              </button>
            </div>
            
            {showPromptArea && (
              <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <label style={{ display: 'block', color: 'var(--accent-primary)', marginBottom: '0.8rem', fontWeight: '500' }}>Customize your prompt for Gemini:</label>
                <textarea 
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  style={{ width: '100%', height: '200px', padding: '1rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'monospace' }}
                />
                <p style={{ margin: '0.8rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>This prompt contains the exact details of this chapter and exam. Feel free to tweak it before generating.</p>
              </div>
            )}

            {aiError && (
              <div style={{ padding: '1rem', background: 'rgba(255, 68, 68, 0.1)', border: '1px solid rgba(255, 68, 68, 0.3)', borderRadius: '8px', color: '#ff4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                {aiError}
              </div>
            )}

            <button onClick={handleGenerateQuestions} disabled={isGenerating || !aiPrompt.trim()} style={{ background: isGenerating ? 'rgba(124, 58, 237, 0.5)' : 'var(--accent-primary)', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontSize: '1rem', fontWeight: '600', cursor: isGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.8rem', width: '100%', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)' }} onMouseOver={(e) => !isGenerating && (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseOut={(e) => !isGenerating && (e.currentTarget.style.transform = 'translateY(0)')}>
              {isGenerating ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                  <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                  Generating AI Questions...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  Generate Questions
                </>
              )}
            </button>
            

          </div>
          )}

        </div>
      </div>
    </main>
  );
}
