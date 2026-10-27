# Leadwake — Master Spec

> **Status:** APPROVED v1.2 (Rahul, 27 Oct 2026).
> **Owner:** Rahul · **Last updated:** 2026-10-27
> **Companions:** `CLAUDE.md` (how to work in this repo) · `docs/technical-design.md` (the **how**, written after this is approved) · `specs/NN-*.md` (one spec per feature).

**How to use this file**
- This is the **what and why** of the whole product. It names no framework, database, hosting or library. Those belong in `docs/technical-design.md`.
- Feature specs must not contradict this file. If one needs to, change this file first.
- Requirement IDs (e.g. `FR-ON3`) are stable. Never renumber. Mark removed ones as *(removed)*.
- Tags: **[P1]** Phase 1 (test-mode MVP) · **[P2]** Phase 2 (automation) · **[P3]** later.
- Numbers marked **(default)** are starting values. They live in config and get tuned with real data.

---

## 1. Problem statement

### 1.1 The problem
B2B companies (founders, sales teams, agencies) need to know **who to talk to this week and why**. Today they choose between:
- **Static lead databases**: a list of people who fit a profile, with no sign that any of them want to buy now. Outreach to them gets low replies.
- **Manual LinkedIn watching**: founders scroll LinkedIn to spot people talking about a problem. It works, but it takes hours and doesn't scale.
- **Signal tools such as Traxy**: they automate the watching, but our study of a real Traxy workspace showed four weaknesses (§1.3).

### 1.2 What Leadwake does
Leadwake watches public LinkedIn activity for each client, finds people whose **profile fits** the client's ideal customer **and** whose **behaviour shows a reason to talk now**, and delivers them as leads at a steady daily pace. Each lead explains itself with the evidence: the post or comment, and whether the person said it themselves.

### 1.3 What we learned from Traxy (and must not repeat)
Study of a real Traxy workspace export (27 Oct 2026: 1,128 leads, 1,094 engagements, 338 posts):

| Traxy weakness | Evidence | Leadwake answer |
|---|---|---|
| Watched profiles chosen by name, not by audience | 627 of 629 watchlist engagers scored 0% fit; the watched profiles' audience didn't match the ICP | Sources are chosen and kept by **yield** (FR-FB4). A post author can be a lead from their own post (FR-AU); creators, vendors, job seekers and the author's team never are |
| Warmth stuck low, so no lead ever reached the top tiers | No agent lead above warmth 33; 0 Qualified, 0 Priority | Warmth is built from **history** across posts and weeks, and comments count more than likes (§11.2) |
| Generic reasons | 82% of good leads only said "active ICP engager" | Reasons are only written for real matches; generic activity is labelled honestly (§11.3) |
| Leads never left the tool | 0 emails, 0 integrations | Lead inbox + CSV from Phase 1, daily drip in Phase 2 (§12) |

### 1.4 Why now
LinkedIn is where B2B buyers talk about problems in public. Cheap, fast "typed decision" models make it affordable to judge thousands of posts and headlines before paying for data. That turns signal-based prospecting from an expensive tool into one priced for small teams.

---

## 2. Product promise and success metrics

**Promise to a client:** "Every working day you get a short list of people who fit your customer profile and recently showed a reason to talk, with the evidence."

**North Star metric:** qualified leads acted on, per client, per week.

**Phase 1 go / no-go** (decided 27 Oct 2026; numbers are defaults): within 14 days at the test budget, on Rahul's own workspace. Only Qualified and Priority leads count; Nurture is excluded.
- ≥ 50 rated leads, **and**
- ≥ 60% of them get 👍, **and**
- a second founder blind-rates 20 of them (without seeing Rahul's ratings) and also gives ≥ 60% 👍, **and**
- internal cost per Qualified-or-better lead ≤ ₹50.

Also measured, with no pass/fail in P1: reply rate on 10 real outreach messages, sent manually (Leadwake never sends).

If Phase 1 fails, fix sources, gates or scoring before building Phase 2. Never automate a pipeline that produces bad leads.

---

## 3. Users and access

| Role | Who | Can do |
|---|---|---|
| Super-admin | Rahul | Everything, plus the admin console: caps, kill switch, runs needing review, decision quality, deletion requests |
| Owner | The client's main user | Onboarding, edit ICP and Brief, sources, run now [P1], delivery settings [P2], invite members, see usage |
| Member | Client's teammates | See and rate leads, export CSV |

- Phase 1: invite-only. Rahul creates workspaces and invites owners.
- A person can belong to several workspaces and switch between them.
- **A workspace never sees another workspace's data, scores, sources or even that it exists.**

---

## 4. Scope

### 4.1 In scope
Phase 1 [P1], one question: *are the leads good?*
- Login, workspaces, invites, members
- Onboarding: website → ICP + Signal Brief drafts, client edits and approves, ICP check, similar-company sorting
- Sources: topic search and competitor posts
- Post authors as leads from their own posts, including hiring posts when the Brief has a hiring trigger
- Gate 1 (post), comment collection, Gate 2 (headline), profile and company lookup through the shared pool
- Scoring (fit, warmth, reason), buckets, lead inbox, lead detail, CSV
- Manual "Run now" (once a day), run report, spend caps, kill switch, internal cost ledger
- 👍 / 👎 with reason on every lead
- Public pages: privacy (with a contact email for data requests) and terms
- Admin-handled data deletion + suppression list (no public "remove my data" page in P1)
- Data model for both ledgers (cost ledger + lead credits), even though no client pays in P1

Phase 2 [P2], only after go:
- Scheduler (every 2 hours), drip delivery, express lane for Priority
- Creator sources with suggestions, reactions collection, refresh rules
- Outcome tracking (contacted, replied, meeting), learning loop v2
- Lead credits and plans (§14.5), bad-lead replacements (FR-FB7)
- Hiring signals from job listings (FR-HP4)
- Landing page and waitlist

Phase 3 [P3]: contact lookup (email / phone), CRM and webhook delivery, payments, cross-client matching index at scale.

### 4.2 Out of scope (do not build, stub or add data for these)
- Meetings, calendar, call booking. **Never.**
- Sending messages or emails to leads on the client's behalf.
- Images and video of any kind.
- Any LinkedIn data source other than Apify; logging into LinkedIn; fake accounts.
- Apify actors that need LinkedIn cookies or an account (e.g. the Sales Navigator actor).
- Money back for bad leads. Ever. (Replacements only, P2, FR-FB7.)
- Non-English posts and comments [until P3].

---

## 5. Fixed rules (business constraints)
1. **No meetings / calendar feature.** Ever.
2. **LinkedIn data only through Apify**, one account, behind an adapter, using only actors that state "No cookies or account required" (§16.3). Never give an actor LinkedIn cookies or an account. If an actor starts requiring them, stop using it.
3. **Every paid call is capped.** Caps apply to real vendor spend (Apify, Jev, Claude) in ₹, recorded in the internal cost ledger. Test-mode monthly cap: **₹4,000** (default; resets at IST midnight on the 1st of each month). Per-run cap: **₹200** (default). A minimal spend guard exists before the first paid call (FR-CRD5). Customer lead credits are separate (§14.5).
4. **No workflow tools.** All logic is the product's own code.
5. **Manual first.** Runs are manual until go/no-go passes.
6. **Judgements go to the Decider:** Jev, behind a swappable interface. Claude Haiku is the borderline re-check and the fallback. **Sentences go to the writer:** Claude (ICP/Brief drafts, reason lines, openers).
7. **Built for 1 → 100,000 workspaces.** Shared pool for public facts, per-workspace layer for judgements. No data rewrite later.
8. **History is append-only.** Engagements and snapshots are never overwritten. Only exceptions: deletion requests (FR-PV2) and retention expiry (FR-PV3), which hard-delete.

---

## 6. Glossary
| Term | Meaning |
|---|---|
| Workspace | One client account with its own ICP, Brief, sources, leads and caps |
| ICP | Ideal customer profile: roles, seniority, company size, industries, countries, must-haves, exclusions |
| Signal Brief | What buying intent looks like: value proposition, pains, triggers, topics, competitors, rules |
| Pool | Shared store of public facts: people, companies, posts, comments, reactions, snapshots |
| Source | Where posts come from: a topic search, a competitor, or a creator [P2] |
| Gate 1 | Decide whether a post is worth paying for its engagers: a global post-quality part (pool) plus a per-workspace audience-fit part |
| Taste test | Buying a few comments of a new author's post to check the audience before buying the rest |
| Gate 2 | Decide from the free headline whether a person is worth a paid profile lookup |
| Fit | 0–100: how well a person matches the ICP |
| Warmth | 0–100: how strong, recent and repeated their relevant engagement is |
| Reason | The Brief item a person matches, with strength Direct / Contextual / Activity |
| Bucket | Priority / Qualified / Nurture / Hidden |
| Yield | Share of a source's engagers that became Qualified or better |
| Lead | One (workspace, person) pair that passed every gate and has a bucket |
| Run | One pipeline execution for one workspace |
| Drip | Scheduled release of leads into a workspace inbox [P2] |
| Decision record | Stored copy of one judgement: inputs fingerprint, question version, model, probabilities, answer, cost |
| Decider | Jev: answers typed judgement questions. Claude Haiku is the borderline re-check and fallback |
| Writer | Claude: writes ICP/Brief drafts, reason lines and openers |
| Cost ledger | Internal record of what Leadwake pays vendors, per call. Spend caps apply to it |
| Cost to serve | A workspace's share of the cost ledger: its own calls plus its share of each pooled item it used |
| Lead credit | What a client pays for [P2]: 1 credit per DELIVERED Qualified or Priority lead. Nurture is never charged |
| Author-only mode | A post makes its author a lead candidate without buying its comments |
| Suppression list | Every known ID of people who asked to be removed; matched at ingest |

---

## 7. How it works: the pipeline

Work is split into two layers:
- **Pool (shared, done once for everyone):** raw facts (posts, comments, reactions, profiles, companies, snapshots) and the judgements that don't depend on any workspace: injection, engagement bait, hiring-post detection, author type (buyer / vendor / creator / job seeker), title seniority + function, comment quality class.
- **Per workspace:** Gate 1 audience fit, Gate 2 headline match, fit, warmth, reason, bucket, delivery and feedback.

| # | Step | Layer | Who decides | Paid? |
|---|---|---|---|---|
| 1 | Onboarding | Workspace | Writer drafts, Decider checks, client approves | Small |
| 2 | Find posts from sources | Pool (posts); workspace (which sources) | Code | Yes |
| 3a | Gate 1, post quality: injection, bait, hiring post, author type | Pool | Decider + code | Small |
| 3b | Gate 1, audience fit: worth paying for engagers, for this workspace? | Workspace | Decider + code | Small (taste test) |
| 4 | Collect comments (and reactions [P2]); comment quality class | Pool | Code + Decider | Yes, the biggest line |
| 5 | Gate 2: headline match → worth a profile lookup? (title seniority + function cached in pool) | Workspace | Code + Decider | No |
| 6 | Profile + company lookup | Pool | Code (company judgements FR-LK7 run per workspace) | Yes |
| 7 | Score: fit, warmth, reason | Workspace | Code + Decider + writer | Small |
| 8 | Bucket | Workspace | Code (Decider on ties) | No |
| 9 | Match to workspaces + deliver | Workspace | Code + Decider (rank) | No |
| 10 | Feedback + yield | Workspace | Client + code | No |

---

## 8. Functional requirements: onboarding and setup

### 8.1 Onboarding (FR-ON) [P1]
- **FR-ON1** The owner enters the company website (required), company name, and optionally a short description of what they sell.
- **FR-ON2** Leadwake reads the website and the writer drafts the **ICP** and the **Signal Brief**: value proposition, up to 8 pains, up to 8 triggers, up to 12 topics, competitors, up to 8 rules (each HIGH or MEDIUM).
- **FR-ON3** The owner reviews and edits every field, then approves. Nothing runs before approval.
- **FR-ON4** **ICP check (optional, recommended):** the owner names up to 5 real customers and up to 5 bad fits (company or person LinkedIn URLs). The Decider scores each against the draft ICP. If a good customer scores low or a bad fit scores high, the wizard shows which ICP field caused it and asks the owner to adjust.
- **FR-ON5** **Similar companies (manual entry):** The owner types the names of companies with an overlapping ICP. Leadwake does not auto-discover them. The Decider labels each **competitor** (same job, same buyer), **complement** (same buyer, different job) or **unrelated**. The owner confirms. Competitors become sources (§9.2) and their staff are excluded from leads. Complements are shown as possible partners only.
- **FR-ON6** Never use data from other Leadwake workspaces to build this list.
- **FR-ON7** Each competitor may have its LinkedIn company page. If unknown, Leadwake proposes one and the owner must confirm it before it is used as a source.
- **FR-ON8** ICP and Brief are **versioned**. Every edit after approval creates a new version and triggers a re-score of existing leads (FR-SC9).
- **FR-ON9** Exclusions: the owner can list companies, domains, title words and countries to exclude. The workspace's own company is always excluded.

### 8.2 Workspace settings (FR-WS)
- **FR-WS1** [P1] Owner can edit ICP, Brief, competitors, exclusions, and see caps and usage. Owner can switch on comment collection for hiring posts (off by default, FR-HP3).
- **FR-WS2** [P2] Delivery settings: daily quota (default 10), delivery time and time zone (default 09:30, owner's time zone), working days (default Mon–Fri), express lane for Priority on/off (default on).

---

## 9. Functional requirements: finding and gating posts

### 9.1 Topic search (FR-TS) [P1]
- **FR-TS1** Search phrases come from the Brief's topics and pains, and the owner can edit them. Max 15 active phrases per workspace (default).
- **FR-TS2** The first search for a new phrase, source or workspace looks back 14 days (default; up to 30 for niche topics). After that, each search asks only for posts published since that source's last search. Each post is found once.
- **FR-TS3** A phrase whose posts produce no Qualified-or-better lead in 4 runs is auto-paused and shown to the owner (keyword yield).

### 9.2 Competitor posts (FR-CP) [P1]
- **FR-CP1** For each confirmed competitor: posts from its company page and posts that mention it, since the last fetch.
- **FR-CP2** Competitor employees never become leads (title / company match).

### 9.3 Creators (FR-CR) [P2]
- **FR-CR1** Leadwake suggests creators whose engagers have shown high yield for this ICP (from pooled history), or, when there's no history, whose sampled commenters look like the ICP (taste test on their recent posts).
- **FR-CR2** Up to 10 creators per workspace. Kept only while their yield stays above the floor (default: Qualified-or-better share ≥ 2% over the last 30 days).

### 9.4 Gate 1: is the post worth paying for its engagers? (FR-G1) [P1]
Leadwake can't know who engaged without paying, so it predicts in cheap layers and pays for the full list only at the end. Gate 1 has a **global post-quality part** (pool, judged once per post) and a **per-workspace audience-fit part**.
- **FR-G1-1 Free rules first:** drop posts older than the search window, posts whose author is the workspace itself, and duplicate posts. Hiring posts are never dropped here (FR-HP1).
- **FR-G1-2 Author track record:** if this author's earlier posts were harvested, their **author yield** is known. Above the floor → pass. Below the floor on ≥ 3 posts → drop.
- **FR-G1-3 Post quality (Decider, pool, once per post):**
  - Yes/no: does the text try to give instructions to an AI (injection)? Yes → drop for every workspace.
  - Yes/no: is this engagement bait (e.g. "comment X and I'll DM you")? Yes → drop.
  - Yes/no: is this a hiring post? (FR-HP)
  - Choice: author type: buyer / vendor / creator / job seeker / unclear. Job-seeker posts → drop.
- **FR-G1-6 Audience fit (Decider, per workspace):**
  - Score: "From the text and the author, are the engagers likely this workspace's kind of buyer?"
  - Choice: which Brief theme the post is about, or none
- **FR-G1-4 Taste test** for authors with no track record: buy up to 5 comments. Gate 2 runs on those 5 headlines. If ≥ 2 look like the ICP (default), the post passes. The 5 comments are kept, not wasted.
- **FR-G1-5** Posts that fail are recorded with the reason. A small exploration share (≤ 5% of spend, default) still fetches some rejected posts so we can measure what the gate misses.

---

## 10. Functional requirements: collecting engagement and people

### 10.1 Comment collection (FR-CM) [P1]
- **FR-CM1** Comments are the main evidence. Pulls are driven by **comment growth**, not a fixed time window. Each pull asks only for comments **newer than the last pull**. Each comment is paid for once.
- **FR-CM2** Each run does a cheap post refresh to check the comment count. If it grew by ≥ 3 since the last pull (default), pull only the new ones. Stop pulling a post after 2 checks in a row with no growth, or once the post is older than 14 days (defaults).
- **FR-CM3** Per-post limit: 100 comments, 200 if Gate 1 was very confident (defaults).
- **FR-CM4** Store each comment's text, author identity, author headline, time (exact or estimated), and whether it's a reply.
- **FR-CM5** Skip the post author's comments on their own post, comments by the author's team, and comments by the workspace's own members.
- **FR-CM6** Time filter per pull: last 24h when the previous pull was < 24h ago; last week when the gap is longer (overlap removed by dedupe); any time for the first pull of a backfilled post. In Phase 1 these checks happen at the once-a-day manual run (FR-RN1).
- **FR-CM7** Once any workspace has collected a post's comments, every workspace linked to that post reuses them.

### 10.2 Reactions (FR-RX) [P2]
- **FR-RX1** Opt-in per workspace. One pull per post, once its comment growth has stopped (FR-CM2), capped at 100, only for posts Gate 1 scored very high.
- **FR-RX2** Reactions are weak evidence: a reaction alone can never make a person more than Nurture.

### 10.3 Gate 2: is the person worth a profile lookup? (FR-G2) [P1]
- **FR-G2-1 Free rules:** drop duplicates, the workspace's own staff, competitor staff, the post author's team, and excluded title words. (Suppressed people never get this far: they are dropped at ingest, FR-PV6.)
- **FR-G2-2 Decider on the headline** (headlines are free in the comment record):
  - Yes/no: does this headline fit the ICP's roles and company type?
  - Yes/no: does this person sell lead-gen, outreach or agency services themselves?
  - Choice: seniority and function of the title (pool judgement, cached per unique title, asked once ever)
- **FR-G2-3** Confident mismatch → no lookup. Pass and borderline go to the lookup queue, ordered by expected value (Gate 1 score × headline match).

### 10.4 Profile and company lookup (FR-LK) [P1]
- **FR-LK1** Check the pool first. A profile seen in the last 30 days (default) is reused at no cost.
- **FR-LK2** Otherwise buy the profile and save it to the pool for every workspace.
- **FR-LK3** Required facts: current title, current company, country. Missing any → **PARTIAL**: retried once at the next run, then not a lead. **Never guessed by a model.**
- **FR-LK4** Country comes only from the profile's own location data.
- **FR-LK5** Company lookup only for people who passed the person checks. Pooled for 90 days (default). Stores size, industries, HQ country, website domain, description, last funding round (stored, not scored in P1).
- **FR-LK6** A current job with no company page (e.g. stealth founder) is a complete result, not an error.
- **FR-LK7** Decider on the company:
  - Yes/no: does the company build or use AI? (only when the ICP has an AI keyword)
  - Choice: which ICP industry fits its description best, or other
- **FR-LK8** Messy values (cities, titles) may be normalised by the Decider only when it's ≥ 90% sure; otherwise the raw value stays.

### 10.5 Post authors as leads (FR-AU) [P1]
- **FR-AU1** A post's author can be a lead. Their own relevant post is **Direct** evidence and needs no comment purchase.
- **FR-AU2** Authors classified (FR-G1-3) as creator, vendor or job seeker are never leads. The author's comments on their own post and the author's team are excluded (FR-CM5, FR-G2-1).
- **FR-AU3** Author candidates go through Gate 2 and lookup like any engager.

### 10.6 Hiring posts (FR-HP)
- **FR-HP1** [P1] Hiring-post detection is a pool judgement (FR-G1-3). Hiring posts are never dropped globally.
- **FR-HP2** [P1] A hiring post is a signal only for workspaces whose Brief has a hiring trigger. For those, the post's author (and their company) becomes a lead candidate in author-only mode (FR-AU).
- **FR-HP3** [P1] Comments on hiring posts are not bought by default (mostly job seekers). The owner can switch this on (FR-WS1).
- **FR-HP4** [P2] Hiring signals from job listings (job-search actor, §16.3).

---

## 11. Functional requirements: scoring

### 11.1 Fit, 0–100 (FR-FT) [P1, per workspace]
- **FR-FT1** Must-haves first (owner marks which ICP fields are must-haves; country and role by default). Failing a must-have → Hidden.
- **FR-FT2** Points (defaults): role and seniority 35, company size 20, industry 20, country 15, soft match 10.
- **FR-FT3** Role, size, country: computed in code from stored facts. Industry: from the Decider's industry choice. Soft match: Decider score for "does what this person and company do match what the client sells?".
- **FR-FT4** Unknown values get half points, never full points.

### 11.2 Warmth, 0–100 (FR-WM) [P1, per workspace]
- **FR-WM1** Warmth is computed in **code** from the person's whole engagement history in the pool, not from one post.
- **FR-WM2** Inputs (defaults): each relevant comment 30 × intent factor, each relevant reaction 5 [P2], each repost 15, an author's own relevant post 40 (one strong engagement, FR-AU1; tune in the dry run); repeated engagement across different posts or authors +10 per extra post; recency decay with a 14-day half-life; cap 100.
- **FR-WM3** Intent factor comes from the **comment quality class**, a pool judgement (Decider choice on the comment text, asked once per comment): just praise (0.3) / shares an opinion (0.6) / describes own experience or problem (1.0) / asks for a solution, price or recommendation (1.5).
- **FR-WM4** Comments on irrelevant posts don't count.

### 11.3 Reason (FR-RS) [P1, per workspace]
- **FR-RS1** Decider choice: which Brief item (pain, trigger, topic, rule, competitor) the person's comment or the engaged post supports, or "activity only".
- **FR-RS2** Decider yes/no: did the person say it themselves?
- **FR-RS3** Strength: **Direct** (they said it, in a comment or in their own post), **Contextual** (the post said it, they engaged), **Activity** (no Brief match).
- **FR-RS4** For Direct and Contextual leads in Qualified or better, the writer writes one line: who they are, what they said or engaged with, which Brief item it matches. Activity leads get a fixed template line.
- **FR-RS5** Every reason shows the quote and links to the post.

### 11.4 Buckets (FR-BK) [P1]
| Bucket | Rule (defaults) |
|---|---|
| **Priority** | Fit ≥ 80 **and** warmth ≥ 70 **and** reason is Direct |
| **Qualified** | Fit ≥ 65 **and** (warmth ≥ 40 **or** reason is Direct) |
| **Nurture** | Fit ≥ 45. Re-scored whenever the person engages again |
| **Hidden** | Everything else. Never shown, never counted as a lead |
- **FR-BK1** Activity-only reason → never above Nurture.
- **FR-BK2** Within 5 points of a line, one extra Decider choice breaks the tie.
- **FR-BK3** Rules are versioned config. A change re-buckets existing leads.

### 11.5 Re-scoring (FR-SC)
- **FR-SC9** A new ICP or Brief version re-scores all of that workspace's leads from pooled data, with no new purchases.
- **FR-SC10** Every lead stores the scoring version that produced it.

---

## 12. Functional requirements: delivery

### 12.1 Matching (FR-MT)
- **FR-MT1** [P1] A person scored for one workspace can be scored for any other workspace whose sources reached the same post, at no extra data cost.
- **FR-MT2** [P3] At scale, new pooled people are routed only to workspaces whose ICP could match (index on country, role, industry, topic), not checked against every workspace.
- **FR-MT3** Exposure cap: the same person is delivered to at most 3 workspaces per 7 days (default).

### 12.2 Inbox and leads (FR-LD) [P1]
- **FR-LD1** Inbox ("Today's leads"): new leads since the last visit, Priority first.
- **FR-LD2** All leads: filter by bucket, reason strength, source, date; sort by bucket then warmth.
- **FR-LD3** Lead detail: name, title, company, country, profile link, fit and warmth with their parts, reason line, quotes, links to posts, engagement history, bucket, 👍 / 👎.
- **FR-LD4** CSV export of the current filter. Safe against spreadsheet formula injection.
- **FR-LD5** Lead lifecycle: NEW → READY → DELIVERED → ACTED / DISMISSED. In P1 leads go to DELIVERED at the end of a run.

### 12.3 Drip (FR-DR) [P2]
- **FR-DR1** Validated leads wait as READY in the workspace queue.
- **FR-DR2** The Decider re-ranks the queue ("who to contact first") before each drop.
- **FR-DR3** At the delivery time, the top N (daily quota) are delivered. Leftovers stay up to 72 hours (default), then expire if they've gone cold.
- **FR-DR4** Express lane: Priority leads are delivered immediately.
- **FR-DR5** Opener: for Qualified and Priority, the writer drafts a first message that quotes the real post. Leadwake never sends it.
- **FR-DR6** Pacing: spend follows the quota. If the queue already holds 3 days of leads, runs fetch less.

---

## 13. Functional requirements: feedback and learning

- **FR-FB1** [P1] 👍 / 👎 on every lead. 👎 asks for a reason (free text or a quick pick); the Decider maps free text to: wrong role / wrong company / wrong country / no real intent / vendor or competitor / already a customer / other. In P1 there are no refunds or replacements.
- **FR-FB2** [P2] Outcome per lead: contacted / replied / meeting / customer / bad lead.
- **FR-FB3** [P1] Every judgement is stored as a decision record, later joined to its outcome (👍/👎, the actual engager yield of a gated post, etc.).
- **FR-FB4** [P1] **Yield** is computed per topic phrase, competitor, creator [P2] and author. It drives FR-TS3, FR-G1-2 and FR-CR2 [P2].
- **FR-FB5** [P1] **Golden set:** before go-live, Rahul labels a set of posts, comments and headlines. Each Decider question must agree with the labels ≥ 85% (default) before it's used live. Thresholds are set from this set.
- **FR-FB6** [P2] Thresholds may auto-tune within guard rails, always with rollback. Questions and rules never change automatically.
- **FR-FB7** [P2] Bad leads: no money back, ever. A replacement lead only for objective errors the system can verify from data: wrong country or failed must-have, left the company, competitor employee, duplicate. Not for subjective reasons ("no reply", "didn't like"). Replacements are capped at 10% of monthly credits.

---

## 14. Functional requirements: runs, spend, credits and admin

### 14.1 Runs (FR-RN)
- **FR-RN1** [P1] "Run now" button for the owner and the admin. One run per workspace at a time. In P1, runs are manual, once a day (default).
- **FR-RN2** Preflight before any spend: caps left, vendors reachable, ICP and Brief approved. Fail → no run, clear message.
- **FR-RN3** A run that stops halfway (error, cap reached, crash) resumes from its last checkpoint and never pays twice for the same item.
- **FR-RN4** Results are staged, validated, then published together. A broken run never shows half its leads.
- **FR-RN5** [P2] Scheduler: every 2 hours (default), within the daily envelope.

### 14.2 Spend and cost ledger (FR-CRD)
All amounts here are real vendor cost in ₹, never customer lead credits (§14.5).
- **FR-CRD1** Every paid call **reserves** spend first and **settles** the real cost after. No reservation → no call.
- **FR-CRD2** Caps: per run, per month, per workspace, plus a global monthly cap. Reaching a cap stops new spend immediately; in-flight calls settle.
- **FR-CRD3** Every charge is in the internal **cost ledger**: run, step, vendor, item, estimated cost, real cost.
- **FR-CRD4** Kill switch (admin): stops all spend everywhere at once.
- **FR-CRD5** [P1] **Minimal spend guard**, built in spec 00 before any paid call (including onboarding and the dry run): per-call hard limit (₹20, default), daily limit (₹200, default), kill switch, cost ledger. Full reserve/settle (FR-CRD1–3) comes in spec 04.
- **FR-CRD6** [P1] **Cost to serve:** data is bought once into the pool. Each pooled item's cost is split equally across the workspaces that used it, giving each workspace's cost to serve. Internal metric only; never shown to clients.

### 14.3 Run report (FR-RP) [P1]
Per run: posts found / passed Gate 1 / harvested, comments bought, people passed Gate 2, lookups bought vs reused, leads per bucket, spend per step, cost per Qualified-or-better lead, top dropped reasons, yield per source.

### 14.4 Admin console (FR-AD) [P1]
Caps and kill switch · runs needing review · decision quality per question (agreement with golden set, borderline rate) · exploration results · deletion requests (manual delete + suppress, FR-PV2) · vendor health.

### 14.5 Customer lead credits (FR-LC) [P2; data model from P1]
- **FR-LC1** A subscription includes monthly lead credits. 1 credit per DELIVERED Qualified or Priority lead, whether it came from the pool or a fresh scrape. Nurture is visible but never charged.
- **FR-LC2** When a workspace's credits run out, its drip pauses **and** no new vendor spend happens on its behalf.
- **FR-LC3** Lead credits and the cost ledger (§14.2) are separate. The data model supports both from P1, though no client pays in P1.

---

## 15. Privacy and legal (FR-PV)
- **FR-PV1** [P1] Public pages: privacy policy and terms. The privacy policy lists a contact email for data requests: mahatluckyrahul@gmail.com (placeholder until a domain email exists). No public "remove my data" page in P1.
- **FR-PV2** [P1] Deletion requests arrive by email. The admin handles them in the admin console: delete the person from the pool and every workspace (hard delete, §5 rule 8), then add them to the **suppression list**. If requests are ever automated, rate-limit them.
- **FR-PV3** Store only the fields this spec lists. Raw vendor payloads are kept 30 days (default), then hard-deleted.
- **FR-PV4** Comply with India's DPDP Act and GDPR where leads or clients are in the EU. Lawyer review before the first external workspace.
- **FR-PV5** Scraped text is shown as plain text, never as HTML.
- **FR-PV6** [P1] **Suppression at ingest:** engagement data is checked against the suppression list when it arrives, before anything is stored. The list holds every known ID of the person (public profile URL + internal IDs) and matches on all of them.

---

## 16. Inputs and outputs

### 16.1 Inputs
| From | What |
|---|---|
| Owner | Website, company name, optional description; edits to ICP, Brief, exclusions; **similar company names (manual entry, FR-ON5)**; optional good/bad customer examples; 👍/👎 and reasons; delivery settings [P2] |
| Apify (LinkedIn) | Posts, comments, reactions [P2], profiles, company pages |
| Website | Page text for onboarding |
| Decider (Jev; Claude Haiku re-check + fallback) | Probabilities for each named answer |
| Writer (Claude) | Draft ICP/Brief, reason lines, openers [P2] |

### 16.2 Outputs
| To | What |
|---|---|
| Owner / members | Leads in inbox and list, lead detail, CSV, run report, usage |
| Admin | Ledger, decision quality, alerts, deletion requests |
| Pool | Every fact bought, saved once for all workspaces |

### 16.3 Approved Apify actors
Only actors that state "No cookies or account required". All verified no-cookie on 27 Oct 2026:
harvestapi/website-content-crawler (onboarding: reads the client's website, FR-ON2) · harvestapi/linkedin-post-search · harvestapi/linkedin-company-posts · harvestapi/linkedin-profile-posts · harvestapi/linkedin-post-comments · harvestapi/linkedin-post-reactions · harvestapi/linkedin-profile-scraper · harvestapi/linkedin-company · harvestapi/linkedin-job-search (used from P2, FR-HP4).
- Excluded: the Sales Navigator actor (needs cookies).
- Any new actor must state "No cookies or account required" before use. Status is re-verified in the dry run (§22). Lawyer review stays required (vendor-side risk, FR-PV4).

---

## 17. Constraints (non-functional)
- **Isolation:** no query, page, export, email or log can show one workspace's data to another. Proven by automated tests.
- **Money correctness:** no paid call without a reservation; no double charge on retry; ledger matches the vendor's bill within 2%.
- **Fail closed:** any Decider failure, timeout or low confidence = "no". Never auto-accept.
- **Speed:** a Phase 1 run finishes in under 30 minutes (default). Inbox loads in under 2 seconds with 5,000 leads.
- **Scale:** the data model stays the same from 1 to 100,000 workspaces; only matching and scheduling change.
- **Cost:** Phase 1 fits the monthly test cap. Planning estimate for one workspace: ~₹3,400 / month (Apify ~97%, Decider ~1%, writer ~2%). Verify in the dry run.
- **Vendor change:** swapping the Decider model or adding a second data vendor must not change product behaviour beyond scores.
- **English only** for posts and comments until P3.

---

## 18. Edge cases
| Case | Expected behaviour |
|---|---|
| Website unreadable, blocked or almost empty | Ask the owner for a short description and draft from that |
| Draft ICP too broad ("all businesses") | Warn; require at least one role and one company-size or industry field |
| ICP check: good customers score low | Show the failing field; block approval until the owner edits or overrides |
| A topic phrase returns 0 posts | Record; after 4 empty runs, auto-pause and tell the owner |
| Post deleted or private after being found | Mark gone; keep comments already bought; no error |
| Post with thousands of comments | Respect the per-post limit; bait check first |
| Engagement-bait post | Dropped at Gate 1; if detected after the taste test, stop and mark its commenters as bait (not leads) |
| Comment by the post author on their own post, or by their team | Skipped |
| Same person under different IDs or URLs | Merged into one identity in the pool |
| Same person in several workspaces | One pool record; separate scores; exposure cap applies |
| Person changed jobs since last lookup | New snapshot; re-score; old snapshot kept |
| Profile private, deleted or missing country | PARTIAL; retry once; then not a lead; cost recorded |
| Person is a vendor, agency or competitor employee | Excluded, reason recorded |
| Person on the suppression list | Dropped at ingest; nothing about them is stored (FR-PV6) |
| Prompt-injection text in a post or comment | Treated as data; flagged by the Decider; dropped |
| Decider down or slow | Retry twice → Claude Haiku fallback → still failing → "no" for that batch; run continues |
| Apify run fails or returns partial data | No ingest from a failed vendor run; retry once; recorded in the report |
| Cap reached mid-run | Stop new spend; finish scoring what was already bought; publish |
| ICP or Brief edited during a run | The run finishes on the version it started with; re-score after |
| Two "Run now" clicks | Second one refused while the first runs |
| Monthly cap used up | Runs refused with a clear message showing when it resets |
| Non-English post or comment | Skipped, counted in the report |
| Hiring post | Kept. A signal only if the Brief has a hiring trigger (author-only mode); comments not bought unless the owner switched it on |
| Post author is a creator, vendor or job seeker | Not a lead (FR-AU2) |
| An actor starts requiring cookies | Stop using it (§5 rule 2) |
| Workspace out of lead credits [P2] | Drip pauses; no new vendor spend for that workspace (FR-LC2) |
| Owner deletes the workspace | Workspace layer deleted; pool facts stay (they're shared, public, and governed by retention) |

---

## 19. Acceptance criteria — Phase 1 is DONE when
1. An owner can log in, complete onboarding, edit and approve the ICP and Brief, and nothing runs before approval.
2. ICP check and similar-company sorting work on at least 3 real companies.
3. "Run now" executes the full pipeline (steps 2–8) and publishes leads with buckets.
4. No paid call happens without a reservation; the ledger matches the Apify bill within 2% over 5 runs.
5. Per-run and monthly caps and the kill switch stop spend immediately (tested).
6. A killed or crashed run resumes without paying twice for any item.
7. Every lead shows fit and warmth with their parts, a reason with strength, quotes and post links.
8. Activity-only leads never appear above Nurture; Hidden people never appear anywhere.
9. Comments are paid for once per comment across repeat pulls and across workspaces.
10. Profiles seen in the last 30 days are reused at zero cost.
11. Workspace isolation tests pass for every page, export and API.
12. CSV export works and is safe against formula injection.
13. Every Decider question used live has ≥ 85% agreement with the golden set.
14. The run report shows spend per step and cost per Qualified-or-better lead.
15. The admin can delete a person everywhere from the admin console; suppressed people are dropped at ingest on every later run, matched on all their known IDs.
16. Go/no-go (§2) has been measured and recorded, whichever way it comes out.

---

## 20. Release phases and feature-spec map

**Phase 1 build order:**
| # | Feature spec | Contents |
|---|---|---|
| 00 | Skeleton | Project, environments, CI, guard rails, minimal spend guard + cost ledger (FR-CRD5), CLAUDE.md tech section |
| 01 | Login and workspaces | Login, workspaces, invites, members, switcher, isolation, public legal pages (privacy with contact email, terms) |
| 02 | Onboarding | FR-ON1–9, FR-WS1 |
| 03 | Dry run + golden set | Vendor adapters with caps; verify the assumptions in §22; recorded fixtures; golden set labelled; Decider ≥ 85% → **go/no-go for building 04–08** |
| 04 | Run engine and spend | Pool, identity, suppression at ingest (FR-PV6), run now, preflight, reserve/settle, cost to serve (FR-CRD6), lead-credit data model (FR-LC3), checkpoint/resume, stage/publish, kill switch, decision records |
| 05 | Sources and Gate 1 | FR-TS, FR-CP, FR-G1, FR-HP1–3 |
| 06 | Comments, Gate 2, lookups | FR-CM, FR-G2, FR-LK, FR-AU |
| 07 | Scoring, inbox, leads | FR-FT, FR-WM, FR-RS, FR-BK, FR-SC, FR-LD, FR-MT1 |
| 08 | Report, feedback, admin | FR-RP, FR-FB1/3/4, FR-AD, FR-PV2 deletion requests, usage |

**Phase 2:** 09 scheduler + refresh · 10 drip + delivery settings + openers + lead credits (FR-LC) + replacements (FR-FB7) · 11 creators + reactions + job-listing hiring signals (FR-HP4) · 12 outcomes + learning v2 · 13 landing page.
**Phase 3:** contact lookup, CRM/webhook, payments, matching index at scale, non-English.

---

## 21. Decision-lens review

| Lens | Verdict |
|---|---|
| **One-way doors** | (1) How LinkedIn data is collected (legal). (2) Shared pool + per-workspace layer data model. (3) Append-only history with first-seen time. (4) Pricing model. Get these right before code. |
| **Two-way doors** | Decider model choice, thresholds, weights, quotas, UI, which sources to watch. Ship fast, tune later. |
| **Inversion: how it fails** | LinkedIn access cut off; junk leads destroy trust; many clients hit the same person; costs beat price. Defences: adapter + lawyer review, Direct-reason-first, exposure cap, gates + pool reuse. |
| **Second-order** | Cheap scoring means competitors will also score everything; the edge moves to outcome labels, yield history and the shared pool. |
| **Unit economics** | Data cost falls per workspace as pool reuse grows. Planning: ~₹3,400 / workspace / month at 1 workspace; much lower once workspaces share posts and people. Verify. |
| **Compounding assets** | Engagement history, author/source yield, outcome labels, cached title and company judgements. |
| **Time-to-first-value** | First leads within one run (≤ 30 min) of approval. [P2] pre-seeded pool for common ICPs. |
| **Fixable vs fatal** | Fixable: scoring, gates, UI, costs. Potentially fatal: LinkedIn legal action, single-vendor shutdown, a data leak between workspaces. |
| **7 Powers** | Process power (calibrated gates), cornered resource (history), switching costs (sources, labels, settings), scale economies (pool). |
| **JTBD** | Clients hire Leadwake for "warm conversations this week", not for a list. |
| **YAGNI** | No contact lookup, CRM, payments, matching index or multi-vendor until measured need. |
| **Build vs buy** | Buy: LinkedIn data (Apify), login, email, model inference. Build: gates, scoring, pool, yield, delivery. |

---

## 22. Assumptions to verify in the dry run (spec 03)
1. Comment fetch supports a recency filter (24h / week / any) or "newer than X", each comment is billed once, and dedupe works across overlapping windows.
2. Comments carry an exact or usable timestamp; reactions may not.
3. Post search returns posts in date order, respects a "posted since" filter, and can look back 14–30 days.
4. A cheap post refresh returns current comment and reaction counts.
5. Profile data includes a parseable country and current-job dates.
6. Company data includes size and industries often enough to score.
7. Real prices per post, comment, reaction, profile and company on the chosen Apify plan, and whether a per-run spend limit is honoured.
8. The Decider's agreement with the golden set, its latency, rate limits and data-handling terms.
9. Typical ratios: posts passing Gate 1, headlines passing Gate 2, lookups that become leads.
10. How long comments keep arriving on a post (growth curve from repeat counts), to tune the ≥ 3 growth trigger, the 2-checks stop and the 14-day cut-off.
11. Every actor in §16.3 still states "No cookies or account required" (re-verify each one).
12. Apify has an account-level monthly usage limit; if so, set it as a backstop below the monthly cap.

---

## 23. Open questions (need Rahul's decision)
| # | Question | Recommendation |
|---|---|---|
| Q1 | Which Apify plan, and does its fee include usage credit? | The plan whose included usage is close to the monthly cap |
| Q2 | Go/no-go numbers in §2 | **Decided 27 Oct 2026**, see §2 (≤ ₹50 internal cost per Qualified-or-better lead) |
| Q3 | Per-run cap ₹300? | Yes for P1; revisit with real run costs |
| Q4 | Fit weights and bucket lines in §11 | Use defaults; tune on the golden set and 👍/👎 |
| Q5 | Funding stage in fit? | Store only in P1 |
| Q6 | Daily quota 10, delivery 09:30, Mon–Fri? | Yes, tune with first clients [P2] |
| Q7 | Exposure cap 3 workspaces / 7 days? | **Decided 27 Oct 2026:** keep; revisit once there are 20+ workspaces |
| Q8 | Pricing: price per plan and lead credits per month (credit model decided, §14.5) | Decide before the first paying client [P2] |
| Q9 | Lawyer review timing | Before the first external workspace |

---

## 24. Decisions log
| # | Question | Decision (27 Oct 2026) |
|---|---|---|
| Q10 | How is a pooled item's cost split across workspaces (FR-CRD6)? | Equally across the workspaces that used it. Internal metric only |
| Q11 | Pass bar for the second founder's blind rating and the reply rate (§2)? | Second founder's 👍 rate must also be ≥ 60%. Reply rate is measured only, no pass/fail in P1 |
| Q12 | Warmth from an author's own post (FR-AU)? | One strong engagement worth 40 warmth points (default, tune in the dry run) |
| Q13 | Spend-guard defaults (FR-CRD5)? | ₹20 per call, ₹200 per day |
| Q14 | Contact email for data requests (FR-PV1)? | mahatluckyrahul@gmail.com, placeholder until a domain email exists |
| Q15 | Per-run cap: ₹300 or ₹200? (v1.2) | ₹200 (default). Tighter cap for test-mode safety; revisit with real run costs |
| Q16 | Monthly cap reset timing? (v1.2) | IST midnight on the 1st of each month |
| Q17 | FR-ON5 auto-discover vs manual entry? (v1.2) | Manual: founder types company names. No auto-search in P1; avoids hallucinated competitors |
| Q18 | Website-content-crawler actor for onboarding? (v1.2) | Added to §16.3: harvestapi/website-content-crawler, no cookies required, used in FR-ON2 |
