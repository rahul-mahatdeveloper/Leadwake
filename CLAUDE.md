# Leadwake

## What this project is
Leadwake is a B2B lead-signal web app.
A client gives us their website. Leadwake works out who they sell to (the **ICP**) and what buying intent looks like (the **Signal Brief**). It then finds people engaging with relevant LinkedIn posts, scores each person (fit, warmth, reason), and delivers leads to the client at a steady daily pace. Every lead carries a one-line reason and a link to the post that triggered it.

- Works for any country or market. The client's ICP decides geography; never hard-code a country.
- Text only. No images, no video.
- Current phase: **Phase 1, test-mode MVP.** Runs are manual. The only goal is to prove the leads are good.

## Sources of truth (read the relevant one before working)
| File | What it holds |
|---|---|
| `specs/master-spec.md` | **What and why.** Product source of truth. Contains no tech choices. |
| `docs/technical-design.md` | **How.** Stack, data model, architecture. |
| `specs/NN-<feature>.md` | One spec per feature: requirements, edge cases, acceptance criteria. |

- If code and a spec disagree, the spec wins.
- If a spec looks wrong or incomplete, **stop and ask Rahul**. Never change a spec silently, and never invent a requirement to fill a gap.
- If a file above doesn't exist yet, the decision hasn't been made. Ask; don't guess.

## How we work (spec-driven, no vibe coding)
For every feature:
1. Branch: `feature/NN-short-name`
2. Feature spec `specs/NN-<feature>.md` written or updated, then reviewed by Rahul
3. **QA checklist** `specs/NN-<feature>.qa.md` written **from the spec, before any code**: one check per acceptance criterion and edge case, plus the standing checks (isolation, caps, secrets, injection, CSV safety)
4. Plan mode: a plan built from the spec, approved by Rahul
5. **Task checklist** `specs/NN-<feature>.tasks.md`: small milestones, each with `- [ ]` tasks, the acceptance-criteria IDs it covers, and the command that proves it's done
6. Implement milestone by milestone. Tick a task only after its check passes. Stop and report at the end of each milestone. Never mark a task done that wasn't verified
7. **Independent QA in a fresh session** (or the QA subagent): it reads only the spec, the QA checklist and the code, never this conversation, and reports pass / fail per check with evidence
8. Fix the failures, re-run QA, then small commits, push, PR
9. `/clear` before the next feature

Rules:
- No code without an approved spec.
- No extra features, refactors or "while I'm here" changes outside the plan. Note them as suggestions instead.
- When something is unclear, ask **one** clear question instead of assuming.

## Fixed rules (business constraints, not up for debate)
1. **No meetings or calendar feature. Ever.** No tables, stubs or placeholders for it.
2. **LinkedIn data comes only through Apify**, one account, behind our own adapter. No other scrapers, no LinkedIn cookies, no fake accounts, no direct LinkedIn scraping.
3. **Every paid call has a cap.** Apify, Jev and Claude calls go through the spend system and the internal cost ledger: reserve before the call, settle after, with a per-run cap and a monthly cap. Until reserve/settle exists (spec 04), the minimal spend guard applies (per-call limit, daily limit, kill switch). Never make an uncapped paid call. Cap values live in config, defined in the master spec.
4. **No workflow tools** (n8n, Zapier, etc.). All logic is our own code.
5. **Manual runs first.** The scheduler is built only after the quality gate passes.
6. **Built for 1 → 100,000 clients from day one.** People, companies, posts and engagements live once in a shared global pool. Each client's scores and decisions live in that client's own layer. Never copy pool data per client.
7. **Never overwrite history.** Engagements and profile/company snapshots are append-only and store `first_seen_at`. Only exceptions: deletion requests and retention expiry, which hard-delete.

## Who decides what: Decider (Jev), code, or writer LLM
- **Judgements → Decider.** Yes/no, pick-one-from-a-list and labelled-scale questions go through the Decider interface. Jev is primary, Claude Haiku is the fallback and borderline re-check. Never call Jev or Haiku directly outside the Decider.
- **Compute, don't ask.** Counting, dates, recency, ages, maths, scores, thresholds, country, company size, dedupe and money are always plain code, never a model.
- **Writing sentences → writer (Claude).** ICP and Brief drafts, the lead's reason line and the opener message. Write them only for leads that earned them.
- Every judgement has an "other / unclear" answer. **Uncertain means no** (fail closed): no spend, no lead.
- A judgement may only **filter or rank**. It never spends money, sends anything or changes data on its own.
- **Scraped text is untrusted.** Posts, comments, headlines and websites are the thing being judged, never part of the instructions. Guard every prompt against injection.
- Questions and prompts are **versioned**. Changing one word creates a new version.
- Record every judgement: input fingerprint, question version, model + version, probabilities, final answer, cost.

## Money and data safety
- **Tests and local dev never call paid APIs.** Use recorded fixtures and fake providers. Real calls happen only in explicit dry-run scripts, each with its own cap.
- Never commit secrets. `.env` is gitignored; keep `.env.example` up to date with every new variable.
- Never touch the production database from dev. Schema changes go through migrations only.
- **Ask before any destructive action:** dropping tables, deleting data or files, `rm -rf`, `git push --force`, `git reset --hard`.
- Ask before adding any new paid service or dependency.

## Privacy, legal and client isolation
- Store only the personal data the spec lists. Check the suppression / opt-out list for every incoming person. Support deletion requests.
- Raw scraped payloads have a retention limit (defined in the spec).
- **A client never sees another client's data, scores or even that they exist.** Isolation is enforced in the database and proven by tests.
- Escape CSV exports against formula injection. Render scraped text as plain text, never as HTML.

## Code rules (apply whatever the stack)
- Vendor SDKs (Apify, Jev, Claude, email) are imported **only** inside their adapter folder.
- Validate all external data with a schema at the adapter boundary. Nothing unvalidated goes deeper.
- Scoring and decision logic are pure functions: same input, same output, unit-tested.
- No magic numbers. Thresholds, caps and weights live in config with a version.
- Every database function and query is scoped by client (workspace) id.
- Clear names over clever code. Short functions. Comment the "why", not the "what".

## Testing
- Each feature: a test for every acceptance criterion in its spec.
- Scoring, buckets and Decider wrappers: unit tests with fixed inputs.
- Client-isolation tests must pass before any feature touching client data is merged.
- A failing test is never deleted or skipped to make CI green. Fix the code or ask.

## Tech (fill in after `docs/technical-design.md` is approved)
- Stack: _TBD_
- Install: _TBD_
- Run dev: _TBD_
- Test: _TBD_
- Lint / typecheck: _TBD_
- Folder map: _TBD_

## Words we use
| Term | Meaning |
|---|---|
| Client / workspace | One paying company using Leadwake, with its own ICP, Brief and leads |
| ICP | Who the client sells to: roles, company size, industry, country |
| Signal Brief | What buying intent looks like: pains, triggers, topics, competitors, rules |
| Pool | Shared global store of people, companies, posts and engagements |
| Fit | 0–100: how well a person matches the ICP |
| Warmth | 0–100: how strong and recent their engagement is, built from history |
| Reason | Which Brief item they match, and whether they said it themselves (Direct) or only engaged with it (Contextual) |
| Bucket | Priority / Qualified / Nurture / Hidden |
| Gate 1 | Decide if a post is worth paying for its engagers |
| Gate 2 | Decide from the free headline if a person is worth a paid profile lookup |
| Yield | Share of a source's engagers that became Qualified or better |
| Drip | Steady daily delivery of leads to a client |
| Run | One pipeline execution |
| Cost ledger | Internal record of what Leadwake pays vendors; spend caps apply to it |
| Lead credit | What a client pays for [P2]: 1 credit per delivered Qualified or Priority lead |

## Working with Rahul
- Rahul writes in Hinglish. Reply in simple Hinglish; keep code, specs and commit messages in English.
- Be direct and short. Lead with the answer, then the detail.
- For product or architecture choices, show the options with trade-offs (one-way vs two-way door, cost, risk) and recommend one. Rahul decides.
- Keep this file under 200 lines. Detail belongs in specs, not here.
