---
name: Kids Study Hub
description: A focused study and assessment workspace for students, parents, and teachers.
colors:
  deep-navy: "#0f172a"
  deep-violet: "#1e1b4b"
  surface-glass: "rgba(255, 255, 255, 0.03)"
  border-glass: "rgba(255, 255, 255, 0.08)"
  accent-violet: "#8b5cf6"
  accent-blue: "#3b82f6"
  accent-gradient: "linear-gradient(135deg, #8b5cf6, #3b82f6)"
  text-primary: "#f8fafc"
  text-secondary: "#94a3b8"
typography:
  display:
    fontFamily: "Outfit, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Outfit, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Outfit, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "12px"
  pill: "9999px"
---

# Design System: Kids Study Hub

## Overview

**Creative North Star: "The Focused Study Desk"**

The interface is a compact workspace for managing study materials and assessments. A deep navy canvas keeps attention on the current task, while violet and blue accents make actions and selection states easy to find. Keep exam status and controls direct, readable, and easy to scan.

**Key Characteristics:**
- Calm dark surfaces with bright action cues.
- Compact layouts that keep related study controls close.
- Clear status and selection treatments for exam workflows.

## Colors

The palette pairs Deep Navy with Bright Violet and Clear Blue; translucent white and slate tones carry borders and secondary information.

### Primary
- **Bright Violet** (#8b5cf6): Main action accent and selected controls.

### Secondary
- **Clear Blue** (#3b82f6): Supporting actions and informational emphasis.

### Neutral
- **Deep Navy** (#0f172a): Main page background.
- **Deep Violet** (#1e1b4b): Secondary background tone.
- **Primary White** (#f8fafc): Headings and primary text.
- **Slate Secondary** (#94a3b8): Supporting text.
- **Glass Surface** (rgba(255, 255, 255, 0.03)): Subtle control and surface fill.
- **Glass Border** (rgba(255, 255, 255, 0.08)): Low-emphasis borders.

**The Accent-as-Signal Rule.** Use violet and blue to communicate actions, selection, and status; keep large reading areas on dark neutral surfaces.

## Typography

**Display Font:** Outfit (with sans-serif fallback)  
**Body Font:** Outfit (with sans-serif fallback)

**Character:** A single rounded sans-serif family keeps compact labels and longer study content cohesive. Use weight and size to distinguish hierarchy rather than adding another typeface.

### Hierarchy
- **Display** (700, 2rem, 1.2 line-height): Main page headings.
- **Headline** (600, 1.4rem): Section headings.
- **Body** (400, 0.95rem, 1.5 line-height): Supporting and instructional text.
- **Label** (600, 0.75rem): Badges and compact status labels.

## Layout

The shared page shell is capped at 1240px. Desktop gutters use a responsive clamp; at 768px and below the layout tightens to 1.25rem horizontal padding, and at 480px and below heading and button sizes reduce slightly. Keep exam controls in flexible rows that can wrap on narrow screens.

## Elevation & Depth

Depth comes primarily from dark tonal layering and translucent borders. Cards are flat by default; shadows are reserved for interactive emphasis and focus.

### Shadow Vocabulary
- **Button hover** (`0 6px 14px -4px rgba(0, 0, 0, 0.25)`): Subtle lift on secondary controls.
- **Primary action hover** (`0 8px 18px -4px rgba(139, 92, 246, 0.35)`): Violet emphasis for the primary action.
- **Input focus** (`0 0 0 4px rgba(139, 92, 246, 0.15)`): Visible keyboard and pointer focus.

## Shapes

Controls use compact 6px corners, the shared radius is 12px, and badges use a full pill. Prefer clear full borders and restrained surface fills over nested card chrome.

## Components

### Buttons
- **Shape:** Compact 6px corners.
- **Primary:** Violet-to-blue accent fill, white text, and a slightly stronger hover shadow.
- **Secondary:** Translucent white fill with a subtle border; hover increases the fill and adds a restrained shadow.
- **Focus:** Keep the browser-visible focus treatment; do not rely on color change alone.

### Chips
- **Style:** Violet-tinted fill, violet text, and a light violet border.
- **Shape:** Full pill with compact text.
- **Use:** Short category or status labels, not long instructions.

### Cards / Containers
- **Background:** Transparent or lightly tinted dark surfaces.
- **Border:** Use only when separation is needed.
- **Shadow:** Flat at rest; reserve lift for interactive emphasis.
- **Internal Padding:** Adapt to content density and viewport width.

### Inputs / Fields
- **Style:** Dark translucent fill, subtle glass border, compact padding, and 6px corners.
- **Focus:** Violet border with a soft focus ring.
- **Placeholder:** Maintain readable contrast against the field background.

### Status Banners
- Use concise status text and a clearly labeled next action.
- Distinguish success, pending, and attention states with both color and text.

## Do's and Don'ts

### Do:
- **Do** use violet and blue as purposeful action and status signals.
- **Do** keep exam controls flexible and wrapping on smaller screens.
- **Do** make focus, pending, and completion states explicit.
- **Do** maintain readable text contrast on dark surfaces.

### Don't:
- **Don't** nest decorative cards inside other cards.
- **Don't** communicate exam state through color alone.
- **Don't** use secondary text for critical instructions or actions.
