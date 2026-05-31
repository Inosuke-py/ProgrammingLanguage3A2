# Kino — Design System

## Theme

Dark mode. Scene: a student at their desk at 11pm, laptop glowing in a dim room, headphones on, in the zone between "I should study" and "this is actually fun."

## Color Strategy

Full palette. Three named roles used deliberately.

## Palette

| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Brand | `--color-brand` | `oklch(75% 0.18 65)` | CTAs, active states, headings accent, icon backgrounds |
| Brand dim | `--color-brand-dim` | `oklch(68% 0.16 65)` | Hover/pressed states |
| Accent | `--color-accent` | `oklch(70% 0.16 160)` | Success states, XP badges, positive feedback |
| Purple | — | `oklch(65% 0.18 300)` | Reserved for future badge/level system |
| Background | `--color-base` | `oklch(14% 0.02 280)` | Page background |
| Surface | `--color-surface` | `oklch(18% 0.02 280)` | Section alternation, elevated areas |
| Card | `--color-card` | `oklch(22% 0.02 280)` | Cards, quiz elements, feature blocks |
| Text | `--color-text` | `oklch(92% 0.01 280)` | Primary text |
| Muted | `--color-muted` | `oklch(65% 0.01 280)` | Secondary text, labels |
| Border | `--color-border` | `oklch(28% 0.02 280)` | Subtle dividers, card edges |

All neutrals tinted toward hue 280 (blue-violet undertone). No pure black or white anywhere.

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / Headings | Space Grotesk | 700–800 | 3xl–8xl |
| Body | Space Grotesk | 400–500 | sm–xl |
| Labels / Caps | Space Grotesk | 600 | xs, uppercase, tracked |

Single font family (Space Grotesk) used throughout. Hierarchy through size and weight contrast, not font switching.

## Spacing & Layout

- Sections alternate between `bg` and `surface` backgrounds
- Section padding: `py-24 px-6`
- Max content width: `max-w-5xl` (features), `max-w-4xl` (how it works), `max-w-2xl` (FAQ, CTA)
- Card padding: `p-5` to `p-6`
- Grid gaps: `gap-4` (tight), `gap-6` (comfortable)

## Corners & Borders

- Cards: `rounded-xl` to `rounded-2xl`
- Buttons: `rounded-lg` (nav), `rounded-xl` (hero CTA)
- Borders: 1px solid `--color-border`, never thicker accent stripes

## Motion

- Entry animations: fade + translateY(20–40px), staggered by 0.1s per item
- Easing: `[0.16, 1, 0.3, 1]` (ease-out-quart)
- Hover: scale(1.02–1.05), translateY(-2 to -4px), border color shift
- Floating elements: translateY oscillation, 2–4s loop
- Particles: linear rise from bottom, 6s duration, staggered
- No bounce, no elastic, no layout property animation

## Components

### Navbar
- Sticky, backdrop-blur, semi-transparent bg
- Logo: Lucide Dog icon in brand-colored rounded square + "KINO" text
- Single CTA button (brand bg, dark text)

### Hero
- Floating particles (brand color, rising)
- Grid overlay (3% opacity)
- Animated stat counters
- Interactive quiz card preview with hover states on options
- Mouse-following radial glow (page-wide)

### Feature Cards
- Lucide vector icons (brand color)
- Lift + border-color-shift on hover
- 3-column grid on desktop

### FAQ
- Accordion with rotate-45 "+" indicator
- Brand color on active question text

### CTAs
- Brand background with glow shadow (`box-shadow: 0 0 30px brand/44`)
- Scale on hover/tap via framer-motion

## Icons

Lucide React. Stroke-based, size 22, strokeWidth 2. Brand color for feature icons, dark bg color for icons inside brand-colored containers.

## Dependencies

- framer-motion (animations)
- lucide-react (icons)
- tailwindcss v4 (styling)
