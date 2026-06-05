# Memory Management Simulator

Small web app that demonstrates allocation (`malloc`), `free`, pointer roots, reference-counting GC, and mark-and-sweep GC.

To run:

1. Open `index.html` in your browser (no server required).
2. Use the controls to `malloc()` blocks, create pointer variables, assign pointers, and `free()` blocks.
3. Press `Run Ref-Count GC` to reclaim blocks with zero references.
4. Press `Run Mark-&-Sweep GC` to reclaim unreachable blocks from root pointers.

Notes:
- Freeing a block leaves any pointers that referenced it as dangling (visualized).
- Reference counting does not detect cycles; use mark-and-sweep to collect cyclic garbage.
