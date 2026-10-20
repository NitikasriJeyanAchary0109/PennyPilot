#!/usr/bin/env python3
"""
Reproducible Mutation Testing Harness for backend/app/services/rule_engine.py
Evaluates hand-picked mutants with strict test assertion verification.
Guarantees clean restoration of rule_engine.py even under interruption or failure.
"""
import os
import re
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any, cast

RULE_ENGINE = Path("backend/app/services/rule_engine.py")

MUTATIONS = [
    {
        "id": "MUT-01",
        "name": "Negative Roundup Sign Inversion",
        "desc": "Invert sign of calculated roundup: roundup = -(next_milestone - amount)",
        "target": "roundup = next_milestone - amount",
        "replacement": "roundup = -(next_milestone - amount)",
    },
    {
        "id": "MUT-02",
        "name": "Inverted Budget Headroom",
        "desc": "Calculate budget + spent instead of budget - spent",
        "target": "return budget - spent",
        "replacement": "return budget + spent",
    },
    {
        "id": "MUT-03",
        "name": "Off-by-one in Monthly Scaling Days",
        "desc": "Use 31 days instead of 30 days per month in goal_forecast",
        "target": 'days_needed = int(months_needed * Decimal("30"))',
        "replacement": 'days_needed = int(months_needed * Decimal("31"))',
    },
    {
        "id": "MUT-04",
        "name": "Tier 1 vs Tier 2 Paise Boundary Mutation",
        "desc": "Change paise > 0 to paise >= 0, causing whole rupee amounts to enter Tier 1 instead of Tier 2",
        "target": 'if paise > Decimal("0"):',
        "replacement": 'if paise >= Decimal("0"):',
    },
    {
        "id": "MUT-05",
        "name": "Roundup Eligibility Threshold Strict Inequality",
        "desc": "Change balance >= threshold to balance > threshold, failing boundary balance",
        "target": "return current_balance >= threshold",
        "replacement": "return current_balance > threshold",
    },
    {
        "id": "MUT-06",
        "name": "Accelerated Savings Options Decrement Velocity",
        "desc": "Subtract extra contribution instead of adding it",
        "target": 'effective_vel = max(base_velocity, Decimal("0")) + inc',
        "replacement": 'effective_vel = max(base_velocity, Decimal("0")) - inc',
    },
]


def main():
    if not RULE_ENGINE.exists():
        print(f"Error: {RULE_ENGINE} does not exist.", file=sys.stderr)
        sys.exit(1)

    original_code = RULE_ENGINE.read_text()

    def signal_handler(signum, frame):
        RULE_ENGINE.write_text(original_code)
        print(f"\n[INTERRUPT] Caught signal {signum}. Restored {RULE_ENGINE} cleanly.")
        sys.exit(128 + signum)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    test_targets = [
        "backend/tests/test_rule_engine_units.py",
        "backend/tests/test_rule_engine_hypothesis.py",
    ]

    print("=" * 70)
    print("REPRODUCIBLE MUTATION TESTING SUITE FOR RULE_ENGINE.PY")
    print(f"Target file: {RULE_ENGINE}")
    print(f"Total hand-picked mutants evaluated: {len(MUTATIONS)}")
    print("=" * 70)

    # Step (a): Run unmutated baseline tests first and abort unless they pass
    print("\n[STEP 1] Running unmutated baseline tests...")
    baseline_cmd = (
        [sys.executable, "-m", "pytest"] + test_targets + ["-q", "--tb=short"]
    )
    baseline_env = os.environ.copy()
    baseline_env["PYTHONPATH"] = "backend"

    baseline_res = subprocess.run(
        baseline_cmd, capture_output=True, text=True, env=baseline_env
    )

    if baseline_res.returncode != 0:
        print("[ABORT] Baseline unmutated tests failed!", file=sys.stderr)
        print(baseline_res.stdout, file=sys.stderr)
        print(baseline_res.stderr, file=sys.stderr)
        sys.exit(1)

    passed_match = re.search(r"(\d+) passed", baseline_res.stdout)
    passed_count = passed_match.group(1) if passed_match else "unknown"
    print(
        f"Baseline tests passed cleanly: exit 0 ({passed_count} passed). Proceeding to mutants.\n"
    )

    results: list[dict[str, Any]] = []

    try:
        for m in MUTATIONS:
            print(f"Evaluating {m['id']}: {m['name']}...")
            if m["target"] not in original_code:
                print(
                    f"  [ERROR] Target string not found in {RULE_ENGINE}!",
                    file=sys.stderr,
                )
                sys.exit(1)

            mutated_code = original_code.replace(m["target"], m["replacement"], 1)
            RULE_ENGINE.write_text(mutated_code)

            try:
                res = subprocess.run(
                    [sys.executable, "-m", "pytest", *test_targets, "-q", "--tb=short"],
                    capture_output=True,
                    text=True,
                    env=baseline_env,
                )
            finally:
                RULE_ENGINE.write_text(original_code)

            # Step (b): Count as KILLED only if pytest reports at least one FAILED test
            has_failed_test = bool(
                re.search(r"\bFAILED\b", res.stdout)
                or re.search(r"\d+ failed\b", res.stdout)
            )
            has_collection_error = bool(
                re.search(r"\bERROR\b", res.stdout)
                or "ImportError" in res.stderr
                or "SyntaxError" in res.stderr
            )

            if has_failed_test:
                status = "KILLED"
                killed = True
            elif res.returncode != 0 and has_collection_error:
                status = "ERROR (Collection/Import failure - NOT counted as killed)"
                killed = False
            elif res.returncode != 0:
                status = f"FAILED ({res.returncode}) - NOT counted as killed"
                killed = False
            else:
                status = "SURVIVED"
                killed = False

            failing_lines = [
                line.strip()
                for line in res.stdout.splitlines()
                if line.startswith("FAILED") or "assert" in line
            ]

            print(f"  Result: {status} (pytest exit code {res.returncode})")
            results.append(
                {
                    "mutation": m,
                    "status": status,
                    "killed": killed,
                    "failing": failing_lines[:4],
                }
            )
    finally:
        # Step (c): Guaranteed restore in finally
        RULE_ENGINE.write_text(original_code)

    # Step (c) check: Verify git diff --stat backend/app/services/rule_engine.py is empty
    diff_check = subprocess.run(
        ["git", "diff", "--stat", str(RULE_ENGINE)], capture_output=True, text=True
    )
    if diff_check.stdout.strip():
        print(
            f"[ERROR] {RULE_ENGINE} is modified after run! Content:\n{diff_check.stdout}",
            file=sys.stderr,
        )
        RULE_ENGINE.write_text(original_code)
        sys.exit(1)
    else:
        print(f"\n[VERIFIED] git diff --stat {RULE_ENGINE} is empty.")

    print("\n" + "=" * 70)
    print("MUTATION SUMMARY REPORT")
    print("=" * 70)
    killed_count = sum(1 for r in results if r["killed"])
    survived_count = len(results) - killed_count

    print(f"Total Mutants Evaluated: {len(results)}")
    print(f"Mutants Killed:          {killed_count}")
    print(f"Mutants Survived:        {survived_count}")
    print(
        f"Result:                  {killed_count} of {len(results)} hand-picked mutants killed\n"
    )

    for r in results:
        m = cast(dict[str, str], r["mutation"])
        print(f"[{r['status']}] {m['id']}: {m['name']}")
        print(f"       Target:      {m['target']}")
        print(f"       Replacement: {m['replacement']}")
        failing = cast(list[str], r["failing"])
        if failing:
            print(f"       Caught by:   {failing[0]}")

    if survived_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
