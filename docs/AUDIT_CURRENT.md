# Penny Pilot — Current-State Audit

Point-in-time audit of branch `ui-pennypilot` at commit `08231ca18` (2026-10-23), working tree clean.
This is a fresh pass over the code *as it is now*; the history of what was fixed earlier is in
[`AUDIT_REPORT.md`](AUDIT_REPORT.md). Ratings are my judgement, backed by the evidence in §2.

---

## 1. Scorecard

| Area | Rating | Why |
|---|---|---|
| **Money correctness** | 🟢 Good | Deterministic `Decimal` rule engine, property-tested; budgets, scores and projections use real windows; ledger can't go negative or be edited directly. |
| **Honesty of the UI** | 🟢 Good | No API call returns substitute data on failure (enforced by Jest tests); simulated rows are labelled; limits of the product (no bank, no money movement) are stated in the UI. |
| **Authentication** | 🟡 Solid, gaps remain | 15-min access tokens, rotating refresh with replay detection, session-wide logout, login throttling, Google ID-token verification. Gaps: no throttling on register / Google / refresh, no password reset. |
| **Dependencies** | 🔴 Needs attention | Known advisories in `python-multipart` (6), `python-jose`, `python-dotenv`, and in frontend `axios` (runtime) plus 70 npm findings overall (mostly build tooling). See A1–A4. |
| **Data / deployment** | 🟢 Good | Migrations 001–008 build exactly the model schema on PostgreSQL (checked by `scripts/check_schema.py`, wired into CI); container migrates on start; production refuses a default JWT secret. |
| **Test coverage** | 🟡 Good backend, thin frontend | Backend 168 tests, 93 % line coverage. Frontend: 30 unit tests on the API/session layer only; no screen/component tests. Tests run on SQLite. |
| **Maintainability** | 🟡 Fair | Clear layering, but dead API surface, a legacy DB-touching helper inside the "pure" rule engine, stale TODOs, and no UI for several implemented features. |

---

## 2. What was verified in this audit

| Check | Result |
|---|---|
| `ruff`, `black --check`, `mypy backend/app` | clean (53 files / 37 sources) |
| `pytest` with coverage | **168 passed**, 93 % (CI gate 85 %) |
| `tsc --noEmit` | clean |
| Jest | **30 passed** |
| `pip-audit` on `requirements.txt` | **8 advisories in 3 packages** (A1–A3) |
| `npm audit --omit=dev` | **70 findings** (1 critical, 55 high, 14 moderate) — triaged in A4 |
| Secret scan of tracked files | clean (only the `GOCSPX-your_…` placeholder in `.env.example`) |
| Token logging in the app | none (only a "failed to read token" error, no value) |
| Migrations → schema vs models (PostgreSQL 18) | "Schema matches the models" for fresh, `create_all`-built, old-schema-with-data and re-run paths (run earlier this session; code unchanged since) |
| Dead API surface | computed by comparing FastAPI routes with what the app calls (C2) |

**Not verifiable here:** visual rendering on a device/simulator, real Ollama output and latency, a live Google sign-in, the pytest suite on PostgreSQL, behaviour under concurrent load.

---

## 3. Findings

Severity: **High** = exploitable or wrong results in normal use · **Medium** = real risk or gap, needs scheduling · **Low** = hygiene.

### Dependencies and supply chain

| # | Sev | Finding | Recommendation |
|---|---|---|---|
| A1 | **Medium** | `python-multipart 0.0.20` has 6 advisories (5 denial-of-service in multipart / form parsing, 1 path traversal that needs non-default `UPLOAD_*` options we don't use). It parses **every login form and every CSV upload**. Fixed in 0.0.31. | Bump to ≥ 0.0.31, re-run tests. Cheap and low-risk. |
| A2 | **Low–Medium** | `python-jose 3.5.0` (JWT library) — advisory PYSEC-2026-4298: HMAC verification accepts asymmetric public-key material, letting someone who holds a service's *public key* forge HS256 tokens. **Not exploitable as configured** (HS256 with a random symmetric secret; no public key exists), but there is no fixed release and the library is lightly maintained. | Move to PyJWT or `authlib.jose` (Authlib is already a dependency). Contained change in `utils/security.py`. |
| A3 | Low | `python-dotenv 1.2.1`: `set_key()` follows symlinks (needs a local attacker; we only read `.env`). | Bump to ≥ 1.2.2 with A1. |
| A4 | **Medium** | Frontend: `axios ^1.6.8` has high-severity advisories (prototype-pollution gadgets in the fetch adapter / default instance) and it **ships in the app**. The other 69 findings are almost all transitive Expo / React Native / Jest **build-time** tooling (including the one *critical*, `shell-quote` command injection, reached through dev tooling, not the shipped bundle). | Bump `axios` to the latest 1.x now. Run `npm audit fix` (non-breaking). Treat the Expo SDK / RN upgrade as planned maintenance, not an emergency. |

### Authentication and abuse

| # | Sev | Finding | Recommendation |
|---|---|---|---|
| A5 | **Medium** | Only password login is throttled. `POST /auth/register`, `/auth/google`, `/auth/refresh` are not. Register also answers "already exists", so it can be used to test whether an email has an account. Refresh tokens are 384-bit random, so guessing them isn't realistic; the concern is volume (account spam, hashing cost, DB growth). | Reuse `AttemptLimiter` per IP on register / Google; consider a generic "account created" response + email verification. |
| A6 | Low | (a) Access tokens issued **before** the session-id change have no `sid` and are checked by `jti` only; they die at most 24 h after deploy. (b) `SessionMiddleware` and the JWT use the same `JWT_SECRET` (no key separation). | (a) none needed; (b) derive a second secret or drop the session middleware if Authlib's flow allows. |
| A7 | Low | CORS regex allows any `localhost` / `127.0.0.1` origin **with credentials**, in production too. The app authenticates with bearer tokens, not cookies, so the practical risk is small. | Only add the regex when `ENVIRONMENT != production`. |
| A8 | Low | No password-reset / account-recovery flow, and no change-password endpoint. A student who forgets a password is locked out. `/auth/logout-all` exists but the app has no button for it. | Plan reset by email; add "Sign out of all devices" to Profile. |
| A9 | Info | A refresh response lost in transit makes the retry look like a replay and signs the user out once (deliberately strict). | Accept, or add a short grace window. |

### Product / UX gaps (implemented in the API, missing in the app)

| # | Sev | Finding |
|---|---|---|
| B1 | **Medium** | There is **no way to delete or edit a goal, edit or delete a transaction, or fix a wrong category** from the UI, although the endpoints exist. Auto-categorisation (keyword rules) will sometimes be wrong, and the student cannot correct it. This is the most user-visible gap now. |
| B2 | Low | Notifications can be read but not cleared; no notification preferences. |
| B3 | Low | The stress-score benchmarks (₹3,000 healthy savings, ₹15,000 spend cap) are fixed numbers, not relative to the student's income. A student on a ₹5,000 allowance will always look "stressed". |

### Maintainability

| # | Sev | Finding | Recommendation |
|---|---|---|---|
| C1 | Medium | `rule_engine.py` declares "NEVER … makes any network/DB I/O" but `apply_roundup_if_eligible` (a legacy shim in the same file) **writes to the database**, and the file is ~800 lines. The contract is violated in the one place it matters most. | Move that function to `services/ledger.py`; keep `rule_engine` pure so the contract holds again. |
| C2 | Low | Dead surface: `/api/calculations/*` (4 endpoints), `/api/stress/`, `/api/goal/{id}/forecast`, `POST /api/forecast/`, and the app methods `deleteGoal`, `forecastSavings`, `getRoundups`, `logoutEverywhere` have no caller. Most are covered by tests, so they will keep costing maintenance. `net-savings-rate` and `goal-feasibility` would suit the Goal detail screen. | Either surface them in the UI or delete them (the deprecated ones are already flagged in OpenAPI). |
| C3 | Low | Stale comments: "confirm with Member 1" TODOs in `negotiator.py` and `rule_engine.py`; `create_refresh_token` / `decode_refresh_token` (JWT refresh) are unused now that refresh tokens are opaque. | Delete. |
| C4 | Low | Largest files: `rule_engine.py` 797 lines, `HomeScreen.tsx` 716, `SubscriptionNegotiatorScreen.tsx` 643. Home now holds three features (log purchase, sandbox, dashboard). | Split Home into cards when next touched. |

### Testing

| # | Sev | Finding |
|---|---|---|
| D1 | Medium | Tests run on SQLite only. PostgreSQL behaviour (row locking via `with_for_update`, `Numeric` handling, case-insensitive `lower()` filters) is exercised only by the manual end-to-end runs. **Add a CI job that runs pytest against the Postgres service** that CI already starts for the migration check. |
| D2 | Low | Weakest backend modules: `google_auth.py` 70 % (network-error and bad-payload branches), `database.py` 67 %, `wellness.py` 81 %, `goals.py` 83 %, `calculations.py` 83 %. |
| D3 | Low | No screen-level frontend tests; UI regressions (e.g. a screen reading the wrong field, as the Round-up Tracker once did) would not be caught. |

---

## 4. Residual-risk summary

- **Highest value, lowest effort:** bump `python-multipart` + `python-dotenv` + `axios` (A1, A3, A4) — one PR, then re-run both test suites.
- **Next:** category/goal/transaction editing in the app (B1); throttle register / Google (A5); run pytest on Postgres in CI (D1).
- **Scheduled maintenance:** replace `python-jose` (A2); plan password reset (A8); Expo SDK upgrade for the transitive npm findings (A4); move the legacy round-up helper out of the rule engine (C1).
- **Product boundary, unchanged:** no live bank connection and no real money movement. The app now says so wherever it matters, and offers a statement-import + sandbox substitute.

## 5. Suggested order of work

| Order | Item | Effort |
|---|---|---|
| 1 | Dependency bumps (A1, A3, A4), re-test | ½ day |
| 2 | CI: pytest against PostgreSQL (D1) | ½ day |
| 3 | Edit/delete goal & transaction + recategorise UI (B1) | 2–3 days |
| 4 | Throttle register/Google; CORS regex only outside production (A5, A7) | ½ day |
| 5 | Move `apply_roundup_if_eligible` to `ledger.py`; delete dead code and stale TODOs (C1–C3) | ½–1 day |
| 6 | Replace `python-jose` (A2) | 1 day |
| 7 | Password reset + sign-out-everywhere button (A8) | 2–3 days |
