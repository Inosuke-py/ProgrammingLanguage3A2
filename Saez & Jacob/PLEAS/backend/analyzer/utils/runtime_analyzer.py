"""Runtime efficiency analyzer module."""
import math
import statistics
import time


RUN_ITERATIONS = 30
WARMUP_ITERATIONS = 3


def analyze_runtime(source_code):
    """Measure execution time, CPU usage, startup time, throughput, and latency."""
    result = {
        "success": False,
        "execution_time": {},
        "cpu_usage": {},
        "startup_time": 0,
        "throughput": {},
        "response_time": {},
        "benchmark_results": [],
        "comparative_benchmarks": [],
        "statistics": {},
        "rankings": {},
        "visualizations": {},
        "runtime_error": "",
        "error": None,
    }

    try:
        startup_start = time.perf_counter()
        code_obj = compile(source_code, "<runtime_analysis>", "exec")
        startup_ms = (time.perf_counter() - startup_start) * 1000

        warmup_error = ""
        for _ in range(WARMUP_ITERATIONS):
            run = _execute_once(code_obj)
            if run["error"] and not warmup_error:
                warmup_error = run["error"]

        samples = []
        for index in range(RUN_ITERATIONS):
            sample = _execute_once(code_obj)
            sample["run"] = index + 1
            samples.append(sample)

        wall_times = [sample["wall_ms"] for sample in samples]
        cpu_times = [sample["cpu_ms"] for sample in samples]
        cpu_percents = [sample["cpu_percent"] for sample in samples]
        runtime_error = next(
            (sample["error"] for sample in samples if sample["error"]),
            warmup_error,
        )

        total_wall_s = sum(wall_times) / 1000
        total_cpu_s = sum(cpu_times) / 1000
        throughput = RUN_ITERATIONS / max(total_wall_s, 0.000001)
        avg_ms = statistics.mean(wall_times)
        p95_ms = _percentile(wall_times, 95)
        p99_ms = _percentile(wall_times, 99)

        result["startup_time"] = round(startup_ms, 4)
        result["execution_time"] = {
            "single_ms": round(wall_times[0], 4),
            "avg_ms": round(avg_ms, 4),
            "min_ms": round(min(wall_times), 4),
            "max_ms": round(max(wall_times), 4),
            "median_ms": round(statistics.median(wall_times), 4),
            "iterations": RUN_ITERATIONS,
            "warmup_iterations": WARMUP_ITERATIONS,
        }
        result["cpu_usage"] = {
            "avg_cpu_percent": round(statistics.mean(cpu_percents), 2),
            "max_cpu_percent": round(max(cpu_percents), 2),
            "min_cpu_percent": round(min(cpu_percents), 2),
            "total_cpu_ms": round(sum(cpu_times), 4),
            "avg_cpu_ms": round(statistics.mean(cpu_times), 4),
            "cpu_efficiency_percent": round(
                (total_cpu_s / max(total_wall_s, 0.000001)) * 100,
                2,
            ),
        }
        result["throughput"] = {
            "executions_per_second": round(throughput, 2),
            "total_iterations": RUN_ITERATIONS,
            "total_elapsed_ms": round(sum(wall_times), 4),
            "avg_response_time_ms": round(avg_ms, 4),
        }
        result["response_time"] = {
            "average_ms": round(avg_ms, 4),
            "median_ms": round(statistics.median(wall_times), 4),
            "p90_ms": round(_percentile(wall_times, 90), 4),
            "p95_ms": round(p95_ms, 4),
            "p99_ms": round(p99_ms, 4),
            "fastest_ms": round(min(wall_times), 4),
            "slowest_ms": round(max(wall_times), 4),
        }
        result["statistics"] = {
            "mean": round(avg_ms, 4),
            "stdev": round(statistics.stdev(wall_times), 4) if len(wall_times) > 1 else 0,
            "variance": round(statistics.variance(wall_times), 6) if len(wall_times) > 1 else 0,
            "coefficient_of_variation": round(
                (statistics.stdev(wall_times) / avg_ms) * 100,
                2,
            ) if len(wall_times) > 1 and avg_ms > 0 else 0,
            "p90": round(_percentile(wall_times, 90), 4),
            "p95": round(p95_ms, 4),
            "p99": round(p99_ms, 4),
        }

        result["benchmark_results"] = _build_benchmark_results(result)
        result["comparative_benchmarks"] = _build_comparative_benchmarks(result)
        result["rankings"] = compute_rankings(result)
        result["visualizations"] = {
            "run_labels": [f"Run {sample['run']}" for sample in samples],
            "execution_samples": [round(value, 4) for value in wall_times],
            "cpu_samples": [round(value, 2) for value in cpu_percents],
            "benchmark_labels": [item["metric"] for item in result["benchmark_results"]],
            "benchmark_scores": [
                item["rating"]["score"]
                for item in result["benchmark_results"]
            ],
            "comparison_labels": [
                item["label"]
                for item in result["comparative_benchmarks"]
            ],
            "comparison_values": [
                item["value"]
                for item in result["comparative_benchmarks"]
            ],
        }
        result["runtime_error"] = runtime_error
        result["success"] = True

    except SyntaxError as exc:
        result["error"] = f"Syntax Error: {exc}"
    except Exception as exc:
        result["error"] = f"Error: {exc}"

    return result


def _execute_once(code_obj):
    namespace = {"__builtins__": __builtins__, "__name__": "__runtime_analysis__"}
    wall_start = time.perf_counter()
    cpu_start = time.process_time()
    error = ""

    try:
        exec(code_obj, namespace, namespace)
    except Exception as exc:
        error = f"{exc.__class__.__name__}: {exc}"

    wall_ms = (time.perf_counter() - wall_start) * 1000
    cpu_ms = (time.process_time() - cpu_start) * 1000
    cpu_percent = (cpu_ms / max(wall_ms, 0.000001)) * 100

    return {
        "wall_ms": round(wall_ms, 6),
        "cpu_ms": round(cpu_ms, 6),
        "cpu_percent": round(min(cpu_percent, 1000), 4),
        "error": error,
    }


def _percentile(values, percentile):
    ordered = sorted(values)

    if not ordered:
        return 0

    if len(ordered) == 1:
        return ordered[0]

    index = (len(ordered) - 1) * (percentile / 100)
    lower = math.floor(index)
    upper = math.ceil(index)

    if lower == upper:
        return ordered[int(index)]

    weight = index - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _build_benchmark_results(result):
    cpu_percent = result["cpu_usage"]["avg_cpu_percent"]
    throughput = result["throughput"]["executions_per_second"]
    avg_ms = result["execution_time"]["avg_ms"]
    p95_ms = result["response_time"]["p95_ms"]
    startup_ms = result["startup_time"]
    consistency = result["statistics"]["coefficient_of_variation"]

    return [
        {
            "metric": "Startup Time",
            "value": startup_ms,
            "unit": "ms",
            "rating": rate_lower_is_better(startup_ms, 1, 5, 20),
        },
        {
            "metric": "Average Execution",
            "value": avg_ms,
            "unit": "ms",
            "rating": rate_lower_is_better(avg_ms, 1, 10, 50),
        },
        {
            "metric": "Response Time p95",
            "value": p95_ms,
            "unit": "ms",
            "rating": rate_lower_is_better(p95_ms, 2, 15, 60),
        },
        {
            "metric": "Throughput",
            "value": throughput,
            "unit": "ops/s",
            "rating": rate_higher_is_better(throughput, 10000, 1000, 100),
        },
        {
            "metric": "CPU Efficiency",
            "value": cpu_percent,
            "unit": "%",
            "rating": rate_cpu_usage(cpu_percent),
        },
        {
            "metric": "Consistency",
            "value": consistency,
            "unit": "% CV",
            "rating": rate_lower_is_better(consistency, 5, 20, 50),
        },
    ]


def _build_comparative_benchmarks(result):
    avg_ms = result["execution_time"]["avg_ms"]
    p95_ms = result["response_time"]["p95_ms"]
    startup_ms = result["startup_time"]
    throughput = result["throughput"]["executions_per_second"]
    cpu_percent = result["cpu_usage"]["avg_cpu_percent"]

    return [
        {
            "label": "Startup",
            "value": _score_lower(startup_ms, 1, 20),
            "raw_value": startup_ms,
            "unit": "ms",
        },
        {
            "label": "Execution",
            "value": _score_lower(avg_ms, 1, 50),
            "raw_value": avg_ms,
            "unit": "ms",
        },
        {
            "label": "Response p95",
            "value": _score_lower(p95_ms, 2, 60),
            "raw_value": p95_ms,
            "unit": "ms",
        },
        {
            "label": "Throughput",
            "value": _score_higher(throughput, 100, 10000),
            "raw_value": throughput,
            "unit": "ops/s",
        },
        {
            "label": "CPU",
            "value": _score_cpu(cpu_percent),
            "raw_value": cpu_percent,
            "unit": "%",
        },
    ]


def rate_lower_is_better(value, excellent, good, average):
    if value <= excellent:
        return {"label": "Excellent", "color": "success", "score": 95}
    if value <= good:
        return {"label": "Good", "color": "info", "score": 75}
    if value <= average:
        return {"label": "Average", "color": "warning", "score": 50}
    return {"label": "Poor", "color": "danger", "score": 25}


def rate_higher_is_better(value, excellent, good, average):
    if value >= excellent:
        return {"label": "Excellent", "color": "success", "score": 95}
    if value >= good:
        return {"label": "Good", "color": "info", "score": 75}
    if value >= average:
        return {"label": "Average", "color": "warning", "score": 50}
    return {"label": "Poor", "color": "danger", "score": 25}


def rate_cpu_usage(value):
    if 25 <= value <= 95:
        return {"label": "Efficient", "color": "success", "score": 90}
    if value < 25:
        return {"label": "Low CPU", "color": "info", "score": 70}
    if value <= 130:
        return {"label": "High", "color": "warning", "score": 50}
    return {"label": "Saturated", "color": "danger", "score": 25}


def _score_lower(value, best, worst):
    if value <= best:
        return 100
    if value >= worst:
        return 10
    return round(100 - ((value - best) / (worst - best)) * 90, 1)


def _score_higher(value, worst, best):
    if value >= best:
        return 100
    if value <= worst:
        return 10
    return round(10 + ((value - worst) / (best - worst)) * 90, 1)


def _score_cpu(value):
    if 25 <= value <= 95:
        return 100
    if value < 25:
        return max(25, round(value / 25 * 75, 1))
    return max(10, round(100 - ((value - 95) / 105) * 90, 1))


def compute_rankings(result):
    """Compute overall runtime performance ranking."""
    scores = [item["rating"]["score"] for item in result["benchmark_results"]]
    overall_score = sum(scores) / len(scores) if scores else 0

    if overall_score >= 90:
        tier = "S"
        label = "Elite"
    elif overall_score >= 78:
        tier = "A"
        label = "High Performance"
    elif overall_score >= 65:
        tier = "B"
        label = "Good"
    elif overall_score >= 50:
        tier = "C"
        label = "Moderate"
    else:
        tier = "D"
        label = "Needs Optimization"

    sorted_categories = sorted(
        result["benchmark_results"],
        key=lambda item: item["rating"]["score"],
        reverse=True,
    )

    return {
        "overall_score": round(overall_score, 1),
        "tier": tier,
        "label": label,
        "category_scores": {
            item["metric"]: item["rating"]["score"]
            for item in result["benchmark_results"]
        },
        "best_metric": sorted_categories[0]["metric"] if sorted_categories else "",
        "weakest_metric": sorted_categories[-1]["metric"] if sorted_categories else "",
        "ordered": [
            {
                "rank": index + 1,
                "metric": item["metric"],
                "score": item["rating"]["score"],
                "rating": item["rating"]["label"],
                "color": item["rating"]["color"],
            }
            for index, item in enumerate(sorted_categories)
        ],
    }
