/**
 * IntroAnimation
 * ───────────────────────────────────────────────────────────
 * Choreography (~9.2s):
 *   0.0 → 1.6s  Three dots fly in from offscreen RIGHT, gently spinning,
 *               and arrive at the converge point as a horizontal triple.
 *   1.6 → 2.0s  Brief pulse-hold at the converge point.
 *   2.0 → 2.6s  Dots draw inward into a tight rotating triangle.
 *   2.6 → 4.0s  Smooth orbit (1.4s, one full turn, linear).
 *   4.0 → 4.4s  Triangle compresses into ONE glowing core at converge point.
 *   4.4 → 5.0s  FLASH + core BLOOMS — light source becomes the bulb.
 *   5.0 → 5.55s Bulb slides slightly LEFT to make room; "Lexara" letters
 *               fade/snap in to its right. Lockup is centered as a unit.
 *   5.55 → 8.0s HOLD the centered lockup ~2.5s. Halo + rays glow around bulb.
 *   8.0 → 8.85s FLIP — the lockup flies to the navbar logo's exact rect.
 *   8.85 → 9.2s Backdrop fades to transparent.
 *   9.2s         Unmount. Real navbar logo becomes visible at same pixel.
 *
 * Coordinate system & FLIP math (CRITICAL):
 *   The lockup's CSS positioning is `top: 50%; left: 50%; transform-origin: 0 0`.
 *   That puts the lockup's TOP-LEFT at viewport center. Framer's translate
 *   moves it from there. We compute, on mount, the centering offset such
 *   that the BULB SVG's center is at viewport center for stages 0–5 (the
 *   visible center of attention).
 *
 *   Then for the FLIP at stage 8, we measure the CURRENT bulb center vs
 *   the navbar bulb center, and apply ADDITIVE translate from the previous
 *   stage's translate (so we never overwrite the slide-left offset — the
 *   lockup glides smoothly from "centered + slid-left" to "navbar position").
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import './IntroAnimation.css';

const LETTERS = ['L', 'e', 'x', 'a', 'r', 'a'];

export default function IntroAnimation({ onDone }) {
  const [stage, setStage] = useState(0);

  // Centering offset — translate that puts the BULB SVG's center at
  // viewport center. Computed once in useLayoutEffect by measuring the
  // bulb-spot rect after first paint.
  const [centerOffset, setCenterOffset] = useState({ x: 0, y: 0 });

  // Slide-left offset for stage 6+ (so the [bulb Lexara] lockup is
  // visually centered as a UNIT). Computed at stage 6 by measuring the
  // wordmark width.
  const [slideOffset, setSlideOffset] = useState({ x: 0, y: 0 });

  // FLIP target — additional translate + scale to land on navbar.
  const [flip, setFlip] = useState(null);

  // Refs for measurement.
  const lockupRef = useRef(null);
  const bulbSpotRef = useRef(null);
  const wordRef = useRef(null);

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Hide navbar logo for the duration of the intro.
  useLayoutEffect(() => {
    document.body.setAttribute('data-intro-playing', '1');
    return () => { document.body.removeAttribute('data-intro-playing'); };
  }, []);

  // Compute centering offset: how much to translate the lockup so its
  // bulb center sits at viewport center.
  useLayoutEffect(() => {
    function recompute() {
      const lockup = lockupRef.current;
      const bulbSpot = bulbSpotRef.current;
      if (!lockup || !bulbSpot) return;
      // The lockup is at top:50%, left:50%, transform-origin 0 0,
      // with framer x:0, y:0 initially. So lockup.left in viewport ==
      // viewport_center_x. The bulb-spot is the FIRST flex child, sits
      // at lockup-relative left=0.
      // We want the bulb-spot CENTER at viewport center.
      const bulbRect = bulbSpot.getBoundingClientRect();
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const bulbCx = bulbRect.left + bulbRect.width / 2;
      const bulbCy = bulbRect.top + bulbRect.height / 2;
      setCenterOffset({
        x: cx - bulbCx,
        y: cy - bulbCy,
      });
    }
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  // Mount-once timer chain.
  useEffect(() => {
    let alive = true;
    const finish = () => {
      try { localStorage.setItem('lexara-intro-seen', '1'); } catch (e) { /* private mode */ }
      onDoneRef.current?.();
    };

    function computeSlideAndAdvance() {
      // At stage 6, slide the lockup LEFT so the entire [bulb Lexara]
      // unit is centered. Distance = half the wordmark's width + half
      // the gap (12px). We subtract 1px for optical centering.
      const word = wordRef.current;
      if (!word) {
        setSlideOffset({ x: -90, y: 0 });
      } else {
        const wRect = word.getBoundingClientRect();
        // Slide left by half the word width + half the 12px gap.
        const dx = -((wRect.width / 2) + 6);
        setSlideOffset({ x: dx, y: 0 });
      }
      setStage(6);
    }

    function computeFlipAndAdvance() {
      // Measure the BULB SVG itself (not the wrapper) so font/baseline
      // padding can't drift the math.
      const introBulbSvg = bulbSpotRef.current?.querySelector('svg');
      const navLogo = document.getElementById('navbar-logo');
      const navBulb = navLogo?.querySelector('svg');
      if (!introBulbSvg || !navBulb) {
        setStage(9);
        return;
      }
      const c = introBulbSvg.getBoundingClientRect();
      const t = navBulb.getBoundingClientRect();
      // Scale = ratio of target height to current height. With both at
      // 28px intrinsic this is ~1.0; if dynamic styling differs, scale
      // adapts.
      const scale = t.height / c.height;
      const cCx = c.left + c.width / 2;
      const cCy = c.top + c.height / 2;
      const tCx = t.left + t.width / 2;
      const tCy = t.top + t.height / 2;
      // ADDITIVE delta — we add this on top of the current centerOffset
      // + slideOffset so the FLIP smoothly continues from where the
      // lockup is now.
      setFlip({
        dx: tCx - cCx,
        dy: tCy - cCy,
        scale,
      });
      setStage(8);
    }

    const timers = [
      setTimeout(() => alive && setStage(1), 1600),
      setTimeout(() => alive && setStage(2), 2000),
      setTimeout(() => alive && setStage(3), 2600),
      setTimeout(() => alive && setStage(4), 4000),
      setTimeout(() => alive && setStage(5), 4400),
      setTimeout(() => alive && computeSlideAndAdvance(), 5000),
      setTimeout(() => alive && setStage(7), 5550),
      setTimeout(() => alive && computeFlipAndAdvance(), 8000),
      setTimeout(() => alive && setStage(9), 8850),
      setTimeout(() => { if (alive) { setStage(10); finish(); } }, 9200),
    ];

    const onKey = (e) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!alive) return;
        timers.forEach(clearTimeout);
        setStage(10);
        finish();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = () => {
    setStage(10);
    try { localStorage.setItem('lexara-intro-seen', '1'); } catch (e) { /* private mode */ }
    onDoneRef.current?.();
  };

  if (stage >= 10) return null;

  // ─── Per-dot positions ────────────────────────────────────
  const DOT_ORBIT_R = 16;
  const DOT_LINE_DX = 56;
  const dotState = (i) => {
    switch (stage) {
      case 0: return {
        fromX: 800 + i * 40, fromY: 0,
        toX: (i - 1) * DOT_LINE_DX, toY: 0,
        scale: 1, opacity: 1,
      };
      case 1: return {
        toX: (i - 1) * DOT_LINE_DX, toY: 0,
        scale: 1, opacity: 1,
      };
      case 2:
      case 3: {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        return {
          toX: Math.cos(a) * DOT_ORBIT_R,
          toY: Math.sin(a) * DOT_ORBIT_R,
          scale: 1, opacity: 1,
        };
      }
      case 4: return { toX: 0, toY: 0, scale: 0.55, opacity: 1 };
      default: return { toX: 0, toY: 0, scale: 0, opacity: 0 };
    }
  };

  let dotsRotate = 0;
  if (stage === 0) dotsRotate = 180;
  else if (stage === 1) dotsRotate = 180;
  else if (stage === 2) dotsRotate = 240;
  else if (stage === 3) dotsRotate = 600;
  else if (stage >= 4) dotsRotate = 600;

  const dotsRotationTransition =
    stage === 3
      ? { duration: 1.4, ease: 'linear' }
      : stage === 0
      ? { duration: 1.6, ease: [0.22, 1, 0.36, 1] }
      : { duration: 0.5, ease: 'easeOut' };

  // ─── Lockup transform — ALL ADDITIVE ──────────────────────
  // Base: centerOffset (puts bulb at viewport center)
  // Stage 6+: + slideOffset (slides left so [bulb Lexara] is centered)
  // Stage 8+: + flip.dx/dy (FLIP to navbar position) + scale
  let lockupX = centerOffset.x;
  let lockupY = centerOffset.y;
  let lockupScale = 1;
  if (stage >= 6) {
    lockupX += slideOffset.x;
    lockupY += slideOffset.y;
  }
  if (stage >= 8 && flip) {
    lockupX += flip.dx;
    lockupY += flip.dy;
    lockupScale = flip.scale;
  }

  const lockupTransition =
    stage === 8
      ? { duration: 0.85, ease: [0.65, 0, 0.35, 1] }
      : stage === 6
      ? { duration: 0.55, ease: [0.22, 1, 0.36, 1] }
      : { duration: 0.4, ease: 'easeOut' };

  // ─── Backdrop opacity ─────────────────────────────────────
  const backdropOpacity = stage >= 9 ? 0 : 1;

  // ─── Halo ─────────────────────────────────────────────────
  const haloScale = stage >= 5 && stage < 8 ? 1 : (stage >= 8 ? 0.6 : 0.4);
  const haloOpacity = stage >= 5 && stage < 8 ? 1 : 0;

  // ─── Rays ─────────────────────────────────────────────────
  // Rays appear with the bulb, rotate slowly during the hold, fade on FLIP.
  const raysOpacity = stage >= 5 && stage < 8 ? 0.85 : 0;

  // ─── Core ─────────────────────────────────────────────────
  let coreScale = 0;
  let coreOpacity = 0;
  if (stage === 4) { coreScale = 1; coreOpacity = 1; }
  else if (stage === 5) { coreScale = 3.0; coreOpacity = 0.85; }
  else if (stage === 6 || stage === 7) { coreScale = 3.0; coreOpacity = 0.30; }
  else if (stage >= 8) { coreScale = 3.0; coreOpacity = 0; }

  const coreTransition =
    stage === 5
      ? { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
      : { duration: 0.4, ease: 'easeOut' };

  // ─── Flash ────────────────────────────────────────────────
  // Brief white flash at stage 5 entry, hiding the dots-to-bulb seam.
  const flashOpacity = stage === 5 ? 0.0 : 0;        // we'll override via keyframes
  // Flash is rendered with keyframe animation in framer (see motion below).

  // ─── Bulb ─────────────────────────────────────────────────
  let bulbOpacity = 0;
  let bulbScale = 0.7;
  if (stage === 5) { bulbOpacity = 1; bulbScale = 1; }
  else if (stage >= 6) { bulbOpacity = 1; bulbScale = 1; }

  return (
    <motion.div
      className="intro-anim"
      initial={{ opacity: 1 }}
      animate={{ opacity: backdropOpacity }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      onClick={handleClick}
      role="presentation"
    >
      {/* GOD-RAYS — slow continuous rotation (the conic gradient stays
          static; we rotate the element as a whole). Anchored to viewport
          center via CSS, but in practice the lockup centers there too. */}
      <motion.div
        className="intro-anim__rays"
        initial={{ opacity: 0, rotate: 0 }}
        animate={{
          opacity: raysOpacity,
          rotate: stage >= 5 ? 25 : 0,
        }}
        transition={{
          opacity: { duration: 0.8, ease: 'easeOut' },
          rotate: { duration: 6, ease: 'linear' },
        }}
      />

      {/* THE LOCKUP — bulb-spot + wordmark, moves as one unit. */}
      <motion.div
        ref={lockupRef}
        className="intro-anim__lockup"
        animate={{ x: lockupX, y: lockupY, scale: lockupScale }}
        transition={lockupTransition}
      >
        {/* Bulb spot — converge point for everything bulb-related. */}
        <div className="intro-anim__bulb-spot" ref={bulbSpotRef}>
          {/* HALO — centered on this bulb. */}
          <motion.div
            className="intro-anim__halo"
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: haloOpacity, scale: haloScale }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />

          {/* DOTS — converge to center of this spot. */}
          <motion.div
            className="intro-anim__dots"
            initial={false}
            animate={{ rotate: dotsRotate }}
            transition={dotsRotationTransition}
          >
            {[0, 1, 2].map((i) => {
              const s = dotState(i);
              return (
                <motion.span
                  key={i}
                  className="intro-anim__dot"
                  initial={{
                    x: stage === 0 ? (s.fromX ?? 0) : (s.toX ?? 0),
                    y: stage === 0 ? (s.fromY ?? 0) : (s.toY ?? 0),
                    opacity: 0,
                    scale: 1,
                  }}
                  animate={{
                    x: s.toX ?? 0,
                    y: s.toY ?? 0,
                    scale: s.scale ?? 1,
                    opacity:
                      stage === 1
                        ? [0.75, 1, 0.75]
                        : (s.opacity ?? 1),
                  }}
                  transition={{
                    x: {
                      duration:
                        stage === 0 ? 1.5 :
                        stage === 2 ? 0.55 :
                        stage === 4 ? 0.35 : 0.4,
                      ease:
                        stage === 0 ? [0.22, 1, 0.36, 1] :
                        stage === 4 ? 'easeIn' :
                        [0.22, 1, 0.36, 1],
                      delay: stage === 0 ? i * 0.05 : 0,
                    },
                    y: {
                      duration: stage === 0 ? 1.5 : 0.4,
                      ease: stage === 0 ? [0.22, 1, 0.36, 1] : 'easeOut',
                      delay: stage === 0 ? i * 0.05 : 0,
                    },
                    scale: { duration: 0.4, ease: 'easeOut' },
                    opacity:
                      stage === 1
                        ? { duration: 1.2, repeat: Infinity, repeatType: 'reverse', delay: i * 0.12, ease: 'easeInOut' }
                        : stage === 0
                        ? { duration: 0.5, delay: 0.1 + i * 0.05 }
                        : { duration: 0.35 },
                  }}
                />
              );
            })}
          </motion.div>

          {/* CORE — gold ball bridging dots → bulb. */}
          <motion.div
            className="intro-anim__core"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: coreScale, opacity: coreOpacity }}
            transition={coreTransition}
          />

          {/* FLASH — quick white pulse at the bloom moment. Hides the seam
              between core and bulb visually. Renders only during stage 5
              and stages above for a fraction of a second via keyframes. */}
          {stage === 5 && (
            <motion.div
              className="intro-anim__flash"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.4, 1.8] }}
              transition={{ duration: 0.55, ease: 'easeOut', times: [0, 0.35, 1] }}
            />
          )}

          {/* BULB — fades in as the core blooms (briefly hidden under the flash). */}
          <motion.div
            className="intro-anim__bulb"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: bulbScale, opacity: bulbOpacity }}
            transition={{
              duration: 0.55,
              delay: stage === 5 ? 0.1 : 0,    // bulb appears as flash peaks
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Lightbulb size={28} strokeWidth={1.5} />
          </motion.div>
        </div>

        {/* WORDMARK — fades in at stage 6 to the right of the bulb. */}
        <div className="intro-anim__word" aria-hidden="true" ref={wordRef}>
          {LETTERS.map((ch, i) => {
            const inPlace = stage >= 6;
            return (
              <motion.span
                key={i}
                className="intro-anim__letter"
                initial={{ opacity: 0, y: 14, scale: 0.88 }}
                animate={{
                  opacity: inPlace ? 1 : 0,
                  y: inPlace ? 0 : 14,
                  scale: inPlace ? 1 : 0.88,
                }}
                transition={{
                  duration: 0.55,
                  delay: inPlace ? 0.15 + i * 0.05 : 0,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {ch}
              </motion.span>
            );
          })}
        </div>
      </motion.div>

      <span className="intro-anim__skip">click anywhere or press Esc to skip</span>
    </motion.div>
  );
}
