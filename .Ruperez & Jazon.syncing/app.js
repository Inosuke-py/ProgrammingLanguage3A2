/* ------------------------------------------------------------------
   Pyrism — main app logic
------------------------------------------------------------------- */

const statusEl = document.getElementById("pyodide-status");
let pyodide = null;
let pyodideReady = null;

// ---------- Pyodide bootstrap ----------
async function bootPyodide() {
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/"
    });
    pyodide.runPython(`
import sys, io, traceback, json

def _run_user_code(src):
    out, err = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err
    try:
        exec(compile(src, "<user>", "exec"), {"__name__": "__main__"})
    except SystemExit:
        pass
    except BaseException:
        traceback.print_exc()
    finally:
        sys.stdout, sys.stderr = old_out, old_err
    return out.getvalue(), err.getvalue()


def _run_traced(src, max_events=600):
    events = []
    depth = [0]
    overflowed = [False]

    def push(ev):
        if len(events) >= max_events:
            overflowed[0] = True
            return
        events.append(ev)

    out_buf, err_buf = io.StringIO(), io.StringIO()
    old_out, old_err = sys.stdout, sys.stderr

    class _TracedOut:
        def __init__(self, real): self._real = real
        def write(self, s):
            if s:
                self._real.write(s)
                for line in s.splitlines():
                    push({"kind": "print", "depth": depth[0], "text": line})
            return len(s)
        def flush(self): self._real.flush()

    def safe_repr(v, limit=80):
        try:
            r = repr(v)
        except Exception:
            r = "<unreprable>"
        return r if len(r) <= limit else r[: limit - 1] + "…"

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<user>":
            return None
        if event == "call":
            name = frame.f_code.co_name
            if name == "<module>":
                return tracer
            argcount = frame.f_code.co_argcount
            argnames = frame.f_code.co_varnames[:argcount]
            args = {n: safe_repr(frame.f_locals.get(n)) for n in argnames}
            depth[0] += 1
            push({"kind": "call", "depth": depth[0], "name": name,
                  "line": frame.f_lineno, "args": args})
            return tracer
        if event == "return":
            name = frame.f_code.co_name
            if name == "<module>":
                return None
            push({"kind": "return", "depth": depth[0],
                  "name": name, "value": safe_repr(arg)})
            depth[0] = max(0, depth[0] - 1)
            return None
        if event == "exception":
            exc_type, exc_val, _ = arg
            push({"kind": "error", "depth": depth[0],
                  "name": frame.f_code.co_name,
                  "message": f"{exc_type.__name__}: {exc_val}"})
            return tracer
        return tracer

    sys.stdout = _TracedOut(out_buf)
    sys.stderr = err_buf
    sys.settrace(tracer)
    try:
        exec(compile(src, "<user>", "exec"), {"__name__": "__main__"})
    except SystemExit:
        pass
    except BaseException:
        traceback.print_exc(file=err_buf)
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = old_out, old_err

    return json.dumps({
        "events": events,
        "stdout": out_buf.getvalue(),
        "stderr": err_buf.getvalue(),
        "overflowed": overflowed[0],
    })
`);
    statusEl.classList.remove("loading");
    statusEl.classList.add("ready");
    statusEl.innerHTML = '<span class="dot"></span> <span class="status-text">Runtimes ready</span>';
    document.querySelectorAll(".btn.run").forEach(b => b.disabled = false);
    refreshTraceButtons();
  } catch (e) {
    statusEl.classList.remove("loading");
    statusEl.classList.add("error");
    statusEl.innerHTML = '<span class="dot"></span> <span class="status-text">Python failed to load</span>';
    console.error(e);
  }
}

// ---------- Sidebar / topbar ----------
const sidebarEl = document.querySelector(".sidebar");
const backdropEl = document.getElementById("sidebar-backdrop");
const hamburgerEl = document.getElementById("hamburger");

function closeSidebar() {
  if (!sidebarEl) return;
  sidebarEl.classList.remove("open");
  if (backdropEl) backdropEl.classList.remove("show");
  if (hamburgerEl) {
    hamburgerEl.classList.remove("open");
    hamburgerEl.setAttribute("aria-expanded", "false");
  }
}
function toggleSidebar() {
  if (!sidebarEl) return;
  const isOpen = sidebarEl.classList.toggle("open");
  if (backdropEl) backdropEl.classList.toggle("show", isOpen);
  if (hamburgerEl) {
    hamburgerEl.classList.toggle("open", isOpen);
    hamburgerEl.setAttribute("aria-expanded", String(isOpen));
  }
}
if (hamburgerEl) hamburgerEl.addEventListener("click", toggleSidebar);
if (backdropEl)  backdropEl.addEventListener("click", closeSidebar);

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    const panel = document.getElementById("tab-" + tab.dataset.tab);
    if (panel) panel.classList.add("active");
    const crumb = document.getElementById("topbar-crumb");
    if (crumb && panel) crumb.textContent = panel.dataset.title || tab.textContent.trim();
    closeSidebar();
    Object.values(editors).forEach(ed => ed && ed.refresh());
  });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sidebarEl && sidebarEl.classList.contains("open")) {
    closeSidebar();
  }
});

// ---------- CodeMirror editors ----------
const editors = {};

function makeEditor(textareaId, mode = "python", readOnly = false) {
  const ta = document.getElementById(textareaId);
  if (!ta) return null;
  return CodeMirror.fromTextArea(ta, {
    mode,
    theme: "dracula",
    lineNumbers: true,
    indentUnit: 4,
    tabSize: 4,
    autoCloseBrackets: true,
    matchBrackets: true,
    readOnly,
    viewportMargin: Infinity
  });
}

// Single-language tabs (their language can switch between Python/Java/C/C++/JS)
const LAB_TABS = ["duck", "poly", "inherit", "encap", "cb", "closure", "recursion", "gen"];
LAB_TABS.forEach(tab => {
  editors[tab] = makeEditor(tab + "-code");
});

// Two compare tabs keep their dedicated read-only side
editors.typingPy   = makeEditor("typing-py-code");
editors.typingJava = makeEditor("typing-java-code", "text/x-java", "nocursor");
editors.strengthPy = makeEditor("strength-py-code");
editors.strengthJs = makeEditor("strength-js-code", "javascript", "nocursor");

// ---------- Language picker ----------
const LANGS = [
  { id: "python", label: "Python",     flag: "🐍", mode: "python" },
  { id: "ruby",   label: "Ruby",       flag: "💎", mode: "ruby" },
  { id: "c",      label: "C",          flag: "🔧", mode: "text/x-csrc" },
  { id: "cpp",    label: "C++",        flag: "⚙️", mode: "text/x-c++src" },
  { id: "js",     label: "JavaScript", flag: "📜", mode: "javascript" },
];

// Per-tab state: currently active language and example index
const tabState = {};
LAB_TABS.forEach(tab => { tabState[tab] = { lang: "python", idx: 0 }; });

// Build the language buttons inside every .lang-picker container
document.querySelectorAll(".lang-picker").forEach(container => {
  const tab = container.dataset.langTab;
  LANGS.forEach(L => {
    const btn = document.createElement("button");
    btn.className = "lang-btn" + (L.id === "python" ? " active" : "");
    btn.dataset.lang = L.id;
    btn.innerHTML = `<span class="lang-flag">${L.flag}</span>${L.label}`;
    btn.addEventListener("click", () => setTabLang(tab, L.id));
    container.appendChild(btn);
  });
});

function setTabLang(tab, lang) {
  tabState[tab].lang = lang;
  tabState[tab].idx = 0;
  // toggle button highlight
  const picker = document.querySelector(`.lang-picker[data-lang-tab="${tab}"]`);
  if (picker) {
    picker.querySelectorAll(".lang-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.lang === lang));
  }
  // adjust CodeMirror mode
  const cm = editors[tab];
  const langMeta = LANGS.find(L => L.id === lang);
  if (cm && langMeta) {
    cm.setOption("mode", langMeta.mode);
    cm.setOption("readOnly", lang === "python" ? false : "nocursor");
  }
  // repopulate dropdown for the new language
  const examples = exampleListFor(tab, lang);
  const sel = document.getElementById(tab + "-examples");
  if (sel) {
    sel.innerHTML = "";
    examples.forEach((ex, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = ex.title;
      sel.appendChild(opt);
    });
  }
  loadExample(tab, 0);
  refreshTraceButtons();
}

function exampleListFor(tab, lang) {
  if (lang === "python") return EXAMPLES[tab] || [];
  return (window.LANG_EXAMPLES?.[tab]?.[lang]) || [];
}

function currentExample(tab) {
  const { lang, idx } = tabState[tab];
  const list = exampleListFor(tab, lang);
  return list[idx] || null;
}

function loadExample(tab, idx) {
  tabState[tab].idx = idx;
  const ex = currentExample(tab);
  if (!ex) {
    editors[tab].setValue(`# No examples available yet for this language.\n# Switch to Python or another language tab.`);
    setOutput(tab, "");
    updateLearn(tab, null);
    return;
  }
  editors[tab].setValue(ex.code);
  setOutput(tab, "");
  updateLearn(tab, ex);
}

function refreshTraceButtons() {
  // Run is enabled immediately for non-Python (simulated output) but waits
  // for Pyodide when running Python. Trace is always available — Python
  // produces a real trace, other languages get a simulated one.
  const ready = !!pyodide;
  document.querySelectorAll(".btn.trace").forEach(btn => {
    const tab = btn.dataset.trace;
    const isPython = !LAB_TABS.includes(tab) || tabState[tab]?.lang === "python";
    btn.disabled = isPython && !ready;
    btn.title = isPython
      ? "See how each line of output was produced"
      : "Show a simulated step-by-step trace for this example";
  });
  document.querySelectorAll(".btn.run").forEach(btn => {
    const tab = btn.dataset.run;
    const lang = LAB_TABS.includes(tab) ? (tabState[tab]?.lang || "python") : "python";
    btn.disabled = lang === "python" && !ready;
  });
}

// Initial dropdown population for Python (default)
LAB_TABS.forEach(tab => {
  const list = exampleListFor(tab, "python");
  const sel = document.getElementById(tab + "-examples");
  if (sel && list.length) {
    sel.innerHTML = "";
    list.forEach((ex, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = ex.title;
      sel.appendChild(opt);
    });
  }
  if (sel) sel.addEventListener("change", e => loadExample(tab, +e.target.value));
  loadExample(tab, 0);
});

// Compare tabs (Static vs Dynamic / Strong vs Weak) keep their own loaders
function populateSelect(selectId, examples) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = "";
  examples.forEach((ex, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = ex.title;
    sel.appendChild(opt);
  });
}
populateSelect("typing-examples",   EXAMPLES.typing);
populateSelect("strength-examples", EXAMPLES.strength);

function loadTypingExample(idx) {
  const ex = EXAMPLES.typing[idx];
  editors.typingPy.setValue(ex.python);
  editors.typingJava.setValue(ex.java);
  setOutput("typing", "");
  setStaticReport(ex.staticReport);
}
function loadStrengthExample(idx) {
  const ex = EXAMPLES.strength[idx];
  editors.strengthPy.setValue(ex.python);
  editors.strengthJs.setValue(ex.js);
  setOutput("strength", "");
  setStrengthReport(ex.report);
}
document.getElementById("typing-examples")  .addEventListener("change", e => loadTypingExample(+e.target.value));
document.getElementById("strength-examples").addEventListener("change", e => loadStrengthExample(+e.target.value));
loadTypingExample(0);
loadStrengthExample(0);

// ---------- Reset ----------
document.querySelectorAll('[data-action="reset"]').forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    if (LAB_TABS.includes(target)) {
      const sel = document.getElementById(target + "-examples");
      const idx = sel ? +sel.value : 0;
      loadExample(target, idx);
    }
  });
});

// ---------- Output / learn / reports ----------
function setOutput(tabName, content) {
  const el = document.getElementById(tabName + "-output");
  if (el) el.innerHTML = content;
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
document.querySelectorAll("[data-clear]").forEach(btn => {
  btn.addEventListener("click", () => setOutput(btn.dataset.clear, ""));
});

function updateLearn(tab, ex) {
  const el = document.getElementById(tab + "-learn");
  if (!el) return;
  if (!ex) { el.innerHTML = ""; return; }
  const blurb = ex.blurb ? `<span class="learn-blurb">${escapeHtml(ex.blurb)}</span>` : "";
  const body  = ex.explain || `<p>${escapeHtml(ex.blurb || "")}</p>`;
  el.innerHTML = blurb + body;
}

function setStaticReport(text) {
  const el = document.getElementById("typing-static-output");
  const isOk = /^✓/.test(text.trim());
  const cls = isOk ? "ok" : "stderr";
  el.innerHTML = `<span class="${cls}">${escapeHtml(text)}</span>`;
  const badge = document.getElementById("typing-static-badge");
  if (badge) {
    badge.textContent = isOk ? "compiles ✓" : "compile errors";
    badge.style.background  = isOk ? "rgba(74, 222, 128, 0.15)" : "rgba(255, 107, 107, 0.15)";
    badge.style.color       = isOk ? "#86efac" : "#ffb4b4";
    badge.style.borderColor = isOk ? "rgba(74, 222, 128, 0.4)"  : "rgba(255, 107, 107, 0.4)";
  }
}
function setStrengthReport(text) {
  const el = document.getElementById("strength-js-output");
  if (el) el.innerHTML = `<span class="meta">${escapeHtml(text)}</span>`;
}

// ---------- Run / Trace ----------
async function runPython(source, tabName) {
  await pyodideReady;
  if (!pyodide) {
    setOutput(tabName, '<span class="stderr">Python runtime is not available.</span>');
    return;
  }
  setOutput(tabName, '<span class="meta">running…</span>');
  const t0 = performance.now();
  try {
    pyodide.globals.set("__user_src", source);
    const tup = pyodide.runPython("_run_user_code(__user_src)");
    const [stdout, stderr] = tup.toJs();
    tup.destroy();
    const ms = (performance.now() - t0).toFixed(1);
    let html = "";
    if (stdout) html += `<span class="stdout">${escapeHtml(stdout)}</span>`;
    if (stderr) html += `<span class="stderr">${escapeHtml(stderr)}</span>`;
    if (!stdout && !stderr) html += `<span class="meta">(no output)</span>`;
    html += `\n<span class="meta">— finished in ${ms} ms</span>`;
    setOutput(tabName, html);
  } catch (e) {
    setOutput(tabName, `<span class="stderr">Runtime error: ${escapeHtml(e.message)}</span>`);
  }
}

function showSimulatedOutput(tab, lang, ex) {
  const langMeta = LANGS.find(L => L.id === lang);
  const langName = langMeta ? `${langMeta.flag} ${langMeta.label}` : lang;
  const out = ex && ex.output ? ex.output : "(no expected output for this example)";
  const html =
    `<div class="sim-banner"><b>Simulated output (${langName})</b> — no live engine ran this; the output below is hand-written.</div>` +
    `<span class="stdout">${escapeHtml(out)}</span>`;
  setOutput(tab, html);
}

// ---------- Live runners for non-Python languages -----------------------

// JavaScript: uses the browser's own engine.
function runJavaScriptLive(tab, source) {
  setOutput(tab, '<span class="meta">running JavaScript…</span>');
  const t0 = performance.now();
  let out = "";
  let err = "";
  const capture = (...args) => {
    out += args.map(a => {
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch { return String(a); }
    }).join(" ") + "\n";
  };
  const sandboxConsole = { log: capture, info: capture, warn: capture, error: capture, debug: capture };
  try {
    // Wrap the user code so console references our capture.
    // eslint-disable-next-line no-new-func
    const fn = new Function("console", source);
    fn(sandboxConsole);
  } catch (e) {
    err = (e && e.stack) ? String(e.stack) : String(e);
  }
  const ms = (performance.now() - t0).toFixed(1);
  let html =
    `<div class="live-banner"><b>Live execution</b> — your browser's JavaScript engine.</div>`;
  if (out) html += `<span class="stdout">${escapeHtml(out)}</span>`;
  if (err) html += `<span class="stderr">${escapeHtml(err)}</span>`;
  if (!out && !err) html += `<span class="meta">(no output)</span>`;
  html += `\n<span class="meta">— finished in ${ms} ms</span>`;
  setOutput(tab, html);
}

// JSCPP: in-browser C/C++ interpreter, lazy-loaded.
let _jscppPromise = null;
function loadJSCPP() {
  if (_jscppPromise) return _jscppPromise;
  _jscppPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jscpp@2.1.1/dist/JSCPP.es5.min.js";
    s.onload = () => resolve(window.JSCPP);
    s.onerror = () => reject(new Error("Failed to load JSCPP"));
    document.head.appendChild(s);
  });
  return _jscppPromise;
}

// Ruby (ruby.wasm): a real CRuby compiled to WebAssembly. ~10 MB on first load.
let _rubyVMPromise = null;
function loadRubyVM() {
  if (_rubyVMPromise) return _rubyVMPromise;
  _rubyVMPromise = (async () => {
    // ESM import from jsDelivr; works in modern browsers.
    const mod = await import("https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.6.2/dist/browser.esm.js");
    const { DefaultRubyVM } = mod;
    const wasmRes = await fetch(
      "https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm"
    );
    if (!wasmRes.ok) throw new Error("ruby.wasm download failed (" + wasmRes.status + ")");
    const wasm = await WebAssembly.compileStreaming(wasmRes);
    const { vm } = await DefaultRubyVM(wasm);
    return vm;
  })();
  return _rubyVMPromise;
}

async function runRubyLive(tab, source, lang, ex) {
  setOutput(tab, '<span class="meta">loading Ruby (~10 MB on first run)…</span>');
  let vm;
  try {
    vm = await loadRubyVM();
  } catch (e) {
    return showSimulatedOutput(tab, lang, ex);
  }
  setOutput(tab, '<span class="meta">running Ruby…</span>');
  const t0 = performance.now();
  let out = "";
  let err = "";
  try {
    // Redirect $stdout / $stderr inside Ruby to capture output, run the user's
    // code, then read the captured strings back across the JS boundary.
    const wrapped =
`require 'stringio'
$pyrism_out = StringIO.new
$pyrism_err = StringIO.new
$stdout = $pyrism_out
$stderr = $pyrism_err
begin
${source}
rescue => __pyrism_e
  $stderr.puts "#{__pyrism_e.class}: #{__pyrism_e.message}"
  __pyrism_e.backtrace.first(6).each { |l| $stderr.puts "  #{l}" }
end
$stdout = STDOUT
$stderr = STDERR
[$pyrism_out.string, $pyrism_err.string]
`;
    const result = vm.eval(wrapped);
    // result is a Ruby array of two strings; pull them out.
    out = result.call("[]", vm.eval("0")).toString();
    err = result.call("[]", vm.eval("1")).toString();
  } catch (e) {
    err = (e && e.message) ? e.message : String(e);
  }
  const ms = (performance.now() - t0).toFixed(1);
  let html = `<div class="live-banner"><b>Live execution</b> — Ruby 3.3 via ruby.wasm.</div>`;
  if (out) html += `<span class="stdout">${escapeHtml(out)}</span>`;
  if (err) html += `<span class="stderr">${escapeHtml(err)}</span>`;
  if (!out && !err) html += `<span class="meta">(no output)</span>`;
  html += `\n<span class="meta">— finished in ${ms} ms</span>`;
  setOutput(tab, html);
}

async function runCppLive(tab, source, lang, ex) {
  setOutput(tab, '<span class="meta">loading C/C++ interpreter…</span>');
  let JSCPP;
  try {
    JSCPP = await loadJSCPP();
  } catch (e) {
    return showSimulatedOutput(tab, lang, ex);
  }
  setOutput(tab, '<span class="meta">running…</span>');
  const t0 = performance.now();
  let out = "";
  let err = "";
  const config = {
    stdio: { write: (s) => { out += s; } },
    unsigned_overflow: "warn",
    maxTimeout: 5000,
  };
  try {
    JSCPP.run(source, "", config);
  } catch (e) {
    err = (e && e.message) ? e.message : String(e);
  }
  const ms = (performance.now() - t0).toFixed(1);

  // If JSCPP couldn't handle this example, fall back to the simulated output
  // so the learner still sees something useful.
  if (err && !out) {
    setOutput(tab,
      `<div class="sim-banner"><b>Live run failed</b> — JSCPP doesn't support every feature ` +
      `(${escapeHtml(err)}). Falling back to the simulated output below.</div>` +
      `<span class="stdout">${escapeHtml(ex?.output || "")}</span>`);
    return;
  }

  const langMeta = LANGS.find(L => L.id === lang);
  const langName = langMeta ? `${langMeta.flag} ${langMeta.label}` : lang;
  let html = `<div class="live-banner"><b>Live execution</b> — ${langName} via JSCPP (subset).</div>`;
  if (out) html += `<span class="stdout">${escapeHtml(out)}</span>`;
  if (err) html += `<span class="stderr">${escapeHtml(err)}</span>`;
  if (!out && !err) html += `<span class="meta">(no output)</span>`;
  html += `\n<span class="meta">— finished in ${ms} ms</span>`;
  setOutput(tab, html);
}

function runSimulatedTrace(tab, lang, ex) {
  const langMeta = LANGS.find(L => L.id === lang);
  const langName = langMeta ? `${langMeta.flag} ${langMeta.label}` : lang;

  // Build event list. Prefer a hand-written ex.trace; otherwise derive from output.
  let events = [];
  if (Array.isArray(ex?.trace) && ex.trace.length) {
    events = ex.trace.map(e => ({
      kind: e.kind || "print",
      depth: e.depth || 0,
      name: e.name || "",
      args: e.args || {},
      value: e.value || "",
      line: e.line || 0,
      text: e.text || "",
      message: e.message || "",
    }));
  } else if (ex && typeof ex.output === "string") {
    const lines = ex.output.split(/\r?\n/);
    events = lines.map(line => ({ kind: "print", depth: 0, text: line }));
  }

  const PAD = "  ";
  const rows = events.map(ev => {
    const indent = PAD.repeat(Math.max(0, ev.depth));
    if (ev.kind === "call") {
      const args = Object.entries(ev.args || {}).map(([k, v]) => `${k}=${v}`).join(", ");
      return `<div class="trace-row trace-call"><span class="trace-marker">▶</span><span class="trace-indent">${indent}</span><span class="trace-text">call <b>${escapeHtml(ev.name)}</b>(${escapeHtml(args)})${ev.line ? ` <span class="trace-loc">@ line ${ev.line}</span>` : ""}</span></div>`;
    }
    if (ev.kind === "return") {
      return `<div class="trace-row trace-return"><span class="trace-marker">◀</span><span class="trace-indent">${indent}</span><span class="trace-text">return from <b>${escapeHtml(ev.name)}</b> → ${escapeHtml(ev.value)}</span></div>`;
    }
    if (ev.kind === "print") {
      return `<div class="trace-row trace-print"><span class="trace-marker">▷</span><span class="trace-indent">${indent}</span><span class="trace-text">prints <code>${escapeHtml(ev.text)}</code></span></div>`;
    }
    if (ev.kind === "error") {
      return `<div class="trace-row trace-error"><span class="trace-marker">✗</span><span class="trace-indent">${indent}</span><span class="trace-text">in <b>${escapeHtml(ev.name)}</b>: ${escapeHtml(ev.message)}</span></div>`;
    }
    if (ev.kind === "note") {
      return `<div class="trace-row meta"><span class="trace-marker">·</span><span class="trace-indent">${indent}</span><span class="trace-text">${escapeHtml(ev.text)}</span></div>`;
    }
    return "";
  }).join("");

  const banner = `<div class="sim-banner"><b>Simulated trace</b> — ${langName} doesn't run live in the browser; this trace is reconstructed from the example's expected output.</div>`;
  const header = `<div class="trace-header">Step-by-step simulation <span class="trace-meta">— ${events.length} event(s)</span></div>`;
  const body = `<div class="trace">${rows || '<div class="trace-row meta">(no events to show)</div>'}</div>`;
  setOutput(tab, banner + header + body);
}

// Simulated banner styles via inline so we don't need extra CSS
const _simStyle = document.createElement("style");
_simStyle.textContent = `
.sim-banner {
  font-size: 11.5px;
  color: var(--fg-3);
  background: rgba(63,169,255,0.07);
  border: 1px solid rgba(63,169,255,0.25);
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 10px;
  line-height: 1.5;
}
.sim-banner b { color: var(--accent-3); font-weight: 600; }

.live-banner {
  font-size: 11.5px;
  color: var(--fg-3);
  background: rgba(74,222,128,0.07);
  border: 1px solid rgba(74,222,128,0.30);
  border-radius: 6px;
  padding: 6px 10px;
  margin-bottom: 10px;
  line-height: 1.5;
}
.live-banner b { color: var(--ok); font-weight: 600; }`;
document.head.appendChild(_simStyle);

function renderTrace(payload, ms) {
  const { events, stdout, stderr, overflowed } = payload;
  const PAD = "  ";
  const rows = events.map(ev => {
    const indent = PAD.repeat(Math.max(0, ev.depth));
    if (ev.kind === "call") {
      const args = Object.entries(ev.args || {})
        .map(([k, v]) => `${k}=${v}`).join(", ");
      return `<div class="trace-row trace-call"><span class="trace-marker">▶</span><span class="trace-indent">${indent}</span><span class="trace-text">call <b>${escapeHtml(ev.name)}</b>(${escapeHtml(args)}) <span class="trace-loc">@ line ${ev.line}</span></span></div>`;
    }
    if (ev.kind === "return") {
      return `<div class="trace-row trace-return"><span class="trace-marker">◀</span><span class="trace-indent">${indent}</span><span class="trace-text">return from <b>${escapeHtml(ev.name)}</b> → ${escapeHtml(ev.value)}</span></div>`;
    }
    if (ev.kind === "print") {
      return `<div class="trace-row trace-print"><span class="trace-marker">▷</span><span class="trace-indent">${indent}</span><span class="trace-text">prints <code>${escapeHtml(ev.text)}</code></span></div>`;
    }
    if (ev.kind === "error") {
      return `<div class="trace-row trace-error"><span class="trace-marker">✗</span><span class="trace-indent">${indent}</span><span class="trace-text">in <b>${escapeHtml(ev.name)}</b>: ${escapeHtml(ev.message)}</span></div>`;
    }
    return "";
  }).join("");

  let header = `<div class="trace-header">Step-by-step simulation <span class="trace-meta">— ${events.length} event(s), ${ms} ms</span></div>`;
  if (overflowed) header += `<div class="trace-warn">⚠ trace truncated to keep the UI snappy</div>`;
  let body = `<div class="trace">${rows || '<div class="trace-row meta">(no events captured)</div>'}</div>`;
  if (stdout) body += `<div class="trace-section-title">Plain stdout</div><pre class="trace-stdout"><span class="stdout">${escapeHtml(stdout)}</span></pre>`;
  if (stderr) body += `<div class="trace-section-title">Errors</div><pre class="trace-stdout"><span class="stderr">${escapeHtml(stderr)}</span></pre>`;
  return header + body;
}

async function runPythonTraced(source, tabName) {
  await pyodideReady;
  if (!pyodide) {
    setOutput(tabName, '<span class="stderr">Python runtime is not available.</span>');
    return;
  }
  setOutput(tabName, '<span class="meta">tracing…</span>');
  const t0 = performance.now();
  try {
    pyodide.globals.set("__user_src", source);
    const jsonStr = pyodide.runPython("_run_traced(__user_src)");
    const payload = JSON.parse(jsonStr);
    const ms = (performance.now() - t0).toFixed(1);
    setOutput(tabName, renderTrace(payload, ms));
  } catch (e) {
    setOutput(tabName, `<span class="stderr">Trace error: ${escapeHtml(e.message)}</span>`);
  }
}

// Map tab -> editor (for compare tabs the Python side is what runs)
const TAB_TO_EDITOR = {
  duck:       () => editors.duck,
  poly:       () => editors.poly,
  typing:     () => editors.typingPy,
  strength:   () => editors.strengthPy,
  inherit:    () => editors.inherit,
  encap:      () => editors.encap,
  cb:         () => editors.cb,
  closure:    () => editors.closure,
  recursion:  () => editors.recursion,
  gen:        () => editors.gen,
};
function getSourceFor(tab) {
  const ed = TAB_TO_EDITOR[tab] && TAB_TO_EDITOR[tab]();
  return ed ? ed.getValue() : "";
}

// Run buttons — Python via Pyodide; JS via browser; C/C++ via JSCPP; Ruby via ruby.wasm
document.querySelectorAll(".btn.run").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.run;
    const lang = LAB_TABS.includes(tab) ? tabState[tab].lang : "python";
    const source = getSourceFor(tab);
    const ex = LAB_TABS.includes(tab) ? currentExample(tab) : null;
    if (lang === "python") {
      runPython(source, tab);
    } else if (lang === "js") {
      runJavaScriptLive(tab, source);
    } else if (lang === "c" || lang === "cpp") {
      runCppLive(tab, source, lang, ex);
    } else if (lang === "ruby") {
      runRubyLive(tab, source, lang, ex);
    } else {
      showSimulatedOutput(tab, lang, ex);
    }
  });
});

// Trace buttons — Python uses sys.settrace; other languages get a simulated trace
document.querySelectorAll(".btn.trace").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.trace;
    const lang = LAB_TABS.includes(tab) ? tabState[tab].lang : "python";
    if (lang === "python") {
      runPythonTraced(getSourceFor(tab), tab);
    } else {
      runSimulatedTrace(tab, lang, currentExample(tab));
    }
  });
});

// Keyboard shortcut
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    const activeTab = document.querySelector(".tab.active")?.dataset.tab;
    if (!activeTab) return;
    const selector = e.shiftKey
      ? `.btn.trace[data-trace="${activeTab}"]`
      : `.btn.run[data-run="${activeTab}"]`;
    const btn = document.querySelector(selector);
    if (btn && !btn.disabled) btn.click();
  }
});

// Disable run/trace until Pyodide is up; trace also depends on language
document.querySelectorAll(".btn.run").forEach(b => b.disabled = true);
document.querySelectorAll(".btn.trace").forEach(b => b.disabled = true);
refreshTraceButtons();   // sets correct enabled-state for non-Python tabs at boot

pyodideReady = bootPyodide();
