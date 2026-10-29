// All numbers the probe uses live here, so probe.ts has no magic numbers (FR-PB4).
// Values are the master-spec defaults unless a comment says otherwise.
// If you change a value, bump config_version so cost.json shows which settings produced a run.

export const config = {
  config_version: "probe-1",

  // --- Input limits (FR-PB1) ---
  minPosts: 2,
  maxPosts: 3,

  // --- Money (FR-PB3, FR-PB4) ---
  defaultTotalBudgetInr: 1000,
  defaultPerCallLimitInr: 50,
  inrPerUsd: 88,

  // --- Models (FR-PB4) ---
  writerModel: "claude-sonnet-5-5",
  deciderFallbackModel: "claude-haiku-5-5",

  // Claude prices in USD per 1 million tokens (prompts up to 100K tokens).
  claudePricesUsdPerMillionTokens: {
    "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  } as Record<string, { input: number; output: number }>,

  // Per-use Claude settings. maxOutputTokens also caps thinking tokens, so it is the
  // upper bound used for the cost estimate. Low effort = cheap, fast judgements.
  claudeCalls: {
    briefWriter: { maxOutputTokens: 6000, effort: "medium" },
    decider: { maxOutputTokens: 1500, effort: "low" },
    reasonWriter: { maxOutputTokens: 600, effort: "low" },
  },
  reasonPromptVersion: "reason.v1",
  // Changing the writer prompt text means bumping this (it is part of the cache key).
  briefPromptVersion: "brief.v1",

  // Rough text-to-token ratio used for upper-bound estimates (technical-design 5.6).
  charsPerToken: 3.5,

  // Apify actors (spec 03a section 4: only these three, all "No cookies or account required").
  // Prices: read from each actor's public pricing on 2026-10-29 (pay-per-event, FREE account tier,
  // which is the HIGHEST tier price, so estimates are an upper bound).
  //   linkedin-post-comments : $0.002 per comment ("post-comment" event)
  //   linkedin-profile-scraper: $0.004 per profile ("profile" event, no-email mode)
  //   linkedin-company        : $0.004 per company + $0.00005 actor start fee
  // Rahul must confirm these against the Apify console after the first run (AC-PB12).
  apifyActorAllowlist: [
    "harvestapi/linkedin-post-comments",
    "harvestapi/linkedin-profile-scraper",
    "harvestapi/linkedin-company",
  ],
  apifyPrices: {
    "harvestapi/linkedin-post-comments": { perItemUsd: 0.002, perRunUsd: 0.00005 },
    "harvestapi/linkedin-profile-scraper": { perItemUsd: 0.004, perRunUsd: 0.00005 },
    "harvestapi/linkedin-company": { perItemUsd: 0.004, perRunUsd: 0.00005 },
  } as Record<string, { perItemUsd: number; perRunUsd: number } | null>,
  // Apify refuses a max-total-charge below this for pay-per-event actors (comments actor minimum).
  apifyMinMaxChargeUsd: 0.01,
  // Profiles / companies per Apify run. Small batches limit what one failed run can cost.
  apifyLookupBatchSize: 25,
  // The comments actor's setting that skips (free) vs buys (extra $0.002) comment-author profile details.
  commentsProfileScraperMode: "short",
  // One automatic retry of a failed Apify run (spec section 5), then skip and record.
  apifyRetries: 1,

  // --- Comments (FR-PB10) ---
  maxCommentsPerPost: 100,
  // The --m5-smoke check fetches only this many comments from the first post.
  smokeCommentsPerPost: 5,

  // --- Decider (FR-PB28). Master spec has no numbers yet; these are proposed for the probe. ---
  decider: {
    yesThreshold: 0.7, // P(yes) at or above this = confident yes
    noThreshold: 0.4, // P(yes) below this = confident no; in between = borderline
    haikuBorderlineBand: { low: 0.45, high: 0.65 }, // Haiku's stated confidence is less reliable
    sellerDropThreshold: 0.5, // P(seller) at or above this = drop
    jevRetries: 2, // Jev gets 1 try + 2 retries before falling back to Haiku
  },

  // --- Jev: the Decider's primary provider (TypeSafe "System One" API) ---
  // Decision (Rahul, 2026-10-29): Jev has NO spend cap and is never refused for an unknown price.
  // Every call logs its token usage (decisions.jsonl, cost.json) so the bill can be worked out later.
  jev: {
    endpoint: "https://api.typesafe.ai/v1/systemone",
    // Pinned on purpose: "jev-latest" would let cached and fresh answers come from different models.
    model: "jev-1.13.0",
    adapterVersion: "jev-adapter.v1",
    timeoutMs: 30_000,
  },

  // --- Scoring orchestration (FR-PB23 to FR-PB27) ---
  scoring: {
    // Longest scraped text one Decider question sees per field (comment, company description).
    maxTextChars: 1500,
    // Longest comment copied into the CSV quote column.
    quoteMaxChars: 280,
    // Levels of the soft-match score question, lowest to highest. Index / (n-1) = 0..1.
    softMatchLevels: ["no match", "partial match", "strong match"],
    // Warmth clock file: the first scoring run writes "now" here so a re-run gives identical warmth (AC-PB5).
    clockFile: "scoring-clock.json",
  },

  // --- Fit points (FR-PB23, FR-FT2) ---
  fitPoints: { roleSeniority: 35, companySize: 20, industry: 20, country: 15, softMatch: 10 },
  unknownValueShare: 0.5, // unknown value earns half points, never full (FR-FT4)

  // --- Warmth (FR-PB24, FR-WM2) ---
  warmth: {
    pointsPerComment: 30,
    pointsPerExtraPost: 10,
    halfLifeDays: 14,
    cap: 100,
    intentFactor: {
      praise: 0.3,
      opinion: 0.6,
      own_experience_or_problem: 1.0,
      asks_for_solution: 1.5,
    },
  },

  // --- Buckets (FR-PB27, FR-BK) ---
  buckets: {
    priority: { minFit: 80, minWarmth: 70 },
    qualified: { minFit: 65, minWarmth: 40 },
    nurture: { minFit: 45 },
    tieBreakBand: 5, // within this many points of a line, one Decider tie-break (FR-BK2)
  },

  // --- Brief limits (FR-PB6, FR-ON2) ---
  briefLimits: { pains: 8, triggers: 8, topics: 12, rules: 8 },

  // --- Retention (FR-PV3) ---
  retentionDays: 30,
} as const;
