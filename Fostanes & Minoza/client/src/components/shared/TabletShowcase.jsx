import { useEffect, useRef, useState } from 'react';
import {
  Sparkles, FileText, Wand2, Brain, Trophy,
  TrendingUp, Search, Plus, Bell
} from 'lucide-react';
import './TabletShowcase.css';

const SLIDES = [
  { label: 'I · Compose', title: 'Begin with a thought', description: 'Drop in a topic, paste any text, or upload a PDF. Lexara reads, understands, and prepares to learn alongside you.', tablet: 'left', image: '/tablet1.gif' },
  { label: 'II · Generate', title: 'Watch intelligence unfold', description: 'Advanced AI distills your content into elegantly crafted questions — calibrated to depth, not difficulty alone.', tablet: 'right', image: '/tablet2.gif' },
  { label: 'III · Read', title: 'Every page, your way', description: 'Pick a theme — Novel, Sci-Fi, Kids, Pixel Art, Slingshot — and your reader transforms with animated chrome that fits the mood.', tablet: 'left', image: '/tablet3.gif' },
  { label: 'IV · Master', title: 'See yourself learning', description: 'Beautiful analytics chart your progress, surface what you have mastered, and gently point to what waits ahead.', tablet: 'right', image: '/tablet4.gif' },
];

const SCREENS = [ScreenCreate, ScreenAI, ScreenModules, ScreenAnalytics];

export default function TabletShowcase() {
  const containerRef = useRef(null);
  const [step, setStep] = useState(0); // 0..3

  useEffect(() => {
    const handle = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight;
      // total scrollable distance through this section while sticky is pinned
      const total = rect.height - winH;
      // how far we've scrolled into this section
      const scrolled = Math.max(0, Math.min(total, -rect.top));
      const progress = total > 0 ? scrolled / total : 0;
      // 4 segments: 0..0.25 → step 0, 0.25..0.5 → step 1, etc.
      const newStep = Math.min(3, Math.floor(progress * 4));
      setStep(newStep);
      // debug
      if (typeof window !== 'undefined') {
        window.__lexProg = progress;
        window.__lexStep = newStep;
      }
    };
    handle();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      window.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, []);

  return (
    <div className="showcase" ref={containerRef} data-step={step}>
      <div className="showcase__sticky">
        <div className="showcase__glow" />
        <div className="showcase__grid grid-widget" />
        <div className="showcase__radial radial-widget" />

        <div className="showcase__header">
          <span className="label">A guided tour</span>
          <h2>Built for the curious mind</h2>
        </div>

        <div className="showcase__canvas">
          {/* Single tablet — its horizontal position is driven by [data-step] on .showcase */}
          <div className="sc-tablet-anchor">
            <div className="sc-tablet-shifter">
              <div className="sc-tablet-tilter">
                <div className="sc-tablet">
                  <div className="sc-tablet__camera" />
                  <div className="sc-tablet__display">
                    <div className="sc-tablet__reel">
                      {SLIDES.map((s, i) => (
                        <div key={i} className="sc-tablet__slide">
                          <img src={s.image} alt="" className="sc-tablet__img" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="sc-tablet__glare" />
                </div>
              </div>
            </div>
          </div>

          {/* Text panels — visibility driven by [data-step] */}
          {SLIDES.map((s, i) => (
            <div
              key={i}
              className={`sc-text-anchor sc-text-anchor--${s.tablet === 'left' ? 'right' : 'left'}`}
              data-active={step === i}
              data-index={i}
            >
              <div className="sc-text">
                <span className="sc-text__label">{s.label}</span>
                <h3 className="sc-text__title text-serif">{s.title}</h3>
                <p className="sc-text__desc">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SCREEN MOCKUPS
   ============================================================ */
function TabBar({ active }) {
  return (
    <div className="t-nav">
      <div className="t-nav__brand"><span className="t-nav__bulb" /><span className="t-nav__name">Lexara</span></div>
      <div className="t-nav__menu">{['Dashboard', 'Create', 'Modules', 'Explore'].map(i => <span key={i} className={`t-nav__item ${active === i ? 't-nav__item--active' : ''}`}>{i}</span>)}</div>
      <div className="t-nav__user"><span className="t-nav__bell"><Bell size={9} /></span><span className="t-nav__avatar">M</span></div>
    </div>
  );
}

function ScreenCreate() {
  return (<div className="t-screen"><TabBar active="Create" /><div className="t-body">
    <div className="t-row"><span className="t-eyebrow">New Quiz</span><span className="t-pill"><Sparkles size={10} /> AI Powered</span></div>
    <h4 className="t-h">What shall we learn today?</h4>
    <p className="t-sub">Provide a source — a topic, document, or passage.</p>
    <div className="t-tabs"><button className="t-tab t-tab--active"><FileText size={11} /> Topic</button><button className="t-tab">PDF Upload</button><button className="t-tab">Paste Text</button></div>
    <div className="t-input"><span className="t-input__placeholder">The fundamentals of geographic information systems<span className="t-cursor">|</span></span></div>
    <div className="t-config"><div className="t-config__field"><span className="t-config__lbl">Questions</span><span className="t-config__val">10</span></div><div className="t-config__field"><span className="t-config__lbl">Difficulty</span><span className="t-config__val">Medium</span></div><div className="t-config__field"><span className="t-config__lbl">Type</span><span className="t-config__val">MCQ + T/F</span></div></div>
    <div className="t-foot"><button className="t-cta"><Wand2 size={11} /> Generate Quiz</button><span className="t-foot__hint">~ 8s with Mistral</span></div>
  </div></div>);
}

function ScreenAI() {
  return (<div className="t-screen"><TabBar active="Create" /><div className="t-body t-body--ai">
    <div className="t-ai-stage"><div className="t-ai-orb"><Brain size={14} /></div></div>
    <span className="t-eyebrow t-eyebrow--center">Generating · question 7 of 10</span>
    <h4 className="t-h t-h--center">Crafting your quiz</h4>
    <div className="t-q"><div className="t-q__head"><span className="t-q__num">07</span><span className="t-q__type">MCQ</span></div><p className="t-q__text">Which map projection preserves angle and shape but distorts area at high latitudes?</p><div className="t-q__options"><span className="t-opt">A · Robinson</span><span className="t-opt t-opt--correct">B · Mercator ✓</span><span className="t-opt">C · Mollweide</span><span className="t-opt">D · Lambert</span></div></div>
    <div className="t-progress"><div className="t-progress__bar"><div className="t-progress__fill" style={{ width: '70%' }} /></div><span className="t-progress__lbl">70%</span></div>
  </div></div>);
}

function ScreenModules() {
  const items = [{ t: 'Overview of GIS', tone: 0 }, { t: 'Spatial Data', tone: 1 }, { t: 'Map Projections', tone: 2 }, { t: 'Cartography', tone: 3 }, { t: 'Remote Sensing', tone: 4 }, { t: 'Geo-Statistics', tone: 5 }];
  return (<div className="t-screen"><TabBar active="Modules" /><div className="t-body">
    <div className="t-row"><div><span className="t-eyebrow">Library</span><h4 className="t-h">Lesson Modules</h4></div><button className="t-cta t-cta--ghost"><Plus size={11} /> Upload</button></div>
    <div className="t-search"><Search size={11} /><span>Search modules…</span></div>
    <div className="t-mod-grid">{items.map(m => <div key={m.t} className="t-mod"><div className={`t-mod__cover t-mod__cover--${m.tone}`} /><span className="t-mod__title">{m.t}</span></div>)}</div>
  </div></div>);
}

function ScreenAnalytics() {
  const bars = [42, 58, 36, 70, 62, 88, 74, 95, 84, 92, 78, 100];
  return (<div className="t-screen"><TabBar active="Dashboard" /><div className="t-body">
    <div className="t-row"><div><span className="t-eyebrow">Welcome back</span><h4 className="t-h">Mastery Overview</h4></div><span className="t-pill t-pill--success"><Trophy size={10} /> 12 streak</span></div>
    <div className="t-stats">{[{ v: '87%', l: 'Score' }, { v: '142', l: 'Quizzes' }, { v: '34h', l: 'Studied' }, { v: '8', l: 'Modules' }].map(s => <div key={s.l} className="t-stat"><span className="t-stat__num">{s.v}</span><span className="t-stat__lbl">{s.l}</span></div>)}</div>
    <div className="t-chart"><div className="t-chart__head"><span className="t-eyebrow">Score Trend</span><TrendingUp size={11} /></div><div className="t-chart__plot"><div className="t-chart__bars">{bars.map((h, i) => <div key={i} className="t-bar" style={{ height: `${h}%` }} />)}</div></div></div>
  </div></div>);
}
