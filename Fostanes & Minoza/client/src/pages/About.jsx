import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Legal.css';

export default function About() {
  return (
    <div className="legal">
      <div className="legal__container">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="legal__eyebrow">About Lexara</span>
          <h1 className="legal__title">An exam, drawn from your reading.</h1>
          <p className="legal__lead">
            Lexara turns documents, articles, and lecture notes into structured quizzes through a
            language-aware pipeline — so practice always tracks the material you actually study.
          </p>
        </motion.header>

        <div className="legal__rule" />

        <section className="legal__section">
          <h2>What it does</h2>
          <p>
            Lexara is an AI-assisted assessment platform. You provide a source — a PDF, a block of
            text, a URL, or a topic — and the system reads it, decides whether it&rsquo;s an existing
            exam to extract or learning material to generate from, and produces a multi-format quiz
            with explanations, scoring, and a leaderboard around it.
          </p>

          <div className="legal__cards">
            <div className="legal__card">
              <h4>Multi-source ingestion</h4>
              <p>
                PDF text extraction, plain text, URLs, or a single topic prompt — all converted into a
                normalized representation before any model sees it.
              </p>
            </div>
            <div className="legal__card">
              <h4>Smart content detection</h4>
              <p>
                A classification step decides whether your file already contains questions
                (extract them verbatim) or is reference material (generate fresh items from it).
              </p>
            </div>
            <div className="legal__card">
              <h4>NLP question generation</h4>
              <p>
                A large language model produces multiple-choice, true/false, and fill-in-the-blank
                questions, each with a written explanation calibrated to your difficulty.
              </p>
            </div>
            <div className="legal__card">
              <h4>Robust grading</h4>
              <p>
                Scoring tolerates lettered (A/B/C/D), full-text, and case-insensitive answers, so
                small format differences never cost a point.
              </p>
            </div>
          </div>
        </section>

        <section className="legal__section">
          <h2>Built for learners and teachers</h2>
          <p>
            Students upload modules, generate study quizzes, take them in practice or graded mode,
            earn experience points, and climb leaderboards. Teachers create classes, share private
            quizzes with members, and review per-quiz records — including times, attempt counts, and
            best scores — exportable to CSV.
          </p>
          <ul>
            <li><strong>Two play modes.</strong> Practice gives instant feedback; graded mode persists the attempt and awards XP.</li>
            <li><strong>Progress over time.</strong> XP, levels, streaks, and a global leaderboard surface long-term effort, not just one good day.</li>
            <li><strong>Module library.</strong> Reuse the same PDF across multiple quizzes; the in-app reader streams it without leaving the page.</li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>The stack, briefly</h2>
          <p>
            React 19 and Vite for the frontend with vanilla CSS design tokens. Express on Node for
            the API. PostgreSQL on Neon for storage. Two language-model providers — Mistral and
            Google Gemini — sit behind a unified service so the UI never depends on which one is
            running.
          </p>
          <p>
            Authentication is Google OAuth with rotating refresh tokens stored as SHA-256 hashes.
            Cookies are <code>httpOnly</code> with strict <code>SameSite</code> and a CSRF header
            check on every state-changing request. Rate limits are tiered: stricter on auth and AI
            routes than on read endpoints.
          </p>
        </section>

        <section className="legal__section">
          <h2>The team</h2>
          <p>
            Lexara is built by <strong>Mark Renier B. Fostanes</strong>, a Bachelor of Science in
            Computer Science student at <em>Surigao del Norte State University</em>. The project is
            released as a single-developer effort with an emphasis on quality over breadth — every
            feature shipped is one that&rsquo;s also been used end to end.
          </p>
          <p>
            For questions, partnerships, or feedback, reach out at{' '}
            <a href="mailto:mfostanes@ssct.edu.ph">mfostanes@ssct.edu.ph</a>.
          </p>
        </section>

        <footer className="legal__footer">
          <span>© {new Date().getFullYear()} Lexara</span>
          <div className="legal__footer-links">
            <Link to="/">Home</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
