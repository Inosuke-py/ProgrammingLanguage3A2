"""Hot path detection and runtime profiling module."""
import ast
import cProfile
import sys
import time
from collections import Counter, defaultdict


USER_FILENAME = "<user_input>"


class SourceStructureVisitor(ast.NodeVisitor):
    """Collect source constructs that often explain hot paths."""

    def __init__(self, source_lines):
        self.source_lines = source_lines
        self.functions = {}
        self.constructs = []

    def visit_FunctionDef(self, node):
        self.functions[node.name] = {
            "name": node.name,
            "line": node.lineno,
            "end_line": getattr(node, "end_lineno", node.lineno),
            "args": len(node.args.args),
        }
        self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def visit_For(self, node):
        self._record_construct(node, "for loop", "Iteration-heavy section")
        self.generic_visit(node)

    def visit_While(self, node):
        self._record_construct(node, "while loop", "Potential repeated execution")
        self.generic_visit(node)

    def visit_ListComp(self, node):
        self._record_construct(node, "list comprehension", "Compact repeated work")
        self.generic_visit(node)

    def visit_DictComp(self, node):
        self._record_construct(node, "dict comprehension", "Compact repeated work")
        self.generic_visit(node)

    def visit_SetComp(self, node):
        self._record_construct(node, "set comprehension", "Compact repeated work")
        self.generic_visit(node)

    def visit_GeneratorExp(self, node):
        self._record_construct(node, "generator expression", "Lazy repeated work")
        self.generic_visit(node)

    def _record_construct(self, node, construct_type, reason):
        line_no = getattr(node, "lineno", 0)
        self.constructs.append({
            "line": line_no,
            "end_line": getattr(node, "end_lineno", line_no),
            "type": construct_type,
            "reason": reason,
            "source": self._source_at(line_no),
        })

    def _source_at(self, line_no):
        if 1 <= line_no <= len(self.source_lines):
            return self.source_lines[line_no - 1].strip()
        return ""


class TraceCollector:
    """Collect executed lines, function calls, returns, and a rough timeline."""

    def __init__(self):
        self.line_counts = Counter()
        self.function_calls = Counter()
        self.function_stack = []
        self.timeline = []
        self.call_edges = Counter()
        self.start_time = None

    def trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILENAME:
            return self.trace

        now = time.perf_counter()

        if self.start_time is None:
            self.start_time = now

        if event == "line":
            self.line_counts[frame.f_lineno] += 1
            return self.trace

        if event == "call":
            function_name = frame.f_code.co_name
            caller = (
                self.function_stack[-1]["function"]
                if self.function_stack
                else "<module>"
            )
            self.function_calls[function_name] += 1
            self.call_edges[(caller, function_name)] += 1
            self.function_stack.append({
                "function": function_name,
                "line": frame.f_code.co_firstlineno,
                "start": now,
            })
            return self.trace

        if event == "return" and self.function_stack:
            entry = self.function_stack.pop()
            duration_ms = (now - entry["start"]) * 1000
            self.timeline.append({
                "order": len(self.timeline) + 1,
                "function": entry["function"],
                "line": entry["line"],
                "start_ms": round((entry["start"] - self.start_time) * 1000, 4),
                "duration_ms": round(duration_ms, 4),
            })

        return self.trace


def _empty_result():
    return {
        "success": False,
        "profile_stats": [],
        "hot_functions": [],
        "hot_sections": [],
        "execution_timeline": [],
        "bottlenecks": [],
        "call_frequency": {},
        "call_graph": [],
        "total_time": 0,
        "total_calls": 0,
        "line_frequency": {},
        "runtime_error": "",
        "dashboard": {},
        "visualizations": {},
        "error": None,
    }


def _build_structure(source_code):
    source_lines = source_code.splitlines()
    visitor = SourceStructureVisitor(source_lines)
    visitor.visit(ast.parse(source_code))
    return source_lines, visitor


def _profile_code(source_code):
    profiler = cProfile.Profile()
    trace_collector = TraceCollector()
    namespace = {"__builtins__": __builtins__, "__name__": "__hotpath_profile__"}
    code_obj = compile(source_code, USER_FILENAME, "exec")
    runtime_error = ""

    start = time.perf_counter()
    profiler.enable()
    previous_trace = sys.gettrace()
    sys.settrace(trace_collector.trace)

    try:
        exec(code_obj, namespace, namespace)
    except Exception as exc:
        runtime_error = f"{exc.__class__.__name__}: {exc}"
    finally:
        sys.settrace(previous_trace)
        profiler.disable()
        profiler.create_stats()

    total_time_ms = round((time.perf_counter() - start) * 1000, 4)
    return profiler, trace_collector, total_time_ms, runtime_error


def _extract_profile_stats(profiler):
    profile_stats = []
    total_calls = 0

    for func_key, func_stat in profiler.stats.items():
        filename, line, name = func_key

        if filename != USER_FILENAME:
            continue

        primitive_calls, total_call_count, total_time, cumulative_time, _ = func_stat
        per_call = total_time / max(total_call_count, 1)

        profile_stats.append({
            "function": name,
            "file": filename,
            "line": line,
            "ncalls": total_call_count,
            "primitive_calls": primitive_calls,
            "tottime_ms": round(total_time * 1000, 4),
            "cumtime_ms": round(cumulative_time * 1000, 4),
            "percall_ms": round(per_call * 1000, 6),
        })
        total_calls += total_call_count

    profile_stats.sort(key=lambda item: item["cumtime_ms"], reverse=True)
    return profile_stats, total_calls


def _line_to_function(line_no, functions):
    for function in functions.values():
        if function["line"] <= line_no <= function["end_line"]:
            return function["name"]
    return "<module>"


def _build_hot_sections(source_lines, structure, line_counts):
    sections = []

    for line_no, count in line_counts.most_common(20):
        source = source_lines[line_no - 1].strip() if line_no <= len(source_lines) else ""
        function_name = _line_to_function(line_no, structure.functions)
        related_construct = next(
            (
                construct
                for construct in structure.constructs
                if construct["line"] <= line_no <= construct["end_line"]
            ),
            None,
        )

        sections.append({
            "line": line_no,
            "function": function_name,
            "executions": count,
            "source": source,
            "construct": related_construct["type"] if related_construct else "statement",
            "is_loop": bool(related_construct),
        })

    return sections


def _build_line_frequency(source_lines, structure, line_counts):
    frequency = {}

    for line_no, count in line_counts.most_common():
        source = source_lines[line_no - 1].strip() if line_no <= len(source_lines) else ""
        frequency[f"Line {line_no}"] = {
            "line": line_no,
            "executions": count,
            "function": _line_to_function(line_no, structure.functions),
            "source": source,
            "is_hot": count >= max(2, max(line_counts.values() or [0]) * 0.5),
        }

    return frequency


def _build_bottlenecks(profile_stats, hot_sections, total_time_ms):
    bottlenecks = []
    top_time = profile_stats[0]["cumtime_ms"] if profile_stats else 0

    for stat in profile_stats[:8]:
        time_share = (
            round((stat["cumtime_ms"] / total_time_ms) * 100, 2)
            if total_time_ms > 0
            else 0
        )

        if stat["cumtime_ms"] < max(0.05, top_time * 0.1):
            continue

        severity = "danger" if time_share >= 50 else "warning"
        bottlenecks.append({
            "kind": "Function",
            "function": stat["function"],
            "line": stat["line"],
            "time_ms": stat["cumtime_ms"],
            "calls": stat["ncalls"],
            "time_share_percent": time_share,
            "severity": severity,
            "suggestion": (
                "This function dominates cumulative runtime. Inspect nested "
                "loops, repeated allocations, and expensive calls."
            ),
        })

    if hot_sections:
        max_executions = hot_sections[0]["executions"]
        for section in hot_sections[:5]:
            if section["executions"] < max(5, max_executions * 0.25):
                continue

            bottlenecks.append({
                "kind": "Line",
                "function": section["function"],
                "line": section["line"],
                "time_ms": "",
                "calls": section["executions"],
                "time_share_percent": "",
                "severity": "danger" if section["is_loop"] else "warning",
                "suggestion": (
                    "This line executes frequently. Consider caching repeated "
                    "work or reducing loop complexity."
                ),
            })

    return bottlenecks[:10]


def _timeline_summary(timeline):
    grouped = defaultdict(lambda: {"duration_ms": 0, "calls": 0})

    for item in timeline:
        entry = grouped[item["function"]]
        entry["duration_ms"] += item["duration_ms"]
        entry["calls"] += 1

    summary = [
        {
            "function": function,
            "duration_ms": round(values["duration_ms"], 4),
            "calls": values["calls"],
        }
        for function, values in grouped.items()
    ]
    summary.sort(key=lambda item: item["duration_ms"], reverse=True)
    return summary


def analyze_hotpath(source_code):
    """Profile code and detect frequently executed sections."""
    result = _empty_result()

    try:
        source_lines, structure = _build_structure(source_code)
        profiler, trace_data, total_time_ms, runtime_error = _profile_code(source_code)
        profile_stats, total_calls = _extract_profile_stats(profiler)

        hot_sections = _build_hot_sections(
            source_lines,
            structure,
            trace_data.line_counts,
        )
        hot_functions = [
            stat
            for stat in profile_stats
            if stat["cumtime_ms"] >= (profile_stats[0]["cumtime_ms"] * 0.2)
        ][:10] if profile_stats else []

        call_frequency = {
            stat["function"]: stat["ncalls"]
            for stat in profile_stats[:15]
        }

        if not call_frequency:
            call_frequency = dict(trace_data.function_calls.most_common(15))

        call_graph = [
            {
                "caller": caller,
                "callee": callee,
                "calls": calls,
            }
            for (caller, callee), calls in trace_data.call_edges.most_common(20)
        ]
        line_frequency = _build_line_frequency(
            source_lines,
            structure,
            trace_data.line_counts,
        )
        timeline = trace_data.timeline[-30:]
        timeline_summary = _timeline_summary(trace_data.timeline)
        bottlenecks = _build_bottlenecks(profile_stats, hot_sections, total_time_ms)

        result.update({
            "success": True,
            "profile_stats": profile_stats[:50],
            "hot_functions": hot_functions,
            "hot_sections": hot_sections[:15],
            "execution_timeline": timeline,
            "timeline_summary": timeline_summary[:15],
            "bottlenecks": bottlenecks,
            "call_frequency": call_frequency,
            "call_graph": call_graph,
            "total_time": total_time_ms,
            "total_calls": total_calls or sum(trace_data.function_calls.values()),
            "line_frequency": line_frequency,
            "runtime_error": runtime_error,
            "dashboard": {
                "executed_lines": len(trace_data.line_counts),
                "max_line_executions": max(trace_data.line_counts.values() or [0]),
                "unique_functions": len(call_frequency),
                "profiled_events": sum(trace_data.line_counts.values()),
            },
            "visualizations": {
                "hot_sections": hot_sections[:10],
                "timeline": timeline,
                "timeline_summary": timeline_summary[:10],
                "call_graph": call_graph,
            },
        })

    except SyntaxError as exc:
        result["error"] = f"Syntax Error: {exc}"
    except Exception as exc:
        result["error"] = f"Error: {exc}"

    return result
