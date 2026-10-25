# Penny Pilot — Final Honest Report

Written 2026-10-23, after three rounds of fixes (commits `3770e765d`, `3246a8d4b`, `08231ca18`) plus a few
uncommitted additions. This report says what is true, what I checked myself, what I did not, what I got
wrong along the way, and what I would worry about if this were my project. Where it conflicts with the
earlier reports, **this one wins** (they are partly out of date; see §8).

---

## 1. The verdict in plain words

**The project works end to end, and it is a lot more honest and safer than when I started — but it is not
yet what its own README promises, and "all tests pass" overstates how finished it is.**

What is genuinely good:
- The money maths is correct, exact (`Decimal`), and tested. Round-ups, budgets, forecasts and scores use
  real windows. Balances can only move through recorded entries.
- One serious security hole is closed (anyone could sign in as anyone). Sessions are now short-lived,
  revocable, and replay-detected. The database can be rebuilt from migrations and CI proves it matches the models.
- The UI no longer fabricates data when something fails. That is enforced by tests.
- I opened the running web app and the main flows work: sign-in state, Home, a simulated bank payment that
  rounds up into a goal, Spending Habits, and Insights.

What is **not** true yet (details in §4):
1. **The core promise "the AI never invents numbers" is only enforced on the way *in*.** In my live check the
   local model wrote "…save an additional **1%** of their daily spending…" — a figure nobody gave it.
2. **Importing an old bank statement credits "savings" that never happened** (₹473 from 78 "round-ups" on
   historical purchases).
3. **Insights shows a blank page for ~20 seconds** when the local AI is slow.
4. **Known vulnerable dependencies are still installed** (nothing was upgraded).

---

## 1b. Update — the first three findings have since been fixed

After this report was written, findings **4.1, 4.2 and 4.3** were addressed (uncommitted at the time of writing):

| Finding | What changed | How it was checked |
|---|---|---|
| **4.1 AI invents numbers** | Every LLM reply is now checked (`ai_guard.py`, inside `call_llama`): any figure not present in the text sent to the model — including spelled-out percentages — triggers one retry with a reminder, then rejection. Callers fall back to the factual template (round-up, wellness) or report the AI as unavailable with a distinct message (chat, advisor, negotiator, forecasts). | 21 new tests, incl. HTTP-level (chat/advisor 503 with the invented number absent from the response; round-up falls back to the template). **With the real local model** the guard rejected a first attempt containing invented "9" and "100" and accepted the retry. |
| **4.2 Phantom savings** | Statement imports are history only: no round-ups, no goal credit, no notifications. Demo account re-seeded (`seed_demo.py --reset`): Home now shows ₹1.78 from 3 round-ups (the three simulated payments) instead of ₹473 from 78. | Tests that an import changes no balance/savings/notification and that new spending afterwards still rounds up; seen live on Home and Insights. |
| **4.3 Blank Insights** | `POST /wellness/score` returns immediately with a plain summary; the AI narration is a separate background call (`/wellness/narrate/{id}`, migration 009 adds `summary_source`). Skeletons made visible. | Live: scores and chart appear in ~2–3 s with "Writing a friendlier summary…"; after the 20 s cap the plain summary stays (model was too slow). Migration 009 verified on PostgreSQL (fresh and `create_all`-built DBs). |

**New honest observation from that work:** on this machine the local model needs roughly **20–40 seconds** per
reply, so the 8 s (round-up) and 20 s (wellness) caps usually expire and the plain factual text is what users
see. The app handles that correctly, but the "AI coach" experience will feel slow or absent until a faster model /
GPU is used. Also, a live-check detail worth knowing: the Expo server I started earlier ran in `CI=1` mode, which
disables file watching — it kept serving stale code until restarted without it.

Current numbers: backend **188** tests / 93 % coverage, frontend **32** Jest tests, all linters clean.

---

## 2. What was delivered

| Round | Commit | Theme |
|---|---|---|
| 1 | `3770e765d` | Audit pass: auth hole closed, fabricated data removed, money maths corrected, new endpoints (withdrawal, trend, notifications, advisor) |
| 2 | `3246a8d4b` | Logout/throttling, secure token storage, CSV import made atomic + de-duplicated, migration 007, frontend tests |
| 3 | `08231ca18` | 15-min access tokens + rotating refresh, session logout, migration 008 + schema check, bank-statement import, spending analysis, bank sandbox |
| — | *uncommitted* | Dev-SQLite auto-upgrade, demo account seed, README note, three docs (`AUDIT_CURRENT`, `PROJECT_GUIDE`, this file) |

Size: 87 files changed vs the starting commit (+9,341 / −1,782). App code: ~8,300 backend lines, ~8,700
frontend lines; ~4,500 lines of backend tests.

---

## 3. Evidence — what I verified, and how

| Check | Result (run just now) |
|---|---|
| `ruff`, `black --check`, `mypy` | clean (55 files, 38 sources) |
| Backend tests | **168 passed**, **93 %** coverage |
| Frontend `tsc` / Jest | clean / **30 passed** |
| Migrations on PostgreSQL 18 | fresh, `create_all`-built, old-schema-with-data, and re-run all end at "Schema matches the models" (run earlier; migration code unchanged since) |
| End-to-end API flows on PostgreSQL, `ENVIRONMENT=production` | register → login → CSV import ×2 → analysis → simulation → refresh rotation → replay revocation → logout → throttle: all as designed, no server errors |
| **Live app in a browser (web build, demo account)** | Login screen renders; **Home** shows goal, totals, bank sandbox; **Simulate a payment** produced a labelled round-up banner; **Insights** rendered scores, chart and narrative; **Spending Habits** rendered correct figures (avg spend ₹10,049, money in ₹12,000, categories, repeating charges, round-up estimate). The Spending Habits page scrolls normally. |
| Servers right now | backend `:8000` healthy, Expo web `:8081` serving |

### What I did NOT verify
- **Native iOS/Android.** Only the web build was looked at. `expo-secure-store` (Keychain/Keystore) and
  haptics are native-only; they are covered by unit tests with the module mocked, not on a device.
- **Screens I did not open in the browser:** Goals, Goal detail, Budgets, Round-up Tracker, Subscriptions,
  Emergency Withdrawal, Notifications, Profile, Chat, Create Goal, onboarding. They type-check and bundle;
  I have not seen them render.
- A real **Google sign-in**; the pytest suite **on PostgreSQL** (only SQLite); behaviour **under load**; the
  quality of the AI's answers beyond the two outputs I saw.
- Accessibility (the README's "WCAG 100 % verified" badge is not something I re-checked).

### A caution about the test suite
168 passing tests is real, but **most of those tests were written by me alongside the fixes**, so they prove the
code does what I intended — not that I intended the right thing. Two of the findings below (§4.1, §4.2) are
things no test could catch, because the tests share my assumptions. The live check caught them; the suite didn't.

---

## 4. Findings I would act on first

### 4.1 The AI still invents numbers — **High, because it contradicts the product's central claim**
Seen live: a simulated ₹261.05 Swiggy payment produced the explanation *"…helps the student save an additional
**1%** of their daily spending on 'Swiggy'…"*. No "1%" was supplied. The Zero-Arithmetic tests check that the
**prompts** contain only pre-computed numbers; nothing checks what the model **says back**, and Llama 3 (8B) will
happily add percentages, totals and dates. Affected: round-up explanations, coach, advisor, wellness and goal
narration, purchase advice.
**Fix (small, high value):** after every LLM call, extract the numbers from the reply and accept it only if each
one appears in the numbers we supplied (or is a trivial constant); otherwise discard it and use the factual
template that already exists for round-ups and wellness (or a 503 for chat). Add a test with a reply containing
an invented figure.

### 4.2 Importing history creates phantom savings — **High (product logic)**
Importing the sample statement shows **"₹473 auto-saved from 78 round-ups"** and a goal progress bar. No money
was ever set aside; those are purchases from months ago. The analysis screen's wording ("what round-ups
*would have* saved") is the honest framing — the import itself should not create ledger entries. The Insights
chart shows it all as saved in the latest week (the entries are stamped with import time). This behaviour
predates my work, but I kept and amplified it. The demo account carries these phantom savings.
**Fix:** statement imports should be analysis-only (no round-ups, no goal credit); round-ups apply only to
transactions made going forward (manual log, simulated payment). One flag in the import endpoint + a test.

### 4.3 Slow AI makes screens feel broken — **Medium**
`POST /wellness/score` waits for the model up to 20 s before returning, and the Insights page shows only its
header while it waits (the loading skeleton is effectively invisible). On this machine the model was slow
enough to hit the cap, so the page showed the factual fallback after ~20 s. The simulated payment spinner also
ran ~8 s.
**Fix:** return the computed scores immediately and fetch the narrative separately (or cache it); make the
skeleton visible; show a "narrating…" state. Consider a smaller/faster model for short sentences.

### 4.4 Known-vulnerable dependencies — **Medium** (unchanged since the audit)
`python-multipart 0.0.20` (6 advisories incl. denial-of-service; parses every login form and upload — fixed in
≥ 0.0.31), `python-dotenv 1.2.1`, `python-jose 3.5.0` (advisory not exploitable as configured, no fixed
release), frontend `axios` (high, ships in the app) and ~69 mostly build-tooling npm findings. **I did not
upgrade anything.** One small PR fixes the first four.

### 4.5 Gaps a real student would hit — **Medium**
- No UI to **edit or delete a goal or transaction, or correct a wrong auto-category** (the API exists).
  Keyword categorisation will be wrong sometimes and the student can't fix it.
- No **password reset**; register and Google sign-in are not rate-limited; register reveals whether an
  email is taken.
- Stress-score benchmarks (₹3,000 / ₹15,000) are fixed — a student on a small allowance will always look "stressed".

### 4.6 Smaller things
- `rule_engine.py` claims "never touches the DB" but contains a legacy function that does.
- Dead surface: four `/calculations/*` endpoints, three deprecated duplicates, several unused app methods.
- Tests only on SQLite; no screen-level frontend tests.
- Refresh tokens are single-use: a response lost in transit signs the user out once (deliberate, strict).

---

## 5. Scorecard (my honest grades)

| Area | Grade | One-line reason |
|---|---|---|
| Money maths | **A−** | Exact, tested, windows correct; phantom import savings (§4.2) is a logic flaw, not a maths one |
| Honesty of what the UI claims | **B** | No fabricated fallbacks any more; but AI output can still contain invented numbers (§4.1) |
| Authentication & sessions | **B+** | Strong core (rotation, replay detection, revocation, throttle); gaps in §4.5 |
| Dependencies | **D** | Known advisories left in place |
| Database / deployment | **A−** | Reproducible schema proven on Postgres; container migrates; production secret guard |
| Responsiveness (AI-dependent screens) | **C** | Works, but slow-model case feels broken (§4.3) |
| Test depth | **B** | 168 backend tests, 93 % coverage, but self-authored; thin frontend; SQLite only |
| Verified on real devices | **Incomplete** | Web only |
| Product completeness | **B−** | Core loop is there; editing/recovery/categorisation correction missing |

---

## 6. Things I did to your machine / repo that you should know about

- **Edited your git-ignored `.env` and `backend/.env`:** `ACCESS_TOKEN_EXPIRE_MINUTES` 1440 → 15.
- **Installed npm packages:** `expo-secure-store`, `jest`, `jest-expo`, `@types/jest` (changed `package.json`,
  `package-lock.json`; added the `expo-secure-store` plugin to `app.json`).
- **Changed your real dev database** (`backend/pennypilot.db`): the new auto-upgrade added columns to it, and I
  ran the demo seed against it — it now contains a **demo student with 81 imported transactions** (plus
  the extra simulated payment I triggered). Your six existing users and eight transactions were left intact
  (checked on a copy first).
- **Started two background servers** (backend `:8000`, Expo web `:8081`); both are still running.
- **Replaced work you had in progress:** your uncommitted "subscription sync" feature (it inserted simulated
  transactions) and its test, and the `/negotiator/suggest` endpoint.
- **Reformatted code with `black`** across the backend as I went.
- Used scratch-only resources, since stopped/ignored: a throwaway PostgreSQL cluster, a `pip-audit` virtualenv,
  smoke-test databases. The browser pane is currently signed in as the demo student.

---

## 7. Mistakes I made along the way (so you can judge how much to trust the rest)

- Shipped a first draft of migration 008 with a 38-character revision id; `alembic_version` is `varchar(32)`.
  Caught it by running it on PostgreSQL, before commit.
- I did not run the migrations on PostgreSQL until round 2. Until then nobody (me included) knew they could not build a working schema; the repo's own evidence files had implied they were fine.
- Several of my first tests encoded the *old* bugs (budgets pinned to August dates); I had to rewrite them.
- I reported "not visually verified" for two rounds and only looked at the app now — and the first look found
  three real problems. That is a process failure on my side.
- An earlier test (`test_simulation_runs_the_normal_pipeline`) had a conditional assertion that could never
  fail; I tightened it after noticing.

---

## 8. Documentation status

- `AUDIT_REPORT.md` — cumulative history of fixes. Parts of §3.5 describe the logout design that §3.6 later
  replaced; read §3.6 as current. Test counts refreshed to 168 / 93 %.
- `AUDIT_CURRENT.md` — dependency/gap audit; still accurate (counts refreshed).
- `PROJECT_GUIDE.md` — explains the system; accurate to the code, but it describes round-ups on imported
  statements as intended behaviour — that will change if §4.2 is fixed.
- README screenshots/`docs/screenshots` show the old UI; `docs/HANDOFF.md` is stale.

---

## 9. What I would do next, in order

1. **Output guardrail for AI numbers** (§4.1) — protects the product's central claim. ~½ day.
2. **Imports are analysis-only; no phantom savings** (§4.2) — ~2 hours, plus reset the demo data. 
3. **Dependency upgrades** (§4.4) and **Postgres in CI**. ~1 day.
4. **Narrative off the critical path** + visible loading states (§4.3). ~½ day.
5. **Edit/delete goal & transaction, correct category** in the app (§4.5). 2–3 days.
6. Look at every remaining screen on a real phone; run the Google flow once.
7. Password reset; throttle register/Google.

**Confidence:** high that the backend does what the code and tests say; moderate that the main web flows work
for a real user (I saw four screens, not all); low that the AI-written text can be trusted with numbers until §4.1
is fixed.
