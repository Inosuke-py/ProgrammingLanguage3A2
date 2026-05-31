# Pyrism

> See your Python, one step at a time.

An interactive single-page web app that demonstrates seven core
programming-language features through editable, runnable Python examples.

The Python actually executes in your browser via
[Pyodide](https://pyodide.org/) (CPython compiled to WebAssembly). No
server, no install.

## Concepts covered

- 🦆 **Duck Typing**
- 🎭 **Polymorphism** (subtype, ad-hoc, parametric)
- ⚖️ **Static vs Dynamic Typing** — with a Java side-by-side
- 💪 **Strong vs Weak Typing** — with a JavaScript side-by-side
- 🧬 **Inheritance** — single, multi-level, multiple, ABCs, composition
- 📦 **Encapsulation** — name mangling, properties, slots, frozen
- 📞 **Callbacks**, 🔒 **Closures**, 🌀 **Recursion**, ⚙️ **Generators**

## How to run it

It's a static site — just open `index.html` in any modern browser.

For the cleanest experience (Pyodide loads better over HTTP than `file://`),
serve the folder with any tiny static server, for example:

```cmd
:: from inside interactive-app\
python -m http.server 8000
```

Then open <http://localhost:8000>.

The first run will download the Pyodide runtime (~10 MB) and cache it; later
runs are instant.

## Project layout

```
interactive-app/
├── index.html         # markup, tabs, panels
├── style.css          # dark theme styling
├── examples.js        # all curated example snippets
├── app.js             # Pyodide bootstrap + UI wiring
├── docs.html          # in-app system documentation page
├── docs.css           # styling for the docs page
├── DOCUMENTATION.md   # the same docs as Markdown
└── README.md
```

## Documentation

A full system walkthrough — architecture, runtime flow, file-by-file
reference, and extension guide — is available in two formats:

- 📖 In-app: open `docs.html` (also linked from the header of the main app).
- 📄 Markdown: see [`DOCUMENTATION.md`](./DOCUMENTATION.md).

## Extending it

Add new examples by appending entries to the appropriate array in
`examples.js`:

- Single-language tabs (`duck`, `poly`, `inherit`, `encap`, `gc`) need
  `{ title, blurb, code }`.
- The `typing` tab needs `{ title, blurb, python, java, staticReport }`.
- The `strength` tab needs `{ title, blurb, python, js, report }`.

The dropdowns rebuild themselves automatically on next load.
