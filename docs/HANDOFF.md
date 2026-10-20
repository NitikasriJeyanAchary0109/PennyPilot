# PennyPilot — Agent Handoff Document

> **Generated:** 2026-10-20
> **Verified with:** `git branch -vv`, `git log --oneline --graph --all -40`, `git worktree list`, `git status` run in `/Users/nitikasri/ConsumerLiterarcyTrack-1` (main repo root).
> **Commit target:** `integrate/base` only.

---

## 1. Branch Map

| Branch | Tip commit | Pushed to origin? | Description |
|---|---|---|---|
| `main` | `0dd13bb8e` | ✅ yes (`origin/main` = `515006afc`, local main is 9 behind) | Local `main` ref is stale — do not use for new work |
| `phase-0-hygiene` | `0e5064880` | ❓ not confirmed | Phase 0 hygiene (dual .env, sqlite thread flag, dev CORS). **Not merged to origin/main yet.** |
| `phase-1-tests-ci` | `60d195b22` | ✅ yes (`origin/phase-1-tests-ci`) | Phase 1 tests + CI; merged to origin/main via PR #24 |
| `phase-1b-zero-arithmetic` | `60d195b22` | ✅ yes (`origin/phase-1b-zero-arithmetic`) | Same tip as `phase-1-tests-ci`; Phase 1.5 zero-arithmetic enforcement |
| `integrate/base` | `bb28830e8` | ❌ local only — **ahead of origin/main by 10 commits** | Integration baseline: venv untracked, CI pinned, bcrypt==5.0.0, rounds=12, Python 3.9, migration 006 |
| `integrate/ui-pennypilot` | `aca2a5d5a` | ❌ local only | Backend + UI rebased onto integrate/base; Penny Pilot branding, black/type annotations |
| `integrate/ui-production` | `572fc495e` | ❌ local only | Production UI layer rebased onto integrate/ui-pennypilot tip; UX audit, zero-arithmetic figures |
| `ui-pennypilot` | `aca2a5d5a` | ❌ local only | Checked out in main worktree (`/Users/nitikasri/ConsumerLiterarcyTrack-1`) |
| `ui-production` | `572fc495e` | ❌ local only | Checked out in worktree `.worktrees/ui-production` |

### Worktrees (as of handoff)

| Path | Branch |
|---|---|
| `/Users/nitikasri/ConsumerLiterarcyTrack-1` | `ui-pennypilot` |
| `/Users/nitikasri/ConsumerLiterarcyTrack-1/.worktrees/phase-1-tests-ci` | `phase-1b-zero-arithmetic` |
| `/Users/nitikasri/ConsumerLiterarcyTrack-1/.worktrees/ui-production` | `ui-production` |
| `/Users/nitikasri/pp-integrate` | `integrate/ui-production` |

---

## 2. What Is Merged on origin/main vs Local Only

### Merged on `origin/main` (SHA `515006afc`)

| Phase | PR | Description |
|---|---|---|
| Phase 0 (partial) | #22 (hello) | Earlier hygiene work merged into main |
| Phase 1 + 1.5 | #24 | 63 tests, 86.30% coverage, zero-arithmetic contract enforcement, roundups fix |

> **Note:** Phase 0's three "dev-convenience" commits (dual .env, SQLite thread flag, dev CORS) are on `phase-0-hygiene` (`0e5064880`) and **have not been merged** to `origin/main`. They should be committed separately when ready.

### Local Only (not pushed, not merged)

- `integrate/base` — 10 commits ahead of `origin/main`: venv untracking, pinned CI, Docker tag `pennypilot-backend:ci`, README Caddyfile relative link, `bcrypt==5.0.0`/no passlib, Python 3.9, mutation harness, migration 006 (roundup -> round_up normalization).
- `integrate/ui-pennypilot` — rebased UI + backend with Penny Pilot branding, black formatting.
- `integrate/ui-production` — production UX layer, docs/ux audit, zero-arithmetic figures.

---

## 3. Rules for Every Agent

1. **Work only in your own worktree.** Never run `git` commands in another agent's folder.
2. **Only Agent A pushes or rebases.** No other agent may run `git push`, `git rebase`, or `git merge` targeting shared branches.
3. **Never force-push** (`--force` / `--force-with-lease`) to any branch without explicit user approval.
4. **Evidence files must be raw command output.** Capture the exact command and its stdout/stderr. Never hand-write or paraphrase numbers.
5. **The LLM never calculates.** `rule_engine.py` precomputes every figure (savings totals, round-up amounts, projections, budgets). The LLM only formats and narrates — it must never be given raw numbers and asked to add, subtract, compare, project, or rank them.
6. **Never invent metrics.** Every number in a report must come from a real run with evidence saved under `docs/evidence/`.
7. **Do not change migrations 001–006.** Alembic migrations are append-only. If a data fix is needed, add migration 007+.
8. **Keep DB name `sparechange`** in all connection strings and Alembic env files. User-facing brand is **Penny Pilot** everywhere.
9. **No real Ollama calls in tests.** Mock `call_llama` with `httpx` mocks. No paid APIs.
10. **Do not touch:** `frontend/`, `prompts.py`, `main.py`, `config.py`, `docker-compose.yml`, `alembic.ini` — unless the current phase explicitly calls for it.

---

## 4. Key Facts

| Fact | Value |
|---|---|
| Python version | **3.9** (pinned in `pyproject.toml` and CI) |
| bcrypt | `bcrypt==5.0.0`, `rounds=12` (no passlib) |
| App scheme | `pennypilot://` |
| App slug | `penny-pilot` |
| Frontend package name | `penny-pilot-frontend` |
| DB name (connection) | `sparechange` |
| User-facing brand | **Penny Pilot** |
| GitHub repo name | `PennyPilot` (renamed from SpareChange) |
| UX audit file | `docs/ux/audit.md` |
| Mock data inventory | `docs/ux/mock_data_inventory.md` |
| Zero-arithmetic audit | `docs/audit/zero_arithmetic.md` |
| Mutation evidence | `docs/evidence/integration/mutmut.txt` |
| Savings source enum | `Literal["round_up", "manual", "transfer"]` — normalised via Pydantic before-validator on input |
| Migration 006 | Normalises existing "roundup" rows to "round_up" in SQLite and Postgres |
| CORS | Dev CORS regex must match localhost/Expo dev origins only — never `.*` with credentials |
| Docker image tag | `pennypilot-backend:ci` |
| Backup tags | `backup/integrate-base-pre-rebase`, `backup/ui-pennypilot-pre-rebase`, `backup/ui-production-pre-rebase` |

---

## 5. Open Items

> Items are ordered by risk, highest first.

### Blocking / High Risk

1. **`integrate/base` not pushed — CI not proven on it.**
   `integrate/base` is 10 commits ahead of `origin/main` and has never had a green CI run. Before any PR, push this branch and confirm all 15 CI steps pass (including Docker build).

2. **`phase-0-hygiene` uncommitted changes need a clean, separate commit.**
   The three dev-convenience changes (dual .env lookup, SQLite thread flag, dev CORS) are on `phase-0-hygiene` (`0e5064880`) and should be committed with a restricted CORS regex (localhost/Expo origins only, never `.*`) before being merged. Confirm the exact regex is in the commit.

3. **`roundups.py` savings_source filter: verify `"round_up"` end-to-end.**
   Phase 1.5 changed the filter to `"roundup"`, and Phase 1B normalised it back to `"round_up"`. The stats endpoint must be tested with an actual database row whose `savings_source = "round_up"` before merging.

### Medium Risk

4. **`git show --stat a86fd7d4a` — confirm which `.env` files were ever tracked.**
   Commit `a86fd7d4a` is titled "remove .env and ignore generated files". The exact filenames removed must be listed. If a real `.env` with `GOOGLE_CLIENT_SECRET` or `JWT_SECRET` was ever tracked, those secrets must be rotated before any public push.

5. **`bcrypt` test provenance in CI.**
   The passlib backward-compatibility test was replaced with a genuine passlib test. Confirm CI runs only the genuine test, not any synthetic hash.

6. **`make eval` points at nonexistent `backend/evals/`.**
   This is a placeholder. Phase 2 (eval harness) must create that directory before `make eval` is used in CI.

7. **`ui-pennypilot` has staged deletions of CI workflow and test files.**
   `git status` in the main worktree shows `deleted: .github/workflows/ci.yml` and all Phase 1/1.5 test files staged. This must be reviewed before any commit — these deletions appear to be rebase artefacts and must not be committed to `integrate/ui-pennypilot`.

### Low Risk / Informational

8. **Local `main` is 9 commits behind `origin/main`.**
   Run `git fetch origin && git merge --ff-only origin/main` on the local `main` branch when convenient. Do not use local `main` as a base for new branches.

9. **`pp-integrate` worktree is on `integrate/ui-production`, not `integrate/base`.**
   Agent work on `integrate/base` requires either a separate worktree or a branch switch in `pp-integrate`. Prefer a dedicated worktree to avoid accidental branch switching.

10. **GitHub remote URL may need updating to `PennyPilot`.**
    The repo was renamed on GitHub. Run `git remote set-url origin https://github.com/NitikasriJeyanAchary0109/PennyPilot.git` when ready. GitHub redirects the old URL, so this is low priority but should be done before CI secrets are updated.

---

*End of handoff document.*
