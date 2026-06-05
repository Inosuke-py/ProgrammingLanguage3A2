class HeapBlock {
    constructor(id, size) {
        this.id = id;
        this.size = size;
        this.refCount = 0;
        this.marked = false;
        this.freed = false;
    }
}

class MemoryManager {
    constructor() {
        this.blocks = new Map();
        this.pointers = new Map(); // name -> blockId or null
        this.nextId = 1;
        this.autoGc = false;
        this.logEl = document.getElementById('log');
    }

    malloc(size) {
        const id = this.nextId++;
        const b = new HeapBlock(id, size);
        this.blocks.set(id, b);
        this.log(`malloc -> block #${id} (${size} bytes)`);
        this._maybeAutoGc();
        return id;
    }

    free(id) {
        const b = this.blocks.get(Number(id));
        if (!b) { this.log(`free(): invalid id ${id}`); return; }
        if (b.freed) { this.log(`free(): block #${id} already freed`); return; }
        b.freed = true;
        // leave pointers dangling; refCount doesn't change automatically
        this.log(`free() -> block #${id} (dangling pointers may exist)`);
    }

    createPointer(name) {
        if (this.pointers.has(name)) return false;
        this.pointers.set(name, null);
        this.log(`created pointer '${name}'`);
        return true;
    }

    assignPointer(name, blockId) {
        if (!this.pointers.has(name)) { this.log(`unknown pointer ${name}`); return; }
        const prev = this.pointers.get(name);
        if (prev) { // decrement old
            const old = this.blocks.get(prev);
            if (old) old.refCount = Math.max(0, old.refCount - 1);
        }
        if (blockId == null) { this.pointers.set(name, null); this.log(`${name} = NULL`); return; }
        const b = this.blocks.get(Number(blockId));
        if (!b) { this.log(`assign: no block ${blockId}`); return; }
        b.refCount++;
        this.pointers.set(name, b.id);
        this.log(`${name} -> block #${b.id} (refCount=${b.refCount})`);
        this._maybeAutoGc();
    }

    runRefCountGc() {
        // immediate reclaim: free blocks with refCount==0 and not already freed
        const toFree = [];
        for (const [id, b] of this.blocks) {
            if (!b.freed && b.refCount === 0) { toFree.push(id); }
        }
        if (toFree.length === 0) {
            this.log('RefCount GC: nothing to reclaim');
            return;
        }
        toFree.forEach(id => {
            const b = this.blocks.get(id);
            b.freed = true;
            this.log(`RefCount GC: reclaimed block #${id}`);
        });
    }

    runMarkAndSweep() {
        // Mark phase
        for (const b of this.blocks.values()) b.marked = false;
        const stack = [];
        for (const [name, id] of this.pointers) { if (id != null) { const b = this.blocks.get(id); if (b) stack.push(b); } }
        while (stack.length) {
            const cur = stack.pop();
            if (!cur || cur.marked) continue;
            cur.marked = true;
            // In this simplified model, blocks do not reference others unless simulated via pointers.
        }
        // Sweep
        const reclaimed = [];
        for (const [id, b] of this.blocks) {
            if (!b.marked && !b.freed) { b.freed = true; reclaimed.push(id); this.log(`Mark-&-Sweep: reclaimed block #${id}`); }
        }
        if (reclaimed.length === 0) this.log('Mark-&-Sweep: nothing to reclaim');
    }

    log(msg) {
        const el = document.createElement('div');
        el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        this.logEl.prepend(el);
    }

    _maybeAutoGc() { if (this.autoGc) this.runRefCountGc(); }
}

// UI glue
document.addEventListener('DOMContentLoaded', () => {
    const MM = new MemoryManager();

    // sample code snippets per language
    const snippets = {
        C: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *p = malloc(sizeof(int)); // alloc
    *p = 42;
    // ...
    free(p); // dealloc
    return 0;
}
`,
        CPP: `#include <iostream>
#include <memory>

int main() {
    int *p = (int*)malloc(sizeof(int)); // alloc
    *p = 7;
    free(p); // dealloc
    std::shared_ptr<int> sp = std::make_shared<int>(5); // ref-counted
    return 0;
}
`,
        Java: `public class App {
    public static void main(String[] args) {
        Integer a = new Integer(5); // allocated on heap, GC managed
        a = null; // eligible for GC
        System.gc(); // hint to runtime
    }
}
`,
        Python: `# Python uses automatic GC and reference counting
class Node:
    def __init__(self, v):
        self.val = v

a = Node(1)
b = a
del a
# 'b' still references the Node
`,
        Rust: `fn main() {
    let x = Box::new(3); // ownership-based allocation
    // x goes out of scope and is deallocated automatically
}
`
    };

    // line-by-line simulation state
    let codeLines = [];
    let pc = 0; // program counter (line index)
    let playInterval = null;
    let currentLang = null;

    function escapeHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function renderCodeLines() {
        const codeEl = document.getElementById('codeViewer');
        codeEl.innerHTML = codeLines.map((ln, i) => {
            const cls = ['line'];
            if (i === pc) cls.push('current');
            return `<span class="${cls.join(' ')}" data-line="${i}">${escapeHtml(ln)}</span>`;
        }).join('\n');
    }

    function markExecutedLine(i, kind) {
        const codeEl = document.getElementById('codeViewer');
        const node = codeEl.querySelector(`[data-line=\"${i}\"]`);
        if (!node) return;
        node.classList.add('executed');
        if (kind === 'alloc') node.classList.add('alloc');
        if (kind === 'free') node.classList.add('free');
    }

    function simulateLine(line) {
        const raw = line.trim();
        if (!raw || raw.startsWith('//') || raw.startsWith('#')) return null;

        // Improved C/C++ detection
        // malloc: detect var = malloc(sizeof(TYPE)); or var = (TYPE*)malloc(...);
        let m = raw.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?[A-Za-z0-9_:<>\*\s]*\)?\s*malloc\s*\(\s*sizeof\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*\)/i);
        if (m) {
            const varName = m[1];
            // approximate sizes for common types
            const type = m[2];
            const sizes = { int: 4, char: 1, long: 8, short: 2 };
            const size = sizes[type] || 16;
            const id = MM.malloc(size);
            if (!MM.pointers.has(varName)) MM.createPointer(varName);
            MM.assignPointer(varName, id);
            return { kind: 'alloc' };
        }

        // malloc without sizeof
        m = raw.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?[A-Za-z0-9_:<>\*\s]*\)?\s*malloc\s*\(/i);
        if (m) {
            const varName = m[1];
            const id = MM.malloc(16);
            if (!MM.pointers.has(varName)) MM.createPointer(varName);
            MM.assignPointer(varName, id);
            return { kind: 'alloc' };
        }

        // detect new
        m = raw.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\b/);
        if (m) {
            const varName = m[1];
            const id = MM.malloc(16);
            if (!MM.pointers.has(varName)) MM.createPointer(varName);
            MM.assignPointer(varName, id);
            return { kind: 'alloc' };
        }

        // detect std::make_shared or shared_ptr initialization
        m = raw.match(/([A-Za-z_][A-Za-z0-9_:<>]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*std::make_shared\s*<?.*?>?\s*\(/);
        if (m) {
            const varName = m[2];
            const id = MM.malloc(16);
            if (!MM.pointers.has(varName)) MM.createPointer(varName);
            MM.assignPointer(varName, id);
            return { kind: 'alloc' };
        }

        // detect free(var);
        m = raw.match(/free\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/);
        if (m) {
            const varName = m[1];
            const bid = MM.pointers.get(varName);
            if (bid) { MM.free(bid); return { kind: 'free' }; }
            return null;
        }

        // detect delete var;
        m = raw.match(/delete\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) {
            const varName = m[1];
            const bid = MM.pointers.get(varName);
            if (bid) { MM.free(bid); return { kind: 'free' }; }
            return null;
        }

        // detect assignment between pointers: b = a;
        m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*;?$/);
        if (m) {
            const dst = m[1], src = m[2];
            if (!MM.pointers.has(src)) return null;
            if (!MM.pointers.has(dst)) MM.createPointer(dst);
            const srcId = MM.pointers.get(src);
            MM.assignPointer(dst, srcId ?? null);
            return null;
        }

        // detect nulling or deletion in high-level langs
        m = raw.match(/([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(NULL|null|nullptr|None)\s*;?/i);
        if (m) {
            const varName = m[1];
            if (!MM.pointers.has(varName)) return null;
            MM.assignPointer(varName, null);
            return null;
        }

        // Python del
        m = raw.match(/^del\s+([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) {
            const varName = m[1];
            if (!MM.pointers.has(varName)) return null;
            MM.assignPointer(varName, null);
            return null;
        }

        return null;
    }

    function loadCodeLines(code, lang) {
        currentLang = lang;
        codeLines = code.split('\n');
        pc = 0;
        // reset memory
        MM.blocks.clear(); MM.pointers.clear(); MM.nextId = 1;
        renderCodeLines();
        refreshUI();
    }

    // populate language select
    const langSelect = document.getElementById('langSelect');
    Object.keys(snippets).forEach(lang => {
        const opt = document.createElement('option'); opt.value = lang; opt.textContent = lang; langSelect.appendChild(opt);
    });

    // when language selected, show code and simulator controls and load into stepper
    langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        const codeEl = document.getElementById('codeViewer');
        if (!lang) {
            codeEl.textContent = '';
            document.getElementById('simControls').classList.add('hidden');
            return;
        }
        const code = snippets[lang] || '';
        loadCodeLines(code, lang);
        document.getElementById('simControls').classList.remove('hidden');
        MM.log(`Language selected: ${lang}`);
    });

    function $(id) { return document.getElementById(id); }

    function refreshUI() {
        // blocks
        const heap = $('heap'); heap.innerHTML = '';
        for (const [id, b] of MM.blocks) {
            const el = document.createElement('div'); el.className = 'block' + (b.freed ? ' freed' : '');
            el.innerHTML = `<div class="id">#${b.id}</div><div>size: ${b.size}</div><div>ref: ${b.refCount}</div>`;
            heap.appendChild(el);
        }

        // pointers
        const ptrList = $('pointersList'); ptrList.innerHTML = '';
        for (const [name, id] of MM.pointers) {
            const li = document.createElement('li'); li.className = 'pointer';
            const target = id ? `#${id}` : 'NULL';
            const dangling = (id && MM.blocks.get(id)?.freed) ? `<span class="dang">dangling</span>` : '';
            li.innerHTML = `<div>${name} → ${target} ${dangling}</div><div>${MM.blocks.get(id)?.refCount ?? ''}</div>`;
            ptrList.appendChild(li);
        }
    }

    // wire buttons (simplified)
    $('mallocBtn').addEventListener('click', () => {
        MM.malloc(16);
        refreshUI();
    });

    // free() will free the most recently allocated non-freed block
    $('freeBtn').addEventListener('click', () => {
        let last = null;
        for (const [id, b] of Array.from(MM.blocks).reverse()) {
            if (!b.freed) { last = id; break; }
        }
        if (last) { MM.free(last); refreshUI(); } else { MM.log('free(): nothing to free'); }
    });

    $('forceRcGc').addEventListener('click', () => { MM.runRefCountGc(); refreshUI(); });
    $('forceMsGc').addEventListener('click', () => { MM.runMarkAndSweep(); refreshUI(); });

    $('autoGcToggle').addEventListener('click', () => {
        MM.autoGc = !MM.autoGc; $('autoGcToggle').textContent = `Auto GC: ${MM.autoGc ? 'On' : 'Off'}`;
        MM.log(`Auto GC ${MM.autoGc ? 'enabled' : 'disabled'}`);
    });

    // Stepper controls
    function stepOnce() {
        if (pc >= codeLines.length) { MM.log('Program complete'); return; }
        const line = codeLines[pc];
        const res = simulateLine(line);
        if (res && res.kind) markExecutedLine(pc, res.kind);
        else markExecutedLine(pc, null);
        pc++;
        renderCodeLines();
        refreshUI();
        if (pc >= codeLines.length) { MM.log('Program complete'); if (playInterval) { clearInterval(playInterval); playInterval = null; $('playBtn').textContent = 'Play'; } }
    }

    $('stepBtn').addEventListener('click', () => { stepOnce(); });

    $('playBtn').addEventListener('click', () => {
        if (playInterval) { clearInterval(playInterval); playInterval = null; $('playBtn').textContent = 'Play'; return; }
        $('playBtn').textContent = 'Stop';
        playInterval = setInterval(() => { stepOnce(); if (pc >= codeLines.length) { clearInterval(playInterval); playInterval = null; $('playBtn').textContent = 'Play'; } }, 700);
    });

    $('resetBtn').addEventListener('click', () => {
        if (playInterval) { clearInterval(playInterval); playInterval = null; $('playBtn').textContent = 'Play'; }
        // reload current code
        const sel = langSelect.value; if (!sel) return;
        loadCodeLines(snippets[sel] || '', sel);
        MM.log('Program reset');
    });

    // initial UI: simulator controls hidden until a language is selected
    refreshUI();
});
