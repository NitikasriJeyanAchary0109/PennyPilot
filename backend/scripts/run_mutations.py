#!/usr/bin/env python3
"""
Reproducible Mutation Testing Harness for backend/app/services/rule_engine.py
Applies deliberate mutations, executes unit and property-based test suites,
records killing test assertions, and guarantees clean file restoration.
"""
import subprocess
import sys
from pathlib import Path

RULE_ENGINE = Path("backend/app/services/rule_engine.py")

MUTATIONS = [
    {
        "id": "MUT-01",
        "name": "Negative Roundup Sign Inversion",
        "desc": "Invert sign of calculated roundup: roundup = -(next_milestone - amount)",
        "target": "roundup = next_milestone - amount",
        "replacement": "roundup = -(next_milestone - amount)"
    },
    {
        "id": "MUT-02",
        "name": "Inverted Budget Headroom",
        "desc": "Calculate budget + spent instead of budget - spent",
        "target": "return budget - spent",
        "replacement": "return budget + spent"
    },
    {
        "id": "MUT-03",
        "name": "Off-by-one in Monthly Scaling Days",
        "desc": "Use 31 days instead of 30 days per month in goal_forecast",
        "target": "days_needed = int(months_needed * Decimal(\"30\"))",
        "replacement": "days_needed = int(months_needed * Decimal(\"31\"))"
    },
    {
        "id": "MUT-04",
        "name": "Tier 1 vs Tier 2 Paise Boundary Mutation",
        "desc": "Change paise > 0 to paise >= 0, causing whole rupee amounts to enter Tier 1 instead of Tier 2",
        "target": "if paise > Decimal(\"0\"):",
        "replacement": "if paise >= Decimal(\"0\"):"
    },
    {
        "id": "MUT-05",
        "name": "Roundup Eligibility Threshold Strict Inequality",
        "desc": "Change balance >= threshold to balance > threshold, failing boundary balance",
        "target": "return current_balance >= threshold",
        "replacement": "return current_balance > threshold"
    },
    {
        "id": "MUT-06",
        "name": "Accelerated Savings Options Decrement Velocity",
        "desc": "Subtract extra contribution instead of adding it",
        "target": "effective_vel = max(base_velocity, Decimal(\"0\")) + inc",
        "replacement": "effective_vel = max(base_velocity, Decimal(\"0\")) - inc"
    }
]

def main():
    if not RULE_ENGINE.exists():
        print(f"Error: {RULE_ENGINE} does not exist.", file=sys.stderr)
        sys.exit(1)

    original_code = RULE_ENGINE.read_text()
    print("=" * 70)
    print("REPRODUCIBLE MUTATION TESTING SUITE FOR RULE_ENGINE.PY")
    print(f"Target file: {RULE_ENGINE}")
    print(f"Total mutations evaluated: {len(MUTATIONS)}")
    print("=" * 70)

    results = []

    for m in MUTATIONS:
        print(f"\nEvaluating {m['id']}: {m['name']}...")
        if m["target"] not in original_code:
            print(f"  [ERROR] Target string not found in {RULE_ENGINE}!", file=sys.stderr)
            sys.exit(1)

        mutated_code = original_code.replace(m["target"], m["replacement"], 1)
        RULE_ENGINE.write_text(mutated_code)

        try:
            res = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pytest",
                    "backend/tests/test_rule_engine_units.py",
                    "backend/tests/test_rule_engine_hypothesis.py",
                    "-q",
                    "--tb=short",
                    "-o",
                    "hypothesis_max_examples=10"
                ],
                capture_output=True,
                text=True
            )
        finally:
            RULE_ENGINE.write_text(original_code)

        killed = res.returncode != 0
        status = "KILLED" if killed else "SURVIVED"
        print(f"  Result: {status} (exit code {res.returncode})")

        failing = [
            line.strip()
            for line in res.stdout.splitlines()
            if line.startswith("FAILED") or "assert" in line or "Error" in line
        ]

        results.append({
            "mutation": m,
            "status": status,
            "killed": killed,
            "failing": failing[:4]
        })

    print("\n" + "=" * 70)
    print("MUTATION SUMMARY REPORT")
    print("=" * 70)
    killed_count = sum(1 for r in results if r["killed"])
    survived_count = len(results) - killed_count
    kill_rate = (killed_count / len(results)) * 100

    print(f"Total Mutants:    {len(results)}")
    print(f"Mutants Killed:   {killed_count}")
    print(f"Mutants Survived: {survived_count}")
    print(f"Mutation Score:   {kill_rate:.1f}%\n")

    for r in results:
        m = r["mutation"]
        print(f"[{r['status']}] {m['id']}: {m['name']}")
        print(f"       Target:      {m['target']}")
        print(f"       Replacement: {m['replacement']}")
        if r["failing"]:
            print(f"       Caught by:   {r['failing'][0]}")

    if survived_count > 0:
        sys.exit(1)

if __name__ == "__main__":
    main()
