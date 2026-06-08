import ast
import contextlib
import dis
import io
import time
import types
from collections import Counter


BENCHMARK_ITERATIONS = 30
USER_FILENAME = "<user_input>"


def analyze_bytecode(source_code):
    """Compile source code, disassemble it, build AST data, and benchmark it."""

    try:
        ast_start = time.perf_counter()
        tree = ast.parse(source_code, filename=USER_FILENAME)
        ast_parse_time = round((time.perf_counter() - ast_start) * 1000, 4)

        compile_start = time.perf_counter()
        compiled_code = compile(tree, USER_FILENAME, "exec")
        compile_time = round((time.perf_counter() - compile_start) * 1000, 4)

        code_objects = _collect_code_objects(compiled_code)
        module_instructions = _instructions_for(compiled_code, "module")
        all_instructions = []
        opcode_counter = Counter()

        for code_object in code_objects:
            instructions = _instructions_for(code_object["code"], code_object["qualified_name"])
            code_object["instructions"] = instructions
            code_object["instruction_count"] = len(instructions)
            code_object["bytecode"] = _disassemble(code_object["code"])
            all_instructions.extend(instructions)
            opcode_counter.update(instruction["opname"] for instruction in instructions)

        execution_flow = _build_execution_flow(module_instructions)
        flow_edges = _build_flow_edges(module_instructions)
        interpreted = benchmark_interpreted(source_code)
        compiled = benchmark_compiled(compiled_code)
        ast_summary = _summarize_ast(tree)

        return {
            "success": True,
            "source_code": source_code,
            "total_instructions": len(all_instructions),
            "module_instruction_count": len(module_instructions),
            "code_object_count": len(code_objects),
            "compilation_time": compile_time,
            "ast_parse_time": ast_parse_time,
            "bytecode_instructions": module_instructions,
            "all_bytecode_instructions": all_instructions,
            "opcode_frequency": dict(opcode_counter),
            "constants": _safe_constants(compiled_code),
            "names": list(compiled_code.co_names),
            "execution_flow": execution_flow,
            "flow_edges": flow_edges,
            "raw_disassembly": _disassemble(compiled_code),
            "code_objects": [
                {
                    "name": item["name"],
                    "qualified_name": item["qualified_name"],
                    "type": item["type"],
                    "first_line": item["first_line"],
                    "instruction_count": item["instruction_count"],
                    "bytecode": item["bytecode"],
                    "instructions": item["instructions"],
                }
                for item in code_objects
            ],
            "nested_functions": [
                {
                    "name": item["qualified_name"],
                    "instruction_count": item["instruction_count"],
                    "bytecode": item["bytecode"],
                }
                for item in code_objects
                if item["type"] != "module"
            ],
            "ast_tree": {
                "dump": ast.dump(tree, indent=2),
                "node_count": ast_summary["node_count"],
                "max_depth": ast_summary["max_depth"],
                "node_frequency": ast_summary["node_frequency"],
                "top_level_nodes": ast_summary["top_level_nodes"],
            },
            "execution_comparison": {
                "interpreted_ms": interpreted["total_ms"],
                "compiled_ms": compiled["total_ms"],
                "interpreted_avg_ms": interpreted["avg_ms"],
                "compiled_avg_ms": compiled["avg_ms"],
                "speedup": round(
                    interpreted["total_ms"] / compiled["total_ms"],
                    2,
                ) if compiled["total_ms"] > 0 else 0,
                "iterations": BENCHMARK_ITERATIONS,
                "interpreted_error": interpreted["error"],
                "compiled_error": compiled["error"],
            },
        }

    except SyntaxError as exc:
        return {
            "success": False,
            "error": f"Syntax Error: {exc}",
        }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
        }


def _collect_code_objects(code_obj, qualified_name="module", seen=None):
    if seen is None:
        seen = set()

    object_id = id(code_obj)
    if object_id in seen:
        return []
    seen.add(object_id)

    object_type = "module" if qualified_name == "module" else "function"
    if code_obj.co_name in {"<lambda>", "<listcomp>", "<dictcomp>", "<setcomp>", "<genexpr>"}:
        object_type = "expression"

    collected = [{
        "name": code_obj.co_name,
        "qualified_name": qualified_name,
        "type": object_type,
        "first_line": code_obj.co_firstlineno,
        "code": code_obj,
    }]

    for const in code_obj.co_consts:
        if isinstance(const, types.CodeType):
            child_name = const.co_name
            if qualified_name != "module":
                child_name = f"{qualified_name}.{child_name}"
            collected.extend(_collect_code_objects(const, child_name, seen))

    return collected


def _instructions_for(code_obj, code_object_name):
    instructions = []

    for instr in dis.get_instructions(code_obj):
        target = _jump_target(instr)
        instructions.append({
            "code_object": code_object_name,
            "offset": instr.offset,
            "line": instr.starts_line,
            "opname": instr.opname,
            "arg": instr.arg,
            "argrepr": instr.argrepr,
            "argval": str(instr.argval),
            "is_jump": target is not None,
            "jump_target": target,
        })

    return instructions


def _jump_target(instr):
    if "JUMP" in instr.opname or instr.opname in {
        "FOR_ITER",
        "POP_JUMP_FORWARD_IF_FALSE",
        "POP_JUMP_FORWARD_IF_TRUE",
        "POP_JUMP_BACKWARD_IF_FALSE",
        "POP_JUMP_BACKWARD_IF_TRUE",
    }:
        if isinstance(instr.argval, int):
            return instr.argval
    return None


def _safe_constants(code_obj):
    constants = []

    for const in code_obj.co_consts:
        if const is None or isinstance(const, types.CodeType):
            continue
        constants.append(repr(const))

    return constants


def _disassemble(code_obj):
    buffer = io.StringIO()
    dis.dis(code_obj, file=buffer)
    return buffer.getvalue()


def _build_execution_flow(instructions):
    flow = []

    for index, instr in enumerate(instructions):
        next_offset = instructions[index + 1]["offset"] if index + 1 < len(instructions) else None
        label = f"{instr['offset']} -> {instr['opname']}"

        if instr["is_jump"]:
            label = f"{label} -> {instr['jump_target']}"
        elif next_offset is not None and instr["opname"] not in {"RETURN_VALUE", "RAISE_VARARGS"}:
            label = f"{label} -> {next_offset}"

        flow.append(label)

    return flow


def _build_flow_edges(instructions):
    edges = []

    for index, instr in enumerate(instructions):
        source = instr["offset"]
        next_offset = instructions[index + 1]["offset"] if index + 1 < len(instructions) else None

        if instr["is_jump"]:
            edges.append({
                "source": source,
                "target": instr["jump_target"],
                "type": "jump",
                "opcode": instr["opname"],
            })

            if "IF_" in instr["opname"] and next_offset is not None:
                edges.append({
                    "source": source,
                    "target": next_offset,
                    "type": "fallthrough",
                    "opcode": instr["opname"],
                })

        elif next_offset is not None and instr["opname"] not in {"RETURN_VALUE", "RAISE_VARARGS"}:
            edges.append({
                "source": source,
                "target": next_offset,
                "type": "next",
                "opcode": instr["opname"],
            })

    return edges


def _summarize_ast(tree):
    counter = Counter()
    max_depth = 0

    def visit(node, depth=0):
        nonlocal max_depth
        counter[type(node).__name__] += 1
        max_depth = max(max_depth, depth)

        for child in ast.iter_child_nodes(node):
            visit(child, depth + 1)

    visit(tree)

    return {
        "node_count": sum(counter.values()),
        "max_depth": max_depth,
        "node_frequency": dict(counter.most_common(20)),
        "top_level_nodes": [
            {
                "type": type(node).__name__,
                "line": getattr(node, "lineno", None),
                "summary": _node_summary(node),
            }
            for node in getattr(tree, "body", [])
        ],
    }


def _node_summary(node):
    try:
        source = ast.unparse(node)
    except Exception:
        source = type(node).__name__

    return source.replace("\n", " ")[:120]


def benchmark_interpreted(source_code, iterations=BENCHMARK_ITERATIONS):
    """Benchmark parse/compile/execute, approximating interpreter path."""
    samples = []
    error = ""

    for _ in range(iterations):
        start = time.perf_counter()
        try:
            namespace = {"__builtins__": __builtins__, "__name__": "__bytecode_benchmark__"}
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                exec(source_code, namespace, namespace)
        except Exception as exc:
            if not error:
                error = f"{exc.__class__.__name__}: {exc}"
        samples.append((time.perf_counter() - start) * 1000)

    total = sum(samples)
    return {
        "total_ms": round(total, 4),
        "avg_ms": round(total / max(iterations, 1), 4),
        "error": error,
    }


def benchmark_compiled(compiled_code, iterations=BENCHMARK_ITERATIONS):
    """Benchmark execution of a precompiled code object."""
    samples = []
    error = ""

    for _ in range(iterations):
        namespace = {"__builtins__": __builtins__, "__name__": "__bytecode_benchmark__"}
        start = time.perf_counter()
        try:
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                exec(compiled_code, namespace, namespace)
        except Exception as exc:
            if not error:
                error = f"{exc.__class__.__name__}: {exc}"
        samples.append((time.perf_counter() - start) * 1000)

    total = sum(samples)
    return {
        "total_ms": round(total, 4),
        "avg_ms": round(total / max(iterations, 1), 4),
        "error": error,
    }


def get_nested_bytecode(source_code):
    """Return nested code object bytecode for compatibility with existing views."""
    try:
        compiled_code = compile(source_code, USER_FILENAME, "exec")
        code_objects = _collect_code_objects(compiled_code)
        return [
            {
                "name": item["qualified_name"],
                "instruction_count": len(list(dis.get_instructions(item["code"]))),
                "bytecode": _disassemble(item["code"]),
            }
            for item in code_objects
            if item["type"] != "module"
        ]
    except Exception:
        return []
