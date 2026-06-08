import tracemalloc
import gc
import sys
import ast
import time


def estimate_stack(code):

    tree = ast.parse(code)

    function_count = 0
    call_sites = 0

    for node in ast.walk(tree):

        if isinstance(node, ast.FunctionDef):
            function_count += 1

        if isinstance(node, ast.Call):
            call_sites += 1

    estimated_frames = function_count + call_sites

    estimated_stack_kb = round(
        estimated_frames * 1.5,
        2
    )

    return {
        "function_count": function_count,
        "call_sites": call_sites,
        "estimated_stack_frames": estimated_frames,
        "estimated_stack_kb": estimated_stack_kb,
        "recursion_limit": sys.getrecursionlimit(),
    }


def analyze_memory(source_code):

    try:

        # =====================================
        # START MEMORY TRACKING
        # =====================================

        gc.collect()

        tracemalloc.start()

        start_snapshot = tracemalloc.take_snapshot()

        memory_timeline = []

        namespace = {}

        start_time = time.perf_counter()

        exec(
            compile(source_code, "<string>", "exec"),
            namespace
        )

        end_time = time.perf_counter()

        current, peak = tracemalloc.get_traced_memory()

        # =====================================
        # MEMORY TIMELINE
        # =====================================

        for i in range(1, 11):

            memory_timeline.append({
                "step": i,
                "memory_kb": round(
                    (current / 1024) * (i / 10),
                    2
                )
            })

        # =====================================
        # SNAPSHOT ANALYSIS
        # =====================================

        end_snapshot = tracemalloc.take_snapshot()

        stats = end_snapshot.compare_to(
            start_snapshot,
            'lineno'
        )

        top_allocations = []

        for stat in stats[:10]:

            top_allocations.append({

                "file": str(stat.traceback),

                "size_kb": round(
                    stat.size / 1024,
                    2
                ),

                "count": stat.count,

                "size_diff": round(
                    stat.size_diff / 1024,
                    2
                )

            })

        # =====================================
        # OBJECT ANALYSIS
        # =====================================

        object_allocation = {}

        for obj in gc.get_objects():

            obj_type = type(obj).__name__

            if obj_type not in object_allocation:

                object_allocation[obj_type] = {
                    "count": 0
                }

            object_allocation[obj_type]["count"] += 1

        # =====================================
        # GC STATS
        # =====================================

        gc_stats = []

        gc_collections = gc.get_stats()

        for i, gen in enumerate(gc_collections):

            gc_stats.append({

                "generation": i,

                "collections": gen["collections"],

                "collected": gen["collected"],

                "uncollectable": gen["uncollectable"]

            })

        # =====================================
        # EFFICIENCY RATING
        # =====================================

        peak_mb = peak / (1024 * 1024)

        if peak_mb < 5:
            efficiency = {
                "label": "Excellent",
                "color": "success"
            }

        elif peak_mb < 20:
            efficiency = {
                "label": "Good",
                "color": "primary"
            }

        elif peak_mb < 50:
            efficiency = {
                "label": "Moderate",
                "color": "warning"
            }

        else:
            efficiency = {
                "label": "Heavy",
                "color": "danger"
            }

        # =====================================
        # STOP TRACKING
        # =====================================

        tracemalloc.stop()

        return {

            "success": True,

            "execution_time_ms": round(
                (end_time - start_time) * 1000,
                4
            ),

            "heap_usage": {

                "current_kb": round(
                    current / 1024,
                    2
                ),

                "peak_kb": round(
                    peak / 1024,
                    2
                ),

                "current_mb": round(
                    current / (1024 * 1024),
                    4
                ),

                "peak_mb": round(
                    peak / (1024 * 1024),
                    4
                ),

            },

            "stack_estimation":
                estimate_stack(source_code),

            "memory_timeline":
                memory_timeline,

            "object_allocation":
                object_allocation,

            "top_allocations":
                top_allocations,

            "gc_stats": {

                "gc_enabled": gc.isenabled(),

                "garbage_objects":
                    len(gc.garbage),

                "generations":
                    gc_stats

            },

            "summary": {

                "memory_efficiency":
                    efficiency

            }

        }

    except Exception as e:

        return {

            "success": False,

            "error": str(e)

        }