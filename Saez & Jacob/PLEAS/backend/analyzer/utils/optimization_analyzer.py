import ast
import copy
import difflib
import time


class ConstantFolder(ast.NodeTransformer):
    """Fold expressions made only from literal constants."""

    def __init__(self):
        self.changes = []

    def _record(self, node, value, impact):
        self.changes.append({
            "line": getattr(node, "lineno", None),
            "optimization": "Constant Folding",
            "before": ast.unparse(node),
            "after": repr(value),
            "impact": impact,
        })

    def visit_BinOp(self, node):
        self.generic_visit(node)

        try:
            if (
                isinstance(node.left, ast.Constant)
                and isinstance(node.right, ast.Constant)
            ):
                value = eval(
                    compile(ast.Expression(node), filename="", mode="eval")
                )
                self._record(
                    node,
                    value,
                    "Precomputes constant expressions at compile time.",
                )
                return ast.copy_location(ast.Constant(value=value), node)
        except Exception:
            pass

        return node

    def visit_UnaryOp(self, node):
        self.generic_visit(node)

        try:
            if isinstance(node.operand, ast.Constant):
                value = eval(
                    compile(ast.Expression(node), filename="", mode="eval")
                )
                self._record(
                    node,
                    value,
                    "Collapses unary constant expressions.",
                )
                return ast.copy_location(ast.Constant(value=value), node)
        except Exception:
            pass

        return node


class StrengthReducer(ast.NodeTransformer):
    """Replace simple arithmetic identities with cheaper equivalents."""

    def __init__(self):
        self.changes = []

    def visit_BinOp(self, node):
        self.generic_visit(node)

        replacements = [
            (
                isinstance(node.op, (ast.Mult, ast.Div))
                and isinstance(node.right, ast.Constant)
                and node.right.value == 1,
                node.left,
                "Removes multiplication or division by one.",
            ),
            (
                isinstance(node.op, ast.Mult)
                and isinstance(node.left, ast.Constant)
                and node.left.value == 1,
                node.right,
                "Removes multiplication by one.",
            ),
            (
                isinstance(node.op, (ast.Add, ast.Sub))
                and isinstance(node.right, ast.Constant)
                and node.right.value == 0,
                node.left,
                "Removes addition or subtraction by zero.",
            ),
            (
                isinstance(node.op, ast.Add)
                and isinstance(node.left, ast.Constant)
                and node.left.value == 0,
                node.right,
                "Removes addition by zero.",
            ),
        ]

        for should_replace, replacement, impact in replacements:
            if should_replace:
                self.changes.append({
                    "line": getattr(node, "lineno", None),
                    "optimization": "Strength Reduction",
                    "before": ast.unparse(node),
                    "after": ast.unparse(replacement),
                    "impact": impact,
                })
                return ast.copy_location(replacement, node)

        return node


class DeadCodeEliminator(ast.NodeTransformer):
    """Remove branches and statements that cannot execute."""

    def __init__(self):
        self.changes = []

    def _trim_unreachable(self, body):
        new_body = []
        terminator = None

        for stmt in body:
            if terminator:
                self.changes.append({
                    "line": getattr(stmt, "lineno", None),
                    "optimization": "Dead Code Elimination",
                    "before": ast.unparse(stmt),
                    "after": "removed",
                    "impact": (
                        "Removes code that cannot execute after "
                        f"{terminator}."
                    ),
                })
                continue

            new_body.append(stmt)

            if isinstance(stmt, (ast.Return, ast.Raise, ast.Break, ast.Continue)):
                terminator = stmt.__class__.__name__.lower()

        return new_body

    def visit_FunctionDef(self, node):
        self.generic_visit(node)
        node.body = self._trim_unreachable(node.body)
        return node

    def visit_AsyncFunctionDef(self, node):
        self.generic_visit(node)
        node.body = self._trim_unreachable(node.body)
        return node

    def visit_If(self, node):
        self.generic_visit(node)

        if isinstance(node.test, ast.Constant):
            selected_body = node.body if node.test.value else node.orelse
            removed_body = node.orelse if node.test.value else node.body

            for stmt in removed_body:
                self.changes.append({
                    "line": getattr(stmt, "lineno", None),
                    "optimization": "Dead Code Elimination",
                    "before": ast.unparse(stmt),
                    "after": "removed",
                    "impact": "Removes a branch guarded by a constant condition.",
                })

            return selected_body or [ast.copy_location(ast.Pass(), node)]

        return node


class LoopVariableSubstituter(ast.NodeTransformer):
    """Replace reads of an unrolled loop variable with a concrete value."""

    def __init__(self, variable_name, value):
        self.variable_name = variable_name
        self.value = value

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load) and node.id == self.variable_name:
            return ast.copy_location(ast.Constant(value=self.value), node)

        return node


class LoopUnroller(ast.NodeTransformer):
    """Unroll very small fixed range loops."""

    def __init__(self):
        self.changes = []

    def visit_For(self, node):
        self.generic_visit(node)

        if not (
            isinstance(node.target, ast.Name)
            and isinstance(node.iter, ast.Call)
            and isinstance(node.iter.func, ast.Name)
            and node.iter.func.id == "range"
            and not node.orelse
        ):
            return node

        try:
            range_args = [ast.literal_eval(arg) for arg in node.iter.args]
            values = list(range(*range_args))
        except Exception:
            return node

        if not values or len(values) > 4:
            return node

        unrolled = []

        for value in values:
            for stmt in node.body:
                stmt_copy = copy.deepcopy(stmt)
                stmt_copy = LoopVariableSubstituter(
                    node.target.id,
                    value
                ).visit(stmt_copy)
                ast.fix_missing_locations(stmt_copy)
                unrolled.append(stmt_copy)

        self.changes.append({
            "line": getattr(node, "lineno", None),
            "optimization": "Loop Unrolling",
            "before": ast.unparse(node),
            "after": "\n".join(ast.unparse(stmt) for stmt in unrolled),
            "impact": "Expands a small fixed range loop to reduce iterator overhead.",
        })

        return unrolled


def _count_nodes(tree):
    counts = {}

    for node in ast.walk(tree):
        name = node.__class__.__name__
        counts[name] = counts.get(name, 0) + 1

    return counts


def _line_count(source_code):
    return len(source_code.splitlines())


def _build_code_comparison(original_code, optimized_code):
    original_lines = original_code.splitlines()
    optimized_lines = optimized_code.splitlines()
    matcher = difflib.SequenceMatcher(None, original_lines, optimized_lines)
    rows = []

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        max_count = max(i2 - i1, j2 - j1)

        for offset in range(max_count):
            original_index = i1 + offset
            optimized_index = j1 + offset

            rows.append({
                "status": tag,
                "original_line_no": (
                    original_index + 1 if original_index < i2 else None
                ),
                "optimized_line_no": (
                    optimized_index + 1 if optimized_index < j2 else None
                ),
                "original": (
                    original_lines[original_index]
                    if original_index < i2
                    else ""
                ),
                "optimized": (
                    optimized_lines[optimized_index]
                    if optimized_index < j2
                    else ""
                ),
            })

    return rows


def _benchmark_code(source_code, runs=5):
    timings = []

    try:
        compiled = compile(source_code, "<optimization-benchmark>", "exec")

        for _ in range(runs):
            globals_scope = {"__name__": "__optimization_benchmark__"}
            start = time.perf_counter()
            exec(compiled, globals_scope)
            end = time.perf_counter()
            timings.append((end - start) * 1000)

        return {
            "success": True,
            "average_ms": round(sum(timings) / len(timings), 4),
            "best_ms": round(min(timings), 4),
            "worst_ms": round(max(timings), 4),
            "runs": [round(timing, 4) for timing in timings],
        }

    except Exception as exc:
        return {
            "success": False,
            "average_ms": 0,
            "best_ms": 0,
            "worst_ms": 0,
            "runs": [],
            "error": str(exc),
        }


def _percent_reduction(original_value, optimized_value):
    if original_value <= 0:
        return 0

    return round(((original_value - optimized_value) / original_value) * 100, 2)


def _run_pass(pass_name, transformer, tree, before_counts):
    updated_tree = transformer.visit(tree)
    ast.fix_missing_locations(updated_tree)
    after_counts = _count_nodes(updated_tree)

    return (
        updated_tree,
        {
            "name": pass_name,
            "changes": len(transformer.changes),
            "before_nodes": sum(before_counts.values()),
            "after_nodes": sum(after_counts.values()),
            "nodes_delta": sum(after_counts.values()) - sum(before_counts.values()),
        },
        transformer.changes,
        after_counts,
    )


def benchmark_code(source_code):
    return _benchmark_code(source_code)["average_ms"]


def analyze_optimizations(source_code):
    try:
        original_tree = ast.parse(source_code)
        original_counts = _count_nodes(original_tree)
        original_benchmark = _benchmark_code(source_code)
        original_lines = _line_count(source_code)
        original_nodes = sum(original_counts.values())

        optimized_tree = copy.deepcopy(original_tree)
        current_counts = original_counts
        pass_summaries = []
        optimization_details = []

        for pass_name, transformer in [
            ("Constant Folding", ConstantFolder()),
            ("Strength Reduction", StrengthReducer()),
            ("Dead Code Elimination", DeadCodeEliminator()),
            ("Loop Unrolling", LoopUnroller()),
        ]:
            (
                optimized_tree,
                pass_summary,
                pass_changes,
                current_counts,
            ) = _run_pass(pass_name, transformer, optimized_tree, current_counts)
            pass_summaries.append(pass_summary)
            optimization_details.extend(pass_changes)

        optimized_code = ast.unparse(optimized_tree)
        optimized_benchmark = _benchmark_code(optimized_code)
        optimized_lines = _line_count(optimized_code)
        optimized_nodes = sum(current_counts.values())

        original_time = original_benchmark["average_ms"]
        optimized_time = optimized_benchmark["average_ms"]
        optimizations_applied = [
            pass_summary["name"]
            for pass_summary in pass_summaries
            if pass_summary["changes"] > 0
        ]

        if not optimizations_applied:
            optimizations_applied = ["No safe AST optimizations detected"]

        node_types = sorted(set(original_counts) | set(current_counts))
        node_visualization = [
            {
                "node_type": node_type,
                "original": original_counts.get(node_type, 0),
                "optimized": current_counts.get(node_type, 0),
            }
            for node_type in node_types
            if original_counts.get(node_type, 0) or current_counts.get(node_type, 0)
        ]

        max_runs = max(
            len(original_benchmark["runs"]),
            len(optimized_benchmark["runs"]),
        )

        return {
            "success": True,
            "original_code": source_code,
            "optimized_code": optimized_code,
            "code_comparison": _build_code_comparison(
                source_code,
                optimized_code,
            ),
            "optimizations_applied": optimizations_applied,
            "optimization_details": optimization_details,
            "compiler_pipeline": pass_summaries,
            "visualizations": {
                "runtime_runs": {
                    "labels": [f"Run {index + 1}" for index in range(max_runs)],
                    "original": original_benchmark["runs"],
                    "optimized": optimized_benchmark["runs"],
                },
                "ast_nodes": node_visualization,
                "pipeline": pass_summaries,
            },
            "metrics": {
                "original_time_ms": original_time,
                "optimized_time_ms": optimized_time,
                "performance_gain_percent": _percent_reduction(
                    original_time,
                    optimized_time,
                ),
                "original_best_time_ms": original_benchmark["best_ms"],
                "optimized_best_time_ms": optimized_benchmark["best_ms"],
                "original_worst_time_ms": original_benchmark["worst_ms"],
                "optimized_worst_time_ms": optimized_benchmark["worst_ms"],
                "benchmark_error": (
                    original_benchmark.get("error")
                    or optimized_benchmark.get("error")
                    or ""
                ),
                "original_lines": original_lines,
                "optimized_lines": optimized_lines,
                "line_reduction_percent": _percent_reduction(
                    original_lines,
                    optimized_lines,
                ),
                "original_ast_nodes": original_nodes,
                "optimized_ast_nodes": optimized_nodes,
                "ast_node_reduction_percent": _percent_reduction(
                    original_nodes,
                    optimized_nodes,
                ),
            },
        }

    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }
