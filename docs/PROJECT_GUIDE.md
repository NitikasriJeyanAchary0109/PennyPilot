# Penny Pilot — Project Guide

A study guide to the finished project (state of commit `08231ca18`): what it is, the stack and why,
how a user moves through it, how the code moves with them, and the concepts to remember.
Read §1–§2 for the idea, §4–§5 to connect flow to code, §6–§8 as a reference sheet.

---

## 1. What the project is (no code)

**Penny Pilot is a savings coach for college students.** It does four jobs:

1. **Turns spare change into savings.** Every time the student spends money, the app rounds the
   payment up (₹127.60 → ₹128, so ₹0.40 is "spare") and puts the difference toward a savings goal
   they chose — a laptop, a trip, an emergency cushion.
2. **Learns from their past spending.** The student imports a bank statement (a CSV). The app sorts
   every payment into a category, shows a "typical month", where the money goes, which charges
   repeat (Netflix, Spotify, hostel mess), and what round-ups *would have* saved.
3. **Keeps them on budget and explains it kindly.** Category budgets with alerts; a 0–100 wellness
   score; a plain-language AI coach and purchase advisor ("should I buy this? how much would it delay
   my laptop?"), built to be encouraging, never shaming.
4. **Never lies about money.** All numbers are calculated by ordinary program code, never by the AI.
   If something can't be known (no bank connection, AI offline), the app says so instead of inventing it.

**What it is not:** it is not connected to a real bank and never moves real money. Goals, savings and
withdrawals are *records inside Penny Pilot*. To let students still experience the full loop, it has a
**bank sandbox**: import a real statement, then "simulate a payment" that behaves like one arriving
from the bank, modelled on their own history and clearly labelled *Simulated*.

### The user's story, in plain words

1. **Sign up / sign in** (email + password, or Google).
2. **Onboarding:** tell the app about your money — either type your monthly income and recurring costs,
   or upload a bank statement — then create your first savings goal.
3. **See your habits:** the Spending Habits screen summarises the statement and offers one-tap budgets.
4. **Daily use:** log a purchase (or simulate a bank payment) → a round-up goes to the goal → a budget
   alert may fire → a notification appears.
5. **Check in:** Goals (progress + forecast date), Insights (wellness score + weekly savings chart),
   Chat (coach, and a money-basics tutor), Subscriptions (what repeats, what pausing would do).
6. **Emergencies:** release money from a goal; it is recorded, the goal and history stay accurate.
7. **Sign out** ends that login everywhere it was issued.

---

## 2. The stack, and what each choice buys this project

| Layer | Technology | Role in Penny Pilot | Benefit here |
|---|---|---|---|
| Mobile/web app | **React Native + Expo (SDK 54)**, TypeScript | One codebase for iOS, Android and web | Students use phones; Expo gives fast iteration, Keychain/Keystore (`expo-secure-store`), file picker (CSV), haptics, deep links — and a web build for demos |
| Styling | **NativeWind (Tailwind for RN)** | The warm cream / forest-green design system | Consistent design tokens, small class-based styles, accessible contrast values in one config |
| Navigation | **React Navigation** (stack + bottom tabs) | Auth stack ↔ onboarding stack ↔ main app | Screens swap automatically with login / onboarding state |
| HTTP client | **axios** + interceptors | Talks to the API; attaches the token; silently refreshes it | One place for the "401 → refresh → retry → else sign out" logic |
| API server | **FastAPI** (Python 3.9) | All business logic and endpoints | Typed request/response models (Pydantic), automatic validation (422), auto-generated `/docs`, async for slow AI calls |
| Validation | **Pydantic v2** | Schemas: amounts > 0, `debit`/`credit`, password ≥ 8, message ≤ 1000 chars | Bad input is rejected before it reaches money code |
| Database access | **SQLAlchemy 2** ORM | Models, queries, ownership filters | Same code runs on SQLite (dev/tests) and PostgreSQL (production); `Numeric(12,2)` for money |
| Database | **PostgreSQL** (prod) / **SQLite** (dev, tests) | Persistent store | Real transactions & row locks in prod; zero-setup in dev |
| Migrations | **Alembic** (+ `scripts/migrate.py`, `check_schema.py`) | Versioned schema changes | Reproducible databases; CI proves migrations = models |
| Money math | **Python `Decimal`** | Every amount | No floating-point drift (₹0.1 + ₹0.2 = ₹0.30 exactly) |
| Data import | **pandas** | Reads bank CSVs | Tolerant parsing of messy real-world files |
| Passwords | **bcrypt** (12 rounds) | Password hashes | Slow on purpose; resists brute force |
| Tokens | **JWT (python-jose, HS256)** + **opaque refresh tokens** (SHA-256 hashed in DB) | Login sessions | Short-lived access (15 min) limits theft damage; rotating refresh keeps users signed in; server-side sessions allow real logout |
| Google sign-in | **Authlib** + Google ID-token verification | Optional login | Identity is verified with Google, never trusted from the client |
| AI | **Ollama running Llama 3** (local) via `httpx` | Coach, advisor, narrations | Private (data stays on your machine/server), free, no cloud API key |
| Testing | **pytest** (+ hypothesis property tests), **Jest (jest-expo)** | 166 backend + 30 frontend tests | Rules like "round-up never negative" are proven for thousands of generated inputs |
| Quality gates | **ruff, black, mypy**, GitHub Actions CI | Lint, format, types, tests, Postgres schema check, Docker build | Regressions caught before merge |
| Packaging | **Docker + docker-compose**, Caddy reverse proxy | Production stack: API + Postgres + Ollama + HTTPS | One command to run it all; migrations run on start |

**Why this combination is a good fit (the short version):**
FastAPI + Pydantic + Decimal gives *correct, validated money handling*; Ollama gives *private AI*;
Expo gives *one app for every platform*; Alembic + CI gives *a database you can trust to rebuild*.

---

## 3. Architecture at a glance

```
┌────────────────────────── Phone / Web (Expo, React Native, TypeScript) ──────────────────────────┐
│  Screens (src/screens)  →  apiService (src/services/api.ts)  →  axios + interceptors            │
│       ▲  AuthContext (login state)        tokenStorage (Keychain/Keystore)                       │
└───────┼──────────────────────────────────────────────┬───────────────────────────────────────────┘
        │ shows backend numbers only                   │ HTTPS  /api/...   (Bearer access token)
        │                                              ▼
┌──────────────────────────────── FastAPI backend (backend/app) ──────────────────────────────────┐
│ main.py: CORS, health, includes routers                                                          │
│ middleware/auth_middleware.py: who is calling? (JWT + session still valid?)                      │
│ routers/*  (HTTP layer: validate → call services → shape response)                              │
│     auth · transactions · goals · savings · budgets · roundups · analysis · bank · negotiator    │
│     wellness · chat/coach/advisor · notifications · calculations · users                         │
│ services/*  (the actual logic)                                                                   │
│     rule_engine.py   ← pure maths: round-ups, budgets, forecasts, scores, spending profile       │
│     ledger.py        ← DB helpers: windows, goal choice, balance estimate, alerts, notifications │
│     csv_parser.py + categorizer.py ← bank CSV → clean transactions                               │
│     bank_sim.py      ← invents the next sandbox payment from history                             │
│     ai_engine.py     ← the ONLY code that talks to the LLM                                       │
│     google_auth.py   ← verifies Google ID tokens                                                 │
│ models/models.py + schemas/schemas.py  (tables)         (request/response shapes)                │
└───────────────┬───────────────────────────────────────────────────────────────┬──────────────────┘
                ▼ SQLAlchemy                                                    ▼ HTTP (httpx)
        PostgreSQL / SQLite                                              Ollama (Llama 3)
```

**The one rule that shapes everything — "Zero-Arithmetic":**
*numbers come from `rule_engine.py` (deterministic code); the LLM only phrases them; the app only shows them.*
That is why prompts receive pre-computed values, the frontend never computes totals or percentages, and
there are tests (`test_zero_arithmetic_contract.py`) that check prompts contain only supplied numbers.

---

## 4. Project flow ↔ code flow (follow one action end to end)

Notation: **Screen → `apiService.method` → `METHOD /api/path` → router → services → tables**.

### 4.1 Register and sign in
- **Screen** `RegisterScreen` / `LoginScreen` → `AuthContext.register / login` (calls axios directly, no token yet).
- **API** `POST /auth/register` → `auth.register`: password ≥ 8 (Pydantic), email lower-cased, duplicate check,
  `bcrypt` hash → `users` row (`role="student"`; role from the request is ignored).
- **API** `POST /auth/login/json` → `_authenticate`: **throttle check** (`utils/rate_limit.py`: 5 failures per
  address+email per 15 min → 429) → verify bcrypt → `issue_session`.
- **`issue_session`**: creates a `user_sessions` row (device, IP, expiry), generates a random **refresh token**
  (stores only its SHA-256), mints a **15-minute JWT** carrying `sid` (session id), writes a `security_events` "login".
- **Back in the app**: `AuthContext` saves both tokens via `tokenStorage` (Keychain/Keystore), sets state →
  `RootNavigator` swaps to onboarding or the main app depending on `has_completed_onboarding`.
- **Google**: browser flow `GET /auth/google/login` → callback verifies with Google → deep link
  `pennypilot://oauth?refresh_token=…` (single-use) → `LoginScreen` → `AuthContext.loginWithRefreshToken` →
  `/auth/refresh` redeems it for real tokens.

### 4.2 Every authenticated request (and why you stay signed in)
1. `api.ts` **request interceptor** reads the access token from `tokenStorage` → `Authorization: Bearer …`.
2. Backend `get_current_user` (`auth_middleware.py`): verify JWT signature/expiry → load session by `sid` →
   reject if revoked → load user. `require_student` then checks the role.
3. If the token expired (15 min) the server returns **401** → the **response interceptor** calls
   `refreshSession()` once (concurrent requests *share* that one call, because refresh tokens are single-use) →
   `POST /auth/refresh` **rotates** both tokens → the original request is **replayed**. User notices nothing.
4. If refresh is rejected (expired, revoked, or **replayed** → server revokes the session) → tokens cleared →
   `unauthorizedHandler` → `AuthContext` clears state → Login screen.
5. **Logout**: `apiService.logout()` sends the refresh token → `POST /auth/logout` revokes the *session*
   (all its tokens). Works even if the access token already expired. `logout-all` revokes every session.

### 4.3 Onboarding — telling the app about your money
- **Choice screen** `SpendingEntryChoice` → two paths:
  - **Manual** `ManualIncomeExpenseScreen`: income + typed amounts for ticked recurring costs →
    `createTransaction` (income as `credit`, costs as `debit`, `applyRoundup:false` because these are
    bookkeeping, not purchases).
  - **Bank statement** `CSVUploadScreen` → `uploadStatement` → `POST /transactions/upload` (see 4.4).
- **First goal** `CreateGoalScreen` → `POST /goals/` → `completeOnboarding` → `PATCH /users/me/onboarding-complete`
  → flag saved on the server (source of truth) → navigator switches to the main app.

### 4.4 Import a bank statement (CSV)
1. `DocumentPicker` → `FormData` → `POST /transactions/upload` (`transactions.upload_bank_statement`).
2. Guards: `.csv`, ≤ 2 MB.
3. **`csv_parser.parse_transactions_csv`** (pandas): normalises headers (Narration/Particulars → description,
   Withdrawal/Debit and Deposit/Credit → amount + type, Dr/Cr, ₹/Rs./commas, day-first dates). Row errors are
   collected, valid rows kept.
4. **`categorizer.categorize`** (only if no category column): keyword table → category + merchant label
   (`UPI-SWIGGY-…` → Food / Swiggy). Money in → Income. Unknown → Other.
5. **De-duplication**: rows matching an existing transaction (same day, amount, description, direction) are
   skipped and counted (`duplicates_skipped`), so re-importing is safe.
6. **All-or-nothing**: the whole file is one DB transaction. Failure → rollback, "nothing was saved".
7. **History only**: imported rows never create round-ups or touch a goal — nothing was set aside when those
   purchases happened, so crediting savings would be false. Round-ups start with *new* spending (4.5, 4.7).
8. Rows stored with `source="csv_import"`; response includes counts and per-row errors → app shows them →
   navigates to **Spending Habits**.

### 4.5 A purchase becomes a round-up (the heart of the app)
Triggered by **Home → "Log purchase"** (`createTransaction`) or **"Simulate a payment"** (4.7); both call the
same backend function **`record_transaction`** in `transactions.py`:
1. Validate (`TransactionCreate`): amount > 0, `debit|credit`, non-blank category/merchant.
2. Insert `transactions` row + `audit_logs` entry.
3. **Is a round-up allowed?** debit only, `apply_roundup` true, and `ledger.pick_roundup_goal` finds the oldest
   *active, non-deleted* goal.
4. **`rule_engine.calculate_roundup`**: has paise → up to next rupee; whole rupees → up to next multiple of ₹10
   (₹145 → ₹5; ₹150 → ₹10).
5. **Safety check**: `ledger.estimate_checking_balance` = income − spend − saved (only if the student recorded
   income; otherwise "unknown" and the check is skipped). Below ₹20 → round-up paused with a reason.
6. **`apply_roundup_if_eligible`**: adds to `goals.current_amount`, inserts a `savings` row
   (`source="round_up"`, linked to the transaction). `ledger.sync_goal_status` flips the goal to *completed*
   (+ notification) when full.
7. **Explanation**: try the LLM for one sentence (8 s cap). Its reply is **checked** (see "AI output guard" below);
   if it is slow, offline, or contains a number it wasn't given → a factual template built from the real
   figures, labelled `explanation_source: "template"`.
8. `ledger.check_budget_alert` → if that category's current-period spend exceeds its limit → `notifications` row.
9. Response → Home shows "+₹0.40 saved" banner, refreshes totals from the backend.

### 4.6 Spending Habits (analysis of past behaviour)
`SpendingAnalysisScreen` → `getSpendingAnalysis` → `GET /analysis/spending` → loads the student's non-deleted,
**non-simulated** transactions → **`rule_engine.spending_profile`**: months with data; average monthly income,
spend, left-over; spend-to-income %; top categories with share % and **suggested budget** (monthly average rounded
up to ₹50); **recurring merchants** (≥ 2 months, amounts within 1.25×); weekend share; largest purchase;
**estimated monthly round-up** (round-up of every debit ÷ months). "Create budgets" posts one budget per category
(409 duplicates are left alone).

### 4.7 Bank sandbox — "simulate a payment"
`HomeScreen.handleSimulateBankTransaction` → `simulateBankTransaction` → `POST /bank/simulate` (`bank.py`):
read recent real debits (never simulated ones) → **`bank_sim.pick_simulated_purchase`**: pick a merchant weighted by
how often it was used, take one of its past amounts, jitter ±10% (unless the merchant always charged one fixed
amount, e.g. Netflix) → `record_transaction(source="bank_simulation")` → identical pipeline to 4.5. No history → 409
"import a statement first". Can be disabled by `BANK_SIMULATION_ENABLED`.

### 4.8 Goals, forecast, withdrawal
- **Goals tab** `GET /goals/` → each goal with `progress_percentage` (computed server-side).
- **Detail** `GET /goals/{id}` → `compute_goal_details`: velocity = last-30-day deposits into that goal →
  `rule_engine.goal_forecast` → projected date (or `null` if no recent savings) and, separately,
  `GET /goals/{id}/forecast` → the same numbers narrated by the LLM (503 if offline — no fake text).
- **Withdraw** `EmergencyWithdrawalScreen` → `POST /goals/{id}/withdraw`: lock the goal row, check amount ≤ balance,
  reduce `current_amount`, insert a **negative** `savings` row (`source="withdrawal"`), audit log, notification.
  The UI says plainly it is recorded in Penny Pilot, not a bank transfer.
- Goal balance can **never be edited directly**; it only moves through deposits, round-ups, withdrawals.

### 4.9 Budgets
`BudgetsScreen` → `/budgets/`: spent = sum of **debits** in the **current** month (or 7-day window anchored on the
start date) for the category, case-insensitive (`ledger.calculate_spent_amount`). `rule_engine.budget_status`:
< 70 % safe, 70–100 % warning, ≥ 100 % exceeded.

### 4.10 Insights and wellness score
`InsightsScreen` → `POST /wellness/score` → `_calculate_wellness_metrics` (last 30 days: savings rate, spend rate,
budget overruns) → `rule_engine.stress_score` (40 % savings deficit + 40 % spend level + 20 % overruns) →
health = 100 − stress. **Returned immediately** with a plain *factual* summary (`summary_source: "factual"`).
The screen then calls `POST /wellness/narrate/{report_id}` in the background: the LLM gets 20 s and its reply must
pass the numbers check; on success the summary is replaced (`summary_source: "ai"`), otherwise the plain
summary stays. A stored report (and its AI text) is reused only if the score is unchanged and < 1 h old. The weekly chart comes from
`GET /savings/trend` (backend buckets deposits by week; the app only draws).

### 4.11 Chat
`ChatScreen` has two modes:
- **Coach** `POST /chat/`: `_load_context` gathers the last 5 debits, active goals, budgets with status →
  `prompts.coach_user_prompt` (numbers pre-computed) → `ai_engine.call_llama` → saved in `chat_history`;
  history restored on open via `GET /coach/history` (internal forecast rows filtered out).
- **Money Basics** `POST /advisor/ask`: education only — the system prompt forbids naming products or quoting
  returns; reply carries a disclaimer.
Both return **503** if Ollama is down; the app shows the server's message.

### 4.12 Subscriptions and "should I buy this?"
`SubscriptionNegotiatorScreen`: `GET /negotiator/subscriptions` → `_detect_subscriptions` scans the student's own
debits (known streaming merchants + "Subscription" categories), one entry per merchant, latest charge. Then
`POST /negotiator/evaluate` with `kind`:
- **purchase**: budget status *including* the price (`no_budget` if none) + goal impact (price treated as unsaved
  money → goal date recomputed) → LLM phrases advice.
- **pause**: budget status as-is + "how many days sooner would the goal be reached if this monthly amount were
  saved" → LLM. The app is explicit that it **cannot** pause the subscription for you.

### 4.13 Notifications
Created in `ledger.notify` (deduplicated while unread) on: goal completed, budget exceeded, withdrawal.
`GET /notifications/`, `PATCH /{id}/read`, `POST /read-all`. Home's bell dot = "any unread".

---

## 5. Data model (tables ↔ meaning)

| Table | Holds | Key points |
|---|---|---|
| `users` | account | unique lower-case email, bcrypt hash (null for Google), `has_completed_onboarding` |
| `user_sessions` | one row per login/device | `jwt_token_id`, `refresh_token_hash`, `previous_refresh_token_hash`, expiries, `revoked_at` |
| `security_events` | audit trail of auth | login, logout, logout_all, `refresh_token_reuse` (high severity) |
| `transactions` | money in/out | `type` debit/credit, `category`, `merchant`, `source` (manual / csv_import / bank_simulation), `round_up_amount`, soft-delete `is_deleted` |
| `goals` | savings targets | `target_amount`, `current_amount`, `status` active/completed/abandoned, soft-delete |
| `savings` | the **ledger** of deposits | `source` round_up / manual / transfer (+ withdrawal, goal_reallocation), linked to goal and to the triggering transaction; withdrawals are negative |
| `budgets` | category limits | monthly/weekly, soft-delete |
| `notifications` | in-app alerts | `type`, `status` unread/read |
| `chat_history` | coach turns (also caches goal forecasts) | |
| `financial_health` | wellness reports | scores + narrative |
| `ai_recommendations` | negotiator advice log | |
| `audit_logs` | who did what to what | action, entity, metadata |

Relationships: `users` 1─* everything; `savings.goal_id → goals`; `savings.triggered_by_transaction_id → transactions`.

---

## 6. Concepts ↔ where they live in the code

| Concept | Idea | Where |
|---|---|---|
| **Zero-Arithmetic rule** | Only deterministic code makes numbers; AI phrases, UI displays | `services/rule_engine.py`, `utils/prompts.py`, `tests/test_zero_arithmetic_contract.py` |
| **Decimal money** | Exact decimal arithmetic, 2 dp | `Numeric(12,2)` in `models.py`; `Decimal` everywhere in services |
| **Round-up (two-tier)** | paise → next rupee; whole → next ₹10 | `rule_engine.calculate_roundup` |
| **Ledger** | Balances change only via recorded entries | `savings` table + `goals.current_amount` kept in sync by `ledger.py`, `savings.py`, `goals.withdraw_from_goal` |
| **Soft delete** | Hide, don't erase (audit, reversal) | `is_deleted` on goals/transactions/budgets |
| **Ownership scoping** | Every query filters by the caller's `user_id`; others get 404 | all routers |
| **Role dependency** | `require_student` guards routes | `auth_middleware.RoleChecker` |
| **Short-lived access + rotating refresh** | Limit theft window; keep UX smooth | `auth.issue_session`, `/auth/refresh`, `api.ts` interceptors |
| **Replay detection** | Used refresh token reappearing = theft → kill session | `refresh_tokens` in `auth.py` (`previous_refresh_token_hash`) |
| **Session-based revocation** | Logout kills all tokens of a login | `sid` claim + check in `get_current_user` |
| **Throttling** | Slow password guessing | `utils/rate_limit.AttemptLimiter` |
| **Token-at-rest security** | Credentials in Keychain/Keystore | `services/tokenStorage.ts` |
| **Never trust the client for identity** | Verify Google token server-side | `services/google_auth.py` |
| **Honest failure** | No invented data when something fails | `api.ts` (throws), `ai_engine` raises `AIEngineError` → 503, wellness/round-up template fallbacks |
| **Deterministic fallback, labelled** | Factual sentence from real figures | `transactions._roundup_explanation`, `wellness._factual_summary` |
| **AI output guard** | The model may only repeat numbers it was given; a reply with any other figure is retried once, then rejected | `services/ai_guard.py`, `ai_engine.call_llama` (+ `UngroundedReplyError`, `user_facing_error`) |
| **History vs new spending** | Imports are analysis-only; only new spending rounds up | `transactions.upload_bank_statement` vs `record_transaction` |
| **Fast path / slow path** | Deterministic numbers first, AI text second | `wellness._report_for`, `/wellness/narrate`, `InsightsScreen.narrate` |
| **Time-boxed AI** | Slow LLM never blocks money actions | `asyncio.wait_for` (8 s round-up, 20 s wellness), 60 s + 1 retry in `ai_engine` |
| **Windows, not all-time** | Rates use last 30 days | `ledger.recent_savings_amounts`, `recent_debit_total` |
| **Budget period** | Current month / 7-day window | `ledger.get_period_bounds` |
| **Idempotent import** | Same file twice = no duplicates | `transactions._import_key` + `Counter` |
| **Atomic import** | One DB transaction | `upload_bank_statement` (`commit=False`, single commit) |
| **Provenance (`source`)** | Know where each row came from | `transactions.source`; sandbox rows excluded from analysis |
| **Sandbox** | Safe stand-in for a bank feed | `services/bank_sim.py`, `routers/bank.py` |
| **Auto-categorisation** | Transparent keyword rules | `services/categorizer.py` |
| **Migrations = models** | DB built from scripts equals the ORM | `alembic/versions/001–008`, `scripts/migrate.py`, `scripts/check_schema.py`, CI |
| **Production guard** | No default secret in prod | `config.assert_production_ready` |
| **Single source of truth for state** | Server decides onboarding / balances | `AuthContext` re-reads `/auth/me` on launch |

---

## 7. Where things live (file map)

```
backend/app/
  main.py                    app setup, CORS, routers
  config.py                  settings (.env), production guard
  database.py                engine / session
  models/models.py           tables          schemas/schemas.py   request/response shapes
  middleware/auth_middleware.py   current user, roles, session check
  routers/   auth  transactions  goals  savings  budgets  roundups  analysis  bank
             negotiator  wellness  chat  coach  advisor  dream  forecast  notifications
             calculations  users
  services/  rule_engine  ledger  csv_parser  categorizer  bank_sim  ai_engine  google_auth
  utils/     security (JWT, bcrypt, refresh hashing)  rate_limit  prompts
backend/alembic/versions/    001…008 migrations     backend/scripts/  migrate.py  check_schema.py
backend/tests/               pytest suites          docs/samples/     bank_statement_sample.csv

frontend/App.tsx             providers + navigator
frontend/src/navigation/RootNavigator.tsx   auth ▸ onboarding ▸ main
frontend/src/context/AuthContext.tsx        login state
frontend/src/services/  api.ts (all calls, interceptors)  tokenStorage.ts
frontend/src/screens/   auth · onboarding · student (Home, Goals, GoalDetail, Insights, Chat, Profile,
                        Budgets, RoundupTracker, SubscriptionNegotiator, EmergencyWithdrawal,
                        Notifications, SpendingAnalysis, CreateGoal, Manual…)
frontend/src/components/ui/  Button Card Chip Header ProgressBar Skeleton …   constants/categories.ts
frontend/src/__tests__/      Jest
```

---

## 8. Numbers and rules to remember

| Rule | Value |
|---|---|
| Access token lifetime | **15 min** |
| Refresh token | opaque, 64 chars, single-use, rotates, **30-day** sliding expiry |
| Login throttle | **5** failures / **15 min** per address+email → 429 |
| Password | ≥ **8** chars, bcrypt 12 rounds |
| Round-up | paise → next ₹1; whole ₹ → next multiple of ₹10 |
| Round-up safety threshold | skip if estimated balance **< ₹20** (skipped entirely if no income recorded) |
| Budget status | **< 70 %** safe · **70–100 %** warning · **≥ 100 %** exceeded |
| Stress score | 40 % savings deficit + 40 % spend + 20 % overruns; benchmarks ₹3,000 / ₹15,000; health = 100 − stress |
| Savings velocity / forecast | last **30 days** → monthly rate → date; none ⇒ "no projection" |
| Round-up projection | average of last **90 days** of real round-ups |
| Recurring charge | same merchant in ≥ **2** months, max/min ≤ **1.25** |
| Suggested budget | monthly average rounded **up to ₹50** |
| Simulation jitter | ±**10 %**, none for fixed-price merchants |
| CSV | ≤ **2 MB**; list pages ≤ **200** rows; chat ≤ **1000** chars |
| AI limits | reply ≤ 160 tokens (cut to last full sentence); 60 s timeout, 1 retry on timeout/5xx; **1 retry if the reply contains a number not in the prompt**; 8 s / 20 s caps on side narrations |

---

## 9. Twelve things to be able to say from memory

1. Penny Pilot rounds up students' spending into savings goals and coaches them kindly.
2. **Backend decides every number; AI only phrases; app only shows** (Zero-Arithmetic).
3. FastAPI + SQLAlchemy + Pydantic on the server; Expo/React Native/TypeScript on the client; Ollama (Llama 3) for private AI.
4. Money is `Decimal` and `Numeric(12,2)` — never floats.
5. Round-up = next rupee (if paise) or next ₹10 (if whole), added to the oldest active goal, through the **savings ledger**.
6. Balances only change via recorded entries (deposits, round-ups, withdrawals) — never by editing a total.
7. Sign-in = bcrypt check (throttled) → 15-min JWT with a session id + rotating refresh token.
8. The app refreshes silently on 401; a **replayed** refresh token kills the whole session; logout revokes the session.
9. Bank CSV → parser → keyword categoriser → de-dupe → atomic import → analysis (typical month, categories, recurring, round-up potential).
10. The **sandbox** simulates a payment from the student's own history, labelled `bank_simulation`, excluded from analysis.
11. When something isn't known (no bank, AI offline) the app says so — no invented data, ever (tested).
12. Migrations 001–008 + `check_schema.py` guarantee the PostgreSQL schema equals the models; the container migrates on start.

---

## 10. Honest boundaries (what the finished project still isn't)

- Not connected to a real bank; no real money moves.
- Auto-categorisation is keyword-based; wrong guesses need manual correction (the app has no edit-category screen yet).
- Local LLM quality and speed depend on the machine running Ollama.
- Recommended follow-ups from the audit (dependency bumps, throttling register/Google, Postgres in CI, password reset) are listed in
  [`AUDIT_CURRENT.md`](AUDIT_CURRENT.md).
