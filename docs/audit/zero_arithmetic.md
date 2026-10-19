# Zero-Arithmetic Contract Audit Report

**Date:** 2026-10-19  
**Branch:** `phase-1-tests-ci`  
**Contract Definition:** The LLM never calculates; `rule_engine.py` precomputes all figures, and prompts receive formatted strings. The model is strictly an empathetic communicator and translator, never a calculator.

---

## Summary of Findings

Across the backend codebase, exactly **8 call sites** invoke `call_llama()`:
* **PASS:** 5 call sites
* **VIOLATION:** 3 call sites (due to `dream_engine_prompt` asking the model to invent extra contribution projections `₹X/month` that bring goal dates closer without precomputed scenarios)

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
* **Prompt Builder:** `dream_engine_prompt(goal_name, target_amount, current_amount, forecast_date, velocity)` in `backend/app/utils/prompts.py:178`
* **Data Injected into Prompt:**
  * `goal_name`: string title
  * `target_amount`: Decimal target
  * `current_amount`: Decimal saved
  * `forecast_date`: projected `datetime.date` from `rule_engine.goal_forecast`
  * `velocity`: Decimal monthly rate from `rule_engine.savings_velocity`
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes, `forecast_date` and `velocity` are precomputed.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **Yes.** `prompts.py:224-226` explicitly instructs:
    > *"Explain the timeline in plain language, then suggest ONE concrete action (e.g. saving an extra ₹X per month) that would bring the date meaningfully closer. Keep it specific and encouraging."*
  * In `dream.py:184-185`, system prompt states:
    > *"Suggest exactly one concrete action to reach the goal sooner (e.g. saving an extra ₹X/month)."*
  * Because the prompt does not precompute what `₹X` is or what new completion date `₹X` would produce, the model is invited to perform mental math or hallucinate financial projections (e.g., "If you save ₹400 more, you will finish 2 months earlier").
* **Rating:** **VIOLATION**

---

### 4. `backend/app/routers/goals.py:332`
* **Calling Function:** `forecast_goal`
* **Prompt Builder:** `dream_engine_prompt`
* **Data Injected into Prompt:**
  * Same as `dream.py:180` (`goal_name`, `target_amount`, `current_amount`, `forecast_date`, `velocity`)
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes (`goal_forecast`, `savings_velocity`).
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **Yes.** Re-uses `dream_engine_prompt`, which prompts the model to invent an extra contribution amount and project its impact.
* **Rating:** **VIOLATION**

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
* **Prompt Builder:** `dream_engine_prompt`
* **Data Injected into Prompt:**
  * Same `dream_engine_prompt` parameters with user-provided `monthly_contribution`.
* **Are Figures Pre-formatted from `rule_engine.py`?**
  * Yes.
* **Does Prompt Ask Model to Add, Subtract, Compare, Project, or Rank?**
  * **Yes.** Invokes `dream_engine_prompt` containing the projection instruction.
* **Rating:** **VIOLATION**

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
