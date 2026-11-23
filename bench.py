"""CPU benchmark for the Cactus Mirage vision model.

Usage:
    uv run bench.py [image_path] [--iterations N]
"""

import argparse
import json
import statistics
import time

import cactus


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image", nargs="?", default="sample.png")
    parser.add_argument("--iterations", type=int, default=10)
    args = parser.parse_args()

    t0 = time.perf_counter()
    model = cactus.Mirage()
    load_time_s = time.perf_counter() - t0

    model.describe(args.image)  # warm-up, not timed

    times = []
    for _ in range(args.iterations):
        t0 = time.perf_counter()
        model.describe(args.image)
        times.append(time.perf_counter() - t0)

    report = {
        "image": args.image,
        "load_time_s": round(load_time_s, 4),
        "iterations": args.iterations,
        "times_s": [round(t, 4) for t in times],
        "mean_s": round(statistics.mean(times), 4),
        "median_s": round(statistics.median(times), 4),
        "min_s": round(min(times), 4),
        "max_s": round(max(times), 4),
        "images_per_sec": round(1 / statistics.mean(times), 4),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
