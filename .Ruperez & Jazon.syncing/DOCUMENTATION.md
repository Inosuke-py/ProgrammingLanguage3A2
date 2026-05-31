# Pyrism — System Documentation

> An interactive, client-only web app that demonstrates seven core
> programming-language features through editable, runnable Python examples.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Learning objectives](#2-learning-objectives)
3. [Architecture](#3-architecture)
4. [Runtime flow](#4-runtime-flow)
5. [File-by-file reference](#5-file-by-file-reference)
6. [Concepts covered](#6-concepts-covered)
7. [How to run](#7-how-to-run)
8. [Extending the app](#8-extending-the-app)
9. [Tech stack & dependencies](#9-tech-stack--dependencies)
10. [Limitations](#10-limitations)
11. [FAQ](#11-faq)

---

## 1. Overview

**Pyrism** is a single-page, fully client-side web application that
teaches the canonical programming-language topics through hands-on Python:

- 🦆 Duck Typing
- 🎭 Polymorphism
- ⚖️ Static vs Dynamic Typing
- 💪 Strong vs Weak Typing
- 🧬 Inheritance
- 📦 Encapsulation

The app loads **CPython compiled to WebAssembly** (via
[Pyodide](https://pyodide.org/)) so user code executes entirely in the
browser — no server, no install, no account. Static comparison languages
(Java, JavaScript, C) are shown read-only with a synthesized analyzer
report so learners can see how the same logical bug surfaces in different
language families.

---

## 2. Learning objectives

After working through the lab, a student should be able to:

1. Distinguish duck typing from nominal subtype-based dispatch.
2. Identify the three main polymorphism flavors — subtype, ad-hoc,
   parametric — in working Python code.
3. Predict which type errors a static compiler catches and which only a
   dynamic runtime catches, and explain why.
4. Position a language on the static/dynamic and strong/weak axes
   independently.
5. Use single, multi-level, and multiple inheritance with `super()` and
   reason about Python's MRO.
6. Apply Python's encapsulation conventions (`_protected`, `__private`,
   `@property`, `__slots__`, frozen dataclasses) and recognize that they
   are conventions, not enforced barriers.
7. Explain CPython's hybrid GC (reference counting + generational cyclic
   collector) and use `gc` and `weakref` to inspect it.

---

## 3. Architecture

The system is a static three-layer client app. There is no backend, no
database, no build step.

```
┌──────────────────────────────────────────────────────────────────┐
│                          BROWSER (any modern)                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Presentation layer                                        │  │
│  │  • index.html  — tabs, panels, picker UI                   │  │
│  │  • style.css   — dark theme + responsive grid              │  │
│  │  • docs.html   — system documentation                      │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
│                            │ DOM events (click, change, ⌘+Enter) │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │  Controller / data layer (JavaScript)                      │  │
│  │  • examples.js — curated example snippets per concept      │  │
│  │  • app.js      — tab routing, editor wiring, run handler   │  │
│  │  • CodeMirror 5 — syntax-highlighted editors               │  │
│  └─────────────────────────┬──────────────────────────────────┘  │
│                            │ pyodide.runPython(source)           │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │  Execution layer                                           │  │
│  │  • Pyodide — CPython 3.12 compiled to WebAssembly          │  │
│  │  • _run_user_code() — captures stdout/stderr, formats tb   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Why this shape?**

- **Zero server.** The lab can be hosted on a USB stick, GitHub Pages, or
  any static file host — perfect for a classroom.
- **Real Python**, not a sandboxed pseudo-interpreter, so learners get
  authentic error messages, real `gc` behavior, and the full standard
  library.
- **Data-driven examples.** Every snippet lives in `examples.js`, so adding
  or editing demos doesn't require touching the UI code.

---

## 4. Runtime flow

What happens from page load to a printed result:

1. The browser fetches `index.html`, which pulls `style.css`, CodeMirror,
   Pyodide, `examples.js`, and `app.js` from the CDN/disk.
2. `app.js` calls `loadPyodide()` (≈10 MB on first run; cached
   afterwards). The status pill switches from *“Booting…”* to
   *“Python ready”* when finished.
3. A small Python helper `_run_user_code(src)` is defined inside the
   Pyodide interpreter. It redirects `sys.stdout` / `sys.stderr`,
   `exec()`s the source string, and returns the captured streams as a
   tuple.
4. For each tab, `app.js` creates a CodeMirror editor over the
   corresponding `<textarea>` and pre-fills it with the first example
   from `EXAMPLES.<tab>`.
5. User clicks **▶ Run** (or hits `Ctrl`/`Cmd`+`Enter`). The handler:
   1. reads the editor contents,
   2. writes them into `pyodide.globals.__user_src`,
   3. calls `_run_user_code(__user_src)`,
   4. renders the returned `(stdout, stderr)` into the output pane with a
      per-run timing badge.
6. Clicking **🔍 Trace** (or `Shift`+`Ctrl`/`Cmd`+`Enter`) runs
   `_run_traced(__user_src)` instead. That helper installs a
   `sys.settrace` hook that records every call, return, print, and
   exception inside the user's code, ignoring library internals. The events
   come back as JSON and are rendered as an indented call tree so you can
   see, line by line, *which function call produced which output*.
7. For the comparison tabs (*Static vs Dynamic*, *Strong vs Weak*), only
   the Python pane runs; the other-language pane is read-only and a
   pre-written analyzer report is shown so the contrast is explicit.

```
User                CodeMirror          app.js              Pyodide (WASM)
 │ click ▶ Run       │                  │                       │
 │──────────────────▶│ getValue()       │                       │
 │                   │─────────────────▶│ pyodide.globals.set   │
 │                   │                  │──────────────────────▶│
 │                   │                  │ runPython(_run_…)     │
 │                   │                  │──────────────────────▶│
 │                   │                  │   (exec inside py)    │
 │                   │                  │◀──────────────────────│
 │                   │                  │ (stdout, stderr)      │
 │                   │ render output    │                       │
 │◀──────────────────────────────────────                       │
```

---

## 5. File-by-file reference

### `index.html`
Defines the page chrome and one `<section class="panel">` per concept. Each
panel contains an explainer block, an example picker, one or two
CodeMirror-bound textareas, and an output `<pre>`. Tabs are plain
`<button data-tab="...">` elements; the active panel is toggled purely via
CSS classes.

### `style.css`
Hand-written dark theme using CSS custom properties for colors. Layout uses
a 2-column CSS grid that collapses to a single column under 900 px. No
frameworks, no preprocessor.

### `examples.js`
Exports a single `window.EXAMPLES` object with one array per tab:

```js
EXAMPLES = {
  duck:     [{ title, blurb, code }, …],   // single-language demos
  poly:     [{ title, blurb, code }, …],
  typing:   [{ title, blurb, python, java, staticReport }, …],
  strength: [{ title, blurb, python, js,   report }, …],
  inherit:  [{ title, blurb, code }, …],
  encap:    [{ title, blurb, code }, …],
  gc:       [{ title, blurb, code }, …],
}
```

Adding a new example is a matter of pushing one more object into the right
array. The picker dropdown is rebuilt from this data on page load.

### `app.js`
The controller. It does five things:

1. boots Pyodide and exposes a status pill,
2. turns each `<textarea>` into a CodeMirror editor,
3. populates the example dropdowns and reacts to changes,
4. handles tab switching and reset/clear buttons,
5. runs Python via `_run_user_code()` and renders the captured output (with
   a colorized stderr lane).

A global keyboard shortcut (`Ctrl`/`⌘`+`Enter`) triggers Run on whichever
tab is currently active.

### `docs.html` + `docs.css`
The HTML version of this document. Pure static, styled to match the app
shell.

### `README.md`
Quick-start summary intended for the repository root view.

---

## 6. Concepts covered

### 🦆 Duck Typing

Python's dispatch is structural at the use-site: a call like
`thing.quack()` succeeds if `thing` has a `quack` attribute callable with
no args, regardless of its class. Examples in the lab:

- The classic `Duck` / `Person` / `Dog` demo.
- File-like objects: anything with `.read()`.
- The EAFP idiom (try first, handle exceptions later).
- Custom iterables that plug into `for` via `__iter__`.

### 🎭 Polymorphism

Same operation name, different behavior. The lab covers:

- **Subtype** via overridden methods on a `Shape` hierarchy.
- **Ad-hoc** via dunder operators on a `Money` class (`__add__`,
  `__eq__`, `__repr__`).
- **Parametric** via a generic `smallest()` function.
- A combined `render(scene)` example that relies on duck typing.

### ⚖️ Static vs Dynamic Typing

*When* are types checked? Statically typed languages check at compile time;
dynamic languages check at runtime. The lab shows the same logical bug in
Python (runs until the bad path executes) and in Java (compiler refuses to
build) plus a pre-rendered `javac`-style error report. The fourth scenario
covers **gradual typing** — Python type hints + `mypy` as a way to bolt
static checks onto a dynamic language.

### 💪 Strong vs Weak Typing

*How strict* is the language about mixing types? Side-by-side examples
contrast Python (strong: refuses `"5" + 3`) with JavaScript (weak: gleefully
coerces it to `"53"`; `"5" - 3` becomes `2`). A third example points out
that strength is independent from static/dynamic — classic C is weak *and*
static.

### 🧬 Inheritance

Five examples, in order of complexity:

1. Single inheritance with `super()`.
2. Multi-level chains (`Vehicle → Car → ElectricCar`) and `__mro__`.
3. Multiple inheritance and Python's C3 linearization.
4. Abstract base classes with `abc.abstractmethod`.
5. Composition vs inheritance (favoring DI over hierarchy).

### 📦 Encapsulation

Four examples:

1. Naming conventions: `public`, `_protected`, `__private` (with name
   mangling demonstrated).
2. `@property` as a way to add validation without breaking the public API.
3. `__slots__` and `@dataclass(frozen=True)` for locked-down, low-overhead
   value types.
4. Why it matters: a `Stack` whose invariants break the moment someone
   reaches into `_items` directly.

---

## 7. How to run

The site is a folder of static files. There is no build step.

### Option A — open the file directly
Double-click `index.html`. This works in modern browsers, but Pyodide loads
more reliably over HTTP than via `file://`.

### Option B — serve locally (recommended)

```cmd
:: from inside interactive-app\
python -m http.server 8000
```

Then visit <http://localhost:8000>.

### Option C — host on any static site service
GitHub Pages, Netlify, Vercel, S3, Cloudflare Pages — drop the folder in.

### First-load cost
The first run downloads the Pyodide runtime (~10 MB compressed). The browser
caches it, so subsequent visits start in well under a second.

---

## 8. Extending the app

### Adding a new example to an existing tab

Open `examples.js` and append an object to the right array.

```js
// Single-language tab (duck, poly, inherit, encap, gc):
EXAMPLES.duck.push({
  title: "My new demo",
  blurb: "Short one-line teaser.",
  code: `print("hello")`
});

// Comparison tab (typing):
EXAMPLES.typing.push({
  title: "...",
  blurb: "...",
  python: `...`,
  java:   `...`,
  staticReport: `...`
});

// Comparison tab (strength):
EXAMPLES.strength.push({
  title: "...",
  blurb: "...",
  python: `...`,
  js:     `...`,
  report: `...`
});
```

The dropdown rebuilds itself on the next page load — no UI code changes
needed.

### Adding a brand-new concept tab

1. Add a tab button in `index.html` (`<button class="tab" data-tab="myconcept">`).
2. Add a matching `<section class="panel" id="tab-myconcept">`.
3. Add an `EXAMPLES.myconcept` array in `examples.js`.
4. In `app.js`, register the editor, populate the dropdown, hook up the
   Run button branch, and add a loader function.

### Changing the look

All colors live as CSS variables on `:root` in `style.css`. Swap them for a
light theme by overriding inside a `@media (prefers-color-scheme: light)`
block.

---

## 9. Tech stack & dependencies

| Layer    | Tool                       | Why                                                |
| -------- | -------------------------- | -------------------------------------------------- |
| Markup   | Hand-written HTML5         | No framework needed for a 7-tab UI.                |
| Styling  | Plain CSS + custom props   | Easy to tweak; no build pipeline.                  |
| Editor   | CodeMirror 5               | Tiny, mature, supports Python/Java/JS modes.       |
| Runtime  | Pyodide 0.26               | Real CPython on WebAssembly.                       |
| Hosting  | Any static host            | The whole app is files.                            |

Everything except Pyodide and CodeMirror is hand-written. CodeMirror and
Pyodide are loaded from CDNs — switch to local copies for fully offline
use.

---

## 10. Limitations

- Pyodide cannot do real OS I/O (no file system access by default, no
  sockets), but every example here is purely computational.
- Long-running loops will block the browser tab — avoid `while True:`
  without a `break`.
- The Java and JavaScript panes are **not executed**. Their output is a
  hand-written analyzer report, intentional for pedagogical clarity. Wiring
  up a real JavaScript runtime is trivial; Java would require a remote
  compilation service.
- The first page load needs ~10 MB of bandwidth to fetch the Pyodide image.
  After that everything is cached.

---

## 11. FAQ

**Is this safe to use offline?**
Once cached, yes. To make it work offline from the very first load,
download the Pyodide and CodeMirror assets locally and update the
`<script>` URLs in `index.html`.

**Can I add Ruby / Lua / Rust examples?**
For Ruby and Lua, look at WebAssembly ports. Rust and C/C++ won't run
in-browser without a compilation server. The current read-only “comparison
pane” pattern is the easiest way to add them.

**Why not Brython / Skulpt instead of Pyodide?**
Both are valid, but neither implements `gc`, `weakref`, or accurate
refcount semantics — which would defeat the GC tab.

**Is user code sandboxed?**
Yes. Pyodide runs inside the browser's WebAssembly sandbox; it cannot reach
your file system or network unless you explicitly grant it access via JS
interop.
