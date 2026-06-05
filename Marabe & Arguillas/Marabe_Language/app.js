/* ------------------------------------------------------------------
   PL Concepts Lab — main app logic
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
    // Define a helper that captures stdout/stderr per run.
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
    """Run user code with sys.settrace and return a JSON list of events
    plus captured stdout/stderr. Each event is one of:
      {kind:'call',   depth, name, line, args}
      {kind:'return', depth, name, value}
      {kind:'print',  depth, text}
      {kind:'error',  depth, name, message}
    Only frames from <user> are tracked, so library code stays out of the way.
    """
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
                # Split into lines so multi-line prints render cleanly.
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
            return None  # don't follow into library code
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
    statusEl.innerHTML = '<span class="dot"></span> <span class="status-text">Python ready</span>';
    document.querySelectorAll(".btn.run, .btn.trace").forEach(b => b.disabled = false);
  } catch (e) {
    statusEl.classList.remove("loading");
    statusEl.classList.add("error");
    statusEl.innerHTML = '<span class="dot"></span> <span class="status-text">Python failed to load</span>';
    console.error(e);
  }
}

// Disable run buttons until ready
document.querySelectorAll(".btn.run, .btn.trace").forEach(b => b.disabled = true);
pyodideReady = bootPyodide();

// ---------- Tabs ----------
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
    // Close the mobile drawer once a tab has been selected
    closeSidebar();
    // Refresh CodeMirror layout in case the panel was hidden when first rendered
    Object.values(editors).forEach(ed => ed && ed.refresh());
  });
});

// Close drawer with Escape
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

editors.duck       = makeEditor("duck-code");
editors.poly       = makeEditor("poly-code");
editors.typingPy   = makeEditor("typing-py-code");
editors.typingJava = makeEditor("typing-java-code", "text/x-java", "nocursor");
editors.strengthPy = makeEditor("strength-py-code");
editors.strengthJs = makeEditor("strength-js-code", "javascript", "nocursor");

// ---------- Example pickers ----------
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

populateSelect("duck-examples",     EXAMPLES.duck);
populateSelect("poly-examples",     EXAMPLES.poly);
populateSelect("typing-examples",   EXAMPLES.typing);
populateSelect("strength-examples", EXAMPLES.strength);

function loadSimpleExample(tabKey, editor, examples, idx) {
  editor.setValue(examples[idx].code);
  setOutput(tabKey, "");
}

function loadDuckExample(idx)    { loadSimpleExample("duck",    editors.duck,    EXAMPLES.duck,    idx); }
function loadPolyExample(idx)    { loadSimpleExample("poly",    editors.poly,    EXAMPLES.poly,    idx); }

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

document.getElementById("duck-examples")    .addEventListener("change", e => loadDuckExample(+e.target.value));
document.getElementById("poly-examples")    .addEventListener("change", e => loadPolyExample(+e.target.value));
document.getElementById("typing-examples")  .addEventListener("change", e => loadTypingExample(+e.target.value));
document.getElementById("strength-examples").addEventListener("change", e => loadStrengthExample(+e.target.value));

// Initial load
loadDuckExample(0);
loadPolyExample(0);
loadTypingExample(0);
loadStrengthExample(0);

// ---------- Reset buttons ----------
document.querySelectorAll('[data-action="reset"]').forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.target;
    const sel = document.getElementById(target + "-examples");
    const idx = sel ? +sel.value : 0;
    if (target === "duck") loadDuckExample(idx);
    if (target === "poly") loadPolyExample(idx);
  });
});

// ---------- Output helpers ----------
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

// ---------- Run Python ----------
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

// ---------- Trace Python (simulation: how each output was produced) ----------
function renderTrace(payload, ms) {
  const { events, stdout, stderr, overflowed } = payload;
  const PAD = "  ";

  const rows = events.map(ev => {
    const indent = PAD.repeat(Math.max(0, ev.depth));
    if (ev.kind === "call") {
      const args = Object.entries(ev.args || {})
        .map(([k, v]) => `${k}=${v}`).join(", ");
      return `<div class="trace-row trace-call">` +
             `<span class="trace-marker">▶</span>` +
             `<span class="trace-indent">${indent}</span>` +
             `<span class="trace-text">call <b>${escapeHtml(ev.name)}</b>(${escapeHtml(args)})` +
             ` <span class="trace-loc">@ line ${ev.line}</span></span>` +
             `</div>`;
    }
    if (ev.kind === "return") {
      return `<div class="trace-row trace-return">` +
             `<span class="trace-marker">◀</span>` +
             `<span class="trace-indent">${indent}</span>` +
             `<span class="trace-text">return from <b>${escapeHtml(ev.name)}</b>` +
             ` → ${escapeHtml(ev.value)}</span>` +
             `</div>`;
    }
    if (ev.kind === "print") {
      return `<div class="trace-row trace-print">` +
             `<span class="trace-marker">▷</span>` +
             `<span class="trace-indent">${indent}</span>` +
             `<span class="trace-text">prints <code>${escapeHtml(ev.text)}</code></span>` +
             `</div>`;
    }
    if (ev.kind === "error") {
      return `<div class="trace-row trace-error">` +
             `<span class="trace-marker">✗</span>` +
             `<span class="trace-indent">${indent}</span>` +
             `<span class="trace-text">in <b>${escapeHtml(ev.name)}</b>: ` +
             `${escapeHtml(ev.message)}</span>` +
             `</div>`;
    }
    return "";
  }).join("");

  let header = `<div class="trace-header">Step-by-step simulation ` +
               `<span class="trace-meta">— ${events.length} event(s), ${ms} ms</span></div>`;
  if (overflowed) {
    header += `<div class="trace-warn">⚠ trace truncated to keep the UI snappy</div>`;
  }
  let body = `<div class="trace">${rows || '<div class="trace-row meta">(no events captured)</div>'}</div>`;

  if (stdout) {
    body += `<div class="trace-section-title">Plain stdout</div>` +
            `<pre class="trace-stdout"><span class="stdout">${escapeHtml(stdout)}</span></pre>`;
  }
  if (stderr) {
    body += `<div class="trace-section-title">Errors</div>` +
            `<pre class="trace-stdout"><span class="stderr">${escapeHtml(stderr)}</span></pre>`;
  }
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

// Map a tab key to the editor whose content should be executed.
const TAB_TO_EDITOR = {
  duck:     () => editors.duck,
  poly:     () => editors.poly,
  typing:   () => editors.typingPy,
  strength: () => editors.strengthPy,
};

function getSourceFor(tab) {
  const ed = TAB_TO_EDITOR[tab] && TAB_TO_EDITOR[tab]();
  return ed ? ed.getValue() : "";
}

// Wire up run buttons
document.querySelectorAll(".btn.run").forEach(btn => {
  btn.addEventListener("click", () => runPython(getSourceFor(btn.dataset.run), btn.dataset.run));
});

// Wire up trace buttons
document.querySelectorAll(".btn.trace").forEach(btn => {
  btn.addEventListener("click", () => runPythonTraced(getSourceFor(btn.dataset.trace), btn.dataset.trace));
});

// Keyboard shortcut: Ctrl/Cmd+Enter to run, Shift+Ctrl/Cmd+Enter to trace
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
