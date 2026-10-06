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
if (parsed) {
  allQuestions = extractQuestions(parsed);
  allQuestions = allQuestions.filter((v,i,a)=>a.findIndex(t=>(t.question === v.question))===i);
}

console.log(allQuestions.length);
console.log(allQuestions);
