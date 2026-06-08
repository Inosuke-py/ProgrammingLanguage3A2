import { useRef, useState, useEffect, useCallback } from 'react';
import { Brain, Zap, Trophy, Shield, BookOpen, Sparkles, BarChart3, Target } from 'lucide-react';
import './FeaturesCarousel.css';

const FEATURES = [
  { icon: Brain, title: 'AI-Powered Generation', description: 'Transform any text, PDF, or topic into expertly crafted quizzes with advanced AI.' },
  { icon: Zap, title: 'Instant Feedback', description: 'Get real-time scoring with detailed explanations for every answer you give.' },
  { icon: Trophy, title: 'Gamified Learning', description: 'Earn XP, maintain streaks, climb leaderboards, and unlock achievements.' },
  { icon: Shield, title: 'Smart Analytics', description: 'Track your progress with beautiful charts and identify knowledge gaps.' },
  { icon: BookOpen, title: 'Module Library', description: 'Upload, annotate, and share lesson modules. Turn any page into a quiz.' },
  { icon: Sparkles, title: 'Multiple Sources', description: 'Paste text, upload PDFs, or simply name a topic. AI handles the rest.' },
  { icon: BarChart3, title: 'Score Trends', description: 'Visualize your learning journey with detailed performance analytics.' },
  { icon: Target, title: 'Adaptive Difficulty', description: 'Questions calibrated to your level — challenging but never overwhelming.' },
];

const FACE_COUNT = FEATURES.length;
const SEGMENT_DEG = 360 / FACE_COUNT;
const RADIUS = 1400 / (2 * Math.PI);

export default function FeaturesCarousel() {
  const containerRef = useRef(null);
  const cylinderRef = useRef(null);
  const [angle, setAngle] = useState(0);
  const scrollAngleRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const dragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartAngle = useRef(0);

  // Scroll
  useEffect(() => {
    const handle = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight;
      const total = rect.height - winH;
      const scrolled = Math.max(0, Math.min(total, -rect.top));
      const p = total > 0 ? scrolled / total : 0;
      scrollAngleRef.current = -(p * (FACE_COUNT - 1) * SEGMENT_DEG);
      if (!dragging.current) {
        setAngle(scrollAngleRef.current + dragOffsetRef.current);
      }
    };
    handle();
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
  }, []);

  // Native pointer drag
  const handlePointerDown = useCallback((e) => {
    dragging.current = true;
    dragStartX.current = e.clientX;
    dragStartAngle.current = angle;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [angle]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const newAngle = dragStartAngle.current + dx * 0.3;
    dragOffsetRef.current = newAngle - scrollAngleRef.current;
    setAngle(newAngle);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Active index: which face is at front
  const activeIndex = ((Math.round(-angle / SEGMENT_DEG) % FACE_COUNT) + FACE_COUNT) % FACE_COUNT;
  const feat = FEATURES[activeIndex];

  return (
    <section className="features-section" ref={containerRef}>
      <div className="features-section__grid grid-widget" />
      <div className="features-section__radial radial-widget" />

      <div className="features-sticky">
        <div className="features-sticky__header">
          <span className="label">Capabilities</span>
          <h2>Crafted for mastery</h2>
        </div>

        <div className="features-sticky__layout">
          <div className="feat-text">
            <span className="feat-text__step">
              {String(activeIndex + 1).padStart(2, '0')} / {String(FACE_COUNT).padStart(2, '0')}
            </span>
            <h3 className="feat-text__title text-serif" key={`t-${activeIndex}`}>{feat.title}</h3>
            <p className="feat-text__desc" key={`d-${activeIndex}`}>{feat.description}</p>
          </div>

          <div className="features-carousel-col">
            <div
              className="carousel-cylinder"
              ref={cylinderRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              style={{ transform: `rotateY(${angle}deg)` }}
            >
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className="carousel-face"
                  data-active={i === activeIndex ? 'true' : 'false'}
                  style={{
                    transform: `rotateY(${i * SEGMENT_DEG}deg) translateZ(${RADIUS}px)`,
                  }}
                >
                  <div className="carousel-card">
                    <f.icon className="carousel-card__icon" size={36} strokeWidth={1.5} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
