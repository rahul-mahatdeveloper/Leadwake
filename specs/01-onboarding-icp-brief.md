# Spec 01 — Onboarding: Domain → ICP + Signal Brief

> Status: **DRAFT v0.2** (aligned with master v0.3 + risk register), under discussion with Rahul
> Parent: `00-master-spec.md` (§6.2, §6.3, D9, D22 Phase 1) · risks R28, R38, R23
> Branch: `feature/01-onboarding-icp-brief`
> Last updated: 2026-10-23

---

## 1. Problem statement

The pipeline cannot run without knowing **who the buyer is** (ICP) and **what buying intent looks like** (Signal Brief).

Traxy generates both from the domain alone. That produced long, sentence-style brief items, which became useless search queries (0 of 469 keyword candidates saved). It also produced competitor/ICP guesses that the user never consciously checked.

This feature:
- collects a domain plus **3 short answers** from the user,
- reads the website,
- drafts an ICP + Brief with **short, searchable keywords**,
- makes the user **edit and approve** both before anything can run.

Every approval creates a new version, so leads can always be traced to the ICP/Brief that produced them.

---

## 2. Functional requirements

### 2.1 Entry & gating
- FR-1 A workspace with no APPROVED ICP **and** Brief sees only the onboarding wizard. Dashboard, Runs, Watchlist and Leads are locked with the message "Finish onboarding first".
- FR-2 The wizard has 4 steps with a progress bar: **① Company → ② Generating → ③ Review ICP → ④ Review Brief & Approve**.
- FR-3 Progress autosaves. Closing and reopening resumes at the same step with the same data.

### 2.2 Step ① Company inputs
| Field | Required | Rules |
|-------|----------|-------|
| Company domain | yes | Prefilled from the workspace. Normalized: lowercase, no protocol, no `www.`, no path. Must resolve (HTTP 200–399 within 10s) |
| What do you sell? | yes | 20–300 chars. Placeholder: "e.g. B2B contact data for Indian sales teams" |
| Who buys it? | yes | 20–300 chars. Placeholder: "e.g. Sales heads and founders at 10–200 person SaaS companies in India & US" |
| Top competitors | yes, 1–3 | Each is a name or domain, ≤ 60 chars. Chips input. Duplicates blocked |

- FR-4 "Generate" button is enabled only when all fields are valid.

### 2.3 Step ② Generating (server-side)
- FR-5 **Site read:** via the `SiteReader` adapter, fetch the homepage plus up to **4** more internal pages. Pages are chosen by link text/URL matching `pricing|product|features|solutions|customers|about|use-cases`. Each page is truncated to 15k chars, total ≤ 50k chars.
- FR-6 **Competitor read (optional, best effort):** if a competitor was given as a domain, read its homepage only (≤ 8k chars). If it was given as a name, no fetch.
- FR-7 **LLM draft:** one `LLM.json(..., model: 'smart')` call with site text + the 3 answers + competitor text. Output must validate against the schema in §3.2. Invalid output gets 1 retry with the Zod error appended, then the error state.
- FR-8 **Post-processing (code, not LLM):**
  - lowercase-dedupe all arrays
  - map titles/industries to the canonical lists in `lib/taxonomy/` (unknown values kept but flagged `custom`)
  - enforce keyword rules (§2.6), dropping violating keywords and logging them
  - trim to limits
- FR-9 Show live sub-status: "Reading your site (2/5 pages)…", "Drafting ICP…", "Drafting keywords…". Target total < 60s, hard timeout 120s.
- FR-10 Save the result as **ICP v(n) DRAFT** and **Brief v(n) DRAFT**. Record the cost (Claude tokens → ₹) in `cost_ledger` with `run_id = null`, `step = 'onboarding'`.

### 2.4 Step ③ Review ICP
Editable form, all fields chips/multiselect from the taxonomy, with free-text allowed where marked.

| Field | Limits | Notes |
|-------|--------|-------|
| Job titles | 1–15 | free text allowed |
| Seniorities | 1–6 | from: Owner, CXO, VP, Director, Head, Manager, Senior IC |
| Company size bands | 1–5 | from: 1–10, 11–50, 51–200, 201–500, 501–1000, 1000+ |
| Geographies | 1–10 countries | ISO country list. Default suggestion from "Who buys it?" |
| Industries | 0–10 | LinkedIn industry taxonomy. 0 = any |
| Exclude companies | 0–50 | Own company + competitors are auto-added and locked |

- FR-11 Every AI-filled value shows a small "AI" badge until the user touches it (helps the user see what they haven't checked).
- FR-12 "Regenerate ICP" re-runs only the ICP part (keeps Brief edits). Max 3 regenerations per onboarding session. The counter is shown.

### 2.5 Step ④ Review Brief & Approve
| Section | Limits | Shape of each item |
|---------|--------|--------------------|
| Competitors | 1–8 | `{name, domain?, aliases[] (≤3)}`. The user's 1–3 are locked, the AI may add up to 5 more |
| Pains | 3–8 | `{label (≤ 60 chars), description (≤ 200 chars)}`. The description is for the Haiku relevance prompt, **never** for search |
| Triggers | 2–8 | same shape as pains |
| Keywords | 1–**12** active | `{phrase, bucket: COMPETITOR\|PAIN\|TRIGGER}`. See §2.6 |

- FR-13 Keywords are shown grouped by bucket, with a live counter "9 / 12". The UI suggests 4 per bucket but does not enforce it.
- FR-14 The AI also returns up to **8 extra keyword suggestions** (not active). The user can promote them while under 12.
- FR-15 "Regenerate keywords" is the same as FR-12 with its own counter of 3.
- FR-16 **Approve** button: validates ICP + Brief together, via one Postgres function `approve_onboarding(icp_version_id, brief_version_id, expected_updated_at)`, which runs in **one transaction** (supabase-js can't do multi-statement transactions; R28):
  - sets both drafts to APPROVED
  - archives the previous APPROVED versions
  - writes `approved_by` and `approved_at`
  - inserts the `keywords` rows
- FR-17 After approval, redirect to the dashboard with the toast "Setup done. Ready to run" and a "Run now" CTA (handled by spec 04).

### 2.6 Keyword rules (enforced in code, both on AI output and user edits)
- 1–4 words. 3–40 chars.
- No sentence punctuation `. ? ! ;`, no quotes, no `AND/OR/NOT`, no `( )`.
- Case-insensitive unique across the workspace's active keywords.
- Not a single generic word on a blocklist (`sales`, `growth`, `marketing`, `ai`, `data`, `leads`, `b2b`, `startup`, …). Single words are allowed only if they are a competitor name.
- Error messages are specific, e.g. "Too long, keep it under 4 words, like people would type in a post".

### 2.7 Editing after onboarding
- FR-18 A **Settings → ICP & Brief** page shows the current APPROVED versions read-only, with an "Edit" button.
- FR-19 Edit creates a new DRAFT copied from APPROVED. It runs the same Review ③ → ④ → Approve flow (skipping ① and ②) and approval creates a new version.
- FR-20 A version history list shows version, approved by, date and a diff vs the previous version (added/removed items).
- FR-21 While a DRAFT exists, runs keep using the last APPROVED version.
- FR-22 "Re-onboard from site" re-runs ① + ② and creates a new DRAFT. It needs confirmation.

---

## 3. Input / Output

### 3.1 Inputs
- User: domain, what_you_sell, who_buys, competitors[1..3]
- System: site markdown (≤ 50k chars), competitor homepages (optional), taxonomy lists

### 3.2 LLM output schema (Zod, source of truth in `lib/schemas/onboarding.ts`)
```ts
const Draft = z.object({
  icp: z.object({
    titles: z.array(z.string().max(60)).min(1).max(15),
    seniorities: z.array(z.enum(['Owner','CXO','VP','Director','Head','Manager','Senior IC'])).min(1),
    size_bands: z.array(z.enum(['1-10','11-50','51-200','201-500','501-1000','1000+'])).min(1),
    geos: z.array(z.string().length(2)).min(1).max(10),      // ISO-2
    industries: z.array(z.string().max(80)).max(10),
  }),
  brief: z.object({
    competitors: z.array(z.object({ name: z.string(), domain: z.string().optional(), aliases: z.array(z.string()).max(3) })).max(8),
    pains: z.array(z.object({ label: z.string().max(60), description: z.string().max(200) })).min(3).max(8),
    triggers: z.array(z.object({ label: z.string().max(60), description: z.string().max(200) })).min(2).max(8),
    keywords: z.array(z.object({ phrase: z.string().max(40), bucket: z.enum(['COMPETITOR','PAIN','TRIGGER']) })).max(20),
    extra_keyword_suggestions: z.array(z.object({ phrase: z.string().max(40), bucket: z.enum(['COMPETITOR','PAIN','TRIGGER']) })).max(8),
  }),
  confidence: z.enum(['high','medium','low']),
  notes_for_user: z.string().max(300),   // e.g. "Site had little product detail; ICP is mostly from your answers"
})
```
The LLM may return up to 20 keywords. Code keeps the best 12 valid ones (§2.6). Priority goes to keeping bucket balance, then to the order the LLM gave.

### 3.3 Prompt requirements (the prompt lives in `lib/prompts/onboarding.ts`, versioned)
- The user's 3 answers **override** the site where they conflict.
- Keywords must be phrases real people write in LinkedIn posts or comments ("switched from Apollo", "SDR hiring", "bounce rate"), never descriptions of intent.
- Include 2 good and 2 bad keyword examples in the prompt (bad: "a lead states their team is evaluating…").
- Never invent competitors' pricing or facts.
- English only.

### 3.4 Outputs (DB)
- `onboarding_inputs` (1 row per attempt)
- `icp_versions` (DRAFT → APPROVED)
- `brief_versions` (DRAFT → APPROVED)
- `keywords` (inserted on approval)
- `cost_ledger` row(s)

### 3.5 Server endpoints (Next.js server actions or route handlers)
| Action | Input | Output |
|--------|-------|--------|
| `saveOnboardingInputs` | §3.1 user fields | `{inputs_id}` |
| `generateDraft` | `{inputs_id}` | `{icp_version_id, brief_version_id, notes_for_user, confidence}` (long-running; status via polling `onboarding_inputs.status`) |
| `regenerate` | `{part: 'icp'\|'keywords', draft ids}` | updated draft |
| `updateDraft` | partial ICP/Brief | validation errors or ok |
| `approve` | `{icp_version_id, brief_version_id}` | ok or validation errors |

---

## 4. Constraints
- Cost per onboarding (including 3+3 regenerations) ≤ ₹30. Log a warning above that.
- The site read obeys `robots.txt` disallow for the reader user-agent. If disallowed, skip the site and rely on the answers (set `confidence = low`).
- **SSRF guard (R38):**
  - The site is read via Jina Reader.
  - The direct-fetch fallback allows only `http(s)`, resolves DNS and blocks private, loopback and link-local IPs, re-checks on every redirect (max 3), caps the response at 2 MB and times out at 10s.
- **Untrusted site text (R23):**
  - Site and competitor text goes into the prompt inside a delimited data block that the system prompt marks as data, not instructions.
  - The output is still validated by Zod and the keyword rules.
- Temperature 0.3 for drafting (some variety for Regenerate). `prompt_version` is stored on each draft.
- No LinkedIn/Apify calls in onboarding (zero data spend before approval).
- Only Owner/Member of the workspace can view/edit. RLS applies.
- All LLM payloads are validated with Zod. No `any`.

---

## 5. Edge cases

| # | Case | Behaviour |
|---|------|-----------|
| E1 | Domain doesn't resolve / times out | Inline error on ①: "Couldn't reach this site". Option "Continue without site" generates from the answers only, with `confidence = low` |
| E2 | JS-only / empty site (< 500 chars of text) | Same as E1's fallback, with a banner "Site had little text, please review carefully" |
| E3 | Non-English site | Translate inside the LLM call. The output is still English. Note it in `notes_for_user` |
| E4 | User's answers contradict the site (e.g. site says enterprise, answer says SMB) | Answers win. Mention it in `notes_for_user` |
| E5 | LLM returns invalid JSON twice | Error state with a "Try again" button. No partial draft saved |
| E6 | Fewer than 3 valid keywords after filtering | Show the draft anyway. Approve stays blocked until ≥ 1 keyword exists. Show "AI keywords were too long; add your own" |
| E7 | Competitor given only by name and ambiguous (e.g. "Apollo") | The AI fills `domain` only if confident; the user can edit. Aliases help matching |
| E8 | User enters own domain as a competitor | Block it: "That's your own company" |
| E9 | Regeneration limit hit | Button disabled with "Edit manually". The limit resets on the next onboarding session (FR-22) |
| E10 | Two members edit drafts at the same time | Last write wins per field. On approve, check `updated_at`; if the draft changed since the user loaded it, show "Someone else edited this, reload" |
| E11 | Approve clicked twice | Idempotent: the second call is a no-op |
| E12 | User leaves at step ③ and comes back days later | Draft is still there. Banner "Draft from <date>, continue or regenerate" |
| E13 | Re-onboard while a run is in progress | Allowed. The run keeps using its pinned version ids |
| E14 | Keyword equals a competitor alias | Allowed, bucket must be COMPETITOR (auto-corrected) |

---

## 6. Acceptance criteria

1. A fresh workspace is locked to the wizard. After approval all modules unlock.
2. For 3 test domains (one rich SaaS site, one thin site, one unreachable), the wizard produces a valid draft or a correct fallback within 120s.
3. Every active keyword in the DB passes §2.6. A unit test feeds 30 bad phrases (including Traxy-style sentences) and all are rejected with specific messages.
4. The user's 3 competitors appear locked in the Brief and in ICP exclude-companies.
5. Approve is atomic: if keyword insert fails, ICP/Brief stay DRAFT (verified by a forced-failure test).
6. Editing after onboarding creates v2. v1 is ARCHIVED, and the history shows a correct diff.
7. A run started while a DRAFT exists uses the APPROVED version (tested once spec 04 exists; until then, version pinning is tested at the DB level).
8. Zero Apify/LinkedIn calls during onboarding (ledger check).
9. Onboarding cost is written to `cost_ledger` and is ≤ ₹30 for the 3 test domains.
10. A member of another workspace gets 0 rows / 403 on every endpoint (RLS test).

---

## 7. Out of scope for this spec
- Watchlist setup (spec 05, Phase 2). The wizard does **not** ask for watchlist profiles in v1. Open question O2 below.
- Running the pipeline (spec 04).
- Any meetings/calendar setup (master D1).

---

## 8. Open questions
- O1 Pre-fill Rahul's test workspace with his real answers, or keep it blank and test the flow end-to-end?
- O2 Should the wizard have an optional step ⑤ "Add up to 3 watchlist profiles", or keep watchlist fully separate?
- O3 Is a hard cap of 3 regenerations fine, or should it be unlimited, since cost is small (~₹2–3 each)?
