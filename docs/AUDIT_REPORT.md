# Penny Pilot — Full-Codebase Audit & Honest Report

Date: 2026-10-23 · Branch: `ui-pennypilot` · Scope: `backend/` (FastAPI) and `frontend/` (Expo / React Native)

---

## 1. What the product is supposed to do

Penny Pilot is a **micro-savings and financial-literacy app for college students**. The problem it
targets: students find budgeting tedious and discouraging, so they never build a savings habit.

The intended solution has four parts:

1. **Round-ups** — each debit is rounded up (₹127.60 → ₹0.40; ₹145 → ₹5) and the difference goes into a savings goal.
2. **Deterministic money math** — the backend (`rule_engine.py`) computes every figure. The LLM (Ollama / Llama 3) only phrases results. This is the "Zero-Arithmetic" rule.
3. **Goals, budgets, insights** — progress, forecast dates, budget status, a wellness/stress score.
4. **A private AI coach** — chat grounded in the student's own transactions, goals and budgets.

## 2. Honest verdict

**The core is sound; the surface around it was not trustworthy.**

- Good: the rule engine is pure, `Decimal`-based, unit- and property-tested. The round-up math, budget status, forecast and stress formulas are correct. Ownership checks (`user_id`) are consistent across every router, and the zero-arithmetic prompt contract is genuinely tested.
- Bad: a large share of what the UI *showed* was invented, simulated, or silently substituted when an API call failed. Several screens told the user something happened (money "transferred to your bank", a subscription "paused", a CSV "analyzed") that did not happen. One endpoint let anyone sign in as anyone.
- The reason it looked fine: `api.ts` wrapped many calls in `try/catch` that returned plausible fake data, and some backend endpoints fabricated records or text. Failures were hidden rather than shown.

Everything below was verified against the code, not assumed. Section 7 lists what I could **not** verify.

---

## 3. Findings and what was done

Severity: **Critical** = security/data-integrity or a claim that is false to the user · **High** = wrong numbers or broken feature · **Medium** = misleading/fragile · **Low** = polish.

### 3.1 Security

| # | Sev | Finding | Fix |
|---|---|---|---|
| S1 | **Critical** | `POST /api/auth/google` trusted `email` / `oauth_id` sent by the client and returned a JWT. Anyone could sign in as any user by knowing their email. | Now requires a Google **ID token** and verifies it with Google (`services/google_auth.py`): audience must match `GOOGLE_CLIENT_ID`, email must be verified; the identity comes from Google's response, never the request body. Returns 503 if Google sign-in isn't configured. |
| S2 | High | Server would boot in production with the default `JWT_SECRET="dev-secret-key"` (also signs the session cookie). | `assert_production_ready()` refuses to start with `ENVIRONMENT=production` and a default / <32-char secret. |
| S3 | Medium | Registration accepted no password at all (account that can never log in) and no length rule; frontend said 6 chars. | Password required, ≥ 8 chars, enforced server-side; frontend text matches. |
| S4 | Medium | Emails were case-sensitive (`A@x.com` and `a@x.com` could both register; login failed for mixed case). | Emails are stored lowercase; lookups are case-insensitive. |
| S5 | Medium | `ALLOWED_ORIGINS` setting existed but was ignored (hard-coded dev origins), so a deployed web client would be blocked. | CORS now reads `ALLOWED_ORIGINS`; `*` is ignored because credentials are enabled. |
| S6 | Low | Health endpoint returned raw DB exception text; `create_all()` ran in production, bypassing Alembic. | Generic status + server-side log; `create_all` only outside production. |
| S7 | Medium | Chat message and CSV upload had no size limits (cost/DoS). | Chat 1–1000 chars; CSV ≤ 2 MB; transaction list `limit` ≤ 200. |
| S8 | Medium | The frontend never validated a stored token and never signed the user out on 401 (it cleared storage but UI state stayed "logged in", so every screen silently failed). | Session is verified with `/auth/me` on launch; any 401 signs out; onboarding state comes from the server. |

### 3.2 Backend — wrong numbers and broken behaviour

| # | Sev | Finding | Fix |
|---|---|---|---|
| B1 | High | **Budgets never rolled over.** Spent was computed only for the period containing the budget's *creation date*, so from the next month on every budget showed ₹0 spent forever. | Spent is computed for the *current* month / 7-day window (`ledger.get_period_bounds`). |
| B2 | High | Budgets counted **credits (income)** as spending, and matched category case-sensitively (`Food` ≠ `food`). | Only debits count; category match is case-insensitive. |
| B3 | High | `stress-score`, `wellness`, `goal-feasibility` divided **all-time** savings/spend by 30 days, inflating every score. | All use a true last-30-day (or requested timeframe) window; withdrawals and goal-reallocations are excluded from the savings rate. |
| B4 | High | `round-up-projection` reported the average round-up **per transaction** as "average monthly round-up". | Uses actual round-up deposits over the last 90 days, scaled to a month. |
| B5 | High | Round-ups used a **hard-coded ₹150 checking balance** for the safety check, so the "protect from overdraft" rule did nothing. | Balance is estimated from the student's own records (income − spend − saved). If they've recorded no income the balance is *unknown* and the check is skipped, not faked. |
| B6 | High | Round-ups fired on **credit** transactions (income), and could deposit into **deleted, abandoned or completed** goals (fallback query ignored `is_deleted`). | Only debits; only the oldest *active, non-deleted* goal; opt-out flag for bookkeeping entries (`apply_roundup=false`). |
| B7 | High | Force-deleting a goal wrote `source="goal_reallocation"`, which the response schema rejected → **`GET /savings/` and `/savings/summary` returned HTTP 500** afterwards. | Valid sources extended (`withdrawal`, `goal_reallocation`); clients still can't forge them. |
| B8 | High | Goals never became `completed`; `PUT /goals/{id}` let a client overwrite `current_amount`, bypassing the ledger. | Status flips automatically (and notifies); `current_amount` is no longer editable. |
| B9 | High | Goals with no savings history returned the internal sentinel `9999-12-31` as `projected_completion_date`; the UI showed "December 31, 9999". | Returned as `null`; UI says "Not enough recent savings to project". |
| B10 | Medium | No validation: negative/zero amounts, unknown transaction `type`, blank category/merchant, savings ≤ 0, balances could go negative. | Pydantic + endpoint validation; balances floored at 0. |
| B11 | Medium | **Notifications were never created anywhere** — the screen could only ever be empty. | Created on goal completion, budget exceeded, and withdrawals; `POST /notifications/read-all` added. |
| B12 | Medium | Transaction creation blocked on the LLM for up to ~2 minutes when Ollama was down. | Explanation call is capped at 8 s; falls back to a factual sentence built from the real figures and labelled `explanation_source: "template"`. |
| B13 | Medium | Dream-engine forecasts (`/goal/{id}/forecast`) ignored deleted goals and used "last 60 rows" as "30 days". | Shared 30-day, goal-specific velocity helper. |
| B14 | Medium | Cached "Dream Engine" rows leaked into the coach chat history. | Filtered out of `/coach/history`. |
| B15 | Low | `call_llama` default model ignored `OLLAMA_MODEL`. | Uses the setting. |
| B16 | Medium | CSV import: header `date` rejected, no way to import income, `Infinity` amounts accepted. | `date` alias, optional `type` column (`debit`/`credit`), non-finite amounts rejected. |

### 3.3 Fabricated / hard-coded data (the "hard-coded pages" you asked about)

| # | Where | What was fake | Now |
|---|---|---|---|
| H1 | `api.ts: withdrawGoal` + Emergency Withdrawal screen | Endpoint `/goals/{id}/withdraw` **did not exist**; on failure the client returned `{success:true}` and the screen said *"₹X has been transferred to your primary bank account"*. Nothing moved or was recorded. | Real endpoint: reduces the goal, writes a negative ledger row, audit-logs, notifies. Wording says it is **recorded in Penny Pilot, not a bank transfer**. |
| H2 | `api.ts: askAdvisor` + Chat "Wealth Advisor" | Endpoint `/advisor/ask` **did not exist**; failure returned an invented *"HDFC Nifty 50 Index Fund, Low Risk, 12.5% p.a."* card — fabricated investment advice with a return figure. | Real `/advisor/ask`, **education-only** (system prompt forbids product recommendations and return quotes) with a disclaimer. Tab renamed "Money Basics". 503 when AI is down. |
| H3 | Subscription screen + `negotiator.py` | Backend returned Spotify/Amazon/Netflix/YouTube as "active subscriptions" with default prices for **every** user; "Sync API" **inserted fake transactions** (type `"expense"`, so they weren't even counted) into the ledger; `/suggest` used an invented ₹199 and a made-up "days sooner" formula; the client also had a hard-coded copy as a fallback. | Subscriptions are detected **only from the user's own transactions** (one per merchant, latest charge). "Rescan" is read-only. `/suggest` removed; "pause" is evaluated by the rule engine (goal date with vs without the saved amount). |
| H4 | Subscription "Pause" button | Alert said *"Successfully scheduled a pause… we will redirect ₹X to your savings"*. No such feature. | Button is "How to pause" and says plainly that Penny Pilot can't pause provider subscriptions. |
| H5 | `evaluatePurchase` fallback | When the API failed, the **client computed "advice"** (`price/150` days, `price*3` redirected) — fake numbers and a breach of the zero-arithmetic rule. | Removed; the error is shown. Budget status now has `no_budget` instead of reporting "safe" when no budget exists. |
| H6 | Insights screen | Wellness defaults **85 / 20** shown whenever the API failed; the "Savings Growth Trajectory" chart was a **static SVG path** with a permanent green "Healthy" chip and "Week 1–4" labels. | Scores are `--` with a retry card on failure. Chart is drawn from real weekly totals (`GET /savings/trend`) with real dates; honest empty state. |
| H7 | `wellness.py` | On AI failure it saved (and cached for 24 h) *"Your spending is stable, and micro-savings are actively channeling spare change into your goals"* — a claim unrelated to the data. | Falls back to a plain statement of the computed score and risk factors. Narrative is reused only if the score is unchanged and < 1 h old (was 24 h regardless of data/timeframe). |
| H8 | Home screen | Notification dot **always on**; "Good morning" at any hour; "Micro-savings active" regardless of state; totals set to `₹0.00` when the request failed; "Simulate card swipe". | Unread count from the API; time-aware greeting; subtitle reflects whether a goal exists; failures show a notice instead of zeros; "Log a purchase". |
| H9 | Round-up Tracker | Count read the wrong key (`roundup_count` vs `roundup_transactions_count`) → **always 0**; `round_up_amount` was dropped by the API adapter → every row showed ₹0.00; "Multiplier 1x Standard" and "Active" were static; the three filter tabs did nothing; list showed all transactions. | Fixed keys/adapter; filters are applied by the backend; list shows only transactions that produced a round-up; static badges removed. |
| H10 | CSV upload | A **timer** drove a fake progress bar; after 2.8 s it navigated on regardless of whether the upload succeeded (errors were swallowed); help text described a format (negative = expense, `Date` column) the backend rejected; cards claimed "parsed locally" and "AI categorization". | Awaits the real upload, shows imported / skipped counts and per-row errors, only continues on success; help text matches the parser; claims corrected. |
| H11 | Manual setup (onboarding) | Selecting "Rent" silently recorded a **₹8,000** transaction (tuition ₹12,000, etc.) — preset amounts written into the user's ledger as if they'd entered them. | Student types each amount; entries skip round-ups; retries don't duplicate. |
| H12 | Chat | Coach forgot everything on leaving the tab; reply fallback strings ("Keep building your daily savings streak!") masqueraded as AI output. | History restored from `/coach/history`; errors show the server's message. |
| H13 | Profile | "Security & Privacy" and "Help & FAQ" rows did nothing. | Removed rather than leaving dead buttons. |
| H14 | Goal detail | "Withdraw to your primary bank account at any time" (no bank connection). | Reworded to match reality. |
| H15 | Budgets vs purchase form | Budgets offered Coffee/Dining/Textbooks; the purchase form offered Food/Education/Transport — so a budget could never track what the student logged. | Shared category list + free-text category on budgets. |
| H16 | `README.md` | Claimed "pre-drafted cancellation letters/scripts" (don't exist) and that without Ollama the app "automatically activates graceful fallback heuristics" (AI endpoints return 503). | Corrected. |

Hard-coded values that remain **by design** (not fabricated results): quick-pick amounts (₹500, ₹1,000 on withdrawal), goal templates on Create Goal, placeholder text, `₹0` validation messages, and the benchmark constants in `stress_score` (₹3,000 healthy savings, ₹15,000 spend cap — named, documented, tunable, but arbitrary).

### 3.4 Not security/logic, but fixed along the way
- `Header` bell defaulted to "unread" for every screen that forgot to pass the prop.
- Create-goal from the Goals tab never navigated back (it only made sense during onboarding).
- Home screen re-fetched everything on each category tap (a callback depended on `category`) and fetched twice on mount.
- Goals list made one extra request per goal; the list endpoint now returns `progress_percentage`.
- Auth: login/register no longer toggle the global loading flag (it unmounted the whole navigator and wiped the form on a failed login). Dead "guest" login (token `"guest"` → every call 401) removed.

### 3.5 Follow-up pass (the former "open items")

| # | Item | What was done |
|---|---|---|
| F1 | **Alembic could not build a working database** (found when I ran the app on real PostgreSQL). Migrations 001–006 left out `users.university/oauth_*`, `goals.status`, `savings.goal_id`, `user_sessions.jwt_token_id`, `audit_logs.user_id/entity_*`, `notifications.type`, and the whole current shape of `budgets`. Registering a user on a migrated database returned HTTP 500. Production relies on Alembic, so a `docker compose` deployment could not have worked. | Migration **007** (PostgreSQL only; SQLite dev DBs still use `create_all`) adds everything missing and keeps the old budgets table as `budgets_legacy` instead of dropping it. `scripts/migrate.py` runs before the API starts: fresh DB → upgrade, DB previously made by `create_all` → stamp, Alembic-managed → upgrade. The Dockerfile now runs it; CI builds the schema on a Postgres service and asserts no model column is missing. Verified on PostgreSQL 18, all three paths. |
| F2 | No logout / token revocation (the `user_sessions` table was designed for it but unused). | Each login stores the token's `jti` + expiry on its session. New `POST /auth/logout` revokes just that token; the auth middleware rejects revoked tokens. The app calls it on sign-out. |
| F3 | No login throttling. | 5 failed passwords per (address, email) in 15 min → HTTP 429 with `Retry-After`; success resets the count. In-process memory (no new infrastructure) — see "still open". |
| F4 | JWT stored in plain AsyncStorage. | `tokenStorage`: Keychain / Keystore via `expo-secure-store` on iOS/Android, AsyncStorage on web. Tokens saved by older versions are migrated automatically. |
| F5 | LLM replies could stop mid-sentence at the 120-token cap. | Token limit is now `OLLAMA_NUM_PREDICT` (default 160); when Ollama reports it stopped for length the reply is cut back to its last complete sentence (numbers like ₹1,200.50 are respected). |
| F6 | Purchase evaluator assumed the cost came out of the goal's saved balance (and clamped at ₹0, understating the delay). | Spending is treated as money not saved: the goal date is recomputed with the price added to what's left, at the student's real 30-day savings rate. |
| F7 | CSV import committed row-by-row and importing the same statement twice doubled every transaction and round-up. | Whole file is one transaction (all or nothing); rows already present (same day, amount, description, direction) are skipped and reported as `duplicates_skipped`. |
| F8 | Duplicate endpoints. | `POST /forecast/`, `GET /goal/{id}/forecast`, `POST /coach/chat` are marked deprecated in OpenAPI and point to the canonical route. Not removed, so nothing breaks. |
| F9 | No frontend tests. | Jest (`jest-expo`) suite: error-message mapping, "API failure never yields substitute data" for every call that used to fake one, adapter fields, 401 sign-out, token storage on device/web. CI runs it. |

### 3.6 Third pass — sessions, migrations, bank statements

| # | Item | What was done |
|---|---|---|
| G1 | **Access tokens lasted 24 h and logout only killed one token.** | Access tokens now last **15 minutes** (`ACCESS_TOKEN_EXPIRE_MINUTES=15`; local `.env` files updated). Login also returns a **rotating, single-use refresh token** (opaque random value; only its SHA-256 hash is stored, with the previous hash kept for replay detection). `POST /auth/refresh` swaps it for a new pair; presenting an already-used refresh token is treated as theft and **revokes the whole session** (logged as a high-severity security event). |
| G2 | Logout design. | Access tokens carry the session id (`sid`). `POST /auth/logout` revokes the **session** — so every access token and the refresh token from that login die at once, not just the presented token — and works even if the access token has already expired (it accepts the expired-but-validly-signed token, or the refresh token in the body). `POST /auth/logout-all` signs the account out everywhere. |
| G3 | App side of the above. | A 401 triggers one silent refresh (concurrent requests share a single refresh, because tokens are single-use) and replays the request; only if that fails is the user signed out. Both tokens live in the Keychain / Keystore. Google sign-in now puts only a **single-use refresh token** in the `pennypilot://` link (no access token); the app redeems it immediately, which makes the URL value worthless afterwards. |
| G4 | **"Fix the migration part."** Two more problems found while testing every start-up path on PostgreSQL: the migrated schema still differed from the models in small ways, and `create_all`-built databases would have been stamped as current even if they pre-dated new columns. | Migration **008** adds the refresh-token columns and `transactions.source`, relaxes nullability the models allow, and renames three stale indexes; it is idempotent. `scripts/migrate.py` now stamps unversioned databases at **007** and then upgrades, so old `create_all` databases receive 008. New `scripts/check_schema.py` compares the live schema with the models; CI runs it after migrating (replacing the earlier column-presence check). Verified on PostgreSQL 18: fresh DB, a `create_all` DB, a DB built from the previous models **with a user row in it** (row preserved), and a re-run — all end with "Schema matches the models". (A first draft used a 38-character revision id; `alembic_version` is `varchar(32)`, so it was shortened before it could ship.) |
| G5 | **Bank statement CSV.** Only a bespoke template was accepted, and real exports use other headers. | The parser reads HDFC/ICICI/SBI-style files as they come (`Date`, `Narration`, `Withdrawal Amt.` / `Deposit Amt.`, `Dr`/`Cr`, ₹ / `Rs.` / commas, day-first dates). When there is no category column, `services/categorizer.py` infers one from the narration with a transparent keyword table (Swiggy → Food, Uber → Transport…; unknown → "Other"; money in → "Income") and cleans the merchant name. A realistic 81-row, 3-month sample is in `docs/samples/bank_statement_sample.csv`. Imported rows are stored with `source="csv_import"`. |
| G6 | **Analyse past spending behaviour.** | `GET /api/analysis/spending` → `rule_engine.spending_profile` (deterministic, per calendar month with data): average monthly income / spend / left-over, spend-to-income %, category breakdown with share and a **suggested budget** (typical month rounded up to ₹50), **recurring charges** (same merchant in ≥ 2 months at similar amounts), weekend share, largest purchase, and **what round-ups would have added up to per month**. New "Your Spending Habits" screen shows it right after an import (then continues to goal creation during onboarding) and can create the suggested budgets in one tap (existing budgets are left alone). Simulated rows are excluded from the analysis. |
| G7 | **Simulate a bank transaction.** | `POST /api/bank/simulate` invents the next payment a bank feed might deliver **from the student's own history only**: a merchant weighted by how often they use it, at an amount near what they really paid there (fixed-price merchants such as Netflix are charged exactly their price). It then goes through the *same* pipeline as a manual purchase (round-up into the goal, budget alert, audit) via a shared `record_transaction`. Rows are stored as `source="bank_simulation"`, shown with a "Simulated" label, ignored by the analysis and never used as training history for later simulations. Needs an imported statement (409 otherwise); can be disabled with `BANK_SIMULATION_ENABLED=false`. Home has a "Bank sandbox" card (Import statement / Simulate a payment / See my spending habits). |

---

## 4. Behaviour changes you should know about

1. **`/auth/google` contract changed** to `{ "id_token": "..." }`. The mobile app doesn't call it (it uses the browser flow via `/auth/google/login`), so nothing in the app breaks; any other client must send an ID token. `GOOGLE_CLIENT_ID` must be set (comma-separate multiple client IDs).
2. **I replaced the subscription-sync behaviour you had added in your working tree** (and its test). It injected simulated transactions; I rewrote that test to assert the opposite (nothing is invented, sync is read-only). The `/negotiator/suggest` endpoint was removed.
3. **Budgets are now "current period" budgets.** Tests in `test_budgets.py` and `test_calculations.py` were pinned to August 2026 dates and encoded the old bug; I made their fixtures relative to *now*.
4. `PUT /goals/{id}` ignores `current_amount`. Balances move only via savings / round-ups / withdrawals.
5. Passwords must be ≥ 8 characters.
6. **A new migration (007) is required on PostgreSQL** and the container now runs it on start. Migrations 001–006 are untouched. `docker compose` now needs `JWT_SECRET` set in `.env` (it fails fast with a message instead of using a placeholder). Existing databases created by the old `create_all` start-up are detected and stamped, not re-created.
7. **Access tokens now expire after 15 minutes** and the login response gained `refresh_token` and `expires_in`. Any API client other than the app must call `POST /auth/refresh`. Logout ends the whole login session (all its tokens); other devices are unaffected.
8. Run migration 008 on PostgreSQL (the container does it on start). `transactions` has a new `source` column.
9. `POST /auth/logout` now accepts a refresh token in the body and no longer requires a valid access token.

---

## 5. Verification actually performed

| Check | Result |
|---|---|
| Backend tests | **168 passed** (was 81), 93 % coverage (CI gate is 85 %). 34 new regression tests in `backend/tests/test_audit_fixes.py` covering the bugs above; existing tests rewritten where they asserted the old behaviour (Google sign-in, subscription sync, round-up projection, date-pinned budget/stress fixtures — see §4). |
| `ruff`, `black --check`, `mypy backend/app` | clean |
| Frontend `tsc --noEmit` | clean (20 screens included) |
| Frontend Jest | 30 tests passed (adds: silent refresh + replay, one shared refresh for concurrent 401s, sign-out when the refresh is rejected, no retry loops, logout sends the refresh token) |
| PostgreSQL 18 | `alembic upgrade head`, fresh / `create_all`-built / re-run paths all OK; then end-to-end flows ran against it with `ENVIRONMENT=production` and no server errors: register → login → goal → CSV import ×2 → withdrawal → budget → wellness → logout → throttle, and bank-statement import (81 rows, 78 round-ups) → spending analysis → 2 simulated payments → refresh rotation → replay revoking the session → logout |
| Web bundle (`expo export --platform web`) | succeeds — every screen compiles and bundles |
| Live server smoke test (uvicorn + curl, SQLite) | register → login → goal → purchase (round-up + template explanation) → goal list with progress → withdrawal → trend → notification all returned correct data; `/auth/google` with the old body now 422; advisor returns 503 when Ollama is unreachable |

## 6. Still open — not fixed

- **No live bank connection.** What now exists is the honest substitute: import a real statement CSV, analyse it, and simulate payments arriving from the student's own pattern. Connecting actual accounts needs a regulated provider (e.g. an Account Aggregator) and is a separate project. Round-ups remain a ledger entry; no money moves.
- **Auth, remaining:** the login limiter is per process (use Redis for several workers). A refresh response lost in transit (phone loses signal mid-request) makes the next attempt look like a replay and signs the user out — the safe failure mode, at the cost of one re-login. There is no account-recovery / password-reset flow.
- **Categorisation is keyword-based.** It covers common Indian merchants and UPI narrations; anything else becomes "Other" and must be recategorised by hand (there is no edit-category screen yet, only the API).
- **Stress-score benchmarks** (₹3,000 healthy savings, ₹15,000 spend cap) are fixed constants, not scaled to income — a product decision.
- **Stale visuals:** `docs/screenshots/` and README images show the old UI. They need re-capturing from a running app. `docs/HANDOFF.md` is from 2026-10-20.
- **Loose files:** git-ignored `*.db` files in the repo root / `backend/` are clutter and may hold real data.

## 7. What I could not verify

- **No visual check on a device or simulator.** I verified types, unit tests, bundling, and the API; `expo-secure-store` (native only) was verified through its tests with the module mocked, not on a device; I did not look at the screens rendered. Layout of the changed screens (Insights chart, Round-up Tracker, Manual setup amount fields, Budgets custom-category input) should be eyeballed.
- **Ollama / real LLM output** — tests and the smoke run mock or fail the LLM. Prompt quality and latency on your machine are untested.
- **Google OAuth against Google** — the verification path is unit-tested with Google's response mocked; I did not run a live sign-in.
- **The pytest suite on PostgreSQL** — the test fixtures are SQLite. Migrations and the end-to-end flows were run on PostgreSQL 18 (§5), but not every test; row-locking (`with_for_update`) is only exercised there under a single client.
- **Real bank exports beyond the sample.** The parser is tested on HDFC-style headers and a few variants; a statement with an unusual layout (extra header lines above the table, multi-line narrations) may be rejected with a clear error rather than imported wrongly.
- WCAG "100% verified" (README badge) — I did not re-run the contrast scripts or audit screen-reader behaviour.
