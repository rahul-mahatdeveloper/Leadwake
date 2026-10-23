# Tech Design Inputs — Data Acquisition & Decision Logic

> **Not a spec.** These are inputs for writing `docs/technical-design.md` in Claude Code Plan Mode, together with `00-master-spec.md` (product) and `00b-risk-register.md` (risks R1–R45).
> v2 · 2026-10-23 · Every actor fact below was checked on its Apify Store page today (inputs, prices, sample output). Items marked **VERIFY** must be confirmed in the first small data pull (§8) before the plan is final.

---

## 1. Lead routes: where leads come from

A "route" = which posts we start from + who on those posts can become a lead.

| # | Route | Start from | Who becomes a lead | Signal | Phase |
|---|-------|-----------|--------------------|--------|-------|
| **R-A** | **Keyword → Author** | Posts matching a keyword, **written by people whose headline matches the ICP** | The post author | Strongest. They *wrote* about the pain/competitor/trigger | 1 |
| **R-C** | **Keyword → Commenters** | Posts matching a keyword (any author), judged relevant | Commenters | Strong if the comment shows intent | 1 |
| **R-M** | **Competitor mentions** | Posts that **tag a competitor's company page** or name the competitor | Author + commenters | Very strong. Complaints, comparisons, "switching from X" | 1 |
| **R-P** | **Competitor page engagers** | Posts **on the competitor's own LinkedIn company page** | Commenters | Strong. They are the competitor's users or evaluators | 1 *(recommended, Rahul to confirm; uses the competitors already given in onboarding, so no extra setup)* |
| R-W | Watchlist people | Posts by watched people (influencers, partners, competitor founders) | Commenters | Medium; depends on the profile | 2 |
| R-R | Reactors (likes) | Same posts as R-C/R-M/R-P | Reactors | Weak (Strength 15) | 2 (opt-in) |
| R-J | Hiring trigger (account-level) | Job listings for trigger roles (e.g. "SDR") | A decision-maker at that company | Company-level, needs people search | v2 (different motion) |

**How this compares with Traxy's 3 routes:**
- Traxy's keyword route matched on sentences and got 0 saves → we use R-A/R-C with short phrases and an ICP author filter.
- Traxy's "active ICP engager" route was 80% filler → we don't have it. Every lead needs a relevant signal.
- Traxy's watchlist route gave 0% ICP leads → our R-W/R-P engagers are fully scored.
- R-A and R-M don't exist in Traxy at all.

**Not used, on purpose:** cold people search / company-employee lists (`harvestapi/linkedin-profile-search` $0.10 per 25 results, `linkedin-company-employees`). Those are lists, not signals, which is a different product.

---

## 2. Actor catalogue (chosen)

All are HarvestAPI "No Cookies" actors: one vendor, consistent output shapes, pay-per-event, high usage (5k–85k users). Prices are the FREE tier; they drop at higher Apify tiers.

### 2.1 `harvestapi/linkedin-post-search`: used by R-A, R-C, R-M
| Input we use | Value |
|---|---|
| `searchQueries` | One query per keyword, multi-word phrases in quotes, e.g. `"Apollo alternative"`. Max 500 chars and 5 boolean operators |
| `sortBy` | `date` |
| `postedLimitDate` | last successful search time for this query − 1h (first time: now − 14d) |
| `maxPosts` | 25 (**never 0**, since 0 = all ≈ 400–500 posts) |
| `authorKeywords` | **R-A only**: ICP function/title terms ("Founder", "Head of Sales", "VP Sales"…). Matches the author's headline/title. **VERIFY** the separator syntax |
| `mentioningCompany` | **R-M only**: competitor LinkedIn company names/URLs |
| `scrapeComments`, `scrapeReactions` | **false**. Comments are fetched later, only for relevant posts |
| `profileScraperMode` | `short` (no extra charge) |

**Output fields we use:**
- `id` (activity id), `linkedinUrl`, `content`
- `author.{publicIdentifier, name, info (headline), linkedinUrl (contains the miniProfileUrn → ACoAA id), type (profile/company)}`
- `postedAt.timestamp`
- `engagement.{likes, comments, shares}`

**Price:** $0.002/post, $0.001 per empty query.
**Limits:** ~400–500 posts max per query (LinkedIn).

### 2.2 `harvestapi/linkedin-profile-posts`: used by R-P (company pages) and R-W (people)
| Input | Value |
|---|---|
| `targetUrls` | Competitor company page URLs (R-P) / watched profile URLs (R-W), batched |
| `postedLimitDate` | last fetch − 1h (first: now − 14d) |
| `maxPosts` | 10 per target (never 0) |
| `includeReposts` | false |
| `scrapeComments` / `scrapeReactions` | false |

**Output:** same post shape as 2.1. **Price:** $0.002/post, $0.001 per empty target.

### 2.3 `harvestapi/linkedin-post-comments`: used by R-C, R-M, R-P, R-W
| Input | Value |
|---|---|
| `posts` | Relevant post URLs, batched 10–20 per run |
| `maxItems` | 20 (bait probe) / 100 / 200 (never 0; 0 = up to 1,000) |
| `postedLimit` | `any` for the first fetch, `24h` for refresh |
| `scrapeReplies` | false. Note: up to 5 replies per comment come **nested and unbilled** anyway. v1 stores and ignores them |
| `profileScraperMode` | `short`. `main` costs +$0.002 per comment for *every* commenter. Not worth it, because most commenters get dropped before lookup |

**Output fields we use:**
- `id` (comment id), `commentary` (text)
- `createdAt` (**exact timestamp ✓**)
- `postId` (activity id)
- `actor.{id (ACoAA…), name, linkedinUrl (vanity slug), position (= headline), author (bool: is the post author)}`
- `reactionTypeCounts`

**Not present:** location, company id.
**Price:** $0.002/comment. **Pagination:** 10 per page.

### 2.4 `harvestapi/linkedin-post-reactions`: R-R only (Phase 2, opt-in)
- Inputs: `posts`, `maxItems` 100.
- Output: `reactionType`, `postId`, `actor.{id (ACoAA…), name, linkedinUrl (ACoAA-style, not a slug), position}`.
- **No timestamp** → age is approximate, from the post date. No location.
- $0.002/reaction.

### 2.5 `harvestapi/linkedin-profile-scraper`: person lookup (all routes)
- Inputs: `profileIds` (ACoAA ids, available from every source) or `urls`, batched 10–20. Mode: profile details **without email** ($0.004).

**Output fields we use:**
- `id`, `publicIdentifier`, `headline`
- `location.parsed.{countryCode, country, city}`
- `experience[]` with `{position (title), companyId, companyLinkedinUrl, companyName, startDate, endDate}`. Current job = entries without an `endDate`. **VERIFY** the end-date field name.
- `openToWork`, `hiring`, `influencer`

**Not present:** company size and industry → see 2.6.

### 2.6 `harvestapi/linkedin-company`: company lookup
- Input: `companies` (LinkedIn company URLs from `experience[].companyLinkedinUrl`), batched.
- Output: `id`, `universalName`, `name`, `employeeCount`, `employeeCountRange`, `industries[]`, `locations[]` (country, `headquarter`), `website`.
- $0.004/company. Companies change slowly, so they are **cached globally for 90 days**.
- Also used once in onboarding to resolve the competitors' company page URLs (for R-M and R-P).

### 2.7 Rejected alternatives
| Actor | Why not |
|---|---|
| apimaestro/linkedin-profile-posts | $0.005/post (2.5× the price), different output shape |
| unseenuser comment+reaction extractor | $0.0055/result, few users |
| dev_fusion profile scraper | $0.01/profile, rating 3.65 |
| scraping comments with `profileScraperMode: main` | Pays for every commenter, including the ~70% we drop for free |

---

## 3. Identity keys (solves R11/R12 almost for free)

- **Person key = LinkedIn profile id (`ACoAA…`).** It is present in comments (`actor.id`), reactions (`actor.id`), post authors (inside `author.linkedinUrl` miniProfileUrn; **VERIFY** it's always there) and the profile scraper (`id`).
  - Also store aliases: `publicIdentifier` (vanity slug) and URL variants.
- **Post key = activity id.**
  - Post search/profile posts give `id` = activity id; comments give `postId` = activity id.
  - Reactions' `id` contains a `ugcPost` URN that differs from the activity id. Always key on `postId`. Keep a post-id alias table anyway.
- **Company key = LinkedIn company id** (`experience[].companyId` = company actor `id`).

---

## 4. The pipeline, actor by actor

```
RUN START: preflight (Apify balance, Jev + LLM reachable, credits, pinned ICP/Brief) → reserve credits per call

[R-A]  post-search(keyword, authorKeywords=ICP titles)         ┐
[R-C]  post-search(keyword)                                    ├─► upsert posts (activity id), dedupe
[R-M]  post-search(mentioningCompany=competitors) + competitor-name keywords   │
[R-P]  profile-posts(competitor company pages)                 ┘
        │
        ▼ FREE filters: language (code), excluded authors, too young → DEFER, hiring post (Jev yes/no)
        ▼ JEV relevance: one yes/no per Brief item + author-type Choice   (state = post text only)
        │   not relevant → stop (no further spend)
        │
        ├─► AUTHOR path (R-A, R-M; also R-C authors whose headline matches the ICP):
        │      Jev author Quality + Intent → headline quick-match → lookup queue
        │
        └─► COMMENTS path (R-C, R-M, R-P), relevant posts only:
               comments > 150? → post-comments(maxItems 20) probe → bait? stop
               post-comments(maxItems 100 | 200 if highly relevant)
               FREE rules: LOW_EFFORT (≤3 words, emoji, tags, praise list), author's own comments, members
               JEV per comment: Quality Choice (+ seller/job-seeker) → Intent Choice (only SUBSTANTIVE)
               JEV headline quick-match (function/seniority from `position`)
               drop: SELLER_PITCH, JOB_SEEKER, CREATOR, headline clearly non-ICP, own/competitor employees
        │
        ▼ LOOKUP QUEUE, sorted by expected value (headline match × best signal points)
           pool hit (person < 30d) → free
           else profile-scraper(profileIds, batch) → country, current title, company id
           MUST-HAVES (§5): country in ICP geos AND (function or seniority match) → else stop
           company in pool (< 90d)? → free : linkedin-company(batch) → size, industry
        ▼ SCORE (code): Fit · Strength · tier · reason template
        ▼ STAGE → integrity check → PUBLISH
```

**Spend order (cheapest first):**

| Step | Cost |
|---|---|
| Post | $0.002 |
| Jev judgements | ~$0.000004 each |
| Comments | $0.002 each, only on relevant posts |
| Profile | $0.004, only after free filters |
| Company | $0.004, only after must-haves, and often cached |

---

## 5. Fit must-haves (fixes a hole in the scoring)

With weights 40/20/20/20, a person with the **wrong function and wrong country** but the right company size and industry scores 40 = OKAY, i.e. a lead. That's wrong. Rule (also in the master spec §8.1):

- **Must-have 1:** country in the ICP countries (if the ICP lists countries).
- **Must-have 2:** function **or** seniority matches.
- If either fails → not a lead, whatever the score. The company lookup is skipped too (saves $0.004 per person).

---

## 6. Decision layer: where Jev is used

**What Jev is:** TypeSafe AI's non-generative decision model.
- Launched 2026-09-15. Pin version `jev-1.13.0`.
- Input: a short *state* plus typed questions:
  - **Choice** (pick one option, with per-option probabilities + confidence)
  - **Score** (ordinal rubric)
  - **Noul** (yes/no probability)
- All questions in one call run in parallel, so extra questions cost almost nothing.
- Price: $0.042 per 1M input tokens, output free.

| Judgement | Questions | State (keep it short; accuracy drops with irrelevant text) |
|---|---|---|
| Hiring post? | Noul | post text |
| Relevance | 1 Noul per Brief item (≤ ~20) | post text only. Brief items go in the *questions*, not the state |
| Author type | Choice: buyer / vendor / creator / job seeker / other | post text + author headline |
| Comment quality | Choice: GENERIC / SUBSTANTIVE / SELLER_PITCH / JOB_SEEKER (LOW_EFFORT and LEAD_MAGNET are free rules) | comment + first 300 chars of the post |
| Intent | Choice: DIRECT / EXPERIENCE / OPINION / NONE | comment (or author post) + matched Brief items |
| Headline quick-match | Choice of function + Choice of seniority (+ "unclear") | headline |
| Title → function/seniority | 2 × Choice (cache per unique title globally) | title |
| Industry match | Choice: ICP industries + Other | company industries |

- Country comes from the profile's `location.parsed.countryCode`. **No judgement needed.**
- Size comes from `employeeCount`. **Code, not Jev.**

**Confidence bands** (master §7):
- Confident → use.
- Borderline → a generative LLM (Claude Haiku) re-asks with constrained output.
- Low → Uncertain.
- Thresholds come from the golden set, not vendor claims.

**What Jev does not do:**
- ICP / Brief / keyword drafting in onboarding → generative LLM (Claude Sonnet).
- Reason text → template.
- Counting, percentages, ages, scores → code.

**Vendor safety:** a `Decider` interface (choice / score / yesNo → distribution + confidence) with Jev as the implementation. Fallback candidates:
- OpenAI Decisions API (GPT-6 Luna, $0.10/M)
- Cloudflare Clef / Clef-flash (Apache 2.0)
- AWS Strands Decider 2B (local)
- final fallback: an LLM with constrained output

Re-run the golden set before any Jev version change.

Sources:
- [nexos.ai: What is Jev](https://nexos.ai/blog/what-is-jev/)
- [gradually.ai: Jev](https://www.gradually.ai/en/ai-models/jev/)
- [Let's Data Science: OpenAI's Jev rival](https://letsdatascience.com/blog/openai-jev-rival-three-weeks-typesafe-raised-870-million)

---

## 7. Daily budget by route (₹4,000/month ≈ $1.55/day, FX ≈ ₹85/$)

| Item | Volume/day | $/day |
|---|---|---|
| R-A + R-C keyword posts (12 keywords; only posts newer than the last search) | ~110 | 0.22 |
| R-M mention posts | ~25 | 0.05 |
| R-P competitor page posts (3 competitors) | ~3 | 0.01 |
| Empty queries/targets | ~15 | 0.015 |
| Comments: ~9 relevant keyword/mention posts × ~35 | ~315 | 0.63 |
| Comments: ~3 competitor page posts × ~40 | ~120 | 0.24 |
| Profiles (after free filters, minus pool hits) | ~45 | 0.18 |
| Companies (after must-haves, minus 90-day cache) | ~25 | 0.10 |
| Jev + LLM re-checks | — | ~0.03 |
| Phase 2 refresh (comments, 24h filter) | ~75 | (0.15) |
| **Total, Phase 1** | | **≈ 1.47** |

- First manual run (14-day lookback) ≈ $4–5 ≈ ₹400 → per-run cap 500 credits.
- **Unknown until measured:** relevant-post rate, commenter → lead rate, and therefore **₹ per HOT/WARM lead**. That number decides everything later.

---

## 8. First small data pull (~$0.50 ≈ ₹45): what to verify

Run each actor once, outside the app, with tiny limits. Save the raw output as `fixtures/` (later used by tests, so tests never call Apify).

| # | Call | Check |
|---|---|---|
| 1 | post-search: 2 keywords, `sortBy date`, `postedLimitDate` = 3 days ago, maxPosts 10 | Date order is respected? Any post older than the limit? `author.linkedinUrl` always has the ACoAA id? |
| 2 | post-search with `authorKeywords` "Founder, Head of Sales" | Separator syntax; do the authors really match? |
| 3 | post-search with `mentioningCompany` = 1 competitor | Does it return tagged posts? How many/week? |
| 4 | profile-posts on 1 competitor company page | Company-page posts returned, author type = company |
| 5 | post-comments on 3 posts, maxItems 20 | `createdAt`, `actor.id`, `position` fill rate; nested replies shape |
| 6 | profile-scraper on 5 commenter ids | `location.parsed.countryCode`, current-job detection (end-date field), companyId fill rate |
| 7 | linkedin-company on 3 companies | `employeeCount`, `industries` fill rate |
| 8 | Any run with the Apify per-run max-charge option | Is the charge cap honoured by pay-per-event actors? |
| 9 | Apify bill vs our computed cost | Matches ±2%? |

Then the **golden set**: from these posts and comments plus one bigger pull, Rahul labels ~50 posts and ~150 comments. Then measure Jev's agreement and calibration (master §7.5).

---

## 9. Stack candidates (pending the Plan Mode decision)

| Area | Candidate | Note |
|---|---|---|
| App | Next.js (App Router, TS strict) on Vercel | decided earlier |
| DB + Auth | Supabase (Postgres, Auth with link + OTP, RLS) | decided earlier |
| Background runs | Trigger.dev | Runs take 10–15 min; Supabase Edge Functions stop at 150s/400s. Alternative: pg_cron tick + Apify webhooks |
| Email | Resend (custom SMTP) | R30 |
| Decisions | Jev behind `Decider` | §6 |
| Generative | Claude (Sonnet for onboarding, Haiku for re-checks) | |
| Site reading | Jina Reader + guarded direct fetch | R38 |
| Validation | Zod | |
| UI | Tailwind + shadcn/ui | |
| Monitoring | Sentry + logs per run_id | R35 |

---

## 10. Architecture rules carried over (see the risk register)

- `pool` schema (shared facts, not exposed via the API) and `public` schema (workspace layer: RLS + composite FKs). UI reads pool data only via membership-checking RPCs (R26, R27).
- Identity: keys from §3 + alias tables + a merge function (R11, R12).
- Single-flight claims for lookups (R8).
- Reserve → settle credits, plus 4 spend-limit layers (R2, R3):
  1. the adapter refuses limit ≤ 0
  2. Apify per-run max charge
  3. reservation caps
  4. Apify account monthly limit ≈ cap + 10%
- Stage → validate → publish. Heartbeat + reaper. One active run per workspace (R28, R29).
- Freshness computed at read time. The nightly job does aging/expiry/retention (R14).
- Adapters in `lib/providers/`: they batch 10–20, use explicit limits, treat any non-SUCCEEDED status as an error, validate with Zod and check fill rates (R7, R9).
- Dev/prod separation. Tests use fixtures only. Secrets never exposed (R32, R33).
- Every schema change is a migration (R37).
