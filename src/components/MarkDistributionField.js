'use client';

import React, { useState, useMemo } from 'react';
import { organizeMarkDistributionWithAI } from '../lib/gemini';

/**
 * Cleans and organizes raw pasted text containing markdown, LaTeX math,
 * and question items into clean, human-readable standard format.
 * Intelligently recognizes Parts, context instructions, unnumbered questions,
 * and formula calculations.
 */
export function cleanAndFormatMarkDistribution(raw) {
  if (!raw || !raw.trim()) return '';

  let text = raw
    .replace(/\\times/g, '×')
    .replace(/\\text\{\s*marks?\s*\}/gi, 'marks')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\$([^\$]+)\$/g, '$1')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷');

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const resultLines = [];
  let detectedTotal = null;
  let qCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Ignore horizontal rules
    if (/^[-–—_*]{3,}$/.test(line)) continue;

    // Strip markdown formatting for checks
    const cleanLineForCheck = line.replace(/[*_#]+/g, '').trim();

    // Detect full marks / total (e.g. "**Full Marks:** 100" or "Total: 100 Marks")
    const totalMatch = cleanLineForCheck.match(/^(?:full\s*marks?|total\s*marks?|total)\s*[:=*-]?\s*(\d+)/i);
    if (totalMatch && !cleanLineForCheck.match(/\bpart\b/i) && !cleanLineForCheck.match(/\bquestion\b/i)) {
      detectedTotal = totalMatch[1];
      continue;
    }

    // Ignore general exam header lines
    if (/^(class\s*\d+|time\s*:|grade\s*\d+|subject\s*:|exam\s*:)/i.test(cleanLineForCheck.replace(/^[#*–—\s]+/, ''))) {
      continue;
    }

    // Check for Section / Part headers like "Part–A: Seen Passage (25 Marks)"
    const partMatch = line.match(/^(?:#{1,6}\s*|\[)?(?:part|section|group)\s*[-–—:]?\s*([A-Za-z0-9][^\n:\]]*)(?::\s*([^\n\]]+))?\]?/i);
    if (partMatch) {
      let partTitle = line.replace(/^#{1,6}\s*/, '').replace(/^[\[\]]+|[\[\]]+$/g, '').replace(/\*\*/g, '').trim();
      if (resultLines.length > 0) resultLines.push('');
      resultLines.push(partTitle);
      continue;
    }

    // Check for reading context or general section instructions
    const isContextInstruction = /^(?:read\s+the\s+text|context\s*instruction|instructions?\s*:|direction\s*:|\(this\s+text)/i.test(cleanLineForCheck) ||
      (/^\(/.test(cleanLineForCheck) && !/\d+\s*marks?/i.test(cleanLineForCheck));
    if (isContextInstruction) {
      resultLines.push(`   - ${cleanLineForCheck.replace(/^[-–—*•\s]+/, '')}`);
      continue;
    }

    // Check for bulleted or standard numbered questions OR unnumbered questions with marks/formulas
    const numMatch = line.match(/^(?:[-*•]\s*)?(?:\*\*)?(\d+)[\.\)]\s*(.*)/);
    const hasFormulaOrMarks = /(\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+|\d+\s*marks?)/i.test(line);

    if (numMatch || hasFormulaOrMarks) {
      qCounter++;
      let qNum = numMatch ? parseInt(numMatch[1], 10) : qCounter;
      qCounter = Math.max(qCounter, qNum);

      let rest = numMatch ? numMatch[2].replace(/\*\*/g, '').trim() : line.replace(/^[-*•]\s*/, '').replace(/\*\*/g, '').trim();

      let title = rest;
      let marksInfo = '';

      if (rest.includes(':')) {
        const parts = rest.split(':');
        title = parts[0].trim();
        marksInfo = parts.slice(1).join(':').trim();
      } else {
        const mm = rest.match(/(.*?)((\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+)\s*(?:marks?)?|(\d+)\s*marks?)$/i);
        if (mm) {
          title = mm[1].trim().replace(/[-–—]\s*$/, '');
          marksInfo = mm[2].trim();
        }
      }

      let formulaMatch = (title + ' ' + marksInfo).match(/(\d+(?:\s*[×x*·+]\s*\d+)+)\s*=\s*(\d+)/i);
      let marksMatch = (title + ' ' + marksInfo).match(/(\d+)\s*marks?/i);

      let formulaPart = formulaMatch ? formulaMatch[1].replace(/\s+/g, ' ') : '';
      let marksVal = formulaMatch ? formulaMatch[2] : (marksMatch ? marksMatch[1] : '');

      let cleanTitle = title
        .replace(/\(\s*\d+\s*marks?\s*\)/gi, '')
        .replace(/\(\s*\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+\s*\)/gi, '')
        .replace(/[-–—:]+$/, '')
        .trim();

      const isJustMarksOrFormula = /^(?:\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+|\d+)\s*(?:marks?)?$/i.test(marksInfo.trim());
      let cleanDesc = '';
      if (marksInfo && !isJustMarksOrFormula) {
        cleanDesc = marksInfo
          .replace(/(\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+)\s*(?:marks?)?/gi, '')
          .replace(/\(\s*\d+(?:\s*[×x*·+]\s*\d+)*\s*=\s*\d+\s*\)/gi, '')
          .replace(/\(\s*\d+\s*marks?\s*\)/gi, '')
          .replace(/\d+\s*marks?/gi, '')
          .replace(/[-–—:]+$/, '')
          .trim();
      }

      let headerInfo = '';
      if (formulaPart && marksVal) {
        headerInfo = `${formulaPart} = ${marksVal} marks`;
      } else if (marksVal) {
        headerInfo = `${marksVal} marks`;
      }

      let lineHeader = headerInfo ? `${qCounter}. ${cleanTitle}: ${headerInfo}` : `${qCounter}. ${cleanTitle}`;
      resultLines.push(lineHeader);
      if (cleanDesc && cleanDesc.length > 3) {
        resultLines.push(`   - ${cleanDesc}`);
      }
      continue;
    }

    // Explanatory note or sub-instruction
    const cleanNote = line
      .replace(/^[#*•–—\s]+/, '')
      .replace(/^\*\(/, '(')
      .replace(/\)\*$/, ')')
      .trim();

    if (cleanNote) {
      resultLines.push(`   - ${cleanNote}`);
    }
  }

  if (detectedTotal) {
    resultLines.push('');
    resultLines.push(`Total: ${detectedTotal} Marks`);
  }

  return resultLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Parses raw mark distribution text into structured sections.
 * Robust against Markdown (###, **), LaTeX ($ \times), section groups,
 * compound formulas (1 + 2 + 2 = 5), and multi-part blueprints.
 */
export function parseMarkDistribution(text) {
  if (!text || !text.trim()) {
    return { items: [], totalMarks: null, rawText: '' };
  }

  // Pre-clean LaTeX math artifacts first
  let cleanText = text
    .replace(/\\times/g, '×')
    .replace(/\\text\{\s*marks?\s*\}/gi, 'marks')
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\$([^\$]+)\$/g, '$1')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷');

  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  let explicitTotal = null;
  let currentItem = null;
  let currentGroup = null;
  let pendingGroupNotes = [];

  for (const rawLine of lines) {
    let line = rawLine;

    // Ignore horizontal rules
    if (/^[-–—_*]{3,}$/.test(line)) continue;

    const unstyled = line.replace(/[*_#]+/g, '').trim();

    // Check for explicit "Total: 100 Marks" or "Total Marks: 100" or "**Full Marks:** 100"
    const totalMatch = unstyled.match(/^(?:full\s*marks?|total\s*marks?|total)\s*[:=*-]?\s*(\d+)/i);
    if (totalMatch && !unstyled.match(/\bpart\b/i) && !unstyled.match(/\bquestion\b/i)) {
      explicitTotal = parseInt(totalMatch[1], 10);
      continue;
    }

    // Ignore exam header info
    if (/^(class\s*\d+|time\s*:|grade\s*\d+|subject\s*:|exam\s*:)/i.test(unstyled)) {
      continue;
    }

    // Check for Section / Part headers like "[Part-A: Reading Test...]" or "Part–A..."
    const partMatch = line.match(/^(?:#{1,6}\s*|\[)?(?:part|section|group)\s*[-–—:]?\s*([A-Za-z0-9][^\n:\]]*)(?::\s*([^\n\]]+))?\]?/i);
    if (partMatch) {
      currentGroup = line.replace(/^#{1,6}\s*/, '').replace(/[\[\]]/g, '').replace(/\*\*/g, '').trim();
      currentItem = null;
      continue;
    }

    const numMatch = line.match(/^(?:[-*•]\s*)?(?:\*\*)?(\d+)[\.\)]\s*(.*)/);
    const hasFormulaOrMarks = /(\d+(?:\s*[×x*+·]\s*\d+)*\s*=\s*\d+|\d+\s*marks?)/i.test(line);
    const isContextOrInstruction = /^(?:read\s+the\s+text|context\s*instruction|instructions?\s*:|direction\s*:)/i.test(unstyled);
    const isSubLine = /^[-–—•*]\s*/.test(line) || /^\(/.test(line) || /^(chapters?|note|instructions?|scope):/i.test(line) || isContextOrInstruction;

    // If it is a sub-note or general instruction:
    if (isSubLine || (!numMatch && !hasFormulaOrMarks)) {
      const cleanSub = line.replace(/^[-–—•*]\s*/, '').replace(/^\*\(/, '(').replace(/\)\*$/, ')').trim();
      if (cleanSub) {
        if (currentItem) {
          currentItem.notes.push(cleanSub);
        } else {
          pendingGroupNotes.push(cleanSub);
        }
      }
      continue;
    }

    let indexStr = null;
    let restOfLine = line;
    if (numMatch) {
      indexStr = numMatch[1];
      restOfLine = numMatch[2].replace(/\*\*/g, '').trim();
    } else {
      restOfLine = line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '').trim();
    }

    let title = restOfLine;
    let marksInfo = '';

    if (restOfLine.includes(':')) {
      const parts = restOfLine.split(':');
      title = parts[0].trim();
      marksInfo = parts.slice(1).join(':').trim();
    } else {
      const marksMatch = restOfLine.match(/(.*?)((\d+(?:\s*[×x*+·]\s*\d+)*\s*=\s*\d+)\s*(?:marks?)?|(\d+)\s*marks?)$/i);
      if (marksMatch) {
        title = marksMatch[1].trim().replace(/[-–—]\s*$/, '');
        marksInfo = marksMatch[2].trim();
      }
    }

    // Check if title still has parens like (5 Marks)
    const titleParenMarks = title.match(/\(\s*(\d+)\s*marks?\s*\)/i);
    if (titleParenMarks && !marksInfo) {
      marksInfo = `${titleParenMarks[1]} marks`;
      title = title.replace(titleParenMarks[0], '').trim();
    }

    let formula = null;
    let marks = null;
    const formulaMatch = marksInfo.match(/(\d+(?:\s*[×x*+·]\s*\d+)+)\s*=\s*(\d+)(?:\s*marks?)?/i);
    if (formulaMatch) {
      formula = formulaMatch[1].replace(/\s+/g, ' ');
      marks = parseInt(formulaMatch[2], 10);
    } else {
      const marksOnlyMatch = marksInfo.match(/(\d+)\s*marks?/i);
      if (marksOnlyMatch) {
        marks = parseInt(marksOnlyMatch[1], 10);
      }
    }

    // Extract any remaining description after formula/marks if it had colon
    let noteFromDesc = null;
    if (marksInfo) {
      const cleanNoteFromInfo = marksInfo
        .replace(/\(\s*\d+(?:\s*[×x*+·]\s*\d+)*\s*=\s*\d+\s*\)/gi, '')
        .replace(/(\d+(?:\s*[×x*+·]\s*\d+)*\s*=\s*\d+)(?:\s*marks?)?/gi, '')
        .replace(/\(\s*\d+\s*marks?\s*\)/gi, '')
        .replace(/\d+\s*marks?/gi, '')
        .replace(/[-–—:]+$/, '')
        .trim();
      if (cleanNoteFromInfo.length > 5) {
        noteFromDesc = cleanNoteFromInfo;
      }
    }

    const initialNotes = [...pendingGroupNotes];
    pendingGroupNotes = [];
    if (noteFromDesc) initialNotes.push(noteFromDesc);

    currentItem = {
      index: indexStr || (items.length + 1).toString(),
      title: title || `Section ${items.length + 1}`,
      group: currentGroup,
      rawMarksInfo: marksInfo,
      formula,
      marks: !isNaN(marks) ? marks : null,
      notes: initialNotes
    };
    items.push(currentItem);
  }

  // Calculate sum if no explicit total
  let calculatedTotal = explicitTotal;
  if (calculatedTotal === null) {
    const sum = items.reduce((acc, it) => acc + (it.marks || 0), 0);
    if (sum > 0) calculatedTotal = sum;
  }

  return {
    items,
    totalMarks: calculatedTotal,
    rawText: text
  };
}

const PRESETS = [
  {
    name: 'Class 5 English (100M)',
    text: `Part–A: Seen Passage (25 Marks)
   - Read the text/dialogue and answer questions 1, 2, 3 and 4. (This text/dialogue will be taken from English for Today, Class Five.)
1. Multiple Choice Questions (MCQ): 1 × 5 = 5 marks
2. Fill in the Blanks: 1 × 5 = 5 marks
3. Write True/False for each statement: 1 × 5 = 5 marks
4. Answering Short Questions: 2 × 5 = 10 marks
   - Five questions will be set based on the text. Students must answer them in complete sentences demonstrating understanding of the passage.

Part–B: Unseen Passage (10 Marks)
   - Read the text/dialogue and answer the questions 5 and 6. (This text/dialogue will be taken beyond the textbook, maintaining a Class Five standard.)
5. Matching words with their meanings: 1 × 5 = 5 marks
6. Writing question answers in short: 1 + 2 + 2 = 5 marks
   - Three (3) short questions will be given, and students will have to answer all of them. Knowledge, understanding, and higher-order thinking questions need to be considered.

Part–C: Grammar & Vocabulary (35 Marks)
7. Rearranging words to make meaningful sentences: 1 × 5 = 5 marks
8. WH-Questions: 2 × 5 = 10 marks
   - Five statements will be provided. Students will frame WH-questions (Who, What, When, Where, Why, How) using the underlined parts of the statements.
9. Use of Punctuation and Capital Letters: 1 × 5 = 5 marks
   - A short text or a few sentences will be given without punctuation. Students must rewrite them using correct capital letters and punctuation (Full stop, Comma, Question mark, Exclamation mark).
10. Complete the sentences with the correct form of verbs in brackets: 1 × 5 = 5 marks
11. Using correct prepositions (Filling in the blanks): 1 × 5 = 5 marks
12. Articles (Filling in the blanks): 1 × 5 = 5 marks

Part–D: Writing Part (30 Marks)
13. Writing a Short Composition with or without clues: 10 marks
   - Students will write at least ten sentences related to the given topic. Capital letters, punctuation marks, spelling, sentence structure, and content need to be considered for marking.
14. Writing informal/formal letter with or without clues: 10 marks
15. Writing an email with or without clues: 10 marks

Total: 100 Marks`
  },
  {
    name: '100 Marks Standard',
    text: `1. Multiple Choice Questions: 20 × 1 = 20 Marks
2. Short Answer Questions: 15 × 2 = 30 Marks
3. Descriptive / Creative Questions: 5 × 10 = 50 Marks
Total: 100 Marks`
  },
  {
    name: '50 Marks Class Test',
    text: `1. Multiple Choice Questions: 10 × 1 = 10 Marks
2. Short Answer Questions: 10 × 2 = 20 Marks
3. Problem Solving Questions: 2 × 10 = 20 Marks
Total: 50 Marks`
  },
  {
    name: '56 Marks Competency-Based',
    text: `4. Competency-Based Questions: 8 × 7 = 56 Marks
   – Chapters: 3, 6, 7, 8, and 10 (Total 10 questions, 2 questions from each chapter; answer any 7).`
  }
];

export default function MarkDistributionField({
  value = '',
  onChange,
  label = 'Mark Distribution Pattern',
  compact = false,
  maxHeight = '280px'
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isCleaningAI, setIsCleaningAI] = useState(false);

  const handleCleanWithAI = async () => {
    if (!value || !value.trim() || isCleaningAI) return;
    setIsCleaningAI(true);
    try {
      const organized = await organizeMarkDistributionWithAI(value);
      if (organized) {
        onChange?.(organized);
      } else {
        onChange?.(cleanAndFormatMarkDistribution(value));
      }
    } catch (err) {
      console.warn('AI clean failed, falling back to rule cleaner:', err);
      onChange?.(cleanAndFormatMarkDistribution(value));
    } finally {
      setIsCleaningAI(false);
    }
  };

  const parsed = useMemo(() => parseMarkDistribution(value), [value]);
  const hasItems = parsed.items.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2e8f0', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary, #6366f1)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            {label}
          </label>

          {parsed.totalMarks !== null && (
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.15rem 0.55rem',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                letterSpacing: '0.02em'
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} />
              {parsed.totalMarks} Total Marks
            </span>
          )}

          {hasItems && (
            <span
              style={{
                fontSize: '0.7rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--glass-border)',
                color: 'var(--text-secondary, #94a3b8)'
              }}
            >
              {parsed.items.length} {parsed.items.length === 1 ? 'Section' : 'Sections'}
            </span>
          )}
        </div>

        {/* Toggle Mode Button */}
        <button
          type="button"
          onClick={() => setIsEditing(prev => !prev)}
          style={{
            padding: '0.25rem 0.65rem',
            fontSize: '0.74rem',
            fontWeight: 500,
            background: isEditing ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.06)',
            border: `1px solid ${isEditing ? 'rgba(99, 102, 241, 0.4)' : 'var(--glass-border)'}`,
            borderRadius: '6px',
            color: isEditing ? '#a5b4fc' : '#cbd5e1',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            transition: 'all 0.15s ease'
          }}
          title={isEditing ? 'View formatted breakdown cards' : 'Edit raw text pattern'}
        >
          {isEditing ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              View Breakdown
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit Pattern
            </>
          )}
        </button>
      </div>

      {/* Main Content Area */}
      {!isEditing && hasItems ? (
        /* Structured Visual Preview Cards */
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            minHeight: '120px',
            maxHeight: maxHeight || '280px',
            overflowY: 'auto',
            background: 'rgba(10, 15, 28, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '0.6rem',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)'
          }}
        >
          {parsed.items.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.75) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: '8px',
                padding: '0.55rem 0.7rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                transition: 'border-color 0.15s ease'
              }}
            >
              {/* Card Header: Section number, Title & Marks badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: '#a5b4fc',
                      background: 'rgba(99, 102, 241, 0.18)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '5px',
                      padding: '0.1rem 0.35rem',
                      flexShrink: 0
                    }}
                  >
                    #{item.index}
                  </span>
                  <span
                    style={{
                      fontSize: '0.84rem',
                      fontWeight: 600,
                      color: '#f8fafc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                </div>

                {/* Marks formula / pill */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                  {item.formula && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        color: '#94a3b8',
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        padding: '0.12rem 0.4rem',
                        borderRadius: '4px'
                      }}
                    >
                      {item.formula}
                    </span>
                  )}
                  {item.marks !== null ? (
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#34d399',
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '0.12rem 0.45rem',
                        borderRadius: '5px',
                        letterSpacing: '0.02em'
                      }}
                    >
                      {item.marks} Marks
                    </span>
                  ) : item.rawMarksInfo ? (
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#e2e8f0',
                        background: 'rgba(255, 255, 255, 0.06)',
                        padding: '0.12rem 0.45rem',
                        borderRadius: '5px'
                      }}
                    >
                      {item.rawMarksInfo}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Sub-notes (e.g. Chapter references, question options) */}
              {item.notes.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.1rem' }}>
                  {item.notes.map((note, nIdx) => (
                    <div
                      key={nIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.35rem',
                        fontSize: '0.74rem',
                        color: '#cbd5e1',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '5px',
                        padding: '0.25rem 0.5rem',
                        borderLeft: '2px solid rgba(99, 102, 241, 0.5)'
                      }}
                    >
                      <span style={{ color: '#818cf8', flexShrink: 0, marginTop: '1px' }}>↳</span>
                      <span style={{ lineHeight: 1.45 }}>{note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !isEditing && !hasItems ? (
        /* Empty Preview State */
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px dashed rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '1rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>
            No mark distribution pattern set. Gemini will generate a balanced standard exam, or you can pick a preset below.
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onChange?.(p.text);
                }}
                style={{
                  fontSize: '0.72rem',
                  padding: '0.25rem 0.55rem',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  borderRadius: '6px',
                  color: '#c7d2fe',
                  cursor: 'pointer'
                }}
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Edit Mode Textarea with Live Presets */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <textarea
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            rows={5}
            placeholder={`e.g.\n1. Multiple Choice Questions: 20 × 1 = 20 Marks\n2. Competency-Based Questions: 8 × 7 = 56 Marks\n   – Chapters: 3, 6, 7, 8, 10\nTotal: 100 Marks`}
            style={{
              width: '100%',
              minHeight: '140px',
              padding: '0.65rem 0.75rem',
              background: 'rgba(10, 15, 28, 0.85)',
              border: '1px solid rgba(99, 102, 241, 0.45)',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '0.82rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              lineHeight: 1.5,
              resize: 'vertical',
              boxShadow: '0 0 0 1px rgba(99, 102, 241, 0.15), inset 0 1px 3px rgba(0, 0, 0, 0.4)'
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handleCleanWithAI}
                disabled={isCleaningAI}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '0.22rem 0.65rem',
                  background: isCleaningAI
                    ? 'rgba(139, 92, 246, 0.4)'
                    : 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(99, 102, 241, 0.25) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.45)',
                  borderRadius: '5px',
                  color: '#c4b5fd',
                  cursor: isCleaningAI ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  opacity: isCleaningAI ? 0.75 : 1,
                  transition: 'all 0.15s ease'
                }}
                title="Use AI to structure syllabus by Part, standardize question numbers, and clean mark formulas"
              >
                {isCleaningAI ? (
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
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Presets:
            </span>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {PRESETS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onChange?.(p.text)}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.5rem',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '5px',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#94a3b8';
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
