> **⚠️ Superseded (2026-10-23).** This inventory predates the audit and refers to screens that no longer exist. The current, verified list of fabricated/hard-coded data and its fixes is in [`docs/AUDIT_REPORT.md`](../AUDIT_REPORT.md) §3.3.

# Penny Pilot: Mock Data & Financial Figures Inventory

This document maps all screens and components in the frontend that currently utilize hardcoded mock data, fallback structures, or client-side financial calculations. This inventory serves as the transition specification for the production redesign.

---

## 1. Screens Using Mock Data Instead of API Calls

| Screen Component | File Path | Mock Variable / Data Structure | Existing Backend Endpoint to Wire | Notes / Transition Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **GoalsScreen** | `frontend/src/screens/student/GoalsScreen.tsx` | `mockGoals` (lines 81–86) | `GET /api/goals/` | Currently falls back to `mockGoals` when API returns empty or on network error. In redesign, display empty state UI with "Create your first goal" prompt instead of fake goals. |
| **NotificationsScreen** | `frontend/src/screens/student/NotificationsScreen.tsx` | `mockNotifications` (lines 73–99) | `GET /api/notifications/` | Currently displays 3 hardcoded notification items when the user has 0 notifications. In redesign, show a zero-state illustration and fetch real system/budget notifications. |
| **ChatScreen (Coach Mode)** | `frontend/src/screens/student/ChatScreen.tsx` | `INITIAL_COACH_MESSAGES` (lines 41–66) | `GET /api/chat/history`<br>`POST /api/chat/` | Seeds chat history with fake savings message (`₹1,245 from your round-ups`). Must load real persisted message history from `GET /api/chat/history` and send messages to `POST /api/chat/`. |
| **ChatScreen (Advisor Mode)** | `frontend/src/screens/student/ChatScreen.tsx` | `INITIAL_ADVISOR_MESSAGES` (lines 68–89) | `GET /api/coach/`<br>`POST /api/coach/ask` | Seeds advisor conversation with fake mutual fund prompts. Must query advisor session state and LLM endpoints dynamically. |

---

## 2. Hardcoded Calculations & Zero-Arithmetic Violations

Per the **Zero-Arithmetic Rule**, the frontend must never calculate, project, or derive financial numbers client-side. Every financial figure displayed must be returned by backend services.

### A. AnalysisScreen (`frontend/src/screens/onboarding/AnalysisScreen.tsx`)
- **Detected Figures**:
  - `₹45,000` — Hardcoded Detected Monthly Income (line 67)
  - `₹33,750` — Hardcoded Total Spent (line 133)
  - `₹11,250` — Savings allocation (line 148, exactly 25% of ₹45,000)
  - `₹13,500` — Rent allocation (line 160, exactly 30% of ₹45,000)
  - `₹11,250` — Food allocation (line 172, exactly 25% of ₹45,000)
  - `₹9,000` — Fun allocation (line 184, exactly 20% of ₹45,000)
  - Svg Donut chart hardcoded stroke offsets (`-80`, `-55`, `-25`, `0`)
- **Violation Assessment**:
  - The screen performs client-side percentage math (`75% spent`, `25% savings`) and displays static estimates as if an AI parsed the user's transactions.
- **Backend Solution**:
  - Figures must be fetched from `backend/app/services/rule_engine.py` via `POST /api/transactions/upload-csv` and `GET /api/calculations/analysis`. The backend rule engine aggregates real income, expense categories, and monthly averages from the uploaded CSV and returns verified totals and percentages.

### B. EmergencyWithdrawalScreen (`frontend/src/screens/student/EmergencyWithdrawalScreen.tsx`)
- **Detected Figures**:
  - `₹1` — Minimum withdrawal limit validation (`val <= 0`, line 46; alert string, line 47)
- **Violation Assessment**:
  - Minimum and maximum transaction limits are domain business rules. Hardcoding `₹1` in frontend validation and error strings violates the contract that business rules and constraints originate on the backend.
- **Backend Solution**:
  - Expose withdrawal constraints in `GET /api/goals/{id}` (e.g. `min_withdrawal_amount: 1.00`, `max_withdrawal_amount: balance`) or a dedicated business rule config endpoint, and validate against the backend payload.

### C. Quick-Add / Preset Input Chips
- **Detected Figures**:
  - `+₹500`, `+₹1,000`, `+₹2,000`, `+₹10,000` preset chips in goal funding and manual transaction inputs.
- **Assessment**:
  - **Permitted as Input Presets**. These buttons are purely UX conveniences for user input entry (setting an input field value), not financial results, metrics, balances, or calculated projections.

---

## 3. Inventory of Hardcoded Figures Across Student & Onboarding Screens

| Screen / Location | Hardcoded Value / String | Classification | Target Backend Endpoint / Replacement |
| :--- | :--- | :--- | :--- |
| `ChatScreen.tsx:45` | `₹1,245 from your round-ups` | Mock Seed Message | Real round-up total from `GET /api/savings/summary` |
| `ChatScreen.tsx:175` | `₹5,000 into ${fund}` | Hardcoded Transaction Prompt | Dynamic allocation proposal from `POST /api/coach/ask` |
| `GoalsDashboardScreen.tsx:42` | `₹15,000` / `₹25,000` | Mock Goal Card | Real user goals from `GET /api/goals/` |
| `RoundupTrackerScreen.tsx:38` | `₹24.00`, `₹18.50`, etc. | Mock Transactions List | Real recent roundups from `GET /api/transactions/?has_roundup=true` |
| `HomeScreen.tsx:55` | `₹8,450.00` | Mock Total Savings Display | Real account balance from `GET /api/savings/summary` |
| `InsightsScreen.tsx:64` | `₹14,200` monthly spending | Mock Spending Breakdown | Real category summary from `GET /api/budgets/` |
| `SpendingChoiceScreen.tsx:40` | `₹2,500` / `₹5,000` / `₹10,000` | Spending Profile Presets | Fixed profile options (Input presets) |

---

## 4. Redesign Implementation Roadmap

1. **Remove Mock Fallbacks**:
   - Strip `mockGoals` and `mockNotifications` arrays.
   - Implement clean empty states (`EmptyGoalsView`, `EmptyNotificationsView`) for new users.
2. **Wire Real History to Chat**:
   - Replace `INITIAL_COACH_MESSAGES` and `INITIAL_ADVISOR_MESSAGES` with API calls on component mount.
3. **Backend-Driven Analysis**:
   - Connect `AnalysisScreen` to the `rule_engine.py` CSV ingestion response payload.
4. **Backend-Sourced Validation**:
   - Provide business constraints (minimum withdrawal, max transaction limit) via backend responses.
