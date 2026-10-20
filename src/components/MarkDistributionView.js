'use client';

import React, { useState, useMemo } from 'react';
import { parseMarkDistribution } from './MarkDistributionField';

/**
 * Modern structured presentation component for Exam Mark Distribution.
 * Supports both high-visibility Table view and Card Grid view with
 * visual weightage breakdown, chapter scope pills, and calculation chips.
 */
export default function MarkDistributionView({
  value = '',
  onEdit,
  defaultLayout = 'cards', // 'cards' | 'table'
  showWeightageBar = true
}) {
  const [layout, setLayout] = useState(defaultLayout); // 'cards' | 'table'

  const parsed = useMemo(() => parseMarkDistribution(value), [value]);
  const hasItems = parsed.items.length > 0;
  const totalMarks = parsed.totalMarks || 0;

  // Colors for multi-section visual weightage bar
  const sectionColors = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#8b5cf6', // Violet
    '#3b82f6'  // Blue
  ];

  // Helper to extract chapter numbers from a note like "Chapters: 3, 6, 7, 8, and 10"
  const extractChapters = (note) => {
    const match = note.match(/chapters?\s*:\s*([0-9,\s&and]+)/i);
    if (!match) return null;
    const nums = match[1].match(/\d+/g);
    return nums || null;
  };

  if (!hasItems && !value.trim()) {
    return (
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.45)',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '1.75rem 1.25rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.75rem'
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(99, 102, 241, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a5b4fc'
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>
        <div>
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#f8fafc', fontSize: '0.95rem', fontWeight: 600 }}>
            No Mark Distribution Pattern Configured
          </h4>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary, #94a3b8)', maxWidth: '440px' }}>
            Configure question types, marks calculation, and chapter rules to guide the model test generator.
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="primary"
            style={{
              padding: '0.5rem 1.1rem',
              fontSize: '0.82rem',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              cursor: 'pointer',
              marginTop: '0.25rem'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Set Mark Distribution
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Top Controls & Metrics Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingBottom: '0.5rem'
        }}
      >
        {/* KPI Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {totalMarks > 0 && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.1) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '8px',
                padding: '0.35rem 0.75rem',
                color: '#34d399',
                fontSize: '0.82rem',
                fontWeight: 700
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>{totalMarks} Total Marks</span>
            </div>
          )}

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
              borderRadius: '8px',
              padding: '0.35rem 0.65rem',
              color: '#cbd5e1',
              fontSize: '0.8rem',
              fontWeight: 500
            }}
          >
            <span style={{ color: '#818cf8', fontWeight: 700 }}>{parsed.items.length}</span>
            <span>{parsed.items.length === 1 ? 'Section' : 'Sections'} Defined</span>
          </div>
        </div>

        {/* Layout Toggle (Cards vs Table) */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
            borderRadius: '8px',
            padding: '2px'
          }}
        >
          <button
            type="button"
            onClick={() => setLayout('cards')}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              background: layout === 'cards' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: layout === 'cards' ? '#fff' : 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s ease'
            }}
            title="Card Grid View"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            Cards
          </button>
          <button
            type="button"
            onClick={() => setLayout('table')}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '6px',
              background: layout === 'table' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
              color: layout === 'table' ? '#fff' : 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              transition: 'all 0.15s ease'
            }}
            title="Detailed Table View"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            Table
          </button>
        </div>
      </div>

      {/* Visual Weightage Bar */}
      {showWeightageBar && totalMarks > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div
            style={{
              display: 'flex',
              height: '10px',
              borderRadius: '6px',
              overflow: 'hidden',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.05)'
            }}
          >
            {parsed.items.map((item, idx) => {
              const weightage = item.marks ? (item.marks / totalMarks) * 100 : 0;
              const color = sectionColors[idx % sectionColors.length];
              return (
                <div
                  key={idx}
                  style={{
                    width: `${weightage}%`,
                    background: color,
                    transition: 'width 0.3s ease'
                  }}
                  title={`${item.title}: ${item.marks || 0} Marks (${Math.round(weightage)}%)`}
                />
              );
            })}
          </div>

          {/* Mini Legend */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#94a3b8' }}>
            {parsed.items.map((item, idx) => {
              const color = sectionColors[idx % sectionColors.length];
              const pct = totalMarks ? Math.round(((item.marks || 0) / totalMarks) * 100) : 0;
              return (
                <div key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
                  <span style={{ color: '#cbd5e1' }}>#{item.index} {item.title}</span>
                  {item.marks !== null && (
                    <span style={{ color: '#64748b' }}>({item.marks}m • {pct}%)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE: CARDS */}
      {layout === 'cards' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '0.85rem'
          }}
        >
          {parsed.items.map((item, idx) => {
            const color = sectionColors[idx % sectionColors.length];
            const weightage = totalMarks && item.marks ? Math.round((item.marks / totalMarks) * 100) : null;

            return (
              <div
                key={idx}
                style={{
                  background: 'linear-gradient(145deg, rgba(20, 27, 45, 0.75) 0%, rgba(13, 18, 32, 0.85) 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '12px',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* Header row: Section Badge + Title */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: color,
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${color}40`,
                        borderRadius: '6px',
                        padding: '0.12rem 0.4rem',
                        flexShrink: 0
                      }}
                    >
                      #{item.index}
                    </span>
                    <h4
                      style={{
                        margin: 0,
                        fontSize: '0.92rem',
                        fontWeight: 600,
                        color: '#f8fafc',
                        lineHeight: 1.35
                      }}
                    >
                      {item.title}
                    </h4>
                  </div>

                  {/* Marks Pill */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    {item.marks !== null ? (
                      <span
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.16)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: '6px',
                          padding: '0.18rem 0.5rem',
                          letterSpacing: '0.01em',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {item.marks} Marks
                      </span>
                    ) : item.rawMarksInfo ? (
                      <span
                        style={{
                          fontSize: '0.76rem',
                          color: '#e2e8f0',
                          background: 'rgba(255, 255, 255, 0.06)',
                          borderRadius: '6px',
                          padding: '0.15rem 0.45rem'
                        }}
                      >
                        {item.rawMarksInfo}
                      </span>
                    ) : null}
                    {weightage !== null && (
                      <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                        {weightage}% of exam
                      </span>
                    )}
                  </div>
                </div>

                {/* Calculation / Formula Chip */}
                {item.formula && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Structure:</span>
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                        fontWeight: 600,
                        color: '#a5b4fc',
                        background: 'rgba(99, 102, 241, 0.12)',
                        border: '1px solid rgba(99, 102, 241, 0.25)',
                        borderRadius: '5px',
                        padding: '0.15rem 0.45rem'
                      }}
                    >
                      {item.formula}
                    </span>
                  </div>
                )}

                {/* Notes, Chapter Scope & Instructions */}
                {item.notes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: 'auto' }}>
                    {item.notes.map((note, nIdx) => {
                      const chapters = extractChapters(note);
                      return (
                        <div
                          key={nIdx}
                          style={{
                            background: 'rgba(0, 0, 0, 0.28)',
                            borderRadius: '7px',
                            padding: '0.45rem 0.6rem',
                            borderLeft: '2px solid rgba(99, 102, 241, 0.5)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.3rem'
                          }}
                        >
                          {chapters && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                                </svg>
                                Chapters:
                              </span>
                              {chapters.map((ch, cIdx) => (
                                <span
                                  key={cIdx}
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    color: '#e2e8f0',
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    borderRadius: '4px',
                                    padding: '0.05rem 0.35rem'
                                  }}
                                >
                                  Ch {ch}
                                </span>
                              ))}
                            </div>
                          )}
                          <span style={{ fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                            {note}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE: DETAILED STRUCTURED TABLE */}
      {layout === 'table' && (
        <div
          style={{
            overflowX: 'auto',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ padding: '0.75rem 1rem', width: '50px' }}>#</th>
                <th style={{ padding: '0.75rem 1rem' }}>Question Section / Topic</th>
                <th style={{ padding: '0.75rem 1rem', width: '160px' }}>Pattern / Formula</th>
                <th style={{ padding: '0.75rem 1rem', width: '130px' }}>Marks & Weight</th>
                <th style={{ padding: '0.75rem 1rem' }}>Scope & Rules</th>
              </tr>
            </thead>
            <tbody>
              {parsed.items.map((item, idx) => {
                const color = sectionColors[idx % sectionColors.length];
                const weightage = totalMarks && item.marks ? Math.round((item.marks / totalMarks) * 100) : null;

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)'
                    }}
                  >
                    {/* Index */}
                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: color,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${color}40`,
                          borderRadius: '5px',
                          padding: '0.1rem 0.35rem'
                        }}
                      >
                        #{item.index}
                      </span>
                    </td>

                    {/* Title */}
                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem' }}>
                        {item.title}
                      </div>
                    </td>

                    {/* Formula */}
                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                      {item.formula ? (
                        <span
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            color: '#a5b4fc',
                            background: 'rgba(99, 102, 241, 0.12)',
                            border: '1px solid rgba(99, 102, 241, 0.25)',
                            borderRadius: '5px',
                            padding: '0.15rem 0.45rem'
                          }}
                        >
                          {item.formula}
                        </span>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>—</span>
                      )}
                    </td>

                    {/* Marks & Weight */}
                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {item.marks !== null ? (
                          <span
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 700,
                              color: '#34d399',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            {item.marks} Marks
                          </span>
                        ) : item.rawMarksInfo ? (
                          <span style={{ fontSize: '0.76rem', color: '#e2e8f0' }}>{item.rawMarksInfo}</span>
                        ) : (
                          <span style={{ color: '#64748b' }}>—</span>
                        )}
                        {weightage !== null && (
                          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {weightage}% weightage
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Scope & Rules */}
                    <td style={{ padding: '0.85rem 1rem', verticalAlign: 'top' }}>
                      {item.notes.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {item.notes.map((note, nIdx) => (
                            <span key={nIdx} style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                              • {note}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.76rem' }}>All syllabus chapters</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {totalMarks > 0 && (
              <tfoot>
                <tr style={{ background: 'rgba(99, 102, 241, 0.08)', borderTop: '2px solid rgba(99, 102, 241, 0.3)' }}>
                  <td colSpan={3} style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#f8fafc', fontSize: '0.88rem' }}>
                    Total Exam Marks
                  </td>
                  <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#34d399', fontSize: '0.92rem' }}>
                    {totalMarks} Marks
                  </td>
                  <td style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.78rem' }}>
                    100% Curriculum Allocation
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
