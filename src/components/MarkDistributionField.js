'use client';

import React, { useState, useMemo } from 'react';

/**
 * Parses raw mark distribution text into structured sections.
 * Handles patterns such as:
 *   "4. Competency-Based Questions: 8 × 7 = 56 Marks"
 *   "   – Chapters: 3, 6, 7, 8, and 10 (Total 10 questions; answer any 7)."
 *   "MCQ: 20 marks"
 *   "Total: 100 Marks"
 */
export function parseMarkDistribution(text) {
  if (!text || !text.trim()) {
    return { items: [], totalMarks: null, rawText: '' };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  let explicitTotal = null;
  let currentItem = null;

  for (const line of lines) {
    // Check for explicit "Total: 100 Marks" or "Total Marks: 100"
    const totalMatch = line.match(/^total\s*(marks)?\s*[:=-]?\s*(\d+)/i);
    if (totalMatch) {
      explicitTotal = parseInt(totalMatch[2], 10);
      continue;
    }

    // Check if line is a sub-line / note / chapter reference (starts with -, –, —, •, *, or "Chapters:")
    const isSubLine = /^[-–—•*]\s*/.test(line) || /^(chapters?|note|instructions?|scope):/i.test(line);

    if (isSubLine && currentItem) {
      const cleanSub = line.replace(/^[-–—•*]\s*/, '').trim();
      currentItem.notes.push(cleanSub);
      continue;
    }

    // Main item line
    const numMatch = line.match(/^(\d+)[\.\)]\s*(.*)/);
    let indexStr = null;
    let restOfLine = line;
    if (numMatch) {
      indexStr = numMatch[1];
      restOfLine = numMatch[2];
    }

    let title = restOfLine;
    let marksInfo = '';

    if (restOfLine.includes(':')) {
      const parts = restOfLine.split(':');
      title = parts[0].trim();
      marksInfo = parts.slice(1).join(':').trim();
    } else {
      const marksMatch = restOfLine.match(/(.*?)((\d+\s*[×x*]\s*\d+\s*=\s*\d+)\s*marks?|(\d+)\s*marks?)$/i);
      if (marksMatch) {
        title = marksMatch[1].trim().replace(/[-–—]\s*$/, '');
        marksInfo = marksMatch[2].trim();
      }
    }

    let formula = null;
    let marks = null;
    const formulaMatch = marksInfo.match(/(\d+\s*[×x*]\s*\d+)\s*=\s*(\d+)\s*marks?/i);
    if (formulaMatch) {
      formula = formulaMatch[1].replace(/\s+/g, ' ');
      marks = parseInt(formulaMatch[2], 10);
    } else {
      const marksOnlyMatch = marksInfo.match(/(\d+)\s*marks?/i);
      if (marksOnlyMatch) {
        marks = parseInt(marksOnlyMatch[1], 10);
      }
    }

    currentItem = {
      index: indexStr || (items.length + 1).toString(),
      title: title || `Section ${items.length + 1}`,
      rawMarksInfo: marksInfo,
      formula,
      marks: !isNaN(marks) ? marks : null,
      notes: []
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
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Quick Presets:
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
