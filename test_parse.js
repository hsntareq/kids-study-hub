const fs = require('fs');
const ex = {
  question: `{
  "subject": "Mathematics",
  "exam_type": "Final Exam",
  "chapter": "Chapter 6: Percentage",
  "total_marks": 50,
  "sections": [
    {
      "section_name": "Multiple Choice Questions (MCQ)",
      "marks_per_question": 1,
      "total_questions": 15,
      "total_marks": 15,
      "questions": [
        {
          "question_no": 1,
          "question": "What is 25% expressed as a fraction in its simplest form?",
          "options": [
            "1/2",
            "1/4",
            "3/4",
            "1/5"
          ],
          "answer": "1/4"
        }
      ]
    }
  ]
}`
};
let parsed = null;
try {
  let rawStr = ex.question || '';
  if (typeof rawStr === 'string') {
    const match = rawStr.match(/\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`/);
    const cleanStr = match ? match[1].trim() : rawStr.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
    parsed = JSON.parse(cleanStr);
  }
} catch(e) {
  console.log("JSON parse failed:", e);
}

let allQuestions = [];
if (parsed && Array.isArray(parsed)) {
  parsed.forEach(p => {
     if (p.sections && Array.isArray(p.sections)) {
        p.sections.forEach(sec => {
           if (sec.questions && Array.isArray(sec.questions)) {
              sec.questions.forEach(q => allQuestions.push({ section: sec.section_name, ...q }));
           }
        });
     } else if (p.questions && Array.isArray(p.questions)) {
        p.questions.forEach(q => allQuestions.push(q));
     } else if (p.question) {
        allQuestions.push(p);
     }
  });
} else if (parsed && parsed.sections) {
  parsed.sections.forEach(sec => {
     if (sec.questions && Array.isArray(sec.questions)) {
        sec.questions.forEach(q => allQuestions.push({ section: sec.section_name, ...q }));
     }
  });
} else if (parsed && parsed.question) {
  allQuestions.push(parsed);
}
console.log(allQuestions.length);
