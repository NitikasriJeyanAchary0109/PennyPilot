"""
Demo account for local development and presentations.

Creates (or tops up) a ready-to-use student: onboarding done, a savings goal, and
the sample bank statement imported, so every screen has data on first launch.
It goes through the real API, so round-ups, categories and budgets behave exactly
as they do for a normal user. The statement is imported as spending history only
(imports never create savings); a few simulated payments supply the round-ups. Idempotent: running it again adds nothing twice.

These credentials are for LOCAL DEVELOPMENT ONLY. `scripts/seed_demo.py` refuses
to run when ENVIRONMENT=production.
"""

from __future__ import annotations

import pathlib

DEMO_EMAIL = "demo@pennypilot.app"
DEMO_PASSWORD = "PennyDemo#2026"
DEMO_NAME = "Demo Student"
SIMULATED_PAYMENTS = 3
DEMO_GOAL = {"title": "New Laptop", "target_amount": 45000}
SAMPLE_STATEMENT = (
    pathlib.Path(__file__).resolve().parents[3]
    / "docs"
    / "samples"
    / "bank_statement_sample.csv"
)


def seed(client) -> dict:
    """Seed the demo student through `client` (a FastAPI TestClient / httpx client)."""
    client.post(
        "/api/auth/register",
        json={"full_name": DEMO_NAME, "email": DEMO_EMAIL, "password": DEMO_PASSWORD},
    )  # 400 "already exists" on later runs is fine
    login = client.post(
        "/api/auth/login/json", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}
    )
    login.raise_for_status()
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    goals = client.get("/api/goals/", headers=headers).json()
    if not any(g["title"] == DEMO_GOAL["title"] for g in goals):
        client.post("/api/goals/", json=DEMO_GOAL, headers=headers).raise_for_status()

    imported = client.post(
        "/api/transactions/upload",
        files={
            "file": (
                "bank_statement_sample.csv",
                SAMPLE_STATEMENT.read_bytes(),
                "text/csv",
            )
        },
        headers=headers,
    )
    imported.raise_for_status()

    # The imported statement is history (no savings). Give the demo some real
    # round-ups by simulating a few payments — once, so re-running adds nothing.
    existing = client.get("/api/transactions/?limit=200", headers=headers).json()
    simulated = 0
    if not any(t.get("source") == "bank_simulation" for t in existing):
        for _ in range(SIMULATED_PAYMENTS):
            client.post("/api/bank/simulate", headers=headers).raise_for_status()
            simulated += 1

    client.patch(
        "/api/users/me/onboarding-complete", headers=headers
    ).raise_for_status()
    return {
        "email": DEMO_EMAIL,
        "imported": imported.json()["imported_count"],
        "duplicates_skipped": imported.json()["duplicates_skipped"],
        "simulated": simulated,
    }
