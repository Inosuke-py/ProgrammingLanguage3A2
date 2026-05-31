# How Claude Built Pyrism

> A build journal. This file documents the chronological design decisions,
> mistakes, and tradeoffs made while putting together
> **Pyrism — See your code, one step at a time** with Claude (Opus 4.7) as
> a pair-programming partner.

---

## TL;DR

Pyrism is a single-page, client-only web app that teaches programming-language
concepts through editable, runnable code in **Python, Ruby, C, C++, and
JavaScript**. It runs entirely in the browser via Pyodide, ruby.wasm, JSCPP,
and the host JS engine. There's no backend, no install, and no account.

It started as a 4-tab Python-only lab and grew, conversation by conversation,
into a 10-tab multi-language teaching dashboard with a landing page, a docs
site, mobile drawer navigation, and a step-by-step execution tracer.

---

## Build timeline

This is roughly the order things landed in. Each step came from a single
prompt; mistakes, U-turns, and bugfixes are kept in.

### 1. Initial scaffolding
> *"Build an interactive web app that simulates programming language features
> like duck typing, polymorphism, and static vs dynamic typing using Python
> examples."*

Starting choices:

- **Pyodide** for the Python runtime. Real CPython on WebAssembly was the only
  option that could authentically demonstrate `gc`, `weakref`, `sys.settrace`,
  and the rest of the stdlib. Skulpt and Brython were ruled out for that
  reason.
- **CodeMirror 5** for the editor. Mature, tiny, supports Python/Java/JS modes
  out of the box, and zero build pipeline.
- **Static HTML + plain CSS + plain JS** rather than React/Vue/etc.
  Justification: a 7-tab app doesn't need a framework, and the result has to
  run from any static host (USB stick, GitHub Pages, S3) without a build
  step.
- Curated examples in a separate `examples.js` so the UI code never has to
  change to add or edit demos. Each example carries
  `{ title, blurb, code }` (or extras for comparison tabs).

First three tabs delivered:
- 🦆 Duck Typing — 4 examples
- 🎭 Polymorphism — 4 examples
- ⚖️ Static vs Dynamic — 4 scenarios with a Python pane (live) and a Java
  pane (read-only) plus a hand-rendered `javac`-style error report

### 2. Adding more concepts + a docs page
> *"Add Strong vs Weak, Inheritance, Encapsulation, Garbage Collection… and
> put a system explanation in docs."*

Four more tabs landed (💪, 🧬, 📦, 🗑️) plus a 🛝 Free Playground.

A `docs.html` got written with a sticky-sidebar table of contents, an ASCII
architecture diagram, and a file-by-file reference. A second copy of the same
content went into `DOCUMENTATION.md` for GitHub-style rendering.

### 3. Bug: empty dropdowns
> *"Why are the 'pick an example' dropdowns empty?"*

The Encapsulation example had this Python f-string:

```py
return f"Charged ${amount:.2f}"
```

That code lives inside a JavaScript template literal in `examples.js`. JS
parsed `${amount:.2f}` as JS interpolation, raised a `SyntaxError`, and
`EXAMPLES` was never defined — so the entire app stopped initializing.

**Lesson:** when embedding source code from one language inside another
language's string literals, escape the host-language sigils. Replaced `${`
with `\${` in the affected examples.

### 4. The Trace feature
> *"By simulation I mean show how the function made the output."*

Built `_run_traced(src)` inside Pyodide — a Python helper that installs
`sys.settrace`, captures every call/return/print/exception with depth,
serializes it as JSON, and sends it to JS. The JS side renders it as an
indented call tree.

Filtered out library frames (only `<user>` is tracked) and capped event count
at 600 with a "trace truncated" banner so a `gc.collect()` example couldn't
flood the UI.

Added a Trace button alongside Run on every tab and a `Shift+Ctrl/⌘+Enter`
shortcut.

### 5. More simulators
> *"Add Callbacks, Closures, Recursion, Generators."*

Four new tabs in one pass. Each got 4–5 curated examples designed to look
visually striking when traced (recursive descent + unwind, `next()` resumes
in generators, captured cells in closures).

### 6. Educational dashboard redesign
> *"Make it a modern educational dashboard — sidebar, cards, smooth
> animations."*

Layout went from horizontal tabs to a sidebar shell:
- Three semantic groups in the sidebar: **Type Systems**, **Object Model**,
  **Function Mechanics**.
- Sticky frosted-glass topbar with a breadcrumb and the Pyodide status pill.
- Concept hero card on each panel with a faint purple radial glow.
- Inter + JetBrains Mono via Google Fonts.
- All colors centralized as CSS custom properties.
- Subtle spring entrances, button micro-interactions, and a per-row trace
  fade-in.

### 7. Picking the brand name
> *"Change PL Concepts Lab to something cooler."*

Picked **Pyrism**: a *prism* splits white light into its colors; this app
splits Python execution into its parts. The existing purple → blue → teal
gradient already looked like a spectrum, so the visual identity didn't need
to change. The 🧪 mark got swapped to 🔮 for the same reason.

Tagline: *"See your code, one step at a time."*

### 8. Phone responsiveness
> *"Make it perfect for phone too."*

- Sidebar became a slide-in drawer with a hamburger button and dimmed
  backdrop. Closes on tab pick, on backdrop tap, and on Escape.
- Topbar shortened — keyboard hint hidden, status pill text shrunk to
  "Booting Python…"/"Python ready"/"Python failed to load".
- Two-column layouts collapsed to one.
- Editor heights stepped down from 340 px → 280 px (phone) → 240 px (very
  narrow phones).
- Tap targets bumped to ≥38 px.
- `@media (prefers-reduced-motion: reduce)` cuts every animation.

### 9. Five more simulators (cancelled mid-way)
> *"Add Mutable vs Immutable, Exceptions, Control Structures, Functions vs
> Procedures, Lambdas/Higher-Order, plus Framer-Motion-style animations and
> a Learn pane next to the output."*

Got the example data and the motion CSS in. Then accidentally clobbered
`.panel { display: none }` while inserting the motion block, so every panel
showed at once. Restored the rule, but the user pivoted before all the
panel HTML had landed:

> *"Remove Garbage Collection and Playground."*

Both got cleanly removed across the project — sidebar buttons, panels, JS
wiring, dropdown population, reset handlers, `TAB_TO_EDITOR` map, and the
docs/README references.

That left the app focused on the strongest 10 concepts.

### 10. Multi-language picker
> *"Beside Run and Trace, add a language picker (C, C++, Java, JavaScript,
> Python). Different examples per language."*

Approach:
- New `lang_examples.js` with `{ title, blurb, explain, code, output }`
  blocks for each language per tab.
- Pill-shaped segmented control on each lab tab.
- Switching language: repopulates the example dropdown, swaps the
  CodeMirror mode, toggles read-only, and re-renders the Learn pane.
- For non-Python: Run shows a hand-written "Simulated output" with a blue
  banner. Trace was initially gated.

### 11. "Why can't Trace work in other languages?"
> *"Why can't I use trace in other languages besides Python?"*

Fair point. The Python trace was a real `sys.settrace` instrumentation — there
was no equivalent for the others. The fix:

- A `runSimulatedTrace()` that renders a hand-crafted `trace` array if the
  example author wrote one (call/return/print/error events with proper
  depths).
- If no trace was authored, the renderer falls back to splitting the
  expected output into one print event per line — still a faithful
  what-got-printed-and-when view.
- A "Simulated trace" banner makes the difference from the real thing
  visible.
- Hand-wrote `trace` arrays for the showcase examples (Duck Typing JS,
  Recursion factorial in Java/Ruby/JS).

### 12. Real engines for the other languages
> *"Can you make Pyodide-style live execution for Java, C, C++, JS too?"*

- **JavaScript** — trivial. The browser already has a JS engine. Using
  `new Function(source)` with a captured `console.log` gives a clean
  sandbox for the Run path.
- **C / C++** — added [JSCPP](https://github.com/felixhao28/JSCPP), a JS
  C/C++ interpreter, lazy-loaded on first C/C++ Run. Useful subset
  (iostream, classes, basic templates, recursion). When an example uses
  something JSCPP can't handle, the failure is caught and the simulated
  output is shown with a clear yellow "Live run failed" banner.
- **Java** — there is no good free in-browser JVM. CheerpJ is commercial,
  DoppioVM is essentially abandoned. Honest answer: Java stays simulated,
  with a banner explaining why.

Three banner colors clarify what just happened:
- 🟢 **Live execution** — output is real
- 🔵 **Simulated output** — hand-written, no engine ran the code
- 🟡 **Live run failed — falling back** — engine attempted, fell back

### 13. Replacing Java with Ruby
> *"Replace Java with Ruby because Ruby has ruby.wasm."*

Good call. Duck typing is literally a Ruby motto, so the fit is great.

- Added the Ruby CodeMirror mode.
- New `runRubyLive()` that lazy-loads `@ruby/wasm-wasi` (CRuby 3.3 on
  WebAssembly), captures stdout/stderr by redirecting `$stdout`/`$stderr`
  to `StringIO` inside the VM, runs the user code, then reads the captured
  strings back across the JS boundary.
- Rewrote every `java:` block in `lang_examples.js` as idiomatic Ruby
  (using `respond_to?`, blocks, modules, `attr_reader`, lambdas,
  `Enumerator`, etc.).

#### Mid-step bug
The big rewrite that started replacing the file accidentally only swapped
the opening — the rest of the old Java/C/C++/JS content was left below the
new Ruby blocks, leaving the file as Frankenstein source. Node failed
parsing it. Fix was to rewrite `lang_examples.js` from scratch in one pass
rather than try to surgical-edit a half-replaced file.

> **Lesson:** if a partial file rewrite leaves stale content behind, don't
> try to patch the boundary — start fresh.

### 14. Live engines documentation
> *"Document the live engines in docs.html."*

A new section **#engines** got added to `docs.html` between Concepts and
How to run, with a four-column table of language → engine → load timing →
capability. Existing sections got renumbered. The docs now explain the
banner colors, what Trace can and can't do per language, and the honest
reason Java was dropped.

### 15. Landing page
> *"Make a landing page for this system in another HTML."*

`landing.html` and `landing.css` got built as a marketing-style entry
point:
- Sticky nav with brand mark, jump links, and a primary "Open Lab" CTA.
- Hero with a large gradient headline, subtitle, dual CTAs, an engine
  pill strip, and a floating 3D-tilted code preview card showing a
  mini-trace.
- Features grid (6 cards), Concepts grid (every tab as a deep-linked tile,
  grouped by section), Live engines list (one card per language), 3-step
  How it works, glowing final CTA card, footer.
- Reuses `style.css` color tokens; phone-friendly at ≤760 px.

The lab sidebar and docs page got 🏠 Home links added pointing at
`landing.html`.

---

## Final architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         BROWSER (any modern)                         │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Presentation                                                   │  │
│  │  • landing.html  — marketing entry point                       │  │
│  │  • index.html    — the lab (sidebar dashboard)                 │  │
│  │  • docs.html     — system documentation                        │  │
│  │  • style.css     — shared design system                        │  │
│  │  • landing.css   — landing-only extras                         │  │
│  │  • docs.css      — docs-only extras                            │  │
│  └────────────────────┬───────────────────────────────────────────┘  │
│                       │                                              │
│  ┌────────────────────▼───────────────────────────────────────────┐  │
│  │ Controller / data                                              │  │
│  │  • examples.js      — Python examples (live, traced)           │  │
│  │  • lang_examples.js — Ruby / C / C++ / JS examples             │  │
│  │  • app.js           — bootstrap, tabs, run/trace, lang picker  │  │
│  │  • CodeMirror 5     — syntax-highlighted editors               │  │
│  └────────────────────┬───────────────────────────────────────────┘  │
│                       │                                              │
│  ┌────────────────────▼───────────────────────────────────────────┐  │
│  │ Execution layer                                                │  │
│  │  • Pyodide      — CPython on WASM   (eager load, ~10 MB)       │  │
│  │  • ruby.wasm    — CRuby 3.3 on WASM  (lazy on first Ruby Run)  │  │
│  │  • JSCPP        — C/C++ subset       (lazy on first C/C++ Run) │  │
│  │  • Browser JS   — native JS engine   (always there)            │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### File map

```
interactive-app/
├── landing.html           # marketing entry
├── landing.css
│
├── index.html             # the lab
├── style.css              # shared design system
├── app.js                 # bootstrap + UI + run/trace + lang picker
├── examples.js            # Python examples (live + real trace)
├── lang_examples.js       # Ruby / C / C++ / JS examples
│
├── docs.html              # system documentation
├── docs.css
├── DOCUMENTATION.md       # same docs as Markdown
├── README.md
└── CLAUDE.md              # this file
```

---

## Engineering principles that emerged

1. **Honesty over polish.** When something is simulated rather than
   executed, say so loudly with a banner. Hide nothing.
2. **Static-first.** Every feature must work on a folder-of-files install.
   This ruled out Java live, ruled in Pyodide and ruby.wasm.
3. **Data-driven examples.** New content never needs UI changes — only an
   entry pushed into `EXAMPLES` or `LANG_EXAMPLES`.
4. **Real over fake.** Where a real engine exists (Pyodide, ruby.wasm,
   JSCPP, the browser's JS), use it. Hand-rolling fake interpreters was
   never the right answer.
5. **Pedagogy first.** Every example pairs runnable code with a one-paragraph
   explanation. The point is not to be a code playground; it's to teach.
6. **Don't fix forward through wreckage.** When a partial rewrite leaves
   inconsistent state, scrap and re-create. Two debugging cycles lost trying
   to patch a half-replaced `lang_examples.js` would have been one cycle to
   rewrite it.

---

## What's intentionally not done

- **No backend.** Static-only is a feature, not a limitation.
- **No Java live.** No good in-browser JVM exists. Won't fake it.
- **No accounts, no progress tracking, no analytics.** Out of scope for a
  classroom lab.
- **No build step.** Plain HTML/CSS/JS forever.
- **No framework.** Adding React would more than triple the bundle size for
  a 10-tab UI.

---

## Where Claude helped most

- **Curating examples.** Picking the *right* small program to demonstrate
  each concept — short enough to read in 30 seconds, rich enough that Trace
  reveals something — is the hardest part of teaching, and the part that
  benefited most from iterative collaboration.
- **Catching cross-language string-literal bugs.** The `${...}` collision
  was the kind of issue that's instant to find with a Node syntax check
  but can stump a careful manual review.
- **Writing the explanation paragraphs.** Each example has a short
  conversational explanation; producing those at scale was the work most
  saved by AI assistance.
- **Multi-step refactors that touch every file.** Renaming PL Concepts Lab
  to Pyrism, adding the language picker across 8 tabs, replacing Java with
  Ruby — these all touched HTML, CSS, JS data, JS logic, and docs in lockstep.

## Where humans still drove

- Every product decision: which concepts to teach, which to drop, when to
  prioritize phone polish over more concepts, what the brand name should be.
- The "we should support real Java/C/C++ runtimes" idea, including the
  pivot to Ruby once Java's situation became clear.
- Quality control. Several of the prompts in this conversation were
  variations of *"why doesn't X work?"* and the answer was always to look
  back at what changed last and fix it.

---

*Built with Claude Opus 4.7 over the course of one long pair-programming
session. The product is the work; this file is the receipt.*
