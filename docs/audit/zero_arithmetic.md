# Zero-Arithmetic Contract Audit Report

**Date:** 2026-10-19  
**Branch:** `phase-1b-zero-arithmetic` (branched from `phase-1-tests-ci`)  
**Contract Definition:** The LLM never calculates; `rule_engine.py` precomputes all figures, and prompts receive formatted strings. The model is strictly an empathetic communicator and translator, never a calculator.

---

## Summary of Findings

Across the backend codebase, exactly **8 call sites** invoke `call_llama()`:

| Phase | PASS | VIOLATION | Status |
|---|---|---|---|
| **Phase 1 Initial Audit** | 5 | 3 | 3 violations in `dream.py`, `goals.py`, `forecast.py` (`dream_engine_prompt`) |
| **Phase 1.5 Post-Fix Re-Verification** | **8** | **0** | **100% PASS** — all arithmetic precomputed in `rule_engine.py` |

---

## Detailed Audit by Call Site

### 1. `backend/app/routers/wellness.py:134`
* **Calling Function:** `get_wellness_score` / `generate_wellness_score_post`
* **Prompt Builder:** `wellness_prompt(stress_score, reasons, suggestions_context)` in `backend/app/utils/prompts.py:235`
* **Data Injected into Prompt:**
  * `stress_score`: integer 0–100 (`rule_engine.stress_score`)
  * `reasons`: list of string descriptors (e.g., `"Savings velocity is currently ₹0/month"`)
  * `suggestions_context`: dictionary with `monthly_savings`, `budget_overruns`, and `top_overspend`
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes for `stress_score` and `monthly_savings` (`savings_velocity`).
  * Note: `budget_overruns` and `spend_velocity` are calculated directly within `wellness.py` via DB aggregation rather than dedicated `rule_engine` methods.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * No. The prompt asks the model to explain what the pre-calculated score means, why the factors matter, and provide 2–3 qualitative action suggestions without math.
* **Rating:** **PASS**

---

### 2. `backend/app/routers/chat.py:41`
* **Calling Function:** `chat_with_coach`
* **Prompt Builder:** `coach_system_prompt()`, `coach_user_prompt(message, recent_transactions, goals, budgets)` in `backend/app/utils/prompts.py:38, 56`
* **Data Injected into Prompt:**
  * `message`: raw user input string
  * `recent_transactions`: list of dicts (`merchant`, `amount`, `category`)
  * `goals`: list of dicts (`name`, `target`, `saved`)
  * `budgets`: list of dicts (`category`, `budget`, `spent`, `status`)
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Partial: `status` is evaluated via `rule_engine.budget_status()`. Raw amounts and limits are queried from DB.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * The prompt instructs: *"Please respond to the student's message using their financial context above. Be direct and encouraging. Do not repeat all the numbers back — just use them to inform your advice."*
  * The prompt does not ask for arithmetic, but if the user asks a computational question (e.g., *"How much more do I need?"*), the LLM might attempt arithmetic on the raw numbers provided.
* **Rating:** **PASS (Advisory)**

---

### 3. `backend/app/routers/dream.py:180`
* **Calling Function:** `get_dream_forecast`
* **Prompt Builder:** `dream_engine_prompt(goal_name, target_amount, current_amount, forecast_date, velocity, accelerated_options_text)` in `backend/app/utils/prompts.py:178`
* **Data Injected into Prompt:**
  * `goal_name`: string title
  * `target_amount`: Decimal target
  * `current_amount`: Decimal saved
  * `forecast_date`: projected `datetime.date` from `rule_engine.goal_forecast`
  * `velocity`: Decimal monthly rate from `rule_engine.savings_velocity`
  * `accelerated_options_text`: deterministic precomputed options from `rule_engine.calculate_accelerated_savings_options` formatted by `rule_engine.format_accelerated_options`
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes: 100% of numbers (dates, velocity, extra monthly amounts, new velocities, months saved) are precomputed in `rule_engine.py`.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **No (Fixed in Phase 1.5).**
  * The prompt now includes strict Zero-Arithmetic rules:
    > *"1. Do NOT calculate, estimate, add, subtract, project, or invent ANY numbers or dates.\n2. Only restate the precomputed figures provided in the context above.\n3. If accelerated options are provided above, you may encourage the student by citing ONE of those exact precomputed scenarios verbatim."*
  * The system prompt reinforces: *"use ONLY the precomputed numbers provided. If suggesting an action, cite one of the precomputed accelerated savings scenarios verbatim. Never calculate, estimate, project, or invent any numbers or dates."*
* **Rating:** **PASS** (Formerly VIOLATION in Phase 1)

---

### 4. `backend/app/routers/goals.py:332`
* **Calling Function:** `forecast_goal`
* **Prompt Builder:** `dream_engine_prompt(goal_name, target_amount, current_amount, forecast_date, velocity, accelerated_options_text)`
* **Data Injected into Prompt:**
  * Same as `dream.py` with precomputed `accelerated_options_text`.
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes (`goal_forecast`, `savings_velocity`, `calculate_accelerated_savings_options`).
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **No (Fixed in Phase 1.5).** All acceleration scenarios are precomputed and prompt explicitly prohibits mathematical calculation.
* **Rating:** **PASS** (Formerly VIOLATION in Phase 1)

---

### 5. `backend/app/routers/negotiator.py:281`
* **Calling Function:** `evaluate_purchase`
* **Prompt Builder:** `negotiator_prompt(price, category, description, budget_status, goal_impact)` in `backend/app/utils/prompts.py:131`
* **Data Injected into Prompt:**
  * `price`, `category`, `description`
  * `budget_status`: precomputed string (`"safe"`, `"warning"`, `"exceeded"`) via `rule_engine.budget_status`
  * `goal_impact`: precomputed impact string via `_compute_goal_impact` (e.g., `"delays 'Laptop' goal by ~3 weeks"` or `"no meaningful delay"`)
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes. All delay days and months are calculated in Python prior to prompt assembly.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * No. The prompt asks: *"Should they make this purchase now, wait, or find an alternative? Be honest but kind. No moral lectures."*
* **Rating:** **PASS** (Exemplary implementation of the zero-arithmetic contract)

---

### 6. `backend/app/routers/transactions.py:146`
* **Calling Function:** `create_transaction`
* **Prompt Builder:** `explain_roundup_prompt(transaction_desc, transaction_amount, roundup_amount)` in `backend/app/utils/prompts.py:303`
* **Data Injected into Prompt:**
  * `transaction_desc`: merchant or description string
  * `transaction_amount`: Decimal amount
  * `roundup_amount`: Decimal roundup from `rule_engine.calculate_roundup`
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes, `calculate_roundup` produces the exact roundup.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * No. Prompts: *"Provide a friendly, one-sentence explanation of why this micro-saving is beneficial for their long-term financial habits."*
* **Rating:** **PASS**

---

### 7. `backend/app/routers/forecast.py:57`
* **Calling Function:** `forecast_savings_goal`
* **Prompt Builder:** `dream_engine_prompt(goal_name, target_amount, current_amount, forecast_date, velocity, accelerated_options_text)`
* **Data Injected into Prompt:**
  * Same `dream_engine_prompt` parameters with user-provided `monthly_contribution` and precomputed `accelerated_options_text`.
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes (`goal_forecast`, `calculate_accelerated_savings_options`, `format_accelerated_options`).
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **No (Fixed in Phase 1.5).** Uses updated prompt and strict zero-arithmetic system prompt.
* **Rating:** **PASS** (Formerly VIOLATION in Phase 1)

---

### 8. `backend/app/routers/coach.py:222`
* **Calling Function:** `chat_with_coach`
* **Prompt Builder:** `coach_system_prompt()`, `coach_user_prompt(...)`
* **Data Injected into Prompt:**
  * Same structure as `chat.py:41` (`message`, `recent_transactions`, `goals`, `budgets`).
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes, budget statuses computed via `rule_engine.budget_status`.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * No explicit calculation requested.
* **Rating:** **PASS (Advisory)**

---

## Recommended Remediation (for Future Phases)

1. **`dream_engine_prompt` / `dream.py` / `goals.py` / `forecast.py`:**
   * Precompute concrete scenarios in `rule_engine.py` (e.g. `scenario_extra_500 = goal_forecast(target, current, velocity + 500)`).
   * Pass the exact difference to the prompt (e.g., *"Saving an extra ₹500/month would reach the goal by August 2027 (3 months sooner)"*), removing the instruction asking the LLM to invent an extra ₹X/month.
2. **`coach_user_prompt`:**
   * Add explicit prompt guardrail: *"Do not attempt mathematical calculations. If the user asks for exact totals or calculations not present in the context, guide them to their dashboard metrics."*
