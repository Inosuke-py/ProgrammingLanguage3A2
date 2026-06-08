/**
 * CharacterAvatar
 * ───────────────
 * Five low-poly stylized characters for Game Mode. Each character is
 * a single inline SVG — no external assets, no network requests, no
 * lazy load needed. Renders crisp at any size.
 *
 *   1 Crimson — Fire Mage (red wizard, gold star)
 *   2 Amber   — Sun Knight (gold helmet, plume)
 *   3 Jade    — Forest Ninja (green hood + mask)
 *   4 Cobalt  — Sky Pilot (aviator cap + goggles)
 *   5 Violet  — Court Jester (3-point hat + bells)
 *
 * All SVGs share a 100×120 viewBox and the same body proportions so
 * they line up cleanly in grids and score strips. The face is always
 * rendered at the same coordinates; only the costume / accessory
 * differs per character.
 *
 * Usage:
 *   <CharacterAvatar avatarId={3} size={56} />
 */

import './CharacterAvatar.css';

// Common skin tone — same across all characters so faces feel consistent.
const SKIN = '#f4d3b0';
const SKIN_SHADOW = '#d8a774';
const EYE = '#1f2937';
const MOUTH = '#7c2d12';

/* ═══════════════════════════════════════════════════════════════════
   1 · CRIMSON — FIRE MAGE
   ═══════════════════════════════════════════════════════════════════ */
function CharCrimson() {
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cm-robe" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#dc2626" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </linearGradient>
        <linearGradient id="cm-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#9f1239" />
          <stop offset="100%" stopColor="#4c0519" />
        </linearGradient>
      </defs>
      {/* Robe body */}
      <path d="M22,114 L22,72 Q22,60 32,58 L68,58 Q78,60 78,72 L78,114 Z" fill="url(#cm-robe)" />
      {/* Belt */}
      <rect x="22" y="86" width="56" height="6" fill="#1f2937" />
      <rect x="46" y="84" width="8" height="10" rx="1" fill="#fbbf24" />
      {/* Neck */}
      <rect x="44" y="56" width="12" height="6" fill={SKIN_SHADOW} />
      {/* Head */}
      <ellipse cx="50" cy="46" rx="16" ry="17" fill={SKIN} />
      {/* Hair tuft under hat */}
      <path d="M34,44 Q40,38 50,38 Q60,38 66,44 L66,48 L34,48 Z" fill="#78350f" />
      {/* Hat brim */}
      <ellipse cx="50" cy="40" rx="24" ry="3.5" fill="#3f0a14" />
      {/* Hat cone */}
      <path d="M30,40 L70,40 L60,8 Q50,2 40,8 Z" fill="url(#cm-hat)" />
      {/* Star on hat */}
      <path d="M50,18 L52,23 L57,23.7 L53.3,27.2 L54.2,32 L50,29.6 L45.8,32 L46.7,27.2 L43,23.7 L48,23 Z" fill="#fcd34d" />
      {/* Eyes */}
      <circle cx="44" cy="48" r="2.2" fill={EYE} />
      <circle cx="56" cy="48" r="2.2" fill={EYE} />
      <circle cx="44.6" cy="47.4" r="0.7" fill="#fff" />
      <circle cx="56.6" cy="47.4" r="0.7" fill="#fff" />
      {/* Cheeks */}
      <ellipse cx="40" cy="54" rx="2.5" ry="1.6" fill="#fb7185" opacity="0.4" />
      <ellipse cx="60" cy="54" rx="2.5" ry="1.6" fill="#fb7185" opacity="0.4" />
      {/* Mouth */}
      <path d="M45,55 Q50,58 55,55" stroke={MOUTH} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   2 · AMBER — SUN KNIGHT
   ═══════════════════════════════════════════════════════════════════ */
function CharAmber() {
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="ak-armor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
        <linearGradient id="ak-helm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#fde68a" />
          <stop offset="100%" stopColor="#a16207" />
        </linearGradient>
      </defs>
      {/* Armor body */}
      <path d="M20,114 L20,68 Q20,58 32,56 L68,56 Q80,58 80,68 L80,114 Z" fill="url(#ak-armor)" />
      {/* Chest sun emblem */}
      <circle cx="50" cy="82" r="9" fill="#fef3c7" />
      <g transform="translate(50,82)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <rect key={deg} x="-1" y="-13" width="2" height="4" fill="#fef3c7" transform={`rotate(${deg})`} />
        ))}
        <circle r="3.5" fill="#f59e0b" />
      </g>
      {/* Pauldron shadows */}
      <ellipse cx="22" cy="62" rx="6" ry="5" fill="#78350f" opacity="0.35" />
      <ellipse cx="78" cy="62" rx="6" ry="5" fill="#78350f" opacity="0.35" />
      {/* Helmet — full plate */}
      <path d="M30,46 Q30,22 50,18 Q70,22 70,46 L70,52 Q70,56 66,56 L34,56 Q30,56 30,52 Z" fill="url(#ak-helm)" />
      {/* Eye slit */}
      <rect x="36" y="42" width="28" height="6" rx="1.5" fill="#0f172a" />
      <circle cx="44" cy="45" r="1.3" fill="#fbbf24" />
      <circle cx="56" cy="45" r="1.3" fill="#fbbf24" />
      {/* Helmet ridge */}
      <path d="M50,18 L50,40" stroke="#a16207" strokeWidth="1.5" />
      {/* Plume */}
      <path d="M50,4 Q56,8 54,16 Q52,12 50,18 Q48,12 46,16 Q44,8 50,4 Z" fill="#dc2626" />
      <path d="M50,4 Q53,8 52,14" stroke="#7f1d1d" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   3 · JADE — FOREST NINJA
   ═══════════════════════════════════════════════════════════════════ */
function CharJade() {
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="jn-gi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#10b981" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <linearGradient id="jn-hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#34d399" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
      </defs>
      {/* Gi body */}
      <path d="M20,114 L20,70 Q20,58 32,56 L68,56 Q80,58 80,70 L80,114 Z" fill="url(#jn-gi)" />
      {/* Crossed gi front */}
      <path d="M30,56 L50,80 L70,56 L70,68 L50,90 L30,68 Z" fill="#022c22" />
      {/* Belt — black with knot */}
      <rect x="20" y="86" width="60" height="7" fill="#0f172a" />
      <rect x="46" y="84" width="10" height="11" fill="#1f2937" />
      {/* Neck */}
      <rect x="44" y="54" width="12" height="6" fill={SKIN_SHADOW} />
      {/* Head — only upper face shows */}
      <ellipse cx="50" cy="44" rx="16" ry="17" fill={SKIN} />
      {/* Mask covering lower face */}
      <path d="M34,46 Q34,62 50,62 Q66,62 66,46 L66,52 Q66,58 50,58 Q34,58 34,52 Z" fill="#022c22" />
      <rect x="34" y="46" width="32" height="14" fill="#022c22" />
      {/* Hood */}
      <path d="M28,46 Q26,18 50,14 Q74,18 72,46 L72,38 Q72,30 50,30 Q28,30 28,38 Z" fill="url(#jn-hood)" />
      {/* Hood inner */}
      <path d="M32,42 Q34,28 50,26 Q66,28 68,42 Q66,32 50,30 Q34,32 32,42 Z" fill="#022c22" opacity="0.5" />
      {/* Headband stripe */}
      <rect x="28" y="36" width="44" height="4" fill="#dc2626" />
      <circle cx="50" cy="38" r="2.5" fill="#fef3c7" />
      {/* Sharp eyes */}
      <path d="M40,45 L48,46 L46,49 L40,48 Z" fill={EYE} />
      <path d="M52,46 L60,45 L60,48 L54,49 Z" fill={EYE} />
      <circle cx="44" cy="46.6" r="0.8" fill="#34d399" />
      <circle cx="56" cy="46.6" r="0.8" fill="#34d399" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   4 · COBALT — SKY PILOT
   ═══════════════════════════════════════════════════════════════════ */
function CharCobalt() {
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cp-jacket" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#8b5a2b" />
          <stop offset="100%" stopColor="#3f1d0a" />
        </linearGradient>
        <linearGradient id="cp-cap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#5b3a1f" />
          <stop offset="100%" stopColor="#2a1a0a" />
        </linearGradient>
      </defs>
      {/* Bomber jacket body */}
      <path d="M18,114 L18,70 Q18,60 30,58 L70,58 Q82,60 82,70 L82,114 Z" fill="url(#cp-jacket)" />
      {/* Fur collar */}
      <ellipse cx="50" cy="60" rx="32" ry="6" fill="#fef3c7" />
      <ellipse cx="50" cy="60" rx="32" ry="6" fill="url(#cp-jacket)" opacity="0.15" />
      {/* Scarf — flowing red */}
      <path d="M30,62 Q22,80 18,98 L24,100 Q28,82 36,68 Z" fill="#dc2626" />
      <path d="M30,62 Q26,72 24,82" stroke="#7f1d1d" strokeWidth="0.8" fill="none" />
      {/* Zipper */}
      <line x1="50" y1="62" x2="50" y2="112" stroke="#fde68a" strokeWidth="1.5" strokeDasharray="2 2" />
      {/* Neck */}
      <rect x="44" y="54" width="12" height="6" fill={SKIN_SHADOW} />
      {/* Head */}
      <ellipse cx="50" cy="46" rx="16" ry="17" fill={SKIN} />
      {/* Hair under cap */}
      <path d="M34,46 Q36,40 50,40 Q64,40 66,46 L66,48 L34,48 Z" fill="#1c1917" />
      {/* Aviator cap */}
      <path d="M28,42 Q26,26 50,22 Q74,26 72,42 L72,46 Q72,48 70,48 L66,48 Q66,40 50,40 Q34,40 34,48 L30,48 Q28,48 28,46 Z" fill="url(#cp-cap)" />
      {/* Cap fur trim */}
      <ellipse cx="50" cy="26" rx="22" ry="3" fill="#fef3c7" />
      {/* Goggles raised on cap */}
      <ellipse cx="40" cy="32" rx="6" ry="5" fill="#0f172a" />
      <ellipse cx="60" cy="32" rx="6" ry="5" fill="#0f172a" />
      <ellipse cx="40" cy="32" rx="3" ry="2.5" fill="#38bdf8" />
      <ellipse cx="60" cy="32" rx="3" ry="2.5" fill="#38bdf8" />
      <rect x="46" y="31" width="8" height="2" fill="#0f172a" />
      {/* Goggle strap */}
      <path d="M28,32 Q26,30 28,28" stroke="#0f172a" strokeWidth="2" fill="none" />
      <path d="M72,32 Q74,30 72,28" stroke="#0f172a" strokeWidth="2" fill="none" />
      {/* Eyes */}
      <circle cx="44" cy="48" r="2" fill={EYE} />
      <circle cx="56" cy="48" r="2" fill={EYE} />
      <circle cx="44.6" cy="47.4" r="0.7" fill="#fff" />
      <circle cx="56.6" cy="47.4" r="0.7" fill="#fff" />
      {/* Confident grin */}
      <path d="M44,55 Q50,59 56,55" stroke={MOUTH} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   5 · VIOLET — COURT JESTER
   ═══════════════════════════════════════════════════════════════════ */
function CharViolet() {
  return (
    <svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="vj-suit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#3b0764" />
        </linearGradient>
        <linearGradient id="vj-hat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
        <pattern id="vj-diamond" patternUnits="userSpaceOnUse" width="14" height="14" patternTransform="rotate(45)">
          <rect width="14" height="14" fill="#8b5cf6" />
          <rect width="7" height="14" fill="#fbbf24" />
        </pattern>
      </defs>
      {/* Suit body */}
      <path d="M20,114 L20,70 Q20,58 32,56 L68,56 Q80,58 80,70 L80,114 Z" fill="url(#vj-suit)" />
      {/* Harlequin collar */}
      <path d="M28,56 L50,72 L72,56 L66,76 L50,84 L34,76 Z" fill="url(#vj-diamond)" />
      <circle cx="50" cy="78" r="3" fill="#fbbf24" />
      {/* Bell on belt */}
      <circle cx="50" cy="92" r="4" fill="#fbbf24" />
      <circle cx="50" cy="93" r="1.3" fill="#7f1d1d" />
      {/* Neck */}
      <rect x="44" y="54" width="12" height="6" fill={SKIN_SHADOW} />
      {/* Head */}
      <ellipse cx="50" cy="46" rx="16" ry="17" fill={SKIN} />
      {/* Jester hat — three points */}
      <path d="M30,38 L24,4 L36,28 L50,2 L64,28 L76,4 L70,38 Z" fill="url(#vj-hat)" />
      {/* Hat bells */}
      <circle cx="24" cy="4"  r="3" fill="#fbbf24" />
      <circle cx="50" cy="2"  r="3" fill="#fbbf24" />
      <circle cx="76" cy="4"  r="3" fill="#fbbf24" />
      <circle cx="24" cy="4.5" r="0.8" fill="#7f1d1d" />
      <circle cx="50" cy="2.5" r="0.8" fill="#7f1d1d" />
      <circle cx="76" cy="4.5" r="0.8" fill="#7f1d1d" />
      {/* Hat brim band */}
      <rect x="28" y="38" width="44" height="4" fill="#3b0764" />
      {/* Mischievous eyes — wider, with raised brows */}
      <path d="M38,42 Q42,40 46,42" stroke={EYE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M54,42 Q58,40 62,42" stroke={EYE} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="44" cy="48" r="2.2" fill={EYE} />
      <circle cx="56" cy="48" r="2.2" fill={EYE} />
      <circle cx="44.6" cy="47.4" r="0.7" fill="#fff" />
      <circle cx="56.6" cy="47.4" r="0.7" fill="#fff" />
      {/* Wide grin */}
      <path d="M42,53 Q50,60 58,53 Q55,57 50,57 Q45,57 42,53 Z" fill={MOUTH} />
      <path d="M42,53 Q50,60 58,53" stroke={MOUTH} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Clown cheeks */}
      <circle cx="38" cy="52" r="2.5" fill="#fb7185" opacity="0.5" />
      <circle cx="62" cy="52" r="2.5" fill="#fb7185" opacity="0.5" />
    </svg>
  );
}

const CHAR_MAP = {
  1: CharCrimson,
  2: CharAmber,
  3: CharJade,
  4: CharCobalt,
  5: CharViolet,
};

/**
 * Render a stylized Game-Mode character avatar.
 * @param {object} props
 * @param {1|2|3|4|5} props.avatarId
 * @param {number} [props.size=80]
 * @param {string} [props.className]
 */
export default function CharacterAvatar({ avatarId, size = 80, className = '' }) {
  const Comp = CHAR_MAP[avatarId] || CharCrimson;
  return (
    <span
      className={`gm-char ${className}`}
      style={{ width: size, height: size * 1.2, display: 'inline-block', lineHeight: 0 }}
    >
      <Comp />
    </span>
  );
}

export const CHARACTER_NAMES = {
  1: 'Crimson',
  2: 'Amber',
  3: 'Jade',
  4: 'Cobalt',
  5: 'Violet',
};
