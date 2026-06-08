import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Legal.css';

export default function Terms() {
  return (
    <div className="legal">
      <div className="legal__container">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="legal__eyebrow">Terms of Service</span>
          <h1 className="legal__title">Reasonable rules.</h1>
          <p className="legal__lead">
            Use Lexara to study, build quizzes, and run classes. Don&rsquo;t use it to harass people,
            host illegal content, or attack the service. The full text below covers the
            in-betweens.
          </p>
          <span className="legal__meta">Last updated · {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </motion.header>

        <div className="legal__rule" />

        <section className="legal__section">
          <h2>Agreement</h2>
          <p>
            By creating a Lexara account or using the service, you agree to these terms. If you
            don&rsquo;t agree, please don&rsquo;t use Lexara. These terms apply to every interaction
            with the application — generating quizzes, taking quizzes, uploading modules, viewing
            leaderboards, and any administrative action you perform.
          </p>
        </section>

        <section className="legal__section">
          <h2>Eligibility</h2>
          <p>
            You must be at least 13 years old to use Lexara. By signing in, you confirm you meet
            this minimum. Institutional users (teachers using Lexara with their classes) are
            responsible for ensuring their students meet the same minimum.
          </p>
        </section>

        <section className="legal__section">
          <h2>Your account</h2>
          <ul>
            <li>You sign in using Google. You are responsible for keeping the underlying Google account secure.</li>
            <li>One person, one account. Sharing credentials defeats the leaderboard and is grounds for suspension.</li>
            <li>Information returned by Google sign-in (name, email, profile picture) may be displayed in leaderboards and quiz records visible to other users.</li>
            <li>You may delete your account at any time by emailing the contact below; deletion removes your quizzes, attempts, and modules from the system.</li>
          </ul>
        </section>

        <section className="legal__section">
          <h2>Your content</h2>
          <p>
            You retain ownership of every quiz you create, every module you upload, and every
            attempt you make. By uploading, you grant Lexara a limited license to store, process,
            and display that content for the purpose of operating the service for you. We do not
            use your content to train models, and we do not transfer ownership.
          </p>
          <h3>Public content</h3>
          <p>
            Marking a quiz or module &ldquo;public&rdquo; makes it discoverable by other Lexara
            users. If you make content public, you confirm you have the right to share it (i.e. you
            are not posting copyrighted material that you don&rsquo;t own or have permission to
            redistribute).
          </p>
          <h3>Private content</h3>
          <p>
            Private quizzes and modules remain visible only to you. The exception is when a quiz is
            attached to a class — class members can take it.
          </p>
        </section>

        <section className="legal__section">
          <h2>AI-generated questions</h2>
          <p>
            Lexara&rsquo;s quiz generation is powered by third-party language models. The output is
            statistical and best-effort: it can be wrong, biased, oversimplified, or out of date.
          </p>
          <ul>
            <li>Always verify generated questions before using them in a graded setting.</li>
            <li>Lexara is not a substitute for primary academic sources.</li>
            <li>We make no warranty that generated questions are factually correct or pedagogically appropriate.</li>
          </ul>
          <p>
            By using the generation feature, you accept that the source content you submit is
            transmitted to the configured model provider for processing. See the{' '}
            <Link to="/privacy">Privacy Policy</Link> for details.
          </p>
        </section>

        <section className="legal__section">
          <h2>Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Upload content that infringes copyright, trademarks, or other intellectual property rights you don&rsquo;t own.</li>
            <li>Generate content intended to harass, threaten, or defame any person or group.</li>
            <li>Generate content that depicts or solicits the abuse, exploitation, or sexualization of minors.</li>
            <li>Use Lexara to deliver malware, phishing, or other malicious payloads.</li>
            <li>Probe the service for vulnerabilities outside a coordinated disclosure conversation with the developer.</li>
            <li>Scrape, mass-export, or rate-flood the API beyond the stated rate limits.</li>
            <li>Reverse-engineer, sublicense, or resell the service or its output.</li>
          </ul>
          <p>
            We may suspend or remove accounts and content that violate these rules without prior
            notice when the violation is clear. We will, where reasonable, contact the account
            owner first.
          </p>
        </section>

        <section className="legal__section">
          <h2>Service availability</h2>
          <p>
            Lexara is provided on an &ldquo;as-is&rdquo; basis. We aim for stability but make no
            uptime guarantee. Maintenance, third-party model outages, and platform issues can
            cause brief interruptions. Your data is preserved across these interruptions.
          </p>
        </section>

        <section className="legal__section">
          <h2>Termination</h2>
          <p>
            You can stop using Lexara at any time. We may end your access for material violations
            of these terms or to protect the service or other users. After termination, you lose
            access to your account; your data is removed in line with the{' '}
            <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section className="legal__section">
          <h2>Disclaimers and liability</h2>
          <p>
            To the extent permitted by law, Lexara is provided without warranties of any kind,
            express or implied, including merchantability, fitness for a particular purpose, and
            non-infringement. To the extent permitted by law, the developer&rsquo;s aggregate
            liability arising out of or relating to your use of the service is limited to the
            amount you paid to use it — which, currently, is zero.
          </p>
        </section>

        <section className="legal__section">
          <h2>Changes</h2>
          <p>
            These terms may change as the service evolves. Material changes will be reflected in
            the &ldquo;Last updated&rdquo; date above. Continued use after a change means you accept
            the updated terms.
          </p>
        </section>

        <section className="legal__section">
          <h2>Contact</h2>
          <p>
            For questions about these terms, security issues, copyright takedown requests, or
            account help, email <a href="mailto:mfostanes@ssct.edu.ph">mfostanes@ssct.edu.ph</a>.
          </p>
        </section>

        <footer className="legal__footer">
          <span>© {new Date().getFullYear()} Lexara</span>
          <div className="legal__footer-links">
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
