import { GoogleGenAI } from '@google/genai';

export async function generateGeminiContent(prompt, options = {}) {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_GEMINI_API_KEY is missing in environment variables. Please add it to your .env.local file to use the AI generator.');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Prioritized list of active, supported Gemini models
  const candidateModels = [
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite'
  ];

  let lastError = null;
  let questionsText = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          maxOutputTokens: 65536,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {})
        }
      });
      if (response && response.text) {
        questionsText = response.text;
        break;
      }
    } catch (err) {
      console.warn(`Model ${model} failed, attempting fallback:`, err.message);
      lastError = err;
    }
  }

  // Dynamic fallback: If hardcoded candidate models fail, query available models for this API key
  if (!questionsText) {
    try {
      const modelList = await ai.models.list();
      for await (const m of modelList) {
        const cleanName = m.name ? m.name.replace(/^models\//, '') : '';
        if (!cleanName || candidateModels.includes(cleanName)) continue;
        
        if (cleanName.includes('flash') || cleanName.includes('lite') || cleanName.includes('pro')) {
          try {
            const fallbackRes = await ai.models.generateContent({
              model: cleanName,
              contents: prompt,
              config: {
                responseMimeType: 'application/json',
                maxOutputTokens: 65536,
                ...(options.temperature !== undefined ? { temperature: options.temperature } : {})
              }
            });
            if (fallbackRes && fallbackRes.text) {
              questionsText = fallbackRes.text;
              break;
            }
          } catch (innerErr) {
            console.warn(`Dynamic model ${cleanName} failed:`, innerErr.message);
          }
        }
      }
    } catch (listErr) {
      console.warn('Failed to dynamically query models list:', listErr.message);
    }
  }

  if (!questionsText) {
    throw lastError || new Error('Failed to generate questions with available Gemini models.');
  }

  return questionsText;
}

/**
 * Uses Gemini AI to intelligently structure, clean, and organize
 * raw or messy exam mark distribution text into standardized parts,
 * sequentially numbered questions, mark formulas, reading contexts, and total marks.
 */
export async function organizeMarkDistributionWithAI(rawText) {
  if (!rawText || !rawText.trim()) return '';

  const prompt = `You are an expert curriculum designer and exam structuring assistant.
Your task is to take the user's raw, messy, or unstructured exam mark distribution / syllabus text and reorganize it into a clean, standardized, beautifully organized blueprint for the exam.

INPUT TEXT:
"""
${rawText}
"""

ORGANIZATION AND FORMATTING SPECIFICATIONS:
1. Divide the exam into distinct parts/sections (e.g. "Part–A: Seen Passage (25 Marks)", "Part–B: Unseen Passage (10 Marks)", "Part–C: Grammar & Vocabulary (35 Marks)", "Part–D: Writing Part (30 Marks)", or whatever parts exist in the input).
2. For any general instructions or reading context in a part (such as "Read the text/dialogue and answer questions 1, 2, 3 and 4..."), format it as an indented bullet note right below the Part header:
   - Read the text/dialogue and answer questions 1, 2, 3 and 4. (This text/dialogue will be taken from English for Today, Class Five.)
3. Standardize every question item into a clear sequentially numbered list (1., 2., 3., etc.) across the exam. Each question line MUST follow:
   <Number>. <Question Title>: <Formula or Marks>
   Examples:
   1. Multiple Choice Questions (MCQ): 1 × 5 = 5 marks
   2. Fill in the Blanks: 1 × 5 = 5 marks
   3. Write True/False for each statement: 1 × 5 = 5 marks
   4. Answering Short Questions: 2 × 5 = 10 marks
   5. Matching Words with Meanings: 1 × 5 = 5 marks
   6. Writing question answers in short: 1 + 2 + 2 = 5 marks
   7. Rearranging Words to make meaningful sentences: 1 × 5 = 5 marks
   8. WH-Questions: 2 × 5 = 10 marks
   9. Punctuation & Capital Letters: 1 × 5 = 5 marks
   10. Right Form of Verbs: 1 × 5 = 5 marks
   11. Prepositions: 1 × 5 = 5 marks
   12. Articles: 1 × 5 = 5 marks
   13. Short Composition: 10 marks
   14. Informal/Formal Letter: 10 marks
   15. Email Writing: 10 marks
4. If a question has descriptive guidelines or rules, indent them as sub-notes directly below that question:
   - Five questions will be set based on the text. Students must answer them in complete sentences demonstrating understanding of the passage.
5. Accurately preserve all marks and formulas from the input.
6. Calculate and add the total marks at the very end:
   Total: <X> Marks
7. Return a JSON object with a single string property "formattedText".

Output JSON format:
{
  "formattedText": "..."
}`;

  const jsonText = await generateGeminiContent(prompt);
  let parsed;
  try {
    const cleanStr = jsonText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleanStr);
  } catch (err) {
    return jsonText;
  }

  if (parsed && typeof parsed.formattedText === 'string') {
    return parsed.formattedText.trim();
  }
  return jsonText;
}

/**
 * Automatically reviews and marks a completed exam using Gemini AI.
 * Compares student answers against official marking keys / rubrics.
 * Returns awarded marks, per-question teacher feedback, and an overall evaluation summary.
 */
export async function autoReviewExamWithAI({ questions, studentAnswers = {}, subjectTitle = '', examTitle = '', kidGrade = '' }) {
  const prompt = `You are an expert school examiner evaluating a student's completed exam paper for final teacher review.
Your task is to accurately and fairly mark each question based on the official model answer / rubric, calculate awarded marks, and provide constructive evaluation feedback for the teacher to review and approve.

Exam Subject: ${subjectTitle || 'General Subject'}
Exam Type: ${examTitle || 'Model Test'}
${kidGrade ? `Student Grade: ${kidGrade}\n` : ''}

EXAMINATION QUESTIONS AND STUDENT RESPONSES TO EVALUATE:
${questions.map((q, idx) => {
  const studentAns = studentAnswers[q.id] !== undefined ? studentAnswers[q.id] : (studentAnswers[String(q.id)] || '');
  const maxMarks = Number(q.marks) || 5;
  const isMcq = Array.isArray(q.options) && q.options.length > 0;
  return `---
Question ID: ${q.id}
Number / Section: ${q.displayNumber || idx + 1} (${q.cleanSectionTitle || q.section || 'General'})
Question Content: ${q.question}
${isMcq ? `Options:\n${q.options.map(o => `  ${o}`).join('\n')}\n` : ''}
Max Marks: ${maxMarks}
Official Model Answer / Rubric: ${q.answerKey || 'Standard curriculum model answer'}
Student's Submitted Answer: ${typeof studentAns === 'string' && studentAns.trim() ? `"${studentAns.trim()}"` : '[NO ANSWER PROVIDED / BLANK]'}
`;
}).join('\n')}

EVALUATION CRITERIA:
1. STRICT ADHERENCE TO MAX MARKS: For each question, "awardedMarks" must be a number between 0 and the question's Max Marks (inclusive). Never award negative marks or exceed Max Marks.
2. OBJECTIVE / MCQ QUESTIONS:
   - If the student's answer correctly matches the official answerKey/correct option, award FULL marks.
   - If the answer is incorrect, mismatched, or blank/unanswered, award 0 marks.
3. SUBJECTIVE / SHORT-ANSWER / DESCRIPTIVE / CREATIVE QUESTIONS:
   - If unanswered, award 0 marks and note "Unanswered by student."
   - If answered, evaluate accuracy, key points mentioned, understanding of text/passage, grammar, and completeness against the official rubric.
   - Award full marks, partial marks (e.g. 7/10, 3/5, 1.5/2), or 0 marks based on accuracy.
4. TEACHER FEEDBACK NOTE:
   - For each question, provide a concise 1-sentence note in "feedback" explaining why this mark was given (e.g. "Accurate answer covering all key points; full marks awarded.", "Partially correct; identified characters but missed concluding explanation (-2 marks).", "Incorrect option selected; correct was B.", "Unanswered.").
5. OVERALL FEEDBACK:
   - Provide a comprehensive, encouraging 2-3 sentence overall teacher remark in "overallFeedback" highlighting strong areas, specific areas needing practice, and summary percentage.

OUTPUT FORMAT REQUIREMENTS:
Return STRICTLY a valid JSON object matching this schema:
{
  "evaluations": [
    {
      "questionId": 1,
      "awardedMarks": 5,
      "feedback": "Concise feedback for teacher review"
    }
  ],
  "overallFeedback": "Overall teacher remarks summarizing the student's exam performance..."
}
`;

  const jsonText = await generateGeminiContent(prompt);
  let parsed;
  try {
    const cleanStr = jsonText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    parsed = JSON.parse(cleanStr);
  } catch (err) {
    console.error('Failed to parse AI review output:', jsonText, err);
    throw new Error('AI review output was not valid JSON. Please try again.');
  }

  if (!parsed || !Array.isArray(parsed.evaluations)) {
    throw new Error('AI evaluation response was incomplete. Please try again.');
  }

  return parsed;
}


