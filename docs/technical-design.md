# Leadwake — Technical Design

> **Status:** DRAFT v1.0 for Rahul's review (27 Oct 2026).
> **Owner:** Rahul · **Companions:** `specs/master-spec.md` (the **what**, APPROVED v1.1) · `CLAUDE.md` (how we work) · `specs/NN-*.md` (one spec per feature).

**How to use this file**
- This is the **how** for the whole product. Feature specs and their plans build on it. They don't re-decide the stack.
- If this file and the master spec disagree, the spec wins. Known differences waiting for a spec update are listed in §12.
- Numbers here (caps, limits, prices) are **config defaults**. They live in `src/config/` with a version and are tuned with real data.
- Prices were checked on 27 Oct 2026. Re-check them at signup. FX is assumed at ₹88 = $1 (a config value).

---

## 1. Objective

Give Leadwake one stack, one data model and one set of guard rails that:
1. lets a solo beginner on Windows build Phase 1 (the test-mode MVP) with boring, popular tools and **free infrastructure**;
2. protects real money: every paid call (Apify, Jev, Claude) goes through a spend guard with **₹20 per call, ₹200 per day, ₹4,000 per month** and a kill switch from the first paid call, and with a **₹200 per-run cap** from spec 04;
3. enforces **workspace isolation in the database**, not just in code;
4. keeps a **shared global pool** of public facts and a **per-workspace layer** of judgements, so the data model stays the same from 1 to 100,000 workspaces;
5. keeps history **append-only** and makes runs **resumable without paying twice**.

Out of scope for this file: per-feature requirements (feature specs), UI design, pricing.

---

## 2. Tech stack

| Area | Choice | Why | Rejected alternative (and why) |
|---|---|---|---|
| Language | **TypeScript** on Node 22 LTS | One language for UI, jobs and adapters. Zod schemas at every boundary. Strong Claude Code support | Python + JS frontend: two languages and two toolchains for a solo dev |
| Web framework | **Next.js** (App Router) | Most popular React framework. Server actions and route handlers mean no separate API. Deploys natively on Vercel | React Router v7: smaller ecosystem. Django + HTMX: second language |
| Database | **Supabase Postgres** (Mumbai region) | Real Postgres with Row-Level Security (RLS) for isolation, plus Auth in the same project. Free tier: 500 MB DB, 1 GB storage, 2 projects | Neon: no bundled auth. SQLite/Turso: no RLS, weaker fit for a shared multi-tenant pool |
| ORM + migrations | **Drizzle** + `postgres` (postgres-js) driver | Close to SQL, plain `.sql` migrations, easy `SET LOCAL` inside transactions (which RLS needs) | Prisma: awkward with RLS and per-transaction settings |
| Auth | **Supabase Auth** (email magic link) + our own `workspace / membership / invite` tables | Free to 50K MAU, next to the data. Roles live in our DB where RLS can see them | Clerk Organizations: workspaces would live in a vendor's system. Auth.js: more to build |
| Background jobs | **Inngest** (durable steps, served from our Next.js app) | Each step is memoised, so a crashed run resumes from its last finished step (FR-RN3). A per-workspace concurrency key gives one run at a time (FR-RN1). Long Apify waits are `step.sleep`, never inside a web request. Free: 50K executions/month | Trigger.dev: also good, but code runs on their infra (a second deploy target). pg-boss / Graphile Worker: needs a paid always-on server |
| Scheduler | **None in P1** (rule 5). P2: Inngest cron | Manual runs first | Vercel Cron: Hobby allows once a day only |
| Decider | **Own `Decider` interface**: Jev primary, Claude Haiku 5.5 fallback + borderline re-check, Fake for tests | Vendor-swappable (spec §17). Per-question provider config | Calling vendors directly: breaks the swap rule. LLM frameworks: hidden behaviour, more to learn |
| Writer | **Claude Sonnet 5.5** via `@anthropic-ai/sdk` (model ID in config) | Good writing quality at about half the cost of Opus. Opus 5.5 vs Sonnet 5.5 is compared in the dry run (spec 03) | Opus 5.5 as default: about 2× the cost (~₹290 vs ~₹145 per workspace per month, est.) |
| LinkedIn + website data | **Apify** via `apify-client`, 9-actor allowlist (§5.3) | Fixed rule 2. One account, one adapter | Own scraping / other vendors: forbidden |
| Hosting | **Vercel Hobby** in P1, **Vercel Pro ($20/mo) before the first external workspace** | Native Next.js, free, functions run up to 300 s. Region `bom1` next to Supabase | Render free: sleeps, free Postgres expires. Cloudflare + OpenNext: more friction for a beginner |
| Email | P1: **Supabase built-in mailer** for login/invite emails, **Resend** (free, no domain) for spend alerts to Rahul | No domain yet. Both free | Postmark: 100 emails/month free. Custom SMTP: needs a domain (deferred) |
| Logging | **pino** JSON logs + `run_event` table + Inngest run history | Vercel Hobby keeps logs only briefly, so the DB is the durable record | Sentry / Axiom: extra services, deferred |
| Secrets | `.env.local` (gitignored) + Vercel / Inngest / Supabase dashboard env + Zod-validated `src/config/env.ts` + gitleaks in CI | The app refuses to boot when a variable is missing | Doppler-style secrets manager: unneeded in P1 |
| Dev database | **Second free Supabase project "dev"** (no Docker) | Easy on Windows. Dev and prod are separate projects with separate keys | Supabase CLI on Docker Desktop: heavy on Windows/WSL2 |
| Validation | **Zod** | One schema = runtime check + TS type | Hand-written checks |
| UI | **Tailwind + shadcn/ui** | Popular, copy-in components, no runtime lock-in | MUI: heavier, harder to restyle |
| Testing | **Vitest** + recorded fixtures + Fake providers + network blocker. Playwright (minimal) from spec 01 | Fast, TS-native | Jest: slower TS setup |
| CI | **GitHub Actions** | Free 2,000 min/month on a private repo. Postgres service container for DB tests | Vercel checks only: no DB tests |
| Package manager | **npm** | The default, nothing extra to learn | pnpm: faster but one more tool |

### 2.1 Cost as we grow (rough, order of magnitude, before pool-sharing savings)

| | 10 workspaces | 1,000 | 100,000 |
|---|---|---|---|
| Database (Supabase) | $0 → $25 Pro once >500 MB | ~$150–400 | ~$5K–15K (large dedicated Postgres, partitioned, replicas) |
| Jobs (Inngest) | $0 in P1. ~$99 once P2 2-hourly runs start | ~$300–800 | Self-host Inngest or container workers, ~$2K–5K |
| Hosting (Vercel) | $0 (P1), $20 Pro once external | ~$50–150 | ~$2K–10K, or move hot paths to containers |
| Models (Jev + Haiku + Sonnet writer) | ~$25 (≈₹2.2K, writer ~65%) | ~$2.5K, less with pooled-judgement reuse | ~$150K+ before sharing. Writer cost per delivered lead must be covered by lead-credit pricing (spec Q8) |

Apify is the biggest line (~97%, spec §17). Pool reuse is what brings it down.

---

## 3. High-level architecture

```
                       ┌───────────────────────────────────────────────────────────┐
  Browser ──HTTPS──►   │ Next.js app on Vercel (region bom1)                       │
  (owner, member,      │  • pages + server actions + route handlers                │
   admin)              │  • every request: auth session → withWorkspace(ctx, tx)   │
                       │    (role app_request, SET LOCAL app.workspace_id/user_id) │
                       │  • /api/inngest  ← Inngest calls our functions here       │
                       └────────┬───────────────────────────────┬──────────────────┘
                                │ SQL (RLS enforced)            │ "run.requested" event
                                ▼                               ▼
                 ┌───────────────────────────┐    ┌──────────────────────────────────┐
                 │ Supabase Postgres          │◄───│ Inngest (durable steps)          │
                 │  • pool layer (shared)     │SQL │  pipeline run, one per workspace │
                 │  • workspace layer (RLS)   │    │  preflight → steps → checkpoint  │
                 │  • ledgers, decisions      │    │  → stage → publish → report      │
                 │ Supabase Auth (magic link) │    │  (role app_worker)               │
                 └───────────────────────────┘    └───────────────┬──────────────────┘
                                                                  │ every paid call:
                                                                  ▼ spend.authorize → call → spend.settle
                         ┌────────────────────────────────────────────────────────────────┐
                         │ Adapters (only place vendor SDKs are imported; Zod at boundary) │
                         │  apify/     → Apify (8 harvestapi actors + website crawler)     │
                         │  jev/       → Jev  ┐                                             │
                         │  anthropic/ → Claude Haiku (Decider fallback) + Sonnet (writer) │
                         │  email/     → Resend (alerts) ; auth/ → Supabase Auth admin     │
                         └────────────────────────────────────────────────────────────────┘
                                         ▲
                         Decider (src/decider) = question registry + provider policy
                         Writer  (src/writer)  = drafts + reason lines
```

- The browser never talks to the database directly. The Supabase Data API (PostgREST) is **turned off**, so the anon key can only be used for auth.
- Web requests use the **`app_request`** DB role (RLS enforced). The pipeline uses **`app_worker`**. Migrations use the owner role and run only from CI or scripts, never from the running app.
- Nothing slow runs inside a web request. "Run now" only sends an event.

---

## 4. Data model

### 4.1 Conventions
- **IDs:** UUIDv7 (time-ordered, index-friendly on big tables).
- **Times:** `timestamptz` in UTC. IST is used only for spend windows.
- **Money:** integer **paise** (`bigint`). Vendor USD is stored in integer **micro-USD**, with `fx_rate_version` beside it. No floats for money.
- **`first_seen_at`** on every pool row. **Append-only** tables get INSERT + SELECT grants only; nobody can UPDATE them (§4.6).
- **Versions:** `icp_version`, `brief_version`, `scoring_version`, `question_version`, `config_version` are stored on the rows they produced.
- **No FK into Supabase's `auth` schema.** `app_user.id` equals the auth user ID but is a plain UUID, so CI can run on plain Postgres.
- Out of scope, permanently: no meetings, calendar or booking tables, stubs or columns.

### 4.2 Pool layer (shared, no `workspace_id`)

| Table | Key columns | Notes |
|---|---|---|
| `person` | id, first_seen_at, merged_into_id | One row per real person. Merges keep the old ID pointing to the survivor |
| `person_identity` | person_id, kind (`public_url`/`urn`/`vendor_id`), value_normalised, first_seen_at · UNIQUE(kind, value_normalised) | Merges different IDs/URLs into one person (spec §18) |
| `person_snapshot` | id, person_id, fetched_at, status (`complete`/`partial`), full_name, headline, current_title, current_company_id, country_code, location_raw, job_start_date, source_actor, raw_payload_id | Append-only. Profile reuse: newest `complete` snapshot < 30 days (FR-LK1) |
| `company` / `company_identity` | as for person, kinds `linkedin_url`/`domain`/`vendor_id` | |
| `company_snapshot` | company_id, fetched_at, size_band, employee_count, industries[], hq_country, website_domain, description, last_funding_round | Append-only. Reused < 90 days (FR-LK5) |
| `post` | id, vendor_post_id UNIQUE, url, author_person_id / author_company_id, text, language, posted_at, first_seen_at, gone_at | Each post found once (FR-TS2). `gone_at` = deleted or private (§18) |
| `post_count_snapshot` | post_id, checked_at, comment_count, reaction_count | Append-only. Drives the comment-growth rule (FR-CM2) |
| `comment` | id, vendor_comment_id UNIQUE, post_id, author_person_id, author_headline, text, commented_at, time_is_estimate, is_reply, first_seen_at, raw_payload_id | Append-only. The UNIQUE key is what makes each comment **paid for once** (AC-9) |
| `title_judgement` | title_normalised UNIQUE, seniority, function, decision_id | Asked once ever per unique title (FR-G2-2) |
| `pool_judgement` | subject_type, subject_id, question_id, question_version, input_fingerprint, answer, confidence, decision_id · UNIQUE(question_id, question_version, input_fingerprint) | Post quality, author type, comment quality class: judged once for everyone |
| `raw_payload` | id, vendor, actor, vendor_run_id, fetched_at, **expires_at** (+30 days), body jsonb | Hard-deleted at expiry (FR-PV3) |
| `raw_payload_person` | raw_payload_id, person_id | Lets a deletion request find and delete raw payloads that mention the person |
| `suppression_identifier` | identifier_hash UNIQUE (sha256 of kind + normalised value), created_at, deletion_request_id | Holds **no readable PII**. Checked at ingest on every known ID (FR-PV6) |
| `reaction` [P2] | — | Table added in spec 11 |

### 4.3 Workspace layer (`workspace_id NOT NULL`, RLS on every table)

| Table | Key columns | Notes |
|---|---|---|
| `workspace` | id, name, own_company_domain, own_company_linkedin_url, timezone, created_at, deleted_at | |
| `app_user` | id (= auth user id), email, is_super_admin | Global, but readable only for yourself and fellow members |
| `membership` | workspace_id, user_id, role (`owner`/`member`) | A person can belong to several workspaces (spec §3) |
| `invite` | workspace_id, email, role, token_hash, expires_at, accepted_at | Invite-only (spec §3) |
| `icp_version` / `brief_version` | workspace_id, version_no, body jsonb (Zod-validated), status (`draft`/`approved`), approved_by, approved_at | Never edited after approval. An edit creates a new version (FR-ON8) |
| `similar_company` | workspace_id, name, linkedin_url, domain, label (`competitor`/`complement`), label_source (`owner`/`decider`), **origin (`manual`/`search`)**, confirmed_at | P1: `origin = manual` only. `search` is reserved for the deferred auto-search (§10) |
| `competitor` | workspace_id, company_id, similar_company_id, linkedin_page_confirmed_at | Confirmed competitors become sources (FR-ON5, FR-ON7) |
| `exclusion` | workspace_id, kind (`company`/`domain`/`title_word`/`country`), value | The workspace's own company is always excluded (FR-ON9) |
| `source` | workspace_id, kind (`topic_phrase`/`competitor`/`creator`[P2]), value, status (`active`/`paused`/`auto_paused`), last_searched_at, empty_run_count | FR-TS1–3 |
| `workspace_post_link` | workspace_id, post_id, source_id, first_seen_at · UNIQUE(workspace_id, post_id) | How a workspace reaches pool posts and comments (FR-CM7) |
| `gate1_result` | workspace_id, post_id, run_id, passed, reason, audience_score, theme, taste_test_hits, exploration | FR-G1. Failures recorded with reason (FR-G1-5) |
| `gate2_result` | workspace_id, person_id, post_id, run_id, outcome (`pass`/`borderline`/`fail`), reason, expected_value | FR-G2 |
| `run` | id, workspace_id, triggered_by, admin_override, status, started_at, finished_at, icp_version_id, brief_version_id, config_version, report jsonb | **Partial UNIQUE(workspace_id) WHERE status = 'running'** as a backstop to the Inngest concurrency key |
| `run_step` | run_id, step_key, status, vendor_run_id, checkpoint jsonb | Resume data. Stores the Apify run ID so a resumed step re-reads that run instead of buying again |
| `run_event` | run_id, workspace_id, at, level, step_key, kind, data jsonb | Durable log + run report source. IDs only, never scraped text |
| `lead` | id, workspace_id, person_id, current_score_id, status (NEW/READY/DELIVERED/ACTED/DISMISSED), first_seen_at, delivered_at · UNIQUE(workspace_id, person_id) | One per (workspace, person) |
| `lead_score` | id, workspace_id, lead_id, run_id, scoring_version, icp_version_id, brief_version_id, fit, fit_parts jsonb, warmth, warmth_parts jsonb, reason_strength (`direct`/`contextual`/`activity`), reason_item_ref, reason_line, bucket, **published** (bool), created_at | Append-only. Re-scores add rows; publish moves `lead.current_score_id` in one transaction (FR-RN4, FR-SC9/10) |
| `lead_evidence` | workspace_id, lead_id, comment_id / post_id, quote, kind | The quotes and post links on every reason (FR-RS5) |
| `lead_feedback` | workspace_id, lead_id, user_id, rating (`up`/`down`), reason_pick, reason_text, mapped_reason, decision_id, created_at | Append-only, latest row wins (FR-FB1) |
| `source_yield` | workspace_id, source_kind, source_ref (topic phrase / competitor / author person_id), engagers, qualified_or_better, window_start, window_end | **Per workspace in P1** (FR-FB4). The pooled aggregate comes in P2 |

### 4.4 Ledgers, decisions and admin

| Table | Key columns | Notes |
|---|---|---|
| `decision_record` | id, workspace_id (NULL for pool judgements), run_id, question_id, question_version, input_fingerprint, provider, model, model_version, probs jsonb, confidence, final_answer, borderline, rechecked_by_decision_id, cost_ledger_id, latency_ms, created_at | Every judgement (FR-FB3). **No access for `app_request`**: admin only |
| `cost_ledger` | id, idempotency_key UNIQUE, run_id, workspace_id (NULL if pooled), step, vendor, item_ref, estimate_paise, actual_paise, actual_micro_usd, fx_rate_version, status (`reserved`/`settled`/`released`), reserved_at, settled_at | Internal vendor cost (FR-CRD3). Append-only: settling writes a new row that references the reservation, never an update |
| `cost_allocation` | cost_ledger_id, workspace_id, share_paise | Equal split of a pooled item across the workspaces that used it (FR-CRD6, spec Q10). Internal only |
| `spend_counter` | window_kind (`day`/`month`), window_start (IST), reserved_paise, settled_paise · UNIQUE(window_kind, window_start) | One row per IST day and per IST month. Locked by `authorize()` |
| `lead_credit_ledger` | id, workspace_id, lead_id, delta, reason, created_at · UNIQUE(lead_id, reason) | **Table only in P1** (FR-LC3). Logic comes in P2 (spec 10) |
| `app_settings` | key, value, updated_by, updated_at | Runtime switches only: `kill_switch` (+ reason). Caps live in config, not here |
| `deletion_request` | id, received_at, requester_contact, identifiers_hash[], status, handled_by, handled_at | FR-PV2. Admin console |
| `golden_item` (spec 03) | question_id, item_ref, label, labelled_by | Admin-only, held in the DB, **not in git** (it contains scraped text) |

### 4.5 Isolation in the database (RLS)
- Helper `app_current_workspace()` (SECURITY DEFINER, STABLE) returns `current_setting('app.workspace_id')` **only if** `app.user_id` has a membership in it. Otherwise it returns NULL, so every policy matches nothing.
- **Workspace tables:** `USING (workspace_id = app_current_workspace())` for role `app_request`, plus `WITH CHECK` on writes.
- **`lead` / `lead_score`:** `app_request` sees a row only when it is **published** and its bucket is **not Hidden**. "Hidden people never appear anywhere" (AC-8) is therefore enforced by the DB.
- **Pool tables:** `app_request` can read a pool row only when it is linked to the caller's workspace (e.g. `person` via a visible `lead`, `post` via `workspace_post_link`, `comment` via `lead_evidence`). A workspace can never browse the pool.
- **`decision_record`, `cost_*`, `spend_counter`, `raw_payload`, `suppression_identifier`, `deletion_request`:** no grants to `app_request`.
- **`app_worker`** (pipeline) and the admin console (after an `is_super_admin` check) work across workspaces. Their queries are scoped in code (every function takes `workspaceId`) and covered by tests. An ESLint import rule stops the worker DB client from being imported by any page or route except `/api/inngest` and `/admin`.

### 4.6 History, deletion and retention
- Append-only tables (`*_snapshot`, `comment`, `post_count_snapshot`, `lead_score`, `lead_feedback`, `cost_ledger`, `decision_record`, `run_event`) have no UPDATE/DELETE grant for any app role.
- The only hard deletes go through two SECURITY DEFINER functions:
  - `privacy_delete_person(person_id)`: deletes the person, identities, snapshots, comments, raw payloads that mention them (via `raw_payload_person`), decision records about them, and every workspace's lead, score, evidence and feedback rows. It then inserts all known identifier hashes into `suppression_identifier`. Called only from the admin console (FR-PV2, AC-15).
  - `purge_expired_raw_payloads()`: deletes raw payloads past `expires_at` (FR-PV3). It runs as step 1 of every manual run, and there is an admin button. No cron in P1.
- Workspace deletion: the workspace layer is deleted and pool facts stay (spec §18).

### 4.7 Scale notes (1 → 100,000 workspaces, same model)
- The pool grows with *unique people and posts*, not with workspaces, so growth is sub-linear.
- Every workspace table is indexed `(workspace_id, …)` first.
- **Partition** by month (on `created_at`) for `comment`, `decision_record`, `cost_ledger`, `lead_score` and `run_event` once a table passes ~10M rows. The design allows it; we don't build it now.
- Connection pooling: Supabase pooler in **transaction mode**. `SET LOCAL` is safe because it lives inside the transaction. Prepared statements are off (`prepare: false`).
- FR-MT2's matching index (P3) is a new table, not a change to existing ones.

---

## 5. Core design decisions

### 5.1 Decider (`src/decider/`)
- **Interface:** `decide(questionRef, input, ctx) → { answer, probs, confidence, borderline, provider, model, modelVersion, costPaise, decisionId }`.
- **Question registry:** one file per question version, e.g. `questions/gate1.injection.v1.ts`, holding `{ id, version, type: yesno|choice|score, layer: pool|workspace, prompt, options (always incl. "unclear"/"other"), thresholds, borderlineBand, provider }`. **Changing one word means a new version file.** Old versions stay for audit.
- **Providers:** `JevProvider` (adapter `jev/`), `HaikuProvider` (adapter `anthropic/`, model `claude-haiku-5-5`), `FakeProvider` (tests).
  - **Per-question provider**, versioned in config (decisions log #3). Default: primary Jev, fallback Haiku.
  - Haiku has no logprobs. Its "probabilities" are the model's **stated** per-option confidence, returned with structured output (enum answer + confidence). Haiku gets a **narrower borderline band**, and its calibration is measured on the golden set (decisions log #2).
- **Policy (`policy.ts`):**
  1. If a pool question already has a `pool_judgement` with the same fingerprint and version, reuse it (no cost).
  2. Otherwise call the primary provider (Jev), with up to 2 retries.
  3. On failure or timeout, call the fallback (Haiku).
  4. If the confidence lands inside the borderline band, re-check with Haiku. If the two disagree, the answer is **unclear**.
  5. Any failure, "unclear" or low confidence becomes **no** (fail closed, spec §17). The run continues (spec §18).
- **Fingerprint:** `sha256(questionId + version + canonical JSON of the normalised input)`.
- **Records:** every call writes a `decision_record`. Paid calls go through the spend guard (§5.6), and the ledger row is linked.
- **Injection guard:** scraped text goes into the prompt only inside a fenced block with a random per-call delimiter, marked as data to judge, never instructions. Answers are constrained to the enum by structured output, so nothing free-form comes back. The pool injection question (FR-G1-3) runs before any workspace question on a post.
- **Golden-set gate (FR-FB5):** pipeline questions (Gate 1, Gate 2, comment quality, reason, scoring helpers) must reach ≥ 85% agreement in spec 03 before going live. Onboarding questions (ICP check, similar-company labels) are **advisory**: the owner confirms every result (decisions log #4).
- A judgement may only filter or rank. Decider code has no access to the spend, send or write paths beyond writing its own decision record.

### 5.2 Writer (`src/writer/`)
- Claude via `@anthropic-ai/sdk` (adapter `anthropic/`). The model ID is in config, default `claude-sonnet-5-5` (decisions log #9).
- **ICP and Brief drafts:** structured output against the Zod schemas of `icp_version.body` / `brief_version.body` (limits from FR-ON2: ≤ 8 pains, ≤ 8 triggers, ≤ 12 topics, ≤ 8 rules).
- **Reason lines (FR-RS4):** only for Direct/Contextual leads in Qualified or better. Code checks that every quote in the line appears word-for-word in the source text. If it doesn't, the fixed template line is used instead. Activity leads always get the template.
- Prompts are versioned like Decider questions. Source text is fenced as data.

### 5.3 Adapters (`src/adapters/`)
- **Vendor SDKs are imported only here**, enforced by an ESLint `no-restricted-imports` rule (`apify-client`, `@anthropic-ai/sdk`, the Jev client, `resend`, `@supabase/*`).
- Every response is parsed with Zod at the boundary. Invalid items are dropped and counted, never passed on.
- When `PAID_CALLS_ENABLED` is not `true` (the default in dev and tests), adapters resolve to Fake providers that replay recorded fixtures.
- **Apify (`apify/`):**
  - **Allowlist (9 actors):** `harvestapi/linkedin-post-search`, `harvestapi/linkedin-company-posts`, `harvestapi/linkedin-profile-posts`, `harvestapi/linkedin-post-comments`, `harvestapi/linkedin-post-reactions` [P2], `harvestapi/linkedin-profile-scraper`, `harvestapi/linkedin-company`, `harvestapi/linkedin-job-search` [P2], **`apify/website-content-crawler`** (onboarding, FR-ON2). Any other actor ID is a hard error. No actor ever gets cookies or an account.
  - **One call = one actor run** (decisions log #5). Batches auto-split so each run's estimate is ≤ ₹20. Each run gets `maxItems` and an Apify-side max total charge set from its reservation. Whether this is honoured gets verified in the dry run (spec §22-7).
  - Flow inside an Inngest step: `start` (store `vendor_run_id` in `run_step`) → `step.sleep` + `status` polling → `ingest` (read the dataset in pages, validate, check suppression, insert). **A failed or aborted Apify run ingests nothing** (spec §18), and is retried once.
  - Website crawler: start URL = the owner's website. `crawlerType` is the cheapest HTTP mode, and max pages / depth come from config (a few pages). Output is text only.
- **Jev (`jev/`):** Jev's HTTP API (its official SDK if one exists). Typed questions in, per-option probabilities out.
- **Anthropic (`anthropic/`):** Haiku (Decider fallback) and Sonnet (writer). Usage-based cost is read from `response.usage`.
- **Email (`email/`):** Resend, free tier, no domain. P1 sends only spend/kill-switch alerts to `ALERT_EMAIL`.
- **Auth (`auth/`):** Supabase Auth helpers (`@supabase/ssr` for sessions, admin invite with the service-role key, server-only).

### 5.4 Run engine (`src/pipeline/`)
- **Trigger:** "Run now" (owner or admin) writes a `run` row and sends the Inngest event `run.requested`. Nothing slow happens in the request.
- **Concurrency:** Inngest `concurrency: { key: workspaceId, limit: 1 }`, plus the partial UNIQUE index on `run`. A second click is refused (spec §18).
- **Preflight (FR-RN2), before any spend:**
  - kill switch off
  - day / month / run budget left
  - ICP and Brief approved
  - vendors reachable (free status calls)
  - **max 1 run per workspace per IST day**, unless the admin overrides (decisions log #11)

  If preflight fails, there is no run and the owner gets a clear message (e.g. when the monthly cap resets).
- **Steps:** each pipeline stage is a plain function `(ctx, input) → output` in `src/pipeline/steps/`, wrapped in `step.run`. Steps write to the DB and return **counts and IDs only** (Inngest step outputs stay small). Batches are sized so one step finishes well within Vercel's 300 s.
- **Resume without paying twice (FR-RN3, AC-6):**
  1. Inngest memoises finished steps.
  2. `run_step.vendor_run_id` makes a resumed step re-read an Apify run that already started.
  3. The `cost_ledger.idempotency_key` is `run:step:item`.
  4. Pool UNIQUE keys (`comment.vendor_comment_id`, `post.vendor_post_id`) plus the reuse windows (30-day profile, 90-day company) stop re-buying.
- **Stage → publish (FR-RN4):** new `lead_score` rows are written with `published = false`. The final step flips them and moves `lead.current_score_id` in **one transaction**, then sets status DELIVERED (P1, FR-LD5). A broken run publishes nothing.
- **Version pinning:** a run uses the ICP, Brief and config versions it started with (spec §18). A new version triggers a re-score from pooled data with no purchases (FR-SC9).
- **Cap reached mid-run:** stop new spend, finish scoring what was already bought, publish (spec §18).
- **Run report (FR-RP):** built from `run_event`, `cost_ledger` and `lead_score` at publish, stored in `run.report`.

### 5.5 Scheduler [P2, design only]
No cron and no scheduler code in P1 (rule 5). For spec 09/10: an Inngest cron every 15 minutes finds workspaces whose cadence or delivery time (in their own time zone) is due and sends one event per workspace. Delivery, express lane and pacing (FR-DR) run as their own Inngest functions. The data model already has `workspace.timezone` and lead status `READY`.

### 5.6 Spend guard and ledgers (`src/spend/`)
- **Spec 00, minimal guard (FR-CRD5, with decisions log #5):**
  - `authorize({ vendor, purpose, estimatePaise, idempotencyKey, runId?, workspaceId? })` runs in one transaction. It:
    1. refuses if `kill_switch` is on;
    2. refuses if `estimatePaise > ₹20` (one call = one vendor request / actor run);
    3. locks today's and this month's `spend_counter` rows (`SELECT … FOR UPDATE`, IST windows);
    4. refuses if `day.reserved + estimate > ₹200` or `month.reserved + estimate > ₹4,000`;
    5. writes a `reserved` `cost_ledger` row, adds the estimate to both counters, and returns a reservation with the vendor-side max charge.
  - `settle(reservationId, actual)` writes the settled row. Counters use `max(estimate, actual)`, so an under-estimate can't hide spend. `release()` covers calls that never happened.
  - **Hitting any cap:** the call is refused, `kill_switch` is set on with the reason, an alert email goes to `ALERT_EMAIL`, and the admin console shows a banner. Turning the switch back off is a manual admin action. In-flight calls still settle (FR-CRD2).
  - **No reservation, no call.** Adapters only take a reservation object; there is no code path to a paid call without one.
- **Spec 04, full reserve/settle (FR-CRD1–3):** adds **per-run ₹200**, per-workspace and global monthly caps, still on the same ledger and counters. Also `cost_allocation` (equal split, FR-CRD6) and the `lead_credit_ledger` table (FR-LC3, no logic).
- **Estimates:**
  - Apify: price per item (config price table, verified in the dry run) × `maxItems`.
  - Claude: input characters ÷ 3.5 and `max_tokens` × price.
  - Jev: input tokens × price.
- **Actuals:**
  - Apify: the run's charged usage.
  - Claude/Jev: `usage` in the response.

  The ledger must match the Apify bill within 2% (AC-4).
- **Backstop:** Apify's account-level monthly usage limit is set below ₹4,000 (spec §22-12).

### 5.7 Config (`src/config/`)
- `env.ts`: Zod-validated environment. The app won't boot with a missing variable. Variables:
  - Supabase URL and anon key, service-role key (server only)
  - `DATABASE_URL_REQUEST`, `DATABASE_URL_WORKER`, `DATABASE_URL_MIGRATE` (CI and scripts only)
  - Inngest keys
  - `APIFY_TOKEN`, `JEV_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`
  - `PAID_CALLS_ENABLED`
  - **`APP_NAME`, `APP_URL`/`APP_DOMAIN`, `EMAIL_FROM`, `ALERT_EMAIL`, `CONTACT_EMAIL`**

  The app name, domain and sender are **never hard-coded** (decisions log #6). `.env.example` lists every variable with a dummy value.
- `defaults/v1.ts`: versioned business config (`config_version`). It holds:
  - caps: ₹20 call / ₹200 day / ₹4,000 month / ₹200 run
  - the FX rate and its version
  - the vendor price table
  - fit weights, warmth inputs, bucket lines, Gate thresholds, comment-pull limits, reuse windows, retention days
  - `max_runs_per_workspace_per_day = 1`
  - the writer model ID and per-question Decider providers
  - crawler page limits

  Values come from the spec defaults. **No magic numbers** in code.

### 5.8 Security
- **Isolation:** RLS (§4.5) + code scoping + isolation tests (§7). Admin routes check `is_super_admin` server-side.
- **Auth:** Supabase magic link, public sign-up **disabled**, invite-only. Sessions via `@supabase/ssr` cookies. The service-role key is used only server-side in `adapters/auth/`.
  - P1 email limit: Supabase's built-in mailer sends only to members of the Supabase org team. Anyone else who needs to log in during P1 (e.g. the second founder doing blind ratings) is added as a team member. Moving to custom SMTP (Resend + a domain) is deferred.
- **Injection:** scraped text is fenced as data in every prompt, answers are enum-constrained, and the injection pool question runs first (§5.1).
- **Rendering:** scraped text is plain text only. ESLint `react/no-danger` bans `dangerouslySetInnerHTML` (FR-PV5).
- **CSV (FR-LD4, AC-12):** a server route under `withWorkspace`, using `csv-stringify` + `escapeFormula()`. Any cell starting with `=`, `+`, `-`, `@`, tab or CR gets a `'` prefix and is quoted.
- **Suppression at ingest (FR-PV6):** every incoming person's identifiers are hashed and checked against `suppression_identifier` **before** anything is stored. Matches are dropped and counted only.
- **Secrets:** never in git. gitleaks runs in CI. Logs never include secrets or scraped text.
- **Production DB:** schema changes only via migrations. Prod migrations run from a GitHub Actions workflow behind a manually approved environment, never from a dev machine.

---

## 6. Main flows: the 10 pipeline steps mapped to components

| # | Step (spec §7) | Layer | Components | Tables written | Paid calls (via spend guard) |
|---|---|---|---|---|---|
| 1 | Onboarding | Workspace | `app/(app)/w/[ws]/onboarding` wizard. Inngest fn `onboarding.draft` (crawl takes minutes) → `writer.draftIcpBrief` → owner edits → approve. ICP check (FR-ON4): profile/company lookup + advisory Decider. Similar companies: **owner types them** and picks competitor/complement (P1) | `icp_version`, `brief_version`, `similar_company`, `competitor`, `exclusion`, `source` (topic phrases) | `apify/website-content-crawler`, writer (Sonnet), profile/company actors for ICP check, Decider |
| 2 | Find posts | Pool + workspace | `steps/find-posts.ts`: per active source, posts since `last_searched_at` (first: 14-day backfill) | `post`, `raw_payload`, `workspace_post_link`, `source` | `linkedin-post-search`, `linkedin-company-posts` |
| 3a | Gate 1, post quality | Pool | `steps/gate1-pool.ts`: free rules, then Decider (injection, bait, hiring, author type), cached once per post | `pool_judgement`, `decision_record` | Decider |
| 3b | Gate 1, audience fit | Workspace | `steps/gate1-workspace.ts`: author yield (`source_yield`), Decider audience score + theme, taste test (≤ 5 comments) for authors with no track record, ≤ 5% exploration | `gate1_result`, `comment` (taste test kept) | Decider, `linkedin-post-comments` (taste test) |
| 4 | Collect comments | Pool | `steps/collect-comments.ts`: cheap post refresh → `post_count_snapshot`. Pull only if growth ≥ 3, only newer than the last pull, per-post limit. Skips author/team/own members. Comment quality class via Decider (pool) | `post_count_snapshot`, `comment`, `pool_judgement` | post refresh (actor chosen in dry run, §22-4), `linkedin-post-comments`, Decider |
| 5 | Gate 2 | Workspace (+ pool title cache) | `steps/gate2.ts`: free rules (dupes, own staff, competitor staff, author's team, excluded words), Decider headline fit + seller check, `title_judgement` cache, lookup queue by expected value | `gate2_result`, `title_judgement` | Decider |
| 6 | Profile + company lookup | Pool (+ workspace company judgements) | `steps/lookups.ts`: reuse < 30 days / < 90 days, else buy. PARTIAL → retry once next run. Never guessed. FR-LK7 Decider per workspace | `person_snapshot`, `company_snapshot`, `person_identity`, `decision_record` | `linkedin-profile-scraper`, `linkedin-company`, Decider |
| 7 | Score: fit, warmth, reason | Workspace | `src/core/scoring/fit.ts`, `warmth.ts` (pure, code), Decider for industry / soft match / reason item / said-it-themselves, writer reason line for Qualified+ Direct/Contextual | `lead`, `lead_score` (staged), `lead_evidence` | Decider, writer |
| 8 | Bucket | Workspace | `src/core/scoring/buckets.ts` (pure). Decider tie-break within 5 points | `lead_score.bucket` | Decider (ties) |
| 9 | Match + deliver | Workspace | `steps/match.ts`: score the same person for other workspaces linked to the same post (FR-MT1, no new data cost). Exposure cap (FR-MT3) counted across workspaces by `app_worker`. `steps/publish.ts`: one-transaction publish → DELIVERED | `lead`, `lead_score.published` | none |
| 10 | Feedback + yield | Workspace | 👍/👎 server action. Decider maps free-text 👎 reasons. `steps/yield.ts` after publish: `source_yield`, auto-pause sources after 4 runs with no Qualified+ lead (FR-TS3) | `lead_feedback`, `source_yield`, `source.status` | Decider (reason mapping) |

The run wrapper adds **step 0** (preflight + raw-payload purge) and a final **report** step.

---

## 7. Testing + CI

- **No paid calls in tests or local dev.** `PAID_CALLS_ENABLED` defaults to false, so adapters use Fake providers with recorded fixtures. A Vitest setup file installs a **network blocker** that fails any request to a non-local host.
- **Fixtures** (`tests/fixtures/{apify,jev,anthropic}/…`) are recorded in the dry run (spec 03) and **scrubbed before commit**: names, URLs, IDs and text are replaced by `scripts/fixtures/scrub.ts`. No real personal data goes in git.
- **Unit tests** (`tests/unit`, no DB, run anywhere): scoring, buckets, warmth decay, gates' free rules, Decider policy (fallback, borderline, fail-closed), spend-guard maths, CSV escaping, Zod adapters on fixtures. Fixed inputs → fixed outputs.
- **DB tests** (`tests/db`, `tests/isolation`):
  - **In CI:** a `postgres:17` service container, migrations applied, roles created. Full suite, including tests that need COMMIT (e.g. two parallel `authorize()` calls can't both pass the daily cap).
  - **Locally:** against the **dev** Supabase project. Every test runs inside a transaction that is **always rolled back**, so dev data is never changed.
- **Isolation tests (AC-11):** for every route handler, server action and export, user A must get nothing from workspace B (rows, counts, 404 vs 403 leaks, CSV). Each feature registers its endpoints in `tests/isolation/endpoints.ts`. A CI check fails if any `route.ts` or server-action file is missing from that list. Playwright (minimal, from spec 01) covers page-level isolation.
- **Acceptance criteria:** every feature spec's ACs map to named tests (see each `NN-*.qa.md`).
- **CI (GitHub Actions, every push and PR):** `npm ci` → `npm run lint` (incl. import and no-danger rules) → `npm run typecheck` → `npm test` → Postgres service + `npm run db:migrate` + `npm run test:db` → gitleaks → migration drift check (schema vs migrations). Vercel builds preview deploys from PRs.
- **Prod migrations:** a separate workflow on `main`, behind a GitHub environment that needs manual approval.

---

## 8. Folder structure

```
Leadwake/
├─ CLAUDE.md
├─ docs/technical-design.md
├─ specs/                         master spec + NN-feature.md / .qa.md / .tasks.md
├─ src/
│  ├─ app/                        Next.js routes
│  │  ├─ (public)/privacy, terms  public legal pages (contact email from config)
│  │  ├─ (app)/w/[workspaceId]/   inbox, leads, leads/[id], onboarding, settings, runs
│  │  ├─ admin/                   caps + kill switch, runs, decision quality, deletions
│  │  └─ api/                     inngest/route.ts, export/csv/route.ts
│  ├─ adapters/                   ONLY place vendor SDKs are imported
│  │  ├─ apify/                   client, actor allowlist, Zod schemas, fakes
│  │  ├─ jev/  anthropic/  email/  auth/
│  ├─ core/                       pure functions, no I/O: scoring/, gates/, csv/, money/
│  ├─ decider/                    interface, policy, questions/<id>.v<n>.ts, records
│  ├─ writer/                     drafts, reason lines, versioned prompts
│  ├─ spend/                      guard (authorize/settle), ledger, counters
│  ├─ pipeline/                   Inngest functions + steps/
│  ├─ db/                         client.ts (request/worker), withWorkspace.ts,
│  │                              schema/pool/, schema/workspace/, schema/ledger/,
│  │                              migrations/, rls/
│  ├─ config/                     env.ts, defaults/v1.ts
│  └─ lib/                        logger, ids (uuidv7), time (IST windows)
├─ tests/                         unit/, db/, isolation/, fixtures/, e2e/ (from spec 01)
├─ scripts/                       dry-run/ (own caps), fixtures/scrub.ts
└─ .github/workflows/             ci.yml, migrate-prod.yml
```

---

## 9. Build order (features 00–08)

| # | Feature | Depends on | Builds (technical) |
|---|---|---|---|
| 00 | Skeleton | none | Next.js app, Drizzle + roles + `withWorkspace` stub, `env.ts` + `defaults/v1.ts`, logger, ESLint rules, CI, gitleaks, network blocker. **Minimal spend guard** (₹20 call / ₹200 day / ₹4,000 month / kill switch, IST windows) + `cost_ledger` + `spend_counter` + alert email. **Decider / writer / Apify interfaces with Fake providers** (decisions log #4). CLAUDE.md commands become real |
| 01 | Login and workspaces | 00 | Supabase Auth (magic link, invite-only), `app_user`, `workspace`, `membership`, `invite`, switcher, RLS + `app_current_workspace()`, isolation test harness + Playwright minimal, public privacy/terms pages, super-admin flag |
| 02 | Onboarding | 01 | Real adapters for writer (Sonnet), Decider (Jev + Haiku), Apify (`website-content-crawler`, profile, company), all behind the spend guard. ICP/Brief versions, ICP check (**advisory**), **manual** similar companies, competitors, exclusions, FR-WS1 settings |
| 03 | Dry run + golden set | 00, 02 (adapters) | `scripts/dry-run/*` with their own caps. Verify spec §22 (prices, filters, timestamps, max-charge support, no-cookie status of all 9 actors). Record + scrub fixtures. `golden_item` labelling. **Pipeline questions ≥ 85%**. Opus vs Sonnet writer comparison → revise the §17 estimate. **Go/no-go for 04–08** |
| 04 | Run engine and spend | 01, 03 | Pool tables + identity + suppression at ingest, Inngest run function, preflight (incl. once-a-day rule), `run_step` checkpoints, stage/publish, **full reserve/settle + per-run ₹200 + per-workspace/global caps**, `cost_allocation`, `lead_credit_ledger` (table), `decision_record`, raw-payload purge, kill switch in the admin console |
| 05 | Sources and Gate 1 | 02, 04 | Topic phrases + competitor sources, find-posts step, Gate 1 pool + workspace, taste test, exploration share, hiring posts (FR-HP1–3) |
| 06 | Comments, Gate 2, lookups | 05 | Comment growth + pulls, comment quality class, Gate 2, `title_judgement`, profile/company lookups with reuse, PARTIAL handling, post authors as leads (FR-AU) |
| 07 | Scoring, inbox, leads | 06 | `core/scoring` (fit, warmth, reason, buckets), writer reason lines, `lead_score` + publish, re-score on new versions, inbox, all leads, lead detail, **CSV export**, FR-MT1 |
| 08 | Report, feedback, admin | 07 | Run report, 👍/👎 + reason mapping, `source_yield` + auto-pause, admin console (decision quality, exploration, runs needing review, vendor health), **deletion requests** (`privacy_delete_person`), owner usage view |

Critical path: 00 → 01 → 02 → 03 (gate) → 04 → 05 → 06 → 07 → 08.

---

## 10. Deferred (YAGNI): the data model leaves room, no code now

| Item | When | Room kept |
|---|---|---|
| Scheduler (2-hourly runs), drip, express lane, openers | P2 (09, 10) | `workspace.timezone`, lead status READY, §5.5 |
| Lead-credit logic, bad-lead replacements | P2 (10) | `lead_credit_ledger` table from 04 |
| Reactions, creators, job-listing hiring signals | P2 (11) | Actor allowlist already lists them, `source.kind = creator` |
| **Public similar-companies search** (FR-ON5 auto-listing) | Later (needs spec update) | `similar_company.origin = 'search'`, `label_source = 'decider'` |
| Pooled (cross-workspace) yield aggregate | P2 | `source_yield` per workspace now |
| **Client credit bar + top-up** | P3 (with payments) | `lead_credit_ledger` |
| Contact lookup, CRM/webhook delivery, payments | P3 | none needed now |
| Matching index (FR-MT2) | P3 | New table later |
| Table partitioning, read replicas, Redis | When a table passes ~10M rows | §4.7 |
| Sentry / log service | When errors need it (ask first) | pino JSON already |
| Custom email domain + Resend as Supabase SMTP | When a domain exists | `EMAIL_FROM` / `APP_DOMAIN` in config |
| Non-English posts | P3 | `post.language` stored |

---

## 11. Decisions log (Rahul, 27 Oct 2026)

| # | Topic | Decision |
|---|---|---|
| 1 | Jev | Access confirmed. Jev primary, Haiku fallback + borderline re-check |
| 2 | Haiku probabilities | Stated confidence via structured output, narrower borderline band, calibrated on the golden set |
| 3 | Provider per question | Yes, per-question provider config, versioned |
| 4 | Build order | 00 ships Decider/writer/Apify interfaces + Fakes. 02 uses real adapters, onboarding judgements advisory (owner confirms). Golden-set gate applies to pipeline questions in 03 |
| 5 | Caps | One call = one vendor request / actor run, batches auto-split ≤ ₹20. Per-run ₹200, daily ₹200, monthly ₹4,000. Day and month windows reset at IST midnight |
| 6 | Email | No domain yet. Supabase built-in mailer for P1 logins; spend alerts to Rahul's own email. App name, domain and sender in config, never hard-coded |
| 7 | Hosting | Vercel Hobby in P1; Pro only before the first external workspace |
| 8 | Similar companies | Public search dropped from P1. Owner types them manually. Search deferred, data model keeps room |
| 9 | Writer | Sonnet 5.5 default, model ID in config. Opus vs Sonnet compared in the dry run, then the estimate is revised |
| 10 | Yield | Per workspace in P1 |
| 11 | Run now | Max 1 per workspace per day; admin can override |
| — | Dev database | Second free Supabase project "dev". No Docker |
| — | Website reading | `apify/website-content-crawler` through the Apify adapter + spend guard (Apify-only data) |

---

## 12. Pending spec changes (need Rahul's approval; master spec not yet edited)

These decisions change approved text in `specs/master-spec.md` v1.1. Per CLAUDE.md, the spec is not edited silently. They should go into a v1.2 before the features that touch them (00, 02).

1. **§5 rule 3 + §23 Q3:** per-run cap ₹300 → **₹200**.
2. **FR-CRD5:** the minimal spend guard also enforces the **₹4,000 monthly cap**, with day and month windows at **IST midnight**. **CLAUDE.md fixed rule 3** ("per-call limit, daily limit, kill switch") should add "monthly limit" too.
3. **FR-ON5, FR-ON6, §4.1 ("similar-company sorting"), §19 AC-2:** in P1 the owner enters similar companies manually and labels them. Public search moves to a later phase.
4. **§16.3:** add `apify/website-content-crawler` to the approved actors. §16.3 requires "No cookies or account required". This actor crawls public websites with no LinkedIn login, but its listing may not use that exact wording, so §16.3 needs a line for non-LinkedIn actors. It is re-verified in the dry run (§22-11).
5. **§16.1 Inputs:** the "Website" row becomes "Website (read via Apify `website-content-crawler`)".

### Small questions for later feature specs (not blocking this design)
- FR-WS1 "see caps and usage": what exactly does an owner see? FR-CRD6 says cost to serve is never shown to clients. Suggested for spec 08: runs, leads and run allowance, with no ₹ figures.
- Which actor gives the "cheap post refresh" for comment counts (spec §22-4)? Decided in the dry run.
