# Probe 03a: result

> **Verdict: NO-GO** on "commenters on relevant posts" as the lead source. Date: 2026-10-29.
> Spec: `specs/03a-probe.md`. No personal data in this file: counts and costs only. Raw output is in the gitignored `probe/out/`.

## Verdict against the pass bar (AC-PB17 to AC-PB21)

| ID | Bar | Result | Pass? |
|---|---|---|---|
| AC-PB17 | at least 10 Qualified+ leads | **0** (best single post: 3 Nurture) | fail |
| AC-PB18 | cost per Qualified+ lead at most Rs 50 | **null** (no Qualified+ lead; about Rs 19 spent per post for 0) | fail |
| AC-PB19 | 60% of Qualified+ rated "would message" | not measurable (0 rows to rate) | n/a |
| AC-PB20 | at least 3 "would message" + "new info" | not measurable | n/a |
| AC-PB21 | GO only if 17 to 20 all pass | 17 and 18 fail | **NO-GO** |

## Runs

All runs: `--accept-draft --first-post-only`, one post per run, total cap Rs 150. Jev excluded from every rupee figure (no price known; tokens only).

3 different posts were paid for. Runs 3 and 4 reuse post B from cache (Rs 0 for comments).

| # | Post (topic) | Comments / people | ICP version | Gate 2 pass / borderline / fail | Profiles / companies bought | Leads | Buckets (P / Q / N) | Cost this run (Rs, actual) |
|---|---|---|---|---|---|---|---|---|
| 1 | A: first post in `posts.txt` (comments about video content) | 33 / 30 | v1: India only | 0 / 1 / 29 | 1 / 1 | 1 | 0 / 0 / 1 | 18.6 |
| 2 | B: B2B SaaS founder post (comments about AI-agent identity) | 41 / 38 | v1 | 1 / 3 / 34 | 4 / 0 | 0 | 0 / 0 / 0 | 19.3 |
| 3 | B again, re-scored with new ICP | 41 / 38 | v2: US, UK, CA, AU, DE; COO added | 3 / 4 / 31 | 7 / 3 | 3 | 0 / 0 / 3 | 1.6 |
| 3b | B again, identical re-run (cache test, AC-PB5) | 41 / 38 | v2 | same | 0 new | 3 | same; `leads.csv` byte-identical | 0.0 |
| 4 | C: SDR / outbound / sales automation | 17 / 15 | v3: v2 plus India | 2 / 1 / 12 | 3 / 1 | 1 | 0 / 0 / 1 | 18.9 |

Totals: 5 invocations, about Rs 58.4 of new actual spend over the four paid runs; the ledger counts Rs 101.77 (all runs, including setup calls). Qualified+ leads: **0**. Nurture leads: 5 rows over 3 posts.

Caveats on the sample:
- **Small:** 3 posts, 1 post per run, 38 people at most per post.
- **Unedited Brief:** every run used the writer's draft as it was (`--accept-draft`). No human edit, as FR-PB7 intends for a real run. `cost.json` says "AUTO". The ICP was changed twice between runs.
- **Unrated:** no lead was rated by a human. The verdict follows from AC-PB17 and AC-PB18, not from ratings.

## Learnings

### 1. Fit scoring works; warmth from comments does not
- Fit came out at 91 to 94 for the real founders and COOs who passed Gate 2 (run 3). Role, size, country and industry all matched.
- Warmth stayed at **8 to 16** on every lead. Comments on these posts are praise or opinion about the post's own topic ("great post", a view on AI-agent accounts). None describes the buyer's own pain.
- So every lead had reason strength **Activity** (no Brief match), and Activity can never rise above Nurture (FR-BK1). A good fit with no signal is not a lead.
- The comment-class and Brief-item judgements behaved as designed: praise and opinion classes, "activity only" for the Brief item. The signal is missing in the data, not mis-read.

### 2. Gate 2 lets through only 3 to 18% of commenters
- Per post, 1 to 7 of 15 to 38 people reached a profile lookup (80 to 97% failed on headline).
- Several profile lookups were then Hidden on country or role (a headline does not show country). Those cost Rs 0.35 to 0.88 each.

### 3. The Apify comments actor costs about Rs 17.6 per post, regardless of comment count
- Three paid pulls: 33, 41 and 17 comments, all booked at exactly Rs 17.604 (100 x $0.002, our `maxItems`).
- **Not verified.** The code books the estimate when Apify's bill is not ready yet, so this could be a fallback. Check the Apify console for these runs (AC-PB12). If Apify really charges for 100, a post with 17 comments costs the same as one with 100.
- Everything else is cheap: a profile is about Rs 0.35 to 0.88, a company about Rs 0.004 to 0.7, Haiku about Rs 0.1 per run.

### 4. The ledger over-counts (max of estimate and actual)
- Over all runs: counted Rs 101.77 against about Rs 63.25 actual, **1.6x**.
- Per run it is about 1.1x. The big gap came from setup: Rs 10.65 of phantom spend (two Anthropic calls rejected with 401, counted at their estimate; fixed, so a 400, 401, 403 or 404 now counts Rs 0) and the Brief writer's estimate (about Rs 5.3 against Rs 0.5 to 1.2 actual).
- Small calls are over-counted most, because of the estimate floor (Apify refuses a max charge below $0.01).
- Safe for a budget, but the "cost per lead" built from it is pessimistic.

### 5. Jev
- Jev (`jev-1.13.0`, plain `fetch`) answered every question over the dry runs; no HTTP failures were seen. Its token usage is in `decisions.jsonl` and `cost.json`.
- Jev's price is still unknown. Rupee totals here exclude it.

### 6. Next idea: post authors by pain keywords, not commenters
- The strongest evidence of a pain is a person **saying it themselves** in their own post (FR-AU1, Direct evidence). Commenters mostly react to someone else's topic.
- Try: find posts whose **text** contains the Brief's pain or trigger keywords (SDR hiring cost and churn, slow inbound response, manual lead research, missed follow-ups), then take the **post authors** as lead candidates: headline, profile and company lookup, same fit scoring.
- That skips the Rs 17.6 comments pull per post and puts Direct evidence on the lead.
- Out of scope for the probe (post discovery and FR-AU were excluded in spec 03a section 1). It needs a new spec and a new, capped probe before feature 00.

## Open items
- Verify the Rs 17.6 per post against the Apify console.
- Fill the Results block in `specs/03a-probe.md` section 7 with the table above, and record "Brief edit notes" (the Brief was never human-edited in this probe).
- When the verdict is recorded: delete the "Probe exception" section of `CLAUDE.md` and hard-delete `probe/out/` (AC-PB16). Not done here.
