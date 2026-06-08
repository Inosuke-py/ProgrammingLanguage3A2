"""Concurrency and parallelism analysis module."""
import ast
import multiprocessing
import os
import threading
import time


MULTI_WORKERS = 4
RACE_THREADS = 4
RACE_INCREMENTS = 1000


def analyze_concurrency(source_code):
    """Compare sequential, threading, multithreading, and multiprocessing."""
    result = {
        "success": False,
        "threading_results": {},
        "multithreading_results": {},
        "multiprocessing_results": {},
        "synchronization_overhead": {},
        "comparison": {},
        "race_condition_analysis": {},
        "deadlock_analysis": {},
        "cpu_utilization": {},
        "core_distribution": {},
        "execution_models": [],
        "static_analysis": {},
        "visualizations": {},
        "runtime_error": "",
        "error": None,
    }

    try:
        compile(source_code, "<concurrency_analysis>", "exec")

        sequential = _measure_sequential(source_code)
        threading_result = _measure_threading(source_code)
        multithreading_result = _measure_multithreading(source_code)
        multiprocessing_result = _measure_multiprocessing(source_code, sequential)
        sync_overhead = _measure_synchronization_overhead()
        race_result = _simulate_race_condition()
        deadlock_result = _analyze_deadlocks(source_code)
        static_result = _static_concurrency_analysis(source_code)

        for measured in [
            threading_result,
            multithreading_result,
            multiprocessing_result,
        ]:
            measured["speedup_vs_sequential"] = round(
                sequential["total_time_ms"] / max(measured["total_time_ms"], 0.001),
                2,
            )

        models = [
            _model_summary("Sequential", "Single-thread baseline", sequential),
            _model_summary("Threading", "One worker thread", threading_result),
            _model_summary(
                "Multithreading",
                f"{MULTI_WORKERS} Python worker threads",
                multithreading_result,
            ),
            _model_summary(
                "Multiprocessing",
                "Separate Python processes",
                multiprocessing_result,
            ),
        ]
        successful_models = [
            (model["name"], model["total_time_ms"])
            for model in models
            if model["total_time_ms"] > 0
        ]
        best_approach = min(successful_models, key=lambda item: item[1])[0]

        result.update({
            "success": True,
            "threading_results": threading_result,
            "multithreading_results": multithreading_result,
            "multiprocessing_results": multiprocessing_result,
            "synchronization_overhead": sync_overhead,
            "race_condition_analysis": race_result,
            "deadlock_analysis": deadlock_result,
            "cpu_utilization": {
                "sequential": sequential["cpu_utilization_percent"],
                "threading": threading_result["cpu_utilization_percent"],
                "multithreading": multithreading_result["cpu_utilization_percent"],
                "multiprocessing": multiprocessing_result["cpu_utilization_percent"],
                "cpu_count": os.cpu_count() or 1,
            },
            "core_distribution": _build_core_distribution(
                threading_result,
                multithreading_result,
                multiprocessing_result,
            ),
            "comparison": {
                "sequential_ms": sequential["total_time_ms"],
                "threading_ms": threading_result["total_time_ms"],
                "multithreading_ms": multithreading_result["total_time_ms"],
                "multiprocessing_ms": multiprocessing_result["total_time_ms"],
                "multiprocessing_estimated_ms": multiprocessing_result["estimated_time_ms"],
                "best_approach": best_approach,
            },
            "execution_models": models,
            "static_analysis": static_result,
            "visualizations": {
                "model_labels": [model["name"] for model in models],
                "model_times": [model["total_time_ms"] for model in models],
                "speedups": [model["speedup_vs_sequential"] for model in models],
                "cpu": [model["cpu_utilization_percent"] for model in models],
                "sync_labels": ["Unsafe", "Locked"],
                "sync_times": [
                    sync_overhead["unsafe_time_ms"],
                    sync_overhead["locked_time_ms"],
                ],
            },
            "runtime_error": _first_error([
                sequential,
                threading_result,
                multithreading_result,
                multiprocessing_result,
            ]),
        })

    except SyntaxError as exc:
        result["error"] = f"Syntax Error: {exc}"
    except Exception as exc:
        result["error"] = f"Error: {exc}"

    return result


def _execute_source(source_code):
    namespace = {
        "__builtins__": __builtins__,
        "__name__": "__concurrency_analysis__",
    }
    error = ""

    try:
        exec(compile(source_code, "<concurrency_analysis>", "exec"), namespace, namespace)
    except Exception as exc:
        error = f"{exc.__class__.__name__}: {exc}"

    return error


def _timed_run(function):
    wall_start = time.perf_counter()
    cpu_start = time.process_time()
    error = function()
    wall_ms = (time.perf_counter() - wall_start) * 1000
    cpu_ms = (time.process_time() - cpu_start) * 1000

    return {
        "total_time_ms": round(wall_ms, 4),
        "cpu_time_ms": round(cpu_ms, 4),
        "cpu_utilization_percent": round(
            min((cpu_ms / max(wall_ms, 0.000001)) * 100, 400),
            2,
        ),
        "error": error or "",
    }


def _measure_sequential(source_code):
    def run():
        errors = []
        for _ in range(MULTI_WORKERS):
            error = _execute_source(source_code)
            if error:
                errors.append(error)
        return errors[0] if errors else ""

    data = _timed_run(run)
    data.update({
        "worker_count": 1,
        "runs": MULTI_WORKERS,
        "speedup_vs_sequential": 1,
        "overhead_ms": 0,
    })
    return data


def _measure_threading(source_code):
    thread_time = [0]
    errors = []

    def worker():
        start = time.perf_counter()
        error = _execute_source(source_code)
        thread_time[0] = (time.perf_counter() - start) * 1000
        if error:
            errors.append(error)

    def run():
        thread = threading.Thread(target=worker, name="PLEASThread-1")
        thread.start()
        thread.join()
        return errors[0] if errors else ""

    data = _timed_run(run)
    data.update({
        "thread_count": 1,
        "worker_count": 1,
        "avg_thread_time_ms": round(thread_time[0], 4),
        "speedup_vs_sequential": 0,
        "overhead_ms": round(max(data["total_time_ms"] - thread_time[0], 0), 4),
    })
    return data


def _measure_multithreading(source_code):
    thread_times = []
    errors = []

    def worker():
        start = time.perf_counter()
        error = _execute_source(source_code)
        thread_times.append((time.perf_counter() - start) * 1000)
        if error:
            errors.append(error)

    def run():
        threads = [
            threading.Thread(target=worker, name=f"PLEASWorker-{index + 1}")
            for index in range(MULTI_WORKERS)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return errors[0] if errors else ""

    data = _timed_run(run)
    avg_thread_time = sum(thread_times) / max(len(thread_times), 1)
    ideal_parallel_time = avg_thread_time
    data.update({
        "thread_count": MULTI_WORKERS,
        "worker_count": MULTI_WORKERS,
        "avg_thread_time_ms": round(avg_thread_time, 4),
        "speedup_vs_sequential": 0,
        "overhead_ms": round(max(data["total_time_ms"] - ideal_parallel_time, 0), 4),
    })
    return data


def _multiprocessing_worker(source_code, output_queue):
    start = time.perf_counter()
    error = _execute_source(source_code)
    output_queue.put({
        "time_ms": (time.perf_counter() - start) * 1000,
        "error": error,
    })


def _measure_multiprocessing(source_code, sequential):
    start = time.perf_counter()
    output_queue = multiprocessing.Queue()
    processes = []
    errors = []
    worker_times = []

    try:
        for _ in range(MULTI_WORKERS):
            process = multiprocessing.Process(
                target=_multiprocessing_worker,
                args=(source_code, output_queue),
            )
            processes.append(process)
            process.start()

        for process in processes:
            process.join(timeout=5)
            if process.is_alive():
                process.terminate()
                process.join(timeout=1)
                errors.append("Process timed out")

        while not output_queue.empty():
            item = output_queue.get_nowait()
            worker_times.append(item.get("time_ms", 0))
            if item.get("error"):
                errors.append(item["error"])

        wall_ms = (time.perf_counter() - start) * 1000
        available = bool(worker_times) and not any(
            "Process timed out" in error for error in errors
        )
    except Exception as exc:
        wall_ms = (time.perf_counter() - start) * 1000
        errors.append(f"{exc.__class__.__name__}: {exc}")
        available = False

    estimated = sequential["total_time_ms"] / MULTI_WORKERS + 25
    total_time = wall_ms if available else estimated
    cpu_count = os.cpu_count() or 1

    return {
        "total_time_ms": round(total_time, 4),
        "estimated_time_ms": round(estimated, 4),
        "process_count": MULTI_WORKERS,
        "worker_count": MULTI_WORKERS,
        "avg_process_time_ms": round(
            sum(worker_times) / max(len(worker_times), 1),
            4,
        ),
        "speedup_vs_sequential": round(
            sequential["total_time_ms"] / max(total_time, 0.001),
            2,
        ),
        "estimated_speedup": round(
            sequential["total_time_ms"] / max(estimated, 0.001),
            2,
        ),
        "overhead_ms": round(max(total_time - min(worker_times or [estimated]), 0), 4),
        "cpu_time_ms": 0,
        "cpu_utilization_percent": round(min((MULTI_WORKERS / cpu_count) * 100, 100), 2),
        "available": available,
        "note": (
            "Measured with child processes."
            if available
            else "Using estimate because child process execution was unavailable."
        ),
        "error": errors[0] if errors else "",
    }


def _model_summary(name, description, data):
    return {
        "name": name,
        "description": description,
        "total_time_ms": data.get("total_time_ms", 0),
        "worker_count": data.get("worker_count", data.get("thread_count", 1)),
        "speedup_vs_sequential": data.get("speedup_vs_sequential", 0),
        "overhead_ms": data.get("overhead_ms", 0),
        "cpu_utilization_percent": data.get("cpu_utilization_percent", 0),
        "error": data.get("error", ""),
    }


def _build_core_distribution(threading_result, multithreading_result, multiprocessing_result):
    cpu_count = os.cpu_count() or 1

    return {
        "cpu_count": cpu_count,
        "threading": _worker_distribution(
            "Thread",
            threading_result.get("thread_count", 1),
            cpu_count,
        ),
        "multithreading": _worker_distribution(
            "Thread",
            multithreading_result.get("thread_count", MULTI_WORKERS),
            cpu_count,
        ),
        "multiprocessing": _worker_distribution(
            "Process",
            multiprocessing_result.get("process_count", MULTI_WORKERS),
            cpu_count,
        ),
    }


def _worker_distribution(worker_label, worker_count, cpu_count):
    workers = []

    for index in range(worker_count):
        core = index % max(cpu_count, 1)
        workers.append({
            "name": f"{worker_label} {index + 1}",
            "core": core + 1,
            "label": f"Core {core + 1}",
        })

    return {
        "worker_count": worker_count,
        "workers": workers,
    }


def _measure_synchronization_overhead():
    counter = [0]
    lock = threading.Lock()

    def unsafe_increment():
        for _ in range(RACE_INCREMENTS):
            counter[0] += 1

    def locked_increment():
        for _ in range(RACE_INCREMENTS):
            with lock:
                counter[0] += 1

    def run_threads(target):
        counter[0] = 0
        threads = [threading.Thread(target=target) for _ in range(RACE_THREADS)]
        start = time.perf_counter()
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return (time.perf_counter() - start) * 1000, counter[0]

    unsafe_time, unsafe_value = run_threads(unsafe_increment)
    locked_time, locked_value = run_threads(locked_increment)

    return {
        "unsafe_time_ms": round(unsafe_time, 4),
        "locked_time_ms": round(locked_time, 4),
        "overhead_ms": round(max(locked_time - unsafe_time, 0), 4),
        "overhead_percent": round(
            (max(locked_time - unsafe_time, 0) / max(unsafe_time, 0.000001)) * 100,
            2,
        ),
        "unsafe_final_value": unsafe_value,
        "locked_final_value": locked_value,
    }


def _simulate_race_condition():
    expected = RACE_THREADS * RACE_INCREMENTS
    shared = {"value": 0}
    lock = threading.Lock()

    def unsafe_increment():
        for index in range(RACE_INCREMENTS):
            current = shared["value"]
            if index % 10 == 0:
                time.sleep(0)
            shared["value"] = current + 1

    def safe_increment():
        for _ in range(RACE_INCREMENTS):
            with lock:
                shared["value"] += 1

    def run(target):
        shared["value"] = 0
        threads = [threading.Thread(target=target) for _ in range(RACE_THREADS)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        return shared["value"]

    unsafe_value = run(unsafe_increment)
    safe_value = run(safe_increment)
    data_loss = expected - unsafe_value

    return {
        "expected_value": expected,
        "unsafe_value": unsafe_value,
        "safe_value": safe_value,
        "race_detected": unsafe_value != expected,
        "data_loss": data_loss,
        "data_loss_percent": round((data_loss / expected) * 100, 2),
        "thread_count": RACE_THREADS,
        "increments_per_thread": RACE_INCREMENTS,
        "note": "Unsafe read-modify-write intentionally yields between read and write.",
    }


def _analyze_deadlocks(source_code):
    static_patterns = detect_deadlock_patterns(source_code)
    simulation = _simulate_deadlock()
    return {
        "potential_deadlocks": static_patterns,
        "shared_resources_detected": count_shared_resources(source_code),
        "lock_ordering_issues": bool(static_patterns),
        "simulation": simulation,
        "risk_level": _deadlock_risk(static_patterns, simulation),
    }


def _simulate_deadlock():
    lock_a = threading.Lock()
    lock_b = threading.Lock()
    events = []

    def task_one():
        with lock_a:
            events.append("task_one acquired A")
            time.sleep(0.01)
            acquired = lock_b.acquire(timeout=0.05)
            if acquired:
                events.append("task_one acquired B")
                lock_b.release()
            else:
                events.append("task_one timed out waiting for B")

    def task_two():
        with lock_b:
            events.append("task_two acquired B")
            time.sleep(0.01)
            acquired = lock_a.acquire(timeout=0.05)
            if acquired:
                events.append("task_two acquired A")
                lock_a.release()
            else:
                events.append("task_two timed out waiting for A")

    start = time.perf_counter()
    threads = [threading.Thread(target=task_one), threading.Thread(target=task_two)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=0.2)

    timed_out = any("timed out" in event for event in events)
    return {
        "deadlock_reproduced": timed_out,
        "duration_ms": round((time.perf_counter() - start) * 1000, 4),
        "events": events,
        "note": "Timeouts are used so the demo cannot hang the analyzer.",
    }


def _deadlock_risk(patterns, simulation):
    if patterns and simulation["deadlock_reproduced"]:
        return "high"
    if patterns or simulation["deadlock_reproduced"]:
        return "medium"
    return "low"


def detect_deadlock_patterns(source_code):
    """Detect potential deadlock patterns in uploaded code."""
    patterns = []
    lines = source_code.splitlines()
    acquired_lines = []

    for index, line in enumerate(lines, start=1):
        stripped = line.strip()
        if "Lock()" in stripped or "RLock()" in stripped:
            patterns.append({
                "line": index,
                "pattern": "Lock object creation",
                "risk": "low",
            })
        if ".acquire(" in stripped or stripped.endswith(".acquire()"):
            acquired_lines.append(index)
            risk = "medium" if len(acquired_lines) >= 2 else "low"
            patterns.append({
                "line": index,
                "pattern": "Manual lock acquisition",
                "risk": risk,
            })
        if len(acquired_lines) >= 2 and "with " in stripped and "lock" in stripped.lower():
            patterns.append({
                "line": index,
                "pattern": "Nested lock context",
                "risk": "medium",
            })

    if len(acquired_lines) >= 2:
        patterns.append({
            "line": acquired_lines[-1],
            "pattern": "Multiple lock acquisitions may need consistent ordering",
            "risk": "high",
        })

    return patterns


def count_shared_resources(source_code):
    """Count likely shared mutable resources in uploaded code."""
    count = 0

    try:
        tree = ast.parse(source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Global):
                count += len(node.names)
            elif isinstance(node, ast.Nonlocal):
                count += len(node.names)
            elif isinstance(node, (ast.List, ast.Dict, ast.Set)):
                count += 1
            elif isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name):
                if node.value.id in {"self", "cls"}:
                    count += 1
    except Exception:
        pass

    return count


def _static_concurrency_analysis(source_code):
    lowered = source_code.lower()
    return {
        "uses_threading": "threading" in lowered or "thread(" in lowered,
        "uses_multiprocessing": "multiprocessing" in lowered or "process(" in lowered,
        "uses_async": "async def" in lowered or "await " in lowered or "asyncio" in lowered,
        "uses_locks": "lock" in lowered or ".acquire(" in lowered,
        "shared_resources": count_shared_resources(source_code),
    }


def _first_error(results):
    for item in results:
        if item.get("error"):
            return item["error"]
    return ""
