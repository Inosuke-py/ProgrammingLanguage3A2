import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Lightbulb, Zap, Trophy, ArrowRight, GraduationCap, Brain, Shield, BookOpen, FileText, Wand2, Sparkles } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';
import { publicApi } from '../services/api';
import useBareCanvas from '../components/shared/useBareCanvas';
import TabletShowcase from '../components/shared/TabletShowcase';
import LaptopScene from '../components/shared/LaptopScene';
import FeaturesCarousel from '../components/shared/FeaturesCarousel';
import IntroAnimation from '../components/shared/IntroAnimation';
import './Home.css';

const ASCII_ART = `                                                                                                    
                                           @@@@@@@@@@@@                                             
                                      @@@@@@@@@@@@@@@@@@@@                                          
                                   @@@@@@@@@@@@@@@@@@@@@@@@@@@@                                     
                                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                    
                                @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                 
                              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                 
                             @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@                                
                            @@@@@@@@@@@@@@@@@@@@@%#%@@@%@@@@@@@@@@@@@                               
                           @@@@@@@@@@@@@@@@%%%@%%#%#@@@#@@@@@@@@@@@@@                               
                           @@@@@@@@@@@@@@@%##%%##%@@@%@%@@@@@@@@@@@@@                               
                            @@@@@@@@@@@@@%####%%@@@###%%@@@@@@@@@@@@@                               
                            @@@@@@@@@@%%##%%##*###%*+++%#%@@@@@@@@@@@                               
                             @@@@@%@@@%%%#*++==++**####***+**%@@@@@@                                
                              @@%%@@%%%%%%%#*+==+*######**#*++*%@@@@                                
                              @@#####**+=+###*=-=+++++=====+*++#@@@                                 
                              @@##%%%@@@%#=#%*=-==+*###+++====+*%@@                                 
                               %######**+++#%+=---=+*##**#+===+#@@                                  
                             #%###*+++==++*##===----==-----====#@@                                  
                            #@@*##*++===+*#%*=-==-----------===*==#+                                
                             %%+*#*++==++##%#+====----------==++=-+                                 
                             #@*+##*++++*@#@@#+*%+---------===+*=-=                                 
                             #%%+*##*++++***+===----------===+*===                                  
                              *%**##********+===----------==+++===                                  
                               %*+*####*##%%##***+=------===++===                                   
                                ++*####*%%###**##*#*==--====++                                      
                                 +**##**#%%#*+++++=-=======+++                                      
                                 **##%########**+=========++*                                       
                                  *###%##*++===---=====+++**+                                       
                                   #######*++==--====+++*#*++                                       
                                    ###%%%##***++++**###+==+                                        
                                    #####%%%%%%%%%##**+====+%@                                      
                                    *#%#*#%%%%##**++====-==+:%@@                                    
                                    *#%#*#%#**++======----=-:%@@@@                                  
                                   @@##%####++=======----==:=@@@@@@@                                
                                  @@%######%*+============::#@@@@@@@@@                              
                                @@@@+%#######*++=========:.+@@@@@@@@@@@@@                           
                             @@@@@@@-%######**+========+:.-@@@@@@@@@@@@@@@@@@                       
                        @@@@@@@@@@@%:########*++======*..:%@@@@@@@@@@@@@@@@@@@@@@@                  
                     @@@@@@@@@@@@@@#:+#********++===+*...#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@             
                @@@@@@@@@@@@@@@@@@@*:=********+++++**...=@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@       
            @@@@@@@@@@@@@@@@@@@@@@@*-:+++**++++****+....%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@    
       @@@@@@@@@@@@@@@@@@@@@@@@@@@@*-:==+++==++***-....*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
     @@@@@@@@@@@@@@@@@@@@@@@@@@@@@%+===+=====+***:-=..-@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
    @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*==+=====++**#=...-=%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%#--=-==+++**#%#:..:+@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%+::::=+++**#%%%#::-@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%:.:::-=+++**##%%%*#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%::::::=++++***####@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%%=::::-==+++****+%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*#**=:.:==+++**#+*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@=+-=+*::==+++**++%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%==:-=**-:=++**+=#@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%==::-+*+:=++*+=*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@#=-:::-=++=+*#++%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@*=-::::--=-***+*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@+=-::::-::+*#=+%@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@`;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }
  }),
};

const features = [
  { icon: Brain, title: 'AI-Powered Generation', description: 'Transform any text, PDF, or topic into expertly crafted quizzes with advanced AI.' },
  { icon: Zap, title: 'Instant Feedback', description: 'Get real-time scoring with detailed explanations for every answer you give.' },
  { icon: Trophy, title: 'Gamified Learning', description: 'Earn XP, maintain streaks, climb leaderboards, and unlock achievements.' },
  { icon: Shield, title: 'Smart Analytics', description: 'Track your progress with beautiful charts and identify knowledge gaps.' },
];

const steps = [
  {
    num: '01',
    title: 'Provide Content',
    desc: 'Upload a PDF, paste text, point to a URL, or just name a topic. Lexara extracts and parses it for you.',
    icon: (
      <svg className="step__icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="4" width="28" height="40" rx="3" stroke="currentColor" strokeWidth="2"/>
        <path d="M18 16h12M18 22h12M18 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M24 36v-8M20 32l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Natural Language Understanding',
    desc: 'Our NLP engine reads, summarizes, and detects whether your file is a quiz to extract or material to learn from.',
    icon: (
      <svg className="step__icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 4l2.5 7.5L34 14l-7.5 2.5L24 24l-2.5-7.5L14 14l7.5-2.5L24 4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M36 24l1.5 4.5L42 30l-4.5 1.5L36 36l-1.5-4.5L30 30l4.5-1.5L36 24z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M14 28l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M10 40l6-6M38 10l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    num: '03',
    title: 'AI Generates the Quiz',
    desc: 'A large language model crafts MCQ, true/false, and fill-in-blank questions with explanations — calibrated to your difficulty.',
    icon: (
      <svg className="step__icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="14" stroke="currentColor" strokeWidth="2"/>
        <circle cx="24" cy="24" r="5" stroke="currentColor" strokeWidth="2"/>
        <path d="M24 4v6M24 38v6M4 24h6M38 24h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <path d="M10 10l4 4M34 34l4 4M38 10l-4 4M14 34l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Take & Master',
    desc: 'Practice mode for instant feedback or graded mode for XP, streaks, and leaderboards. Track every gap.',
    icon: (
      <svg className="step__icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 6l4 8.5 9.5 1.5-7 6.5 1.5 9.5L24 27l-8 5 1.5-9.5-7-6.5 9.5-1.5L24 6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M16 34v8l8-4 8 4v-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

function WaveDivider({ flip, color = 'var(--color-surface-1)' }) {
  return (
    <div className={`wave-divider ${flip ? 'wave-divider--bottom' : 'wave-divider--top'}`}>
      <svg viewBox="0 0 1440 60" fill="none" preserveAspectRatio="none"
        style={flip ? { transform: 'rotate(180deg)' } : {}}>
        <path d="M0 60L48 53.3C96 46.7 192 33.3 288 28.3C384 23.3 480 26.7 576 31.7C672 36.7 768 43.3 864 43.3C960 43.3 1056 36.7 1152 31.7C1248 26.7 1344 23.3 1392 21.7L1440 20V60H1392C1344 60 1248 60 1152 60C1056 60 960 60 864 60C768 60 672 60 576 60C480 60 384 60 288 60C192 60 96 60 48 60H0Z" fill={color} />
      </svg>
    </div>
  );
}

function formatStat(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K+`;
  return `${n}+`;
}

// ---- Scatter Title: letters repel from cursor on hover ----
// Each "line" renders on its own line. Within a line, multiple segments
// can exist (e.g. "& " + "QUIZ" on the same line).
const TITLE_LINES = [
  [{ text: 'MODULE', cls: 'hero__title-light' }],
  [{ text: 'VIEWER', cls: 'hero__title-bold' }],
  [{ text: '& ', cls: 'hero__title-light' }, { text: 'QUIZ', cls: 'hero__title-accent' }],
  [{ text: 'GENERATOR', cls: 'hero__title-bold' }],
];

function ScatterTitle() {
  const containerRef = useRef(null);
  const charsRef = useRef([]);
  const [offsets, setOffsets] = useState([]);
  const rafRef = useRef(null);
  const charIndex = useRef(0);

  const handleMouseMove = useCallback((e) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const radius = 120;
      const strength = 45;

      const newOffsets = charsRef.current.map((el) => {
        if (!el) return { x: 0, y: 0 };
        const cr = el.getBoundingClientRect();
        const cx = cr.left + cr.width / 2 - rect.left;
        const cy = cr.top + cr.height / 2 - rect.top;
        const dx = cx - mx;
        const dy = cy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius || dist === 0) return { x: 0, y: 0 };
        const force = (1 - dist / radius) * strength;
        const angle = Math.atan2(dy, dx);
        return { x: Math.cos(angle) * force, y: Math.sin(angle) * force };
      });
      setOffsets(newOffsets);
    });
  }, []);

  const handleMouseLeave = useCallback(() => { setOffsets([]); }, []);

  // Reset char index before render
  charIndex.current = 0;

  const renderChar = (char, cls) => {
    const i = charIndex.current++;
    return (
      <span
        key={i}
        ref={(el) => { charsRef.current[i] = el; }}
        className={`hero__char ${cls}`}
        style={{
          transform: offsets[i]
            ? `translate(${offsets[i].x}px, ${offsets[i].y}px)`
            : undefined,
        }}
      >
        {char === ' ' ? '\u00A0' : char}
      </span>
    );
  };

  return (
    <h1
      className="hero__title"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {TITLE_LINES.map((line, li) => (
        <span key={li} className="hero__title-line">
          {line.map((seg) =>
            seg.text.split('').map((ch) => renderChar(ch, seg.cls))
          )}
        </span>
      ))}
    </h1>
  );
}

function ScreenCreate() {
  return null; // unused — hero now uses static image
}

export default function Home() {
  const navigate = useNavigate();
  const { user, loginWithGoogle } = useAuthStore();
  // While auth is initializing on first paint, click handlers below would
  // see `user === null` and bounce already-signed-in users through Google
  // OAuth. Track loading too so we can disable the buttons until auth
  // settles.
  const authLoading = useAuthStore((s) => s.loading);
  // Home has its own bespoke hero background — opt out of the global texture.
  useBareCanvas();
  const [stats, setStats] = useState({ totalUsers: 0, totalQuizzes: 0, totalAttempts: 0, totalModules: 0 });

  // First-visit intro animation. Show on first visit; persist the "seen" flag
  // ONLY after the intro actually plays (or the user dismisses it). We do
  // NOT auto-skip on prefers-reduced-motion — the intro is short and
  // skippable with a click, and respecting the OS setting was silently
  // hiding it for users who want to see it.
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem('lexara-intro-seen') === '1') return false;
    } catch (e) { /* private mode — fall through and show it once per tab */ }
    return true;
  });

  useEffect(() => {
    let alive = true;
    publicApi.stats().then(res => {
      if (alive && res?.data) setStats(res.data);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleStart = () => {
    if (authLoading) return;             // prevent click during auth init
    if (user) { navigate('/create'); }
    else { loginWithGoogle(); }
  };

  const handleExplore = () => {
    if (authLoading) return;
    if (user) { navigate('/explore'); }
    else { loginWithGoogle(); }
  };

  const handleModules = () => {
    if (authLoading) return;
    if (user) { navigate('/modules'); }
    else { loginWithGoogle(); }
  };

  return (
    <div className="home">
      {/* First-visit splash. Self-unmounts via the onDone callback. */}
      {showIntro && <IntroAnimation onDone={() => setShowIntro(false)} />}

      {/* ===== HERO ===== */}
      <section className="hero">
        <div className="hero__bg">
          <div className="hero__grid-widget grid-widget" />
          <div className="hero__radial radial-widget" />
          <div className="hero__radial-2 radial-widget" />
          <div className="hero__grain" />
        </div>

        <div className="container hero__split">
          {/* Left — editorial typography */}
          <div className="hero__left">
            <motion.span className="hero__eyebrow"
              variants={fadeUp} initial="hidden" animate="visible" custom={0}>
              AI-POWERED LEARNING PLATFORM
            </motion.span>

            <motion.div
              variants={fadeUp} initial="hidden" animate="visible" custom={1}>
              <ScatterTitle />
            </motion.div>

            <motion.p className="hero__subtitle"
              variants={fadeUp} initial="hidden" animate="visible" custom={2}>
              Transform any content into beautifully crafted quizzes.
              Learn smarter. Retain longer. Excel always.
            </motion.p>

            <motion.div className="hero__actions"
              variants={fadeUp} initial="hidden" animate="visible" custom={3}>
              <button className="btn btn--primary btn--lg" onClick={handleStart}>
                Start Creating <ArrowRight size={18} />
              </button>
              <button className="btn btn--outline btn--lg" onClick={handleModules}>
                <BookOpen size={16} /> Modules
              </button>
            </motion.div>

            <motion.div className="hero__stats"
              variants={fadeUp} initial="hidden" animate="visible" custom={4}>
              {[
                { val: formatStat(stats.totalUsers), label: 'Users' },
                { val: formatStat(stats.totalQuizzes), label: 'Quizzes' },
                { val: formatStat(stats.totalAttempts), label: 'Attempts' },
                { val: formatStat(stats.totalModules), label: 'Modules' },
              ].map((s, i) => (
                <div key={s.label} className="hero__stat">
                  {i > 0 && <div className="hero__stat-div" />}
                  <span className="hero__stat-val">{s.val}</span>
                  <span className="hero__stat-lbl">{s.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right — hero device image */}
          <motion.div className="hero__right"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 1, ease: [0.22, 1, 0.36, 1] }}>
            <img
              src="/hero-devices.png"
              alt="Lexara on laptop, tablet, and phone"
              className="hero__image"
              loading="eager"
            />
          </motion.div>
        </div>

        <WaveDivider flip color="var(--color-surface-1)" />
      </section>
      {/* ===== TABLET SHOWCASE ===== */}
      <TabletShowcase />

      {/* ===== 3D LAPTOP SCENE ===== */}
      <LaptopScene />

      {/* ===== HOW IT WORKS ===== */}
      <section className="section section--alt">
        <div className="section__widget grid-widget" style={{ top: -40, right: -120, opacity: 0.025 }} />
        <div className="container">
          <div className="section-header">
            <span className="label">How It Works</span>
            <h2>From document to mastery</h2>
            <p>An NLP pipeline that reads your material, understands it, and turns it into an exam — in seconds.</p>
          </div>
          <div className="steps steps--four">
            {steps.map((s, i) => (
              <motion.div key={s.num} className="step"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                {s.icon}
                <span className="step__num">{s.num}</span>
                <h3 className="step__title">{s.title}</h3>
                <p className="step__desc">{s.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* ===== CAPABILITY STRIP ===== */}
          <motion.div className="capability-strip"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <span className="capability-strip__label">Behind every quiz</span>
            <ul className="capability-strip__list">
              <li>
                <strong>PDF Text Extraction</strong>
                <span>pdf-parse pipeline reads up to 30,000 characters per document, no OCR needed for digital PDFs.</span>
              </li>
              <li>
                <strong>Smart Content Detection</strong>
                <span>NLP classifier decides whether to <em>extract</em> existing questions verbatim or <em>generate</em> new ones from learning material.</span>
              </li>
              <li>
                <strong>LLM Question Generation</strong>
                <span>Mistral and Google Gemini back the same provider-agnostic interface — swap models per request.</span>
              </li>
              <li>
                <strong>Robust Answer Grading</strong>
                <span>Scoring engine handles letter answers (A/B/C/D), full-text answers, and case-insensitive matching transparently.</span>
              </li>
            </ul>
          </motion.div>
        </div>
        <WaveDivider flip color="var(--color-surface-0)" />
      </section>

      {/* ===== FEATURES ===== */}
      <FeaturesCarousel />

      {/* ===== CTA ===== */}
      <section className="section section--alt cta-section">
        <WaveDivider color="var(--color-surface-1)" />
        <div className="container">
          <motion.div className="cta-block"
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="cta-block__glow radial-widget" />
            <span className="label" style={{ position: 'relative' }}>Begin Your Journey</span>
            <h2 style={{ position: 'relative' }}>Ready to transform how you learn?</h2>
            <p style={{ position: 'relative', maxWidth: 460, margin: '0 auto var(--space-8)' }}>
              Join thousands of students and educators using Lexara to create, share, and master knowledge.
            </p>
            <div className="cta-block__actions" style={{ position: 'relative' }}>
              <button className="btn btn--primary btn--lg" id="cta-start" onClick={handleStart}>
                <GraduationCap size={18} /> Get Started Free
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="container footer__inner">
          <div className="footer__left">
            <div className="footer__brand">
              <Lightbulb size={22} strokeWidth={1.5} />
              <span className="text-serif" style={{ fontSize: 'var(--text-xl)' }}>Lexara</span>
            </div>
            <div className="footer__links">
              <Link to="/about">About</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
            </div>
            <p className="footer__copy">© {new Date().getFullYear()} Lexara. All rights reserved.</p>
          </div>
          <div className="footer__right">
            <div className="footer__dev-info">
              <div className="footer__dev-text">
                <span className="footer__dev-label">Developer</span>
                <strong className="footer__dev-name">Mark Renier B. Fostanes</strong>
                <a href="mailto:mfostanes@ssct.edu.ph" className="footer__dev-email">mfostanes@ssct.edu.ph</a>
                <span className="footer__dev-course">Bachelor of Science in Computer Science</span>
              </div>
              {ASCII_ART && ASCII_ART.trim().length > 0 && (
                <pre className="footer__ascii">{ASCII_ART}</pre>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
