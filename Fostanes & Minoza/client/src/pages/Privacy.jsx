import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Legal.css';

export default function Privacy() {
  return (
    <div className="legal">
      <div className="legal__container">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="legal__eyebrow">Privacy Policy</span>
          <h1 className="legal__title">Plain-language privacy.</h1>
          <p className="legal__lead">
            What Lexara collects, why, who it touches, and how long it stays. No dark patterns,
            no surprise newsletters — just the actual data flow of the system.
          </p>
          <span className="legal__meta">Last updated · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </motion.header>

        <div className="legal__rule" />

        <section className="legal__section">
          <h2>Information we collect</h2>
          <p>
            Lexara collects only what is needed to run an account and improve quiz quality.
          </p>
          <dl className="legal__defs">
            <dt>Google account profile</dt>
            <dd>
              When you sign in, we receive your name, email address, profile picture URL, and a
              stable Google identifier. We do not receive your password or contact list.
            </dd>

            <dt>Activity data</dt>
            <dd>
              Quizzes you create or take, attempt scores, time taken, and uploaded modules
              (PDFs you store in your library). This is necessary for scoring, leaderboards, and
              your dashboard.
            </dd>

            <dt>AI request logs</dt>
            <dd>
              The endpoint type used (e.g. <code>generate</code>, <code>analyze-file</code>) and a
              timestamp. Used to power the admin AI-usage chart. We do <strong>not</strong> retain
              the prompt text or the generated questions in the request log.
            </dd>

            <dt>Authentication tokens</dt>
            <dd>
              A short-lived access token and a SHA-256 hash of a refresh token. Tokens are stored
              in <code>httpOnly</code> cookies and rotated automatically.
            </dd>

            <dt>Server logs</dt>
            <dd>
              Standard request/response metadata kept for operational debugging — no body content
              is logged unless an error specifically requires it.
            </dd>
          </dl>
        </section>

        <section className="legal__section">
          <h2>How your content is processed</h2>
          <p>
            When you generate a quiz from a PDF, text, URL, or topic, the source content is sent to
            a third-party language model — currently <strong>Mistral AI</strong> or{' '}
            <strong>Google Gemini</strong>, depending on the configured provider. The provider
            returns a structured set of questions which we save to your account.
          </p>
          <p>
            Lexara does not use your content to train its own models, and we do not share your
            content with any party other than the model provider you implicitly select by using the
            generation feature. Each provider has its own data-handling policy that applies to the
            transmitted prompt.
          </p>
          <p>
            Uploaded module PDFs are stored as binary blobs in our PostgreSQL database and as a
            local cache on the application server. They are accessible only to you, unless you
            explicitly mark a module as public.
          </p>
        </section>

        <section className="legal__section">
          <h2>What we do not do</h2>
          <ul>
            <li>We do not sell your data.</li>
            <li>We do not run advertising or third-party trackers on the application.</li>
            <li>We do not use your quizzes, attempts, or modules to train any model.</li>
            <li>We do not share your account information beyond the providers strictly required to operate (Google for sign-in; Mistral or Gemini for generation when you use that feature).</li>
            <li>We do not contact you outside of transactional necessities — there is no marketing email list.</li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>Cookies</h2>
          <p>
            Lexara sets two cookies: an <code>access_token</code> with a 15-minute lifetime and a
            <code> refresh_token</code> with a 7-day lifetime. Both are <code>httpOnly</code>,
            <code> SameSite=Lax</code>, and marked <code>Secure</code> in production. They exist
            only to keep you signed in. There are no analytics or advertising cookies.
          </p>
        </section>

        <section className="legal__section">
          <h2>Retention</h2>
          <p>
            Account data is kept for as long as your account exists. Refresh tokens are purged
            automatically once expired. Server logs follow standard hosting-provider retention
            (typically 30 days). If you delete your account, your quizzes, attempts, modules, and
            personal information are removed; aggregate counts (e.g. total quizzes taken on the
            platform) may persist in anonymized form.
          </p>
        </section>

        <section className="legal__section">
          <h2>Your controls</h2>
          <ul>
            <li><strong>Sign out everywhere.</strong> Logging out revokes every refresh token tied to your account, not just the one in the current browser.</li>
            <li><strong>Delete a quiz, attempt, or module.</strong> You own everything you create. Deleting it removes it from our database; there is no &ldquo;trash&rdquo; that retains it.</li>
            <li><strong>Account deletion.</strong> Email <a href="mailto:mfostanes@ssct.edu.ph">mfostanes@ssct.edu.ph</a> from the address linked to your account, and the account and its associated data will be removed within a reasonable timeframe.</li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>Children</h2>
          <p>
            Lexara is built for educational use and is suitable for older students, but it is not
            directed at children under 13. We do not knowingly collect data from children under 13.
            If you believe a child has used Lexara, contact us so we can remove the account.
          </p>
        </section>

        <section className="legal__section">
          <h2>Changes to this policy</h2>
          <p>
            If this policy changes materially, we will update the &ldquo;Last updated&rdquo; date
            above and, where reasonable, surface a note in the app on your next sign-in.
          </p>
        </section>

        <section className="legal__section">
          <h2>Contact</h2>
          <p>
            Questions, requests, or concerns: email{' '}
            <a href="mailto:mfostanes@ssct.edu.ph">mfostanes@ssct.edu.ph</a>.
          </p>
        </section>

        <footer className="legal__footer">
          <span>© {new Date().getFullYear()} Lexara</span>
          <div className="legal__footer-links">
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
